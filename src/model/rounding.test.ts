/**
 * Arrondis : un rayon de coin (silhouette vue de face) et un rayon d'arête (tranche vue de profil) par pièce.
 *
 * Étagère de référence : 800 × 1000 mm, profondeur 250, 3 étages, bois de 18 mm, cadre entre les montants.
 *   Tablette : silhouette de face 764 × 18  → rayon de coin max = 18 / 2 = 9 ; section de profil 250 × 18 → arête max 9.
 *   Montant : face 18 × 1000 → coin max 9 ; profil 250 × 1000 → arête max 125.
 *   Cale (étage de 310, jeu 1) : face 18 × 309 → coin max 9 ; profil 250 × 309 → arête max 125.
 */
import { describe, expect, it } from 'vitest'
import { computeCutList, describeRounding, roundingCode } from './cutlist'
import { checkPlan, readPiece, setPieceProperty } from './edit'
import { computeFrontRects } from './layout'
import { createPlan } from './plan'
import { computeProfileRects } from './profile'
import { maxRadii, radiusLimits, roundingProblems } from './rounding'
import { parsePlan, parsePlanFile, serializePlan } from './serialize'
import { addShelf, addWedge } from './tools'
import type { Plan } from './types'

const base = {
  width: 800,
  height: 1000,
  depth: 250,
  stages: 3,
  uprightThickness: 18,
  shelfThickness: 18,
}

function ok<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  if (!result.ok) throw new Error(`échec inattendu : ${(result as unknown as { error: string }).error}`)
  return result as Extract<T, { ok: true }>
}

const round = (plan: Plan, ids: string[], property: 'cornerRadius' | 'edgeRadius', mm: number) =>
  ok(setPieceProperty(plan, ids, property, mm)).plan

describe('limites', () => {
  it('moitié de la plus petite dimension visible', () => {
    expect(maxRadii({ width: 764, height: 18, depth: 250 })).toEqual({ corner: 9, edge: 9 })
    expect(maxRadii({ width: 18, height: 1000, depth: 250 })).toEqual({ corner: 9, edge: 125 })
    expect(maxRadii({ width: 17, height: 100, depth: 100 })).toEqual({ corner: 8, edge: 50 }) // arrondi vers le bas
  })

  it('limites de chaque type de pièce de l’étagère de référence', () => {
    const plan = ok(addWedge(createPlan(base), 'shelf-1')).plan
    expect(radiusLimits(plan, 'shelf-2')).toEqual({ corner: 9, edge: 9 })
    expect(radiusLimits(plan, 'upright-left')).toEqual({ corner: 9, edge: 125 })
    expect(radiusLimits(plan, 'wedge-1')).toEqual({ corner: 9, edge: 125 })
    expect(radiusLimits(plan, 'nope')).toBeNull()
  })

  it('un plan neuf n’a aucun arrondi et ne pose aucun problème', () => {
    expect(roundingProblems(createPlan(base))).toEqual([])
    expect(readPiece(createPlan(base), 'shelf-1')).toMatchObject({ cornerRadius: 0, edgeRadius: 0 })
  })
})

