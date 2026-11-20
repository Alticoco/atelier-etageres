import { describe, expect, it } from 'vitest'
import { getStages } from './pieces'
import { BLANK_WIZARD_VALUES, DEFAULT_WIZARD_VALUES, resolveWizard, WIZARD_PRESETS } from './wizard'

describe('resolveWizard', () => {
  it('convertit les cm saisis en mm et crée le plan', () => {
    const result = resolveWizard(DEFAULT_WIZARD_VALUES)
    if (!result.ok) throw new Error('le formulaire par défaut doit être valide')
    const { plan } = result
    expect(plan.width).toBe(800)
    expect(plan.height).toBe(1000)
    expect(plan.leftUpright).toEqual({ thickness: 18, depth: 250, cornerRadius: 0, edgeRadius: 0 })
    expect(plan.shelves).toHaveLength(4)
    expect(plan.options.defaultWedgeThickness).toBe(18)
  })

  it('accepte la virgule et le point décimaux', () => {
    const result = resolveWizard({ ...DEFAULT_WIZARD_VALUES, width: '80,5', depth: '24.5' })
    if (!result.ok) throw new Error('doit être valide')
    expect(result.plan.width).toBe(805)
    expect(result.plan.shelves[0].depth).toBe(245)
  })

  it('transmet le nombre d’étages et la position du cadre', () => {
    const result = resolveWizard({ ...DEFAULT_WIZARD_VALUES, stages: '5', framePlacement: 'onTop' })
    if (!result.ok) throw new Error('doit être valide')
    expect(getStages(result.plan)).toHaveLength(5)
    expect(result.plan.options.framePlacement).toBe('onTop')
  })

  it('utilise le nom par défaut si le nom est vide', () => {
    const result = resolveWizard({ ...DEFAULT_WIZARD_VALUES, name: '   ' })
    if (!result.ok) throw new Error('doit être valide')
    expect(result.plan.name).toBe('Nouvelle étagère')
  })

  it('signale chaque champ illisible', () => {
    const result = resolveWizard({ ...DEFAULT_WIZARD_VALUES, width: 'abc', stages: '2,5', depth: '' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(Object.keys(result.fieldErrors).sort()).toEqual(['depth', 'stages', 'width'])
  })

  it('refuse zéro avec un message dédié', () => {
    const result = resolveWizard({ ...DEFAULT_WIZARD_VALUES, shelfThickness: '0', stages: '0' })
    if (result.ok) throw new Error('doit être refusé')
    expect(result.fieldErrors.shelfThickness).toMatch(/supérieur à 0/)
    expect(result.fieldErrors.stages).toMatch(/supérieur à 0/)
  })

  it('refuse plus d’une décimale en cm', () => {
    const result = resolveWizard({ ...DEFAULT_WIZARD_VALUES, uprightThickness: '1,85' })
    if (result.ok) throw new Error('doit être refusé')
    expect(result.fieldErrors.uprightThickness).toBeDefined()
  })

  it('explique les incohérences entre champs (hauteur trop faible)', () => {
    const result = resolveWizard({ ...DEFAULT_WIZARD_VALUES, height: '5' })
    if (result.ok) throw new Error('doit être refusé')
    expect(result.fieldErrors).toEqual({})
    expect(result.formError).toMatch(/hauteur/i)
  })

  it('explique les incohérences entre champs (largeur trop faible)', () => {
    const result = resolveWizard({ ...DEFAULT_WIZARD_VALUES, width: '3' })
    if (result.ok) throw new Error('doit être refusé')
    expect(result.formError).toMatch(/largeur/i)
  })

  it('le plan vierge minimal est valide et a un seul étage', () => {
    const result = resolveWizard(BLANK_WIZARD_VALUES)
    if (!result.ok) throw new Error('doit être valide')
    expect(getStages(result.plan)).toHaveLength(1)
  })
})

describe('WIZARD_PRESETS', () => {
  // Hauteur libre attendue par étage (mm), calculée à la main.
  const expectedClear: Record<string, number> = {
    mangatheque: 190,
    epices: 120,
    bibliotheque: 300,
    murale: 267,
    'meuble-bas': 320,
  }

  it('a un identifiant unique et une hauteur attendue pour chaque modèle', () => {
    const ids = WIZARD_PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect([...ids].sort()).toEqual(Object.keys(expectedClear).sort())
  })

  it.each(WIZARD_PRESETS)('$label produit un plan valide', (preset) => {
    const result = resolveWizard(preset.values)
    if (!result.ok) throw new Error(`modèle invalide : ${JSON.stringify(result)}`)
    const stages = getStages(result.plan)
    expect(stages).toHaveLength(Number(preset.values.stages))
    for (const stage of stages) {
      expect(Math.abs(stage.clearHeight - expectedClear[preset.id])).toBeLessThanOrEqual(2)
    }
  })

  it('le modèle mural est sans cadre', () => {
    const murale = WIZARD_PRESETS.find((p) => p.id === 'murale')
    expect(murale?.values.model).toBe('frameless')
  })
})
