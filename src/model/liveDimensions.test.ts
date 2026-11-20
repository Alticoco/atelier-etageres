import { describe, expect, it } from 'vitest'
import { dragObjectToStage } from './drag'
import { liveDimensions, mainDimension, typedTarget } from './liveDimensions'
import { addObjectRow } from './objects'
import { createPlan } from './plan'
import { addSupport } from './supports'
import type { Plan } from './types'

// 800 × 1000, 3 étages, bois de 18 : entre les montants de 18 à 782 ; tablettes à 0, 328, 655, 982 ;
// étage 1 de 18 à 328 (310 libres).
const base = (): Plan => createPlan({ width: 800, height: 1000, depth: 250, stages: 3, uprightThickness: 18, shelfThickness: 18 })
const wedge = (id: string, shelfBelowId: string, x: number) =>
  ({ id, shelfBelowId, x, thickness: 18, depth: 250, cornerRadius: 0, edgeRadius: 0 }) as const

describe('cotes dynamiques d’une cale', () => {
  it('seule : jusqu’aux montants, au milieu de la hauteur de l’étage', () => {
    const plan = base()
    plan.wedges.push(wedge('wedge-1', 'shelf-1', 300))
    expect(liveDimensions(plan, 'wedge-1')).toEqual([
      { axis: 'x', side: 'left', from: 18, to: 300, y: 173, value: 282 },
      { axis: 'x', side: 'right', from: 318, to: 782, y: 173, value: 464 },
    ])
  })

  it('jusqu’à la cale voisine du même étage, pas celle d’un autre étage', () => {
    const plan = base()
    plan.wedges.push(wedge('wedge-1', 'shelf-1', 300), wedge('wedge-2', 'shelf-1', 100), wedge('wedge-3', 'shelf-2', 400))
    const dims = liveDimensions(plan, 'wedge-1')
    expect(dims.find((d) => d.side === 'left')).toMatchObject({ from: 118, value: 182 })
    expect(dims.find((d) => d.side === 'right')).toMatchObject({ to: 782, value: 464 })
  })

  it('collée à un objet posé seul : distance 0', () => {
    const plan = base()
    plan.wedges.push(wedge('wedge-1', 'shelf-1', 300))
    plan.placedObjects = [{ id: 'placed-1', shelfBelowId: 'shelf-1', kind: 'pocket', x: 318 }]
    expect(liveDimensions(plan, 'wedge-1').find((d) => d.side === 'right')).toMatchObject({ from: 318, to: 318, value: 0 })
  })
})

describe('cotes dynamiques d’un objet posé seul', () => {
  it('entre le montant et une cale ; une rangée n’est pas un voisin', () => {
    const plan = base()
    plan.wedges.push(wedge('wedge-1', 'shelf-1', 300))
    const r = addObjectRow(plan, 'shelf-1', 'pocket', 3)
    if (!r.ok) throw new Error(r.error)
    const moved = dragObjectToStage(r.plan, 'obj:row-1:2', 200, 150, null)!
    const dims = liveDimensions(moved.plan, moved.id)
    expect(dims.find((d) => d.side === 'left')).toMatchObject({ from: 18, to: 200, value: 182 })
    expect(dims.find((d) => d.side === 'right')).toMatchObject({ from: 225, to: 300, value: 75 })
  })

  it('un objet d’une rangée (non déplacé) n’a pas de cote', () => {
    const r = addObjectRow(base(), 'shelf-1', 'pocket', 2)
    if (!r.ok) throw new Error(r.error)
    expect(liveDimensions(r.plan, 'obj:row-1:0')).toEqual([])
  })
})

describe('cotes dynamiques d’un support', () => {
  it('jusqu’au support voisin à la même hauteur et jusqu’au bord de l’étagère', () => {
    const a = addSupport(base(), 'under')
    if (!a.ok) throw new Error(a.error)
    const b = addSupport(a.plan, 'under')
    if (!b.ok) throw new Error(b.error)
    // Supports de 100 mm à x = 0 et x = 700.
    const dims = liveDimensions(b.plan, b.id)
    expect(dims.find((d) => d.side === 'left')).toMatchObject({ from: 100, to: 700, value: 600, y: -20 })
    expect(dims.find((d) => d.side === 'right')).toMatchObject({ from: 800, to: 800, value: 0 })
  })

  it('un support sur le côté : rien à gauche, collé à l’étagère à droite', () => {
    const a = addSupport(base(), 'under')
    if (!a.ok) throw new Error(a.error)
    const side = addSupport(a.plan, 'left')
    if (!side.ok) throw new Error(side.error)
    const dims = liveDimensions(side.plan, side.id)
    expect(dims.map((d) => d.side)).toEqual(['right'])
    expect(dims[0]).toMatchObject({ from: 0, to: 0, value: 0 })
  })
})

describe('cotes dynamiques d’une tablette', () => {
  it('hauteur libre dessous et dessus, au milieu de la largeur', () => {
    expect(liveDimensions(base(), 'shelf-2')).toEqual([
      { axis: 'y', side: 'below', from: 18, to: 328, x: 400, value: 310 },
      { axis: 'y', side: 'above', from: 346, to: 655, x: 400, value: 309 },
    ])
  })

  it('pas de cote pour la tablette du bas, du haut, un montant ou une pièce inconnue', () => {
    const plan = base()
    expect(liveDimensions(plan, 'shelf-1')).toEqual([])
    expect(liveDimensions(plan, 'shelf-4')).toEqual([])
    expect(liveDimensions(plan, 'upright-left')).toEqual([])
    expect(liveDimensions(plan, 'nope')).toEqual([])
  })
})

describe('valeur tapée pendant le glisser', () => {
  it('cale : bord gauche = voisin de gauche + valeur', () => {
    const plan = base()
    plan.wedges.push(wedge('wedge-1', 'shelf-1', 300))
    expect(typedTarget(plan, 'wedge-1', 100)).toEqual({ axis: 'x', value: 118 })
  })

  it('tablette : dessous = dessus de la tablette du dessous + valeur', () => {
    expect(typedTarget(base(), 'shelf-2', 200)).toEqual({ axis: 'y', value: 218 })
  })

  it('support posé à gauche du cadre (x négatif) : la valeur tapée est la distance à droite', () => {
    const plan = base()
    plan.supports = [{ id: 'support-1', x: -100, y: 100, z: 0, width: 50, height: 50, depth: 50 } as never]
    expect(mainDimension(liveDimensions(plan, 'support-1'))).toMatchObject({ side: 'right', from: -50, to: 0 })
    // Bord droit à 0 - 30 = -30, donc bord gauche à -80.
    expect(typedTarget(plan, 'support-1', 30)).toEqual({ axis: 'x', value: -80 })
  })

  it('pièce sans cote principale : null', () => {
    expect(typedTarget(base(), 'shelf-1', 200)).toBeNull()
  })
})
