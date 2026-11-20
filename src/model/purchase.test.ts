import { describe, expect, it } from 'vitest'
import { setPlanProperty } from './edit'
import { createPlan } from './plan'
import { optimizeCuts, purchasePlan, purchaseSummary, setStockLength } from './purchase'
import { parsePlan, serializePlan } from './serialize'

// Montants 1000 × 250 × 18 (×2) ; tablettes 764 × 250 × 18 (×4) : une seule section, 250 × 18.
const base = { width: 800, height: 1000, depth: 250, stages: 3, uprightThickness: 18, shelfThickness: 18 }

const pieces = (lengths: number[]) => lengths.map((length, i) => ({ mark: String.fromCharCode(65 + i), length }))

describe('purchaseSummary', () => {
  it('regroupe par section : 6 pièces de 250 × 18, longueur totale 2 × 1000 + 4 × 764 = 5056', () => {
    const rows = purchaseSummary(createPlan(base))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ key: '250x18', width: 250, thickness: 18, pieces: 6, totalLength: 5056, origins: { shelf: 6 } })
  })

  it('trie par épaisseur puis largeur', () => {
    const plan = createPlan(base)
    plan.shelves[0].depth = 200 // 1 tablette de 200 × 18
    plan.shelves[1].thickness = 25 // 1 tablette de 250 × 25
    const keys = purchaseSummary(plan).map((r) => r.key)
    expect(keys).toEqual(['200x18', '250x18', '250x25'])
  })
})

describe('optimizeCuts', () => {
  it('First Fit Decreasing : 1000, 1000 puis 764 ×4 dans 2400 → 3 planches', () => {
    // Planche 1 : 1000 + 1000 = 2000 (+ 764 = 2764 > 2400), chute 400.
    // Planche 2 : 764 × 3 = 2292, chute 108. Planche 3 : 764, chute 1636.
    const { boards, errors } = optimizeCuts(pieces([764, 1000, 764, 1000, 764, 764]), 2400, 0)
    expect(errors).toEqual([])
    expect(boards.map((b) => b.pieces.map((p) => p.length))).toEqual([[1000, 1000], [764, 764, 764], [764]])
    expect(boards.map((b) => b.waste)).toEqual([400, 108, 1636])
  })

  it('le trait de scie réduit la place : 1200 + 1200 tient dans 2400 sans trait, pas avec 3 mm', () => {
    expect(optimizeCuts(pieces([1200, 1200]), 2400, 0).boards).toHaveLength(1)
    // 1200 + 1200 + 1 coupe entre les deux (3) = 2403 > 2400.
    expect(optimizeCuts(pieces([1200, 1200]), 2400, 3).boards).toHaveLength(2)
  })

  it('compte une coupe par pièce dans la chute : 1000 + 1000 avec 3 mm → 2400 − 2000 − 2 × 3 = 394', () => {
    const { boards } = optimizeCuts(pieces([1000, 1000]), 2400, 3)
    expect(boards[0].waste).toBe(394)
  })

  it('une pièce de la longueur exacte de la planche tient, avec ou sans trait de scie', () => {
    expect(optimizeCuts(pieces([2400]), 2400, 3).boards).toHaveLength(1)
    expect(optimizeCuts(pieces([2400]), 2400, 3).boards[0].waste).toBe(0)
  })

  it('pièce plus longue que la planche : erreur explicite, sans planter, les autres pièces sont placées', () => {
    const result = optimizeCuts([{ mark: 'C', length: 1850 }, { mark: 'A', length: 500 }], 1800, 0)
    expect(result.errors).toEqual(['la pièce C (1 850 mm) dépasse la longueur des planches (1 800 mm)'])
    expect(result.boards).toHaveLength(1)
    expect(result.boards[0].pieces).toEqual([{ mark: 'A', length: 500 }])
  })

  it('aucune pièce : aucune planche, aucune erreur', () => {
    expect(optimizeCuts([], 2400, 3)).toEqual({ boards: [], errors: [] })
  })
})

