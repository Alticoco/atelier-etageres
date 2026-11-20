import { describe, expect, it } from 'vitest'
import { dragObjectToStage, dragShelf, dragShelfWithGuide } from './drag'
import { OBJECT_CLEARANCE_MM, objectGuides, shelfGuides, tallestPile } from './guides'
import { addObjectRow } from './objects'
import { getStages } from './pieces'
import { createPlan } from './plan'
import { addSupport, dragSupport } from './supports'
import type { Plan } from './types'

// 800 × 1000, 3 étages, bois de 18 : entre les montants de 18 à 782 ; tablettes à 0, 328, 655, 982.
const base = (): Plan => createPlan({ width: 800, height: 1000, depth: 250, stages: 3, uprightThickness: 18, shelfThickness: 18 })
const wedge = (id: string, shelfBelowId: string, x: number) =>
  ({ id, shelfBelowId, x, thickness: 18, depth: 250, cornerRadius: 0, edgeRadius: 0 }) as const

/** Tablette 2 montée à 400 : étages libres 382, 237, 309. */
const uneven = (): Plan => dragShelf(base(), 'shelf-2', 400, null)

describe('repères d’une tablette', () => {
  it('étages égaux : l’étage du dessous et celui du dessus ont la même hauteur', () => {
    const { plan, guide } = dragShelfWithGuide(uneven(), 'shelf-3', 695, 10)
    expect(guide?.label).toBe('Étages égaux')
    const stages = getStages(plan)
    expect(stages[1].clearHeight).toBe(273)
    expect(stages[2].clearHeight).toBe(273)
  })

  it('l’emporte sur l’arrondi au pas ; Alt le désactive', () => {
    // Sans repère, 695 donnerait un étage de 280 (pas de 10) ; le repère donne 273.
    expect(dragShelfWithGuide(uneven(), 'shelf-3', 695, 10).plan.shelves[2].y).toBe(691)
    const free = dragShelfWithGuide(uneven(), 'shelf-3', 695, null)
    expect(free.plan.shelves[2].y).toBe(695)
    expect(free.guide).toBeNull()
  })

  it('même hauteur qu’un autre étage', () => {
    const { plan, guide } = dragShelfWithGuide(uneven(), 'shelf-3', 806, 10)
    expect(guide?.label).toBe('Même hauteur que l’étage 1')
    expect(getStages(plan)[1].clearHeight).toBe(382)
  })

  it('ajusté aux objets : plus haute pile du dessous + 2 cm', () => {
    const r = addObjectRow(base(), 'shelf-1', 'manga', 3)
    if (!r.ok) throw new Error(r.error)
    expect(tallestPile(r.plan, 'shelf-1')).toBe(175)
    const { plan, guide } = dragShelfWithGuide(r.plan, 'shelf-2', 220, 10)
    expect(guide?.label).toBe('Ajusté aux objets')
    expect(getStages(plan)[0].clearHeight).toBe(175 + OBJECT_CLEARANCE_MM)
  })

  it('une pile compte pour sa hauteur totale', () => {
    const r = addObjectRow(base(), 'shelf-1', 'jar', 4, 0, { stack: 2 })
    if (!r.ok) throw new Error(r.error)
    expect(tallestPile(r.plan, 'shelf-1')).toBe(200)
    expect(shelfGuides(r.plan, 'shelf-2').find((g) => g.label === 'Ajusté aux objets')?.pos).toBe(18 + 200 + 20)
  })

  it('pas de repère pour la tablette du haut ou du bas ; loin de tout repère, l’arrondi au pas', () => {
    expect(shelfGuides(base(), 'shelf-1')).toEqual([])
    expect(shelfGuides(base(), 'shelf-4')).toEqual([])
    const far = dragShelfWithGuide(base(), 'shelf-2', 403, 10)
    expect(far.guide).toBeNull()
    expect(getStages(far.plan)[0].clearHeight).toBe(390)
  })
})