describe('réglage d’un rayon', () => {
  it('règle le rayon des coins d’une tablette', () => {
    const plan = round(createPlan(base), ['shelf-2'], 'cornerRadius', 5)
    expect(readPiece(plan, 'shelf-2')).toMatchObject({ cornerRadius: 5, edgeRadius: 0 })
    expect(readPiece(plan, 'shelf-3')).toMatchObject({ cornerRadius: 0 })
  })

  it('accepte le maximum (9) et refuse au-delà (10), en donnant le maximum', () => {
    expect(setPieceProperty(createPlan(base), ['shelf-2'], 'cornerRadius', 9).ok).toBe(true)
    const result = setPieceProperty(createPlan(base), ['shelf-2'], 'cornerRadius', 10)
    expect(result).toEqual({ ok: false, error: 'Le rayon des coins de « Tablette 2 » est trop grand : 9 mm au maximum.' })
  })

  it('une arête de tablette est limitée par son épaisseur, celle d’un montant beaucoup moins', () => {
    expect(setPieceProperty(createPlan(base), ['shelf-2'], 'edgeRadius', 10).ok).toBe(false)
    expect(setPieceProperty(createPlan(base), ['upright-left'], 'edgeRadius', 100).ok).toBe(true)
    expect(setPieceProperty(createPlan(base), ['upright-left'], 'edgeRadius', 126).ok).toBe(false)
  })

  it('règle plusieurs pièces à la fois, et refuse tout si une seule dépasse', () => {
    const plan = round(createPlan(base), ['shelf-1', 'shelf-2', 'upright-left'], 'cornerRadius', 8)
    expect(['shelf-1', 'shelf-2', 'upright-left'].map((id) => readPiece(plan, id)?.cornerRadius)).toEqual([8, 8, 8])
    expect(setPieceProperty(createPlan(base), ['shelf-1', 'upright-left'], 'edgeRadius', 50).ok).toBe(false)
  })

  it('refuse un rayon négatif ou décimal', () => {
    expect(setPieceProperty(createPlan(base), ['shelf-2'], 'cornerRadius', -1).ok).toBe(false)
    expect(setPieceProperty(createPlan(base), ['shelf-2'], 'cornerRadius', 2.5).ok).toBe(false)
  })

  it('0 remet un angle droit', () => {
    const rounded = round(createPlan(base), ['shelf-2'], 'cornerRadius', 6)
    expect(readPiece(round(rounded, ['shelf-2'], 'cornerRadius', 0), 'shelf-2')?.cornerRadius).toBe(0)
  })

  it('un arrondi qui deviendrait trop grand après un changement d’épaisseur est refusé', () => {
    const plan = round(createPlan(base), ['shelf-2'], 'cornerRadius', 9)
    // amincir la tablette à 10 mm : le maximum devient 5, le coin de 9 est trop grand
    expect(setPieceProperty(plan, ['shelf-2'], 'thickness', 10).ok).toBe(false)
  })

  it('une cale reçoit ses propres arrondis', () => {
    const plan = round(ok(addWedge(createPlan(base), 'shelf-1')).plan, ['wedge-1'], 'edgeRadius', 100)
    expect(readPiece(plan, 'wedge-1')?.edgeRadius).toBe(100)
  })

  it('une nouvelle tablette reprend les arrondis de celle du dessous', () => {
    const start = round(createPlan(base), ['shelf-1'], 'cornerRadius', 4)
    const { plan, id } = ok(addShelf(start, 'shelf-1'))
    expect(readPiece(plan, id)?.cornerRadius).toBe(4)
  })
})

describe('dessin', () => {
  it('la vue de face porte le rayon des coins, le profil celui des arêtes', () => {
    let plan = round(createPlan(base), ['shelf-2'], 'cornerRadius', 5)
    plan = round(plan, ['shelf-2'], 'edgeRadius', 3)
    expect(computeFrontRects(plan).find((r) => r.id === 'shelf-2')).toMatchObject({ cornerRadius: 5, edgeRadius: 3, depth: 250 })
    expect(computeProfileRects(plan).find((r) => r.id === 'shelf-2')?.radius).toBe(3)
    expect(computeProfileRects(plan).find((r) => r.id === 'shelf-3')?.radius).toBe(0)
  })
})

describe('liste de découpe', () => {
  it('deux tablettes de mêmes dimensions mais d’arrondis différents sont dans deux lots', () => {
    const plan = round(createPlan(base), ['shelf-2'], 'cornerRadius', 5)
    const { groups } = computeCutList(plan)
    const shelfGroups = groups.filter((g) => g.length === 764)
    expect(shelfGroups.map((g) => [g.quantity, g.cornerRadius, g.edgeRadius])).toEqual([
      [3, 0, 0],
      [1, 5, 0],
    ])
  })

  it('des pièces de mêmes arrondis restent groupées', () => {
    const plan = round(createPlan(base), ['shelf-1', 'shelf-2', 'shelf-3', 'shelf-4'], 'cornerRadius', 9)
    const shelfGroups = computeCutList(plan).groups.filter((g) => g.length === 764)
    expect(shelfGroups).toHaveLength(1)
    expect(shelfGroups[0]).toMatchObject({ quantity: 4, cornerRadius: 9 })
  })

  it('l’arrondi ne change pas les dimensions de coupe', () => {
    const plain = computeCutList(createPlan(base)).groups.map((g) => [g.length, g.width, g.thickness, g.quantity])
    const rounded = computeCutList(round(createPlan(base), ['shelf-1'], 'cornerRadius', 9))
      .groups.map((g) => [g.length, g.width, g.thickness, g.quantity])
      .sort()
    expect(new Set(rounded.map((r) => r[0]))).toEqual(new Set(plain.map((r) => r[0])))
  })

  it('décrit l’arrondi en toutes lettres et en abrégé', () => {
    expect(describeRounding(0, 0)).toBe('—')
    expect(describeRounding(9, 0)).toBe('coins R 0,9 cm')
    expect(describeRounding(0, 5)).toBe('arêtes R 0,5 cm')
    expect(describeRounding(9, 5)).toBe('coins R 0,9 cm · arêtes R 0,5 cm')
    expect(describeRounding(9, 5, 'mm')).toBe('coins R 9 mm · arêtes R 5 mm')
    expect(roundingCode(0, 0)).toBe('—')
    expect(roundingCode(9, 5)).toBe('C0,9 A0,5')
    expect(roundingCode(9, 5, 'mm')).toBe('C9 A5')
  })
})

