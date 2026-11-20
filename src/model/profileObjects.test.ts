import { describe, expect, it } from 'vitest'
import { addCustomKind, addObjectRow } from './objects'
import { computeProfileObjects } from './profileObjects'
import { createPlan } from './plan'
import type { Plan } from './types'

function base(): Plan {
  return createPlan({ name: 'Test', width: 800, height: 1000, depth: 250, stages: 3, uprightThickness: 18, shelfThickness: 18 })
}

function withRow(plan: Plan, shelf: string, kind: string, count: number, options = {}): Plan {
  const r = addObjectRow(plan, shelf, kind, count, 0, options)
  if (!r.ok) throw new Error(r.error)
  return r.plan
}

describe('objets vus de profil', () => {
  it('ne donne rien sans objet', () => {
    expect(computeProfileObjects(base())).toEqual([])
  })

  it('regroupe une rangée en un seul rectangle (profondeur × hauteur de l’objet)', () => {
    const rects = computeProfileObjects(withRow(base(), 'shelf-1', 'manga', 20))
    expect(rects).toHaveLength(1)
    expect(rects[0]).toMatchObject({ kindId: 'manga', z: 0, depth: 115, height: 175, level: 0, bad: false, shape: 'box' })
  })

  it('un rectangle par étage et par type', () => {
    let p = withRow(base(), 'shelf-1', 'manga', 5)
    p = withRow(p, 'shelf-1', 'novel', 5)
    p = withRow(p, 'shelf-2', 'manga', 5)
    expect(computeProfileObjects(p)).toHaveLength(3)
  })

  it('un rectangle par niveau de pile', () => {
    const rects = computeProfileObjects(withRow(base(), 'shelf-1', 'album', 6, { orientation: 'lying', stack: 3 }))
    expect(rects.map((r) => r.level).sort()).toEqual([0, 1, 2])
    expect(rects[1].y).toBeGreaterThan(rects[0].y)
  })

  it('signale ce qui ne rentre pas (trop haut ou trop profond)', () => {
    const p = withRow(base(), 'shelf-1', 'novel', 2)
    expect(computeProfileObjects(p)[0]).toMatchObject({ depth: 140, bad: false })
    const shallow = createPlan({ name: 'Test', width: 800, height: 1000, depth: 100, stages: 3, uprightThickness: 18, shelfThickness: 18 })
    expect(computeProfileObjects(withRow(shallow, 'shelf-1', 'novel', 2))[0].bad).toBe(true)
  })

  it('reprend la couleur d’un objet sur mesure', () => {
    const added = addCustomKind(base(), { label: 'Boîte à thé', width: 100, height: 120, depth: 100, color: '#336699' })
    if (!added.ok) throw new Error(added.error)
    const rects = computeProfileObjects(withRow(added.plan, 'shelf-1', added.id, 3))
    expect(rects[0].color).toBe('#336699')
  })
})
