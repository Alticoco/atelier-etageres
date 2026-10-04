import { describe, expect, it } from 'vitest'
import { computeCutList, indexToMark } from './cutlist'
import { setPlanProperty } from './edit'
import { createPlan } from './plan'
import { addWedge } from './tools'

// Montants 1000 × 250 × 18 ; tablettes 764 × 250 × 18.
const base = {
  width: 800,
  height: 1000,
  depth: 250,
  stages: 3,
  uprightThickness: 18,
  shelfThickness: 18,
}

describe('indexToMark', () => {
  it('compte A à Z puis AA, AB… comme les colonnes d’un tableur', () => {
    expect(indexToMark(0)).toBe('A')
    expect(indexToMark(25)).toBe('Z')
    expect(indexToMark(26)).toBe('AA')
    expect(indexToMark(27)).toBe('AB')
    expect(indexToMark(51)).toBe('AZ')
    expect(indexToMark(52)).toBe('BA')
  })
})

describe('computeCutList — regroupement', () => {
  it('regroupe les pièces identiques : 2 montants (A) et 4 tablettes (B)', () => {
    const { groups, totalPieces } = computeCutList(createPlan(base))
    expect(groups).toEqual([
      { mark: 'A', length: 1000, width: 250, thickness: 18, cornerRadius: 0, edgeRadius: 0, quantity: 2, pieceIds: ['upright-left', 'upright-right'] },
      { mark: 'B', length: 764, width: 250, thickness: 18, cornerRadius: 0, edgeRadius: 0, quantity: 4, pieceIds: ['shelf-1', 'shelf-2', 'shelf-3', 'shelf-4'] },
    ])
    expect(totalPieces).toBe(6)
  })

  it('donne à chaque pièce le repère de son lot', () => {
    const { marks } = computeCutList(createPlan(base))
    expect(marks).toEqual({
      'upright-left': 'A',
      'upright-right': 'A',
      'shelf-1': 'B',
      'shelf-2': 'B',
      'shelf-3': 'B',
      'shelf-4': 'B',
    })
  })

  it('sépare les pièces qui diffèrent d’une seule dimension', () => {
    const plan = createPlan(base)
    plan.shelves[1].depth = 200
    plan.shelves[2].thickness = 25
    plan.shelves[2].y -= 0
    const { groups } = computeCutList(plan)
    const shelfGroups = groups.filter((g) => g.pieceIds.some((id) => id.startsWith('shelf')))
    expect(shelfGroups.map((g) => [g.length, g.width, g.thickness, g.quantity])).toEqual([
      [764, 250, 18, 2],
      [764, 200, 18, 1],
      [764, 250, 25, 1],
    ])
  })

  it('met dans le même lot une cale et une tablette de mêmes dimensions', () => {
    // une cale de 18 × 250 de profondeur, hauteur 764 : on force un étage assez haut
    const plan = createPlan({ ...base, height: 900 + 4 * 18 + 1, stages: 1, width: 800 })
    plan.wedges.push({ id: 'wedge-1', shelfBelowId: 'shelf-1', x: 300, thickness: 18, depth: 250, cornerRadius: 0, edgeRadius: 0 })
    const { groups, marks } = computeCutList(plan)
    const wedge = groups.find((g) => g.pieceIds.includes('wedge-1'))
    expect(wedge?.pieceIds).toEqual(['wedge-1'])
    expect(marks['wedge-1']).toBeDefined()
  })

  it('compte les cales ajoutées et leur donne un repère', () => {
    let plan = createPlan(base)
    for (const shelf of ['shelf-1', 'shelf-2']) {
      const result = addWedge(plan, shelf)
      if (!result.ok) throw new Error(result.error)
      plan = result.plan
    }
    const { groups, totalPieces } = computeCutList(plan)
    expect(totalPieces).toBe(8)
    // étages de 310 et 309 : cales de 309 et 308 mm
    expect(groups.filter((g) => g.width === 250 && g.thickness === 18 && g.length < 400).map((g) => g.length)).toEqual([309, 308])
  })

  it('suit les modifications du plan', () => {
    const plan = createPlan(base)
    const result = setPlanProperty(plan, { property: 'width', mm: 1000 })
    if (!result.ok) throw new Error(result.error)
    expect(computeCutList(result.plan).groups[1].length).toBe(964)
  })

  it('reste stable : les mêmes cotes redonnent les mêmes repères', () => {
    expect(computeCutList(createPlan(base))).toEqual(computeCutList(createPlan(base)))
  })

  it('passe aux repères à deux lettres au-delà de 26 lots', () => {
    const plan = createPlan({ ...base, height: 4000, stages: 30, width: 800 })
    plan.shelves.forEach((s, i) => (s.depth = 100 + i)) // 31 profondeurs différentes -> 31 lots de tablettes
    const { groups } = computeCutList(plan)
    expect(groups.length).toBeGreaterThan(26)
    expect(groups[26].mark).toBe('AA')
    expect(new Set(groups.map((g) => g.mark)).size).toBe(groups.length)
  })
})

describe('computeCutList — trait de scie', () => {
  it('est absent par défaut', () => {
    expect(computeCutList(createPlan(base)).sawKerf).toBeNull()
  })

  it('estime la perte : une coupe par pièce × épaisseur du trait', () => {
    const plan = createPlan({ ...base, sawKerfEnabled: true, sawKerf: 3 })
    expect(computeCutList(plan).sawKerf).toEqual({ cuts: 6, kerf: 3, loss: 18 })
  })

  it('suit l’épaisseur du trait de scie réglée dans le plan', () => {
    const plan = createPlan({ ...base, sawKerfEnabled: true, sawKerf: 5 })
    expect(computeCutList(plan).sawKerf?.loss).toBe(30)
  })

  it('compte aussi les cales', () => {
    let plan = createPlan({ ...base, sawKerfEnabled: true })
    const result = addWedge(plan, 'shelf-1')
    if (!result.ok) throw new Error(result.error)
    plan = result.plan
    expect(computeCutList(plan).sawKerf).toEqual({ cuts: 7, kerf: 3, loss: 21 })
  })

  it('les réglages du plan se modifient', () => {
    const plan = createPlan(base)
    const on = setPlanProperty(plan, { property: 'sawKerfEnabled', value: true })
    if (!on.ok) throw new Error(on.error)
    const sized = setPlanProperty(on.plan, { property: 'sawKerf', mm: 4 })
    if (!sized.ok) throw new Error(sized.error)
    expect(computeCutList(sized.plan).sawKerf).toEqual({ cuts: 6, kerf: 4, loss: 24 })
  })

  it('refuse un trait de scie décimal ou négatif', () => {
    const plan = createPlan(base)
    expect(setPlanProperty(plan, { property: 'sawKerf', mm: -1 }).ok).toBe(false)
    expect(setPlanProperty(plan, { property: 'sawKerf', mm: 2.5 }).ok).toBe(false)
  })
})
