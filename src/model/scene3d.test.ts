import { describe, expect, it } from 'vitest'
import { addObjectRow } from './objects'
import { createPlan } from './plan'
import { buildScene3D, WALL_THICKNESS } from './scene3d'
import { addSupport } from './supports'

// 800 × 1000 × 250, 3 étages, bois de 18.
const base = () => createPlan({ width: 800, height: 1000, depth: 250, stages: 3, uprightThickness: 18, shelfThickness: 18 })

describe('scène 3D', () => {
  it('une boîte par pièce : 2 montants + 4 tablettes, toutes contre le mur', () => {
    const scene = buildScene3D(base())
    expect(scene.boxes).toHaveLength(6)
    expect(scene.boxes.every((b) => b.z === 0 && b.sz === 250)).toBe(true)
    expect(scene.min).toEqual([0, 0, 0])
    expect(scene.max).toEqual([800, 1000, 250])
  })

  it('le mur est derrière l’étagère et la dépasse de partout', () => {
    const { wall } = buildScene3D(base())
    expect(wall.z).toBe(-WALL_THICKNESS)
    expect(wall.z + wall.sz).toBe(0)
    expect(wall.x).toBeLessThan(0)
    expect(wall.x + wall.sx).toBeGreaterThan(800)
    expect(wall.y).toBeLessThan(0)
    expect(wall.y + wall.sy).toBeGreaterThan(1000)
  })

  it('les supports sont dessinés à leur place, y compris sous l’étagère', () => {
    const r = addSupport(base(), 'under')
    if (!r.ok) throw new Error(r.error)
    const support = buildScene3D(r.plan).boxes.find((b) => b.kind === 'support')!
    expect(support).toMatchObject({ x: 0, y: -40, z: 150, sx: 100, sy: 40, sz: 100 })
    expect(buildScene3D(r.plan).min[1]).toBe(-40)
    expect(buildScene3D(r.plan, { supports: false }).boxes.some((b) => b.kind === 'support')).toBe(false)
  })

  it('les objets de simulation sont des formes simples : boîte, ou cylindre pour un bocal', () => {
    const manga = addObjectRow(base(), 'shelf-1', 'manga', 3)
    const jar = addObjectRow(base(), 'shelf-1', 'jar', 2)
    if (!manga.ok || !jar.ok) throw new Error('ajout impossible')
    const mangas = buildScene3D(manga.plan).boxes.filter((b) => b.kind === 'object')
    expect(mangas).toHaveLength(3)
    expect(mangas[0]).toMatchObject({ shape: 'box', sx: 14, sy: 175, sz: 115, y: 18 })
    expect(buildScene3D(jar.plan).boxes.filter((b) => b.shape === 'cylinder')).toHaveLength(2)
    expect(buildScene3D(manga.plan, { objects: false }).boxes.some((b) => b.kind === 'object')).toBe(false)
  })

  it('un objet plus profond que la tablette est signalé', () => {
    const shallow = createPlan({ width: 800, height: 1000, depth: 100, stages: 3, uprightThickness: 18, shelfThickness: 18 })
    const r = addObjectRow(shallow, 'shelf-1', 'manga', 1)
    if (!r.ok) throw new Error(r.error)
    expect(buildScene3D(r.plan).boxes.find((b) => b.kind === 'object')!.bad).toBe(true)
  })
})
