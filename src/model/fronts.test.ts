import { describe, expect, it } from 'vitest'
import { computeCutList } from './cutlist'
import { contextMenuItems } from './contextMenu'
import { setFront } from './frontEdit'
import { DRAWER_BOX_THICKNESS, FRONT_GAP, drawerBox, frontPieces, frontRects } from './fronts'
import { createPlan } from './plan'
import { buildScene3D } from './scene3d'
import { parsePlan } from './serialize'
import type { Plan } from './types'

const base = (): Plan => createPlan({ name: 'T', width: 800, height: 1000, depth: 250, stages: 3, uprightThickness: 18, shelfThickness: 18 })
const must = (r: ReturnType<typeof setFront>): Plan => {
  if (!r.ok) throw new Error(r.error)
  return r.plan
}

describe('portes et tiroirs', () => {
  it('une porte : encastrée dans l’ouverture de l’étage avec un jeu autour', () => {
    const plan = must(setFront(base(), 'shelf-1', { type: 'doors', count: 1, hinge: 'right' }))
    const stage = 1
    const [door] = frontRects(plan)
    expect(door.id).toBe('door-shelf-1-1')
    expect(door.x).toBe(18 + FRONT_GAP)
    expect(door.width).toBe(800 - 36 - 2 * FRONT_GAP)
    expect(door.y).toBe(plan.shelves.find((s) => s.id === 'shelf-1')!.y + 18 + FRONT_GAP)
    expect(door.hinge).toBe('right')
    expect(stage).toBe(1)
  })

  it('deux portes : même largeur, jeu au milieu', () => {
    const plan = must(setFront(base(), 'shelf-1', { type: 'doors', count: 2 }))
    const [a, b] = frontRects(plan)
    expect(a.width).toBe(b.width)
    expect(b.x - (a.x + a.width)).toBeGreaterThanOrEqual(FRONT_GAP)
    expect(a.hinge).toBe('left')
    expect(b.hinge).toBe('right')
  })

  it('un tiroir : façade plus les planches de la caisse, dans la liste à part', () => {
    const plan = must(setFront(base(), 'shelf-1', { type: 'drawer' }))
    const pieces = frontPieces(plan)
    expect(pieces.map((p) => p.id.split('#')[1] ?? 'front')).toEqual(['front', 'side-1', 'side-2', 'back', 'bottom'])
    const box = drawerBox(plan, 'shelf-1')!
    expect(pieces[1]).toMatchObject({ length: box.depth, width: box.height, thickness: DRAWER_BOX_THICKNESS })
    const { fronts, totalPieces } = computeCutList(plan)
    expect(fronts.reduce((n, g) => n + g.quantity, 0)).toBe(5)
    // Les pièces de l'étagère ne sont pas touchées.
    expect(totalPieces).toBe(computeCutList(base()).totalPieces)
  })

  it('un étage trop bas pour son tiroir est refusé ; « ouvert » retire le choix', () => {
    const plan = base()
    plan.shelves[1].y = plan.shelves[0].y + plan.shelves[0].thickness + 40
    expect(setFront(plan, 'shelf-1', { type: 'drawer' }).ok).toBe(false)
    const withDoor = must(setFront(base(), 'shelf-1', { type: 'doors', count: 1 }))
    expect(must(setFront(withDoor, 'shelf-1', null)).fronts).toBeUndefined()
  })

  it('sauvegarde, 3D et menu', () => {
    const plan = must(setFront(base(), 'shelf-1', { type: 'drawer' }))
    const parsed = parsePlan(JSON.parse(JSON.stringify(plan)))
    expect(parsed.ok && parsed.plan.fronts).toEqual(plan.fronts)
    expect(buildScene3D(plan).boxes.filter((b) => b.kind === 'front')).toHaveLength(2)
    const items = contextMenuItems(plan, 'drawer-shelf-1', { x: 100, y: 100 })
    expect(items.some((i) => i.label.startsWith('Retirer'))).toBe(true)
  })
})
