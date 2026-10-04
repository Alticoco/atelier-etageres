import { describe, expect, it } from 'vitest'
import { createPlan } from './plan'
import { exportFileName, FILE_FORMAT, FILE_VERSION, parsePlan, parsePlanFile, serializePlan } from './serialize'
import { addWedge } from './tools'
import type { Plan } from './types'

function samplePlan(): Plan {
  const plan = createPlan({
    name: 'Mangathèque',
    width: 800,
    height: 1000,
    depth: 250,
    stages: 3,
    uprightThickness: 18,
    shelfThickness: 18,
    sawKerfEnabled: true,
    framePlacement: 'onTop',
  })
  const withWedge = addWedge(plan, 'shelf-1')
  if (!withWedge.ok) throw new Error(withWedge.error)
  return withWedge.plan
}

/** Plan sous forme d'objet JSON brut, modifiable pour fabriquer des fichiers invalides. */
function raw(): Record<string, any> {
  return JSON.parse(JSON.stringify(samplePlan()))
}

function error(value: unknown): string {
  const result = parsePlan(value)
  if (result.ok) throw new Error('un plan invalide a été accepté')
  return result.error
}

describe('aller-retour', () => {
  it('relit exactement le plan écrit', () => {
    const plan = samplePlan()
    const result = parsePlanFile(serializePlan(plan))
    expect(result).toEqual({ ok: true, plan })
  })

  it('écrit le format et la version', () => {
    const data = JSON.parse(serializePlan(samplePlan()))
    expect(data.format).toBe(FILE_FORMAT)
    expect(data.version).toBe(FILE_VERSION)
  })

  it('garde tous les réglages', () => {
    const result = parsePlanFile(serializePlan(samplePlan()))
    if (!result.ok) throw new Error(result.error)
    expect(result.plan.options).toMatchObject({ sawKerfEnabled: true, framePlacement: 'onTop', propagation: true })
    expect(result.plan.wedges).toHaveLength(1)
  })
})

describe('compatibilité avec les anciens fichiers', () => {
  it('relit un fichier écrit avant l’option « fixation murale » : elle vaut alors « non »', () => {
    const old = raw()
    delete old.options.wallMount
    const result = parsePlan(old)
    if (!result.ok) throw new Error(result.error)
    expect(result.plan.options.wallMount).toBe(false)
  })

  it('refuse une valeur invalide pour cette option', () => {
    const plan = raw()
    plan.options.wallMount = 'oui'
    expect(error(plan)).toContain('wallMount')
  })

  it('garde l’option activée dans l’aller-retour', () => {
    const plan = { ...samplePlan() }
    plan.options = { ...plan.options, wallMount: true }
    const result = parsePlanFile(serializePlan(plan))
    expect(result.ok && result.plan.options.wallMount).toBe(true)
  })
})

describe('fichier invalide', () => {
  it('refuse un texte qui n’est pas du JSON', () => {
    expect(parsePlanFile('pas du json')).toMatchObject({ ok: false, error: expect.stringContaining('JSON invalide') })
    expect(parsePlanFile('')).toMatchObject({ ok: false })
  })

  it('refuse un JSON qui n’est pas un fichier d’étagère', () => {
    for (const content of ['[]', 'null', '42', '{"nom":"x"}', '{"format":"autre","version":1}']) {
      expect(parsePlanFile(content)).toMatchObject({ ok: false, error: expect.stringContaining('pas été créé') })
    }
  })

  it('refuse une version plus récente avec un message clair', () => {
    const content = JSON.stringify({ format: FILE_FORMAT, version: FILE_VERSION + 1, plan: samplePlan() })
    expect(parsePlanFile(content)).toMatchObject({ ok: false, error: expect.stringContaining('plus récente') })
  })

  it('refuse un numéro de version absurde', () => {
    for (const version of [0, -1, 1.5, '1', null]) {
      const content = JSON.stringify({ format: FILE_FORMAT, version, plan: samplePlan() })
      expect(parsePlanFile(content).ok).toBe(false)
    }
  })

  it('refuse un fichier sans plan', () => {
    expect(parsePlanFile(JSON.stringify({ format: FILE_FORMAT, version: 1 })).ok).toBe(false)
  })
})

