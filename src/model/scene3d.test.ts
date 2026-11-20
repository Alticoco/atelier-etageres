import { describe, expect, it } from 'vitest'
import { addCustomKind, addObjectRow } from './objects'
import { createPlan } from './plan'
import { buildScene3D, labelTextColor, showsLabel, WALL_THICKNESS } from './scene3d'
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

describe('scène 3D : cylindres couchés et noms', () => {
  const withJars = (orientation: 'standing' | 'lying' | 'facing') => {
    const r = addObjectRow(base(), 'shelf-1', 'jar', 2, 0, { orientation })
    if (!r.ok) throw new Error(r.error)
    return buildScene3D(r.plan).boxes.filter((b) => b.kind === 'object')
  }

  it('un bocal debout ou de face a son axe vertical, couché il a son axe dans le sens de la largeur', () => {
    expect(withJars('standing')[0]).toMatchObject({ shape: 'cylinder', axis: 'y', sx: 55, sy: 100 })
    expect(withJars('facing')[0]).toMatchObject({ shape: 'cylinder', axis: 'y' })
    expect(withJars('lying')[0]).toMatchObject({ shape: 'cylinder', axis: 'x', sx: 100, sy: 55, sz: 55 })
  })

  it('les boîtes n’ont pas d’axe', () => {
    const r = addObjectRow(base(), 'shelf-1', 'manga', 1)
    if (!r.ok) throw new Error(r.error)
    expect(buildScene3D(r.plan).boxes.find((b) => b.kind === 'object')!.axis).toBeUndefined()
  })

  it('le nom ne s’écrit que sur un objet sur mesure dont la face avant est assez grande', () => {
    let p = base()
    const wide = addCustomKind(p, { label: 'Boîte à thé', width: 100, height: 120, depth: 100 })
    if (!wide.ok) throw new Error(wide.error)
    const thin = addCustomKind(wide.plan, { label: 'Fin', width: 20, height: 120, depth: 100 })
    if (!thin.ok) throw new Error(thin.error)
    p = thin.plan
    for (const id of [wide.id, thin.id, 'manga']) {
      const r = addObjectRow(p, 'shelf-1', id, 1)
      if (!r.ok) throw new Error(r.error)
      p = r.plan
    }
    const objects = buildScene3D(p).boxes.filter((b) => b.kind === 'object')
    const byKind = (id: string) => objects.find((b) => b.objectKind === id)!
    expect(showsLabel(byKind(wide.id))).toBe(true)
    expect(showsLabel(byKind(thin.id))).toBe(false)
    expect(showsLabel(byKind('manga'))).toBe(false)
  })

  it('texte sombre sur fond clair, clair sur fond sombre', () => {
    expect(labelTextColor('#ffffff')).toBe('#222222')
    expect(labelTextColor('#e3c46f')).toBe('#222222')
    expect(labelTextColor('#1a2b4c')).toBe('#ffffff')
    expect(labelTextColor('n’importe quoi')).toBe('#222222')
  })
})
