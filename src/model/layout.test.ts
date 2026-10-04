import { describe, expect, it } from 'vitest'
import { computeFrontRects } from './layout'
import { createPlan } from './plan'

const base = {
  width: 800,
  height: 1000,
  depth: 250,
  stages: 3,
  uprightThickness: 18,
  shelfThickness: 18,
}

describe('computeFrontRects — cadre « entre les montants »', () => {
  const plan = createPlan(base)
  const rects = computeFrontRects(plan)
  const byId = Object.fromEntries(rects.map((r) => [r.id, r]))

  it('montants pleine hauteur, collés aux bords', () => {
    expect(byId['upright-left']).toMatchObject({ x: 0, y: 0, width: 18, height: 1000 })
    expect(byId['upright-right']).toMatchObject({ x: 782, y: 0, width: 18, height: 1000 })
  })

  it('tablettes entre les montants', () => {
    expect(byId['shelf-1']).toMatchObject({ x: 18, y: 0, width: 764, height: 18 })
    expect(byId['shelf-4']).toMatchObject({ x: 18, y: 982, width: 764, height: 18 })
  })

  it("ne chevauche aucune pièce : les tablettes touchent les montants sans entrer dedans", () => {
    const shelf = byId['shelf-2']
    expect(shelf.x).toBe(byId['upright-left'].x + byId['upright-left'].width)
    expect(shelf.x + shelf.width).toBe(byId['upright-right'].x)
  })
})

describe('computeFrontRects — tablettes haut/bas posées sur les montants', () => {
  const plan = createPlan({ ...base, framePlacement: 'onTop' })
  const byId = Object.fromEntries(computeFrontRects(plan).map((r) => [r.id, r]))

  it('les montants se glissent entre la tablette du bas et celle du haut', () => {
    expect(byId['upright-left']).toMatchObject({ y: 18, height: 964 })
  })

  it('les tablettes extrêmes prennent toute la largeur', () => {
    expect(byId['shelf-1']).toMatchObject({ x: 0, width: 800 })
    expect(byId['shelf-4']).toMatchObject({ x: 0, width: 800 })
    expect(byId['shelf-2']).toMatchObject({ x: 18, width: 764 })
  })
})

describe('computeFrontRects — cales', () => {
  it("pose la cale sur la tablette du dessous, avec le jeu en haut", () => {
    const plan = createPlan(base)
    plan.wedges.push({ id: 'wedge-1', shelfBelowId: 'shelf-2', x: 300, thickness: 18, depth: 250, cornerRadius: 0, edgeRadius: 0 })
    const wedge = computeFrontRects(plan).find((r) => r.id === 'wedge-1')
    // shelf-2 : y = 18 + 310 = 328, dessus à 346 ; étage de 309 mm, cale de 308
    expect(wedge).toMatchObject({ x: 300, y: 346, width: 18, height: 308 })
  })
})
