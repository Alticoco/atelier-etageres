import { describe, expect, it } from 'vitest'
import { dragWedgeToStage } from './drag'
import { evenSlots, nearestGuide, supportXGuides, wedgeGuides } from './guides'
import { createPlan } from './plan'
import { addSupport, dragSupport, supportGuidesAt } from './supports'
import { moveWedge } from './tools'
import type { Plan } from './types'

// 800 × 1000 × 250, 3 étages, montants de 18 : espace entre les montants de 18 à 782 (764 mm).
const base = (): Plan => createPlan({ width: 800, height: 1000, depth: 250, stages: 3, uprightThickness: 18, shelfThickness: 18 })
const wedge = (id: string, shelfBelowId: string, x: number) =>
  ({ id, shelfBelowId, x, thickness: 18, depth: 250, cornerRadius: 0, edgeRadius: 0 }) as const

describe('répartition égale', () => {
  it('deux pièces tombent aux tiers, trois aux quarts', () => {
    expect(evenSlots(0, 300, [0, 0])).toEqual([100, 200])
    expect(evenSlots(0, 400, [0, 0, 0])).toEqual([100, 200, 300])
    // Les largeurs comptent : 2 cales de 18 dans 764 mm → écarts de (764 − 36) / 3.
    expect(evenSlots(18, 782, [18, 18])).toEqual([261, 521])
  })

  it('le repère le plus proche, dans la limite de l’aimantation', () => {
    const guides = [{ pos: 100, size: 18, label: 'a' }, { pos: 200, size: 18, label: 'b' }]
    expect(nearestGuide(guides, 108)?.label).toBe('a')
    expect(nearestGuide(guides, 150)).toBeNull()
  })
})

describe('repères d’une cale', () => {
  it('seule dans l’étage : le milieu pile', () => {
    const plan = base()
    plan.wedges.push(wedge('wedge-1', 'shelf-1', 100))
    const guides = wedgeGuides(plan, 'wedge-1', 'shelf-1')
    expect(guides[0]).toMatchObject({ pos: 391, label: 'Milieu' })
    // Le centre de la cale (391 + 9) est au milieu de l'étage (18 + 382 = 400).
    expect(guides[0].pos + 9).toBe(400)
  })

  it('une cale se cale au milieu quand on la lâche près du milieu, pas avec Alt', () => {
    const plan = base()
    plan.wedges.push(wedge('wedge-1', 'shelf-1', 100))
    const snapped = moveWedge(plan, 'wedge-1', 'shelf-1', 385, 10)
    expect(snapped.ok && snapped.plan.wedges[0].x).toBe(391)
    const free = moveWedge(plan, 'wedge-1', 'shelf-1', 385, null)
    expect(free.ok && free.plan.wedges[0].x).toBe(385)
  })

  it('deux cales : chacune se cale à son tiers', () => {
    const plan = base()
    plan.wedges.push(wedge('wedge-1', 'shelf-1', 100), wedge('wedge-2', 'shelf-1', 600))
    const first = moveWedge(plan, 'wedge-1', 'shelf-1', 255, 10)
    expect(first.ok && first.plan.wedges.find((w) => w.id === 'wedge-1')!.x).toBe(261)
    const second = moveWedge(plan, 'wedge-2', 'shelf-1', 515, 10)
    expect(second.ok && second.plan.wedges.find((w) => w.id === 'wedge-2')!.x).toBe(521)
  })

  it('trois cales : celle du milieu est centrée, les autres aux quarts', () => {
    const plan = base()
    plan.wedges.push(wedge('wedge-1', 'shelf-1', 100), wedge('wedge-2', 'shelf-1', 300), wedge('wedge-3', 'shelf-1', 600))
    const middle = moveWedge(plan, 'wedge-2', 'shelf-1', 395, 10)
    expect(middle.ok && middle.plan.wedges.find((w) => w.id === 'wedge-2')!.x).toBe(391)
    const first = moveWedge(plan, 'wedge-1', 'shelf-1', 190, 10)
    // (764 − 54) / 4 = 177,5 : première cale à 18 + 177,5.
    expect(first.ok && first.plan.wedges.find((w) => w.id === 'wedge-1')!.x).toBe(196)
  })

  it('une cale d’un autre étage s’aligne avec celle d’en dessous', () => {
    const plan = base()
    plan.wedges.push(wedge('wedge-1', 'shelf-1', 300), wedge('wedge-2', 'shelf-2', 100))
    const guides = wedgeGuides(plan, 'wedge-2', 'shelf-2')
    expect(guides.some((g) => g.aligned && g.pos === 300)).toBe(true)
    const r = moveWedge(plan, 'wedge-2', 'shelf-2', 306, 10)
    expect(r.ok && r.plan.wedges.find((w) => w.id === 'wedge-2')!.x).toBe(300)
  })

  it('le glisser indique le repère sur lequel la cale s’est calée', () => {
    const plan = base()
    plan.wedges.push(wedge('wedge-1', 'shelf-1', 100))
    // Hauteur du curseur dans l'étage 1 (de 18 à 328).
    const moved = dragWedgeToStage(plan, 'wedge-1', 388, 150, 10)
    expect(moved?.x).toBe(391)
    expect(moved?.guide?.label).toBe('Milieu')
    expect(dragWedgeToStage(plan, 'wedge-1', 388, 150, null)?.guide).toBeNull()
    expect(dragWedgeToStage(plan, 'wedge-1', 200, 150, 10)?.guide).toBeNull()
  })
})

describe('repères d’un support', () => {
  const withSupport = () => {
    const r = addSupport(base(), 'under')
    if (!r.ok) throw new Error(r.error)
    return r
  }

  it('centré au milieu, au tiers, au quart de la largeur', () => {
    const { plan, id } = withSupport()
    const labels = Object.fromEntries(supportXGuides(plan, id).map((g) => [g.label, g.pos + g.size / 2]))
    expect(labels['Milieu']).toBe(400)
    expect(labels['1/3']).toBeCloseTo(266.67, 0)
    expect(labels['1/4']).toBe(200)
    expect(labels['3/4']).toBe(600)
  })

  it('le glisser se cale sur le milieu et le dit ; Alt le désactive', () => {
    const { plan, id } = withSupport()
    const snapped = dragSupport(plan, id, { x: 345 }, 10)
    expect(snapped.supports![0].x).toBe(350)
    expect(supportGuidesAt(snapped, id).x?.label).toBe('Milieu')
    const free = dragSupport(plan, id, { x: 345.4 }, null)
    expect(free.supports![0].x).toBe(345)
    expect(supportGuidesAt(free, id).x).toBeNull()
  })

  it('centré dans la profondeur : recul de (250 − 100) / 2', () => {
    const { plan, id } = withSupport()
    const snapped = dragSupport(plan, id, { z: 80 }, 10)
    expect(snapped.supports![0].z).toBe(75)
    expect(supportGuidesAt(snapped, id).z?.label).toBe('Milieu de la profondeur')
  })

  it('deux supports sous l’étagère : écarts égaux sur toute la largeur', () => {
    const first = withSupport()
    const second = addSupport(first.plan, 'under')
    if (!second.ok) throw new Error(second.error)
    // 2 supports de 100 sur 800 : écarts de 200 → positions 200 et 500.
    const guides = supportXGuides(second.plan, second.id).filter((g) => g.label.startsWith('Écarts égaux'))
    expect(guides.map((g) => g.pos).sort((a, b) => a - b)).toEqual([200, 500])
  })
})
