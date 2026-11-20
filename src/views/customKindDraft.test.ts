import { describe, expect, it } from 'vitest'
import { addCustomKind, addObjectRow, resolveKind } from '../model/objects'
import { getStages } from '../model/pieces'
import { createPlan } from '../model/plan'
import type { Plan } from '../model/types'
import {
  CUSTOM_COLORS,
  INITIAL_CUSTOM_KIND_DRAFT,
  countObjectsOfKind,
  draftFromKind,
  draftToInput,
  formatDims,
  parseCount,
  parseStack,
  removeKindMessage,
  stageObjectsNeeds,
} from './customKindDraft'
import { INITIAL_OBJECTS_FORM } from './objectsForm'

const base = () => createPlan({ width: 800, height: 1000, depth: 250, stages: 3, uprightThickness: 18, shelfThickness: 18 })

/** Plan avec une boîte à thé (90 × 180 × 90) et une rangée de 3 posée à l'étage 1. */
function withTea(): { plan: Plan; id: string; stage: string } {
  const created = addCustomKind(base(), { label: 'Boîte à thé', width: 90, height: 180, depth: 90 })
  if (!created.ok) throw new Error(created.error)
  const stage = getStages(created.plan)[0].shelfBelowId
  const row = addObjectRow(created.plan, stage, created.id, 3, 0, { orientation: 'lying', stack: 2 })
  if (!row.ok) throw new Error(row.error)
  return { plan: row.plan, id: created.id, stage }
}

describe('parseCount', () => {
  it('champ vide = remplir, sinon un entier d’au moins 1', () => {
    expect(parseCount('')).toEqual({ count: undefined })
    expect(parseCount('  ')).toEqual({ count: undefined })
    expect(parseCount(' 12 ')).toEqual({ count: 12 })
  })
  it('refuse le texte, 0, les décimaux et les négatifs', () => {
    for (const text of ['abc', '0', '2,5', '-1', '1e3']) expect(parseCount(text)).toBeNull()
  })
})

describe('parseStack', () => {
  it('lit un entier de 1 à 50, un champ vide vaut 1', () => {
    expect(parseStack('')).toBe(1)
    expect(parseStack(' 3 ')).toBe(3)
    expect(parseStack('50')).toBe(50)
  })
  it('refuse le reste', () => {
    for (const text of ['0', '51', '2,5', 'a', '-1']) expect(parseStack(text)).toBeNull()
  })
})

describe('formatDims', () => {
  it('écrit largeur × hauteur × profondeur dans l’unité choisie', () => {
    const tea = { width: 90, height: 180, depth: 90 }
    expect(formatDims(tea, 'cm')).toBe('9 × 18 × 9 cm')
    expect(formatDims(tea, 'mm')).toBe('90 × 180 × 90 mm')
    expect(formatDims({ width: 55, height: 100, depth: 55 }, 'cm')).toBe('5,5 × 10 × 5,5 cm')
  })
})

describe('brouillon du formulaire', () => {
  it('le brouillon de départ a une couleur de la palette', () => {
    expect(CUSTOM_COLORS.map((c) => c.hex)).toContain(INITIAL_CUSTOM_KIND_DRAFT.color)
    expect(CUSTOM_COLORS).toHaveLength(8)
  })
  it('va et vient entre un objet et son brouillon, nom nettoyé', () => {
    const { plan, id } = withTea()
    const draft = draftFromKind(resolveKind(plan, id)!)
    expect(draft).toMatchObject({ label: 'Boîte à thé', width: 90, height: 180, depth: 90, shape: 'box' })
    expect(draftToInput({ ...draft, label: '  Thé vert ' }).label).toBe('Thé vert')
  })
  it('un brouillon vide est refusé par le modèle avec un message', () => {
    const result = addCustomKind(base(), draftToInput(INITIAL_CUSTOM_KIND_DRAFT))
    expect(result.ok).toBe(false)
  })
})

describe('suppression d’un objet sur mesure', () => {
  it('compte les objets posés, piles comprises', () => {
    const { plan, id } = withTea()
    expect(countObjectsOfKind(plan, id)).toBe(3)
    expect(removeKindMessage(plan, id)).toContain('Les 3 objets posés')
  })
  it('ne parle pas d’objets posés s’il n’y en a pas', () => {
    const created = addCustomKind(base(), { label: 'Pot', width: 80, height: 80, depth: 80 })
    if (!created.ok) throw new Error(created.error)
    expect(removeKindMessage(created.plan, created.id)).toBe('Supprimer « Pot » ?')
  })
})

describe('stageObjectsNeeds', () => {
  it('donne la plus haute pile et la plus grande profondeur, dans le sens des objets', () => {
    const { plan, stage } = withTea()
    // Couchée : 180 de large, 90 de haut, 90 de profondeur ; pile de 2 → 180 de haut.
    expect(stageObjectsNeeds(plan, stage)).toEqual({ height: 180, depth: 90 })
  })
  it('renvoie null pour un étage sans objet', () => {
    const { plan } = withTea()
    expect(stageObjectsNeeds(plan, getStages(plan)[1].shelfBelowId)).toBeNull()
  })
})

describe('réglages mémorisés', () => {
  it('ont des valeurs de départ sûres', () => {
    expect(INITIAL_OBJECTS_FORM).toMatchObject({ orientation: 'standing', stack: '', fitMargin: 20 })
  })
})