describe('purchasePlan', () => {
  it('étagère de base : 3 planches de 2 400 mm, chute totale 400 + 108 + 1636 = 2144', () => {
    const [row] = purchasePlan(createPlan(base))
    expect(row.stockLength).toBe(2400)
    expect(row.boards).toHaveLength(3)
    expect(row.totalWaste).toBe(2144)
  })

  it('utilise le trait de scie du plan quand il est activé', () => {
    const on = setPlanProperty(createPlan(base), { property: 'sawKerfEnabled', value: true })
    if (!on.ok) throw new Error(on.error)
    const [row] = purchasePlan(on.plan)
    // Planche 1 : 1000 + 1000, deux coupes.
    expect(row.boards[0].waste).toBe(2400 - 2000 - 2 * on.plan.options.sawKerf)
  })

  it('plusieurs sections : chacune avec sa longueur de planche', () => {
    const plan = createPlan(base)
    plan.shelves[0].depth = 200 // une tablette de 764 × 200 × 18
    const set = setStockLength(plan, '200x18', 3000)
    if (!set.ok) throw new Error(set.error)
    const rows = purchasePlan(set.plan)
    expect(rows.map((r) => [r.key, r.pieces, r.stockLength, r.boards.length])).toEqual([
      ['200x18', 1, 3000, 1],
      // 1000 + 1000 sur une planche, 764 × 3 = 2292 sur l'autre.
      ['250x18', 5, 2400, 2],
    ])
  })

  it('pièce trop longue pour sa section : erreur dans la section, pas d’exception', () => {
    const set = setStockLength(createPlan(base), '250x18', 900)
    if (!set.ok) throw new Error(set.error)
    const [row] = purchasePlan(set.plan)
    expect(row.errors).toEqual(['la pièce A (1 000 mm) dépasse la longueur des planches (900 mm)'])
    expect(row.boards.flatMap((b) => b.pieces.map((p) => p.length))).toEqual([764, 764, 764, 764])
  })
})

describe('setStockLength et sauvegarde', () => {
  it('refuse une longueur hors 100 à 6000, non entière, ou une clé invalide', () => {
    const plan = createPlan(base)
    expect(setStockLength(plan, '250x18', 99).ok).toBe(false)
    expect(setStockLength(plan, '250x18', 6001).ok).toBe(false)
    expect(setStockLength(plan, '250x18', 2400.5).ok).toBe(false)
    expect(setStockLength(plan, 'abc', 2400).ok).toBe(false)
  })

  it('la limite de 50 sections ne compte que les sections présentes : les absentes sont retirées', () => {
    const plan = createPlan(base)
    plan.options.stockLengths = {}
    for (let i = 1; i <= 50; i++) plan.options.stockLengths[`${i}x18`] = 2000
    const r = setStockLength(plan, '250x18', 2500)
    if (!r.ok) throw new Error(r.error)
    expect(r.plan.options.stockLengths).toEqual({ '250x18': 2500 })
  })

  it('ne modifie pas le plan d’origine', () => {
    const plan = createPlan(base)
    setStockLength(plan, '250x18', 3000)
    expect(plan.options.stockLengths).toBeUndefined()
  })

  it('survit à l’enregistrement ; absent = rétrocompatible', () => {
    const plan = createPlan(base)
    expect(parsePlan(JSON.parse(JSON.stringify(plan))).ok).toBe(true)
    const set = setStockLength(plan, '250x18', 3000)
    if (!set.ok) throw new Error(set.error)
    const back = parsePlan(JSON.parse(JSON.stringify(set.plan)))
    expect(back.ok && back.plan.options.stockLengths).toEqual({ '250x18': 3000 })
    expect(serializePlan(plan)).not.toContain('stockLengths')
  })

  it('la lecture refuse les valeurs invalides', () => {
    const accepted = (stockLengths: unknown) => {
      const plan = JSON.parse(JSON.stringify(createPlan(base)))
      plan.options.stockLengths = stockLengths
      return parsePlan(plan).ok
    }
    expect(accepted({ '250x18': 50 })).toBe(false)
    expect(accepted({ '250x18': 7000 })).toBe(false)
    expect(accepted({ '250x18': 2400.5 })).toBe(false)
    expect(accepted({ large: 2400 })).toBe(false)
    expect(accepted([2400])).toBe(false)
    expect(accepted({ '250x18': 2400 })).toBe(true)
  })
})