describe('modèle sans cadre', () => {
  const frameless = () => createPlan({ ...base, model: 'frameless', overhang: 20, width: 900 })

  it('les arrondis d’un montant s’appliquent à tous les montants du même côté', () => {
    const plan = round(frameless(), ['vertical-left-shelf-2'], 'cornerRadius', 6)
    const rects = computeFrontRects(plan).filter((r) => r.id.startsWith('vertical-left'))
    expect(rects.every((r) => r.cornerRadius === 6)).toBe(true)
    expect(computeFrontRects(plan).filter((r) => r.id.startsWith('vertical-right')).every((r) => r.cornerRadius === 0)).toBe(true)
  })

  it('arrondir les tablettes avec débord : rayon limité par l’épaisseur', () => {
    const plan = round(frameless(), ['shelf-1', 'shelf-2'], 'cornerRadius', 9)
    expect(checkPlan(plan)).toEqual([])
    expect(setPieceProperty(frameless(), ['shelf-1'], 'cornerRadius', 10).ok).toBe(false)
  })
})

describe('sauvegarde', () => {
  it('les arrondis reviennent à l’identique', () => {
    let plan = ok(addWedge(createPlan(base), 'shelf-1')).plan
    plan = round(plan, ['shelf-2', 'wedge-1', 'upright-right'], 'cornerRadius', 7)
    plan = round(plan, ['upright-right'], 'edgeRadius', 60)
    const result = parsePlanFile(serializePlan(plan))
    if (!result.ok) throw new Error(result.error)
    expect(result.plan).toEqual(plan)
  })

  it('un ancien fichier sans arrondis se lit avec des angles droits', () => {
    const old = JSON.parse(JSON.stringify(ok(addWedge(createPlan(base), 'shelf-1')).plan))
    for (const holder of [old.leftUpright, old.rightUpright, ...old.shelves, ...old.wedges]) {
      delete holder.cornerRadius
      delete holder.edgeRadius
    }
    const result = parsePlan(old)
    if (!result.ok) throw new Error(result.error)
    expect(result.plan.shelves.every((s) => s.cornerRadius === 0 && s.edgeRadius === 0)).toBe(true)
    expect(result.plan.leftUpright).toMatchObject({ cornerRadius: 0, edgeRadius: 0 })
    expect(result.plan.wedges[0]).toMatchObject({ cornerRadius: 0, edgeRadius: 0 })
  })

  it('refuse un rayon négatif, décimal, ou plus grand que la pièce', () => {
    const make = (patch: (p: any) => void) => {
      const raw = JSON.parse(JSON.stringify(createPlan(base)))
      patch(raw)
      return parsePlan(raw)
    }
    expect(make((p) => (p.shelves[0].cornerRadius = -2)).ok).toBe(false)
    expect(make((p) => (p.shelves[0].edgeRadius = 1.5)).ok).toBe(false)
    expect(make((p) => (p.leftUpright.cornerRadius = 'rond')).ok).toBe(false)
    const tooBig = make((p) => (p.shelves[0].cornerRadius = 40))
    expect(tooBig).toMatchObject({ ok: false, error: expect.stringContaining('trop grand') })
  })
})