describe('plan invalide', () => {
  it('refuse un champ manquant, en le nommant', () => {
    const plan = raw()
    delete plan.width
    expect(error(plan)).toContain('width')
  })

  it('refuse un mauvais type ou un nombre non entier', () => {
    expect(error({ ...raw(), width: '800' })).toContain('width')
    expect(error({ ...raw(), height: 1000.5 })).toContain('height')
    expect(error({ ...raw(), name: 12 })).toContain('name')
  })

  it('refuse des dimensions nulles, négatives ou démesurées', () => {
    expect(parsePlan({ ...raw(), width: 0 }).ok).toBe(false)
    expect(parsePlan({ ...raw(), width: -800 }).ok).toBe(false)
    expect(parsePlan({ ...raw(), width: 10_000_000 }).ok).toBe(false)
  })

  it('refuse NaN et Infinity, qui n’existent pas en JSON mais pourraient venir d’une base corrompue', () => {
    expect(parsePlan({ ...raw(), width: NaN }).ok).toBe(false)
    expect(parsePlan({ ...raw(), width: Infinity }).ok).toBe(false)
  })

  it('refuse une option invalide', () => {
    const plan = raw()
    plan.options.framePlacement = 'autour'
    expect(error(plan)).toContain('framePlacement')
    const other = raw()
    other.options.propagation = 'oui'
    expect(error(other)).toContain('propagation')
  })

  it('refuse des listes de tablettes ou de cales invalides', () => {
    expect(parsePlan({ ...raw(), shelves: 'x' }).ok).toBe(false)
    expect(parsePlan({ ...raw(), wedges: {} }).ok).toBe(false)
    const plan = raw()
    plan.shelves[0] = 5
    expect(parsePlan(plan).ok).toBe(false)
  })

  it('refuse des identifiants en double ou réservés', () => {
    const duplicate = raw()
    duplicate.shelves[1].id = duplicate.shelves[0].id
    expect(error(duplicate)).toContain('identifiant')
    const reserved = raw()
    reserved.shelves[0].id = 'upright-left'
    expect(error(reserved)).toContain('identifiant')
    const clash = raw()
    clash.wedges[0].id = clash.shelves[0].id
    expect(error(clash)).toContain('identifiant')
  })

  it('refuse un plan incohérent (tablettes qui se chevauchent)', () => {
    const plan = raw()
    plan.shelves[1].y = plan.shelves[2].y
    expect(error(plan)).toMatch(/^Plan incohérent/)
  })

  it('refuse une cale rattachée à une tablette qui n’existe pas', () => {
    const plan = raw()
    plan.wedges[0].shelfBelowId = 'fantôme'
    expect(parsePlan(plan).ok).toBe(false)
  })

  it('refuse un nom, un identifiant ou des listes démesurés', () => {
    expect(parsePlan({ ...raw(), name: 'x'.repeat(500) }).ok).toBe(false)
    const plan = raw()
    plan.shelves[0].id = 'x'.repeat(200)
    expect(parsePlan(plan).ok).toBe(false)
    expect(parsePlan({ ...raw(), shelves: Array(500).fill(raw().shelves[0]) }).ok).toBe(false)
  })

  it('ne garde rien d’inattendu venu du fichier', () => {
    const plan = raw()
    plan.surprise = '<script>'
    plan.shelves[0].extra = 1
    plan.options.autre = true
    const result = parsePlan(plan)
    if (!result.ok) throw new Error(result.error)
    expect(result.plan).toEqual(samplePlan())
    expect(JSON.stringify(result.plan)).not.toContain('surprise')
  })

  it('ne se laisse pas piéger par __proto__', () => {
    const content = serializePlan(samplePlan()).replace('"name"', '"__proto__": {"polluted": true}, "name"')
    const result = parsePlanFile(content)
    expect(result.ok).toBe(true)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('refuse null, un tableau ou un texte à la place du plan', () => {
    for (const value of [null, [], 'plan', 7, undefined]) expect(parsePlan(value).ok).toBe(false)
  })

  it('un nom vide est remplacé par un nom par défaut', () => {
    const result = parsePlan({ ...raw(), name: '   ' })
    if (!result.ok) throw new Error(result.error)
    expect(result.plan.name).toBe('Étagère')
  })
})

describe('exportFileName', () => {
  it('retire accents et caractères interdits', () => {
    expect(exportFileName('Étagère à épices')).toBe('Etagere-a-epices.etagere.json')
    expect(exportFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('abcdefghij.etagere.json')
  })

  it('a toujours un nom utilisable', () => {
    expect(exportFileName('')).toBe('etagere.etagere.json')
    expect(exportFileName('???')).toBe('etagere.etagere.json')
    expect(exportFileName('..secret')).toBe('secret.etagere.json')
  })

  it('limite la longueur', () => {
    expect(exportFileName('x'.repeat(300)).length).toBeLessThanOrEqual(60 + '.etagere.json'.length)
  })
})
