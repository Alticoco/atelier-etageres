import { describe, expect, it } from 'vitest'
import { computeProfileRects, profileSize } from './profile'
import { createPlan } from './plan'

const base = {
  width: 800,
  height: 1000,
  depth: 250,
  stages: 3,
  uprightThickness: 18,
  shelfThickness: 18,
}

function byId(plan = createPlan(base)) {
  return Object.fromEntries(computeProfileRects(plan).map((r) => [r.id, r]))
}

describe('computeProfileRects', () => {
  it('montre la profondeur de chaque pièce, collée au mur', () => {
    const rects = byId()
    for (const r of Object.values(rects)) {
      expect(r.x).toBe(0)
      expect(r.width).toBe(250)
    }
  })

  it('garde les hauteurs de la vue de face', () => {
    const rects = byId()
    expect(rects['upright-left']).toMatchObject({ y: 0, height: 1000 })
    expect(rects['shelf-2']).toMatchObject({ y: 328, height: 18 })
  })

  it('reprend la profondeur propre à chaque pièce', () => {
    const plan = createPlan(base)
    plan.shelves[1].depth = 200
    plan.leftUpright.depth = 300
    plan.wedges.push({ id: 'wedge-1', shelfBelowId: 'shelf-1', x: 300, thickness: 18, depth: 180 })
    const rects = byId(plan)
    expect(rects['shelf-2'].width).toBe(200)
    expect(rects['upright-left'].width).toBe(300)
    expect(rects['wedge-1'].width).toBe(180)
  })

  it('cadre « entre les montants » : seul le montant gauche est visible', () => {
    const rects = byId()
    expect(rects['upright-left'].hidden).toBe(false)
    expect(rects['upright-right'].hidden).toBe(true)
    for (const id of ['shelf-1', 'shelf-2', 'shelf-3', 'shelf-4']) expect(rects[id].hidden).toBe(true)
  })

  it('tablettes du haut et du bas posées sur les montants : elles sont visibles', () => {
    const rects = byId(createPlan({ ...base, framePlacement: 'onTop' }))
    expect(rects['shelf-1'].hidden).toBe(false)
    expect(rects['shelf-4'].hidden).toBe(false)
    expect(rects['shelf-2'].hidden).toBe(true)
    expect(rects['shelf-3'].hidden).toBe(true)
    expect(rects['upright-left']).toMatchObject({ y: 18, height: 964 })
  })

  it('les cales sont toujours cachées', () => {
    const plan = createPlan(base)
    plan.wedges.push({ id: 'wedge-1', shelfBelowId: 'shelf-1', x: 300, thickness: 18, depth: 250 })
    expect(byId(plan)['wedge-1']).toMatchObject({ kind: 'wedge', hidden: true, y: 18, height: 309 })
  })
})

describe('profileSize', () => {
  it('prend la plus grande profondeur et la hauteur hors-tout', () => {
    expect(profileSize(createPlan(base))).toEqual({ width: 250, height: 1000 })
  })

  it('suit la pièce la plus profonde', () => {
    const plan = createPlan(base)
    plan.shelves[2].depth = 320
    expect(profileSize(plan)).toEqual({ width: 320, height: 1000 })
  })
})