describe('repères d’un objet posé seul', () => {
  const withRow = () => {
    const r = addObjectRow(base(), 'shelf-1', 'pocket', 2)
    if (!r.ok) throw new Error(r.error)
    return r.plan
  }

  it('milieu de l’étage ; Alt le désactive', () => {
    // Livre de poche de 25 mm : centré entre 18 et 782 → bord gauche à 387,5 arrondi.
    const moved = dragObjectToStage(withRow(), 'obj:row-1:1', 383, 150, 10)
    expect(moved?.x).toBe(388)
    expect(moved?.guide?.label).toBe('Milieu')
    const free = dragObjectToStage(withRow(), 'obj:row-1:1', 383, 150, null)
    expect(free?.x).toBe(383)
    expect(free?.guide).toBeNull()
  })

  it('même bord gauche qu’une cale ou un objet d’un autre étage', () => {
    const plan = withRow()
    plan.wedges.push(wedge('wedge-1', 'shelf-2', 300))
    plan.placedObjects = [{ id: 'placed-1', shelfBelowId: 'shelf-3', kind: 'manga', x: 600 }]
    const onWedge = dragObjectToStage(plan, 'obj:row-1:1', 305, 150, 10)
    expect(onWedge?.x).toBe(300)
    expect(onWedge?.guide).toMatchObject({ label: 'Aligné avec une cale', aligned: true, size: 0 })
    const onObject = dragObjectToStage(plan, 'obj:row-1:1', 594, 150, 10)
    expect(onObject?.x).toBe(600)
    expect(onObject?.guide?.label).toBe('Aligné avec un objet')
  })

  it('un repère occupé (cale au milieu) est ignoré', () => {
    const plan = withRow()
    plan.wedges.push(wedge('wedge-1', 'shelf-1', 380))
    expect(objectGuides(plan, 'obj:row-1:1', 25, 'shelf-1')[0]).toMatchObject({ pos: 388, label: 'Milieu' })
    const moved = dragObjectToStage(plan, 'obj:row-1:1', 392, 150, 10)
    expect(moved?.guide).toBeNull()
    expect(moved?.x).not.toBe(388)
  })
})

describe('aimant entre supports', () => {
  const twoUnder = () => {
    const a = addSupport(base(), 'under')
    if (!a.ok) throw new Error(a.error)
    const b = addSupport(a.plan, 'under')
    if (!b.ok) throw new Error(b.error)
    // Supports de 100 × 40 à x = 0 et x = 700, sous l'étagère (y = -40).
    return b
  }

  it('collé côte à côte, à 10 mm près', () => {
    const { plan, id } = twoUnder()
    expect(dragSupport(plan, id, { x: 107 }, 5).supports![1].x).toBe(100)
    expect(dragSupport(plan, id, { x: 107 }, null).supports![1].x).toBe(107)
  })

  it('posé sous un autre support (y) et bords alignés', () => {
    const { plan, id } = twoUnder()
    expect(dragSupport(plan, id, { y: -86 }, 10).supports![1].y).toBe(-80)
    // Support 1 déplacé à x = 300 : le support 2 aligne son bord gauche sur le sien depuis 7 mm.
    const moved = dragSupport(plan, 'support-1', { x: 300 }, null)
    expect(dragSupport(moved, id, { x: 293 }, 1).supports![1].x).toBe(300)
  })

  it('profondeur : dos aligné sur celui d’un autre support', () => {
    const { plan, id } = twoUnder()
    const moved = dragSupport(plan, 'support-1', { z: 20 }, 10)
    const deep = { ...moved, supports: moved.supports!.map((s) => (s.id === 'support-1' ? { ...s, depth: 60 } : s)) }
    // support-1 : recul 20 (loin du mur et de l'avant) ; support-2 lâché à 26 prend le même recul.
    expect(dragSupport(deep, id, { z: 26 }, 1).supports![1].z).toBe(20)
  })
})
