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

describe('objets sur mesure, sens et piles', () => {
  /** Plan avec une boîte à thé sur mesure, une rangée couchée empilée et une pile posée seule. */
  function withCustom(): Record<string, any> {
    return {
      ...raw(),
      customKinds: [{ id: 'custom-1', label: 'Boîte à thé', width: 90, height: 180, depth: 90, shape: 'cylinder', color: '#aa3300' }],
      rows: [{ id: 'row-1', shelfBelowId: 'shelf-1', kind: 'custom-1', count: 5, orientation: 'lying', stack: 3 }],
      placedObjects: [{ id: 'placed-1', shelfBelowId: 'shelf-2', kind: 'custom-1', x: 100, orientation: 'facing', stack: 2 }],
    }
  }

  it('aller-retour : objets sur mesure, sens et piles relus à l’identique', () => {
    const first = parsePlan(withCustom())
    if (!first.ok) throw new Error(first.error)
    expect(first.plan.customKinds).toEqual(withCustom().customKinds)
    expect(first.plan.rows).toEqual(withCustom().rows)
    expect(first.plan.placedObjects).toEqual(withCustom().placedObjects)
    expect(parsePlanFile(serializePlan(first.plan))).toEqual({ ok: true, plan: first.plan })
  })

  it('un fichier ancien, sans ces champs, se lit comme avant (debout, sans pile, sans objet sur mesure)', () => {
    const old = { ...raw(), rows: [{ id: 'row-1', shelfBelowId: 'shelf-1', kind: 'manga', count: 3 }] }
    const result = parsePlan(old)
    if (!result.ok) throw new Error(result.error)
    expect(result.plan.customKinds).toBeUndefined()
    expect(result.plan.rows).toEqual([{ id: 'row-1', shelfBelowId: 'shelf-1', kind: 'manga', count: 3 }])
    expect('customKinds' in result.plan).toBe(false)
  })

  it('les valeurs par défaut ne sont pas écrites ; forme absente = boîte ; couleur en minuscules', () => {
    const plan = withCustom()
    delete plan.customKinds[0].shape
    plan.customKinds[0].color = '#AA3300'
    plan.rows[0].orientation = 'standing'
    plan.rows[0].stack = 1
    const result = parsePlan(plan)
    if (!result.ok) throw new Error(result.error)
    expect(result.plan.customKinds![0]).toMatchObject({ shape: 'box', color: '#aa3300' })
    expect(result.plan.rows).toEqual([{ id: 'row-1', shelfBelowId: 'shelf-1', kind: 'custom-1', count: 5 }])
  })

  it('une rangée qui utilise un objet sur mesure absent du fichier est refusée', () => {
    expect(error({ ...withCustom(), customKinds: undefined })).toContain('type d’objet inconnu')
    const plan = withCustom()
    plan.placedObjects[0].kind = 'custom-2'
    expect(error(plan)).toContain('type d’objet inconnu')
  })

  it('refuse un objet sur mesure invalide', () => {
    const variants: Record<string, unknown>[] = [
      { id: 'custom-x' },
      { id: '__proto__' },
      { id: 'manga' },
      { label: '   ' },
      { label: 'x'.repeat(61) },
      { label: 7 },
      { width: 0 },
      { height: 3001 },
      { depth: 12.5 },
      { depth: '90' },
      { shape: 'sphere' },
      { color: 'rouge' },
      { color: '#abc' },
    ]
    for (const change of variants) {
      const plan = withCustom()
      Object.assign(plan.customKinds[0], change)
      expect(parsePlan(plan).ok, JSON.stringify(change)).toBe(false)
    }
  })

  it('refuse un identifiant d’objet sur mesure en double et une liste trop longue', () => {
    const plan = withCustom()
    plan.customKinds.push({ ...plan.customKinds[0] })
    expect(error(plan)).toContain('en double')
    const many = withCustom()
    many.customKinds = Array.from({ length: 101 }, (_, i) => ({ id: `custom-${i + 1}`, label: 'Boîte', width: 10, height: 10, depth: 10 }))
    expect(parsePlan(many).ok).toBe(false)
    expect(parsePlan({ ...withCustom(), customKinds: 'thé' }).ok).toBe(false)
  })

  it('refuse un sens inconnu ou une pile hors bornes (1 à 50)', () => {
    for (const change of [{ orientation: 'upside' }, { orientation: 1 }, { stack: 0 }, { stack: 51 }, { stack: 2.5 }]) {
      const row = withCustom()
      Object.assign(row.rows[0], change)
      expect(parsePlan(row).ok, JSON.stringify(change)).toBe(false)
      const placed = withCustom()
      Object.assign(placed.placedObjects[0], change)
      expect(parsePlan(placed).ok, JSON.stringify(change)).toBe(false)
    }
  })

  it('ne garde rien d’inattendu d’un objet sur mesure', () => {
    const plan = withCustom()
    plan.customKinds[0].surprise = 'oui'
    const result = parsePlan(plan)
    if (!result.ok) throw new Error(result.error)
    expect(JSON.stringify(result.plan)).not.toContain('surprise')
  })
})
