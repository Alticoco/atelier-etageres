import { describe, expect, it } from 'vitest'
import { addObjectRow, layoutStage, removeObjectRow, setObjectRowCount, stageCapacity } from './objects'
import { createPlan } from './plan'
import { getStages } from './pieces'
import { parsePlan } from './serialize'
import { removePieces } from './tools'

// 800 × 1000, 3 étages, montants de 18 : entre les montants = 764 mm.
const base = () => createPlan({ width: 800, height: 1000, depth: 250, stages: 3, uprightThickness: 18, shelfThickness: 18 })

describe('objets de simulation', () => {
  it('compte ce qui tient dans un étage : 764 / 14 = 54 mangas', () => {
    expect(stageCapacity(base(), 'shelf-1', 'manga')).toBe(54)
  })

  it('« remplir » pose le maximum, côte à côte depuis le montant gauche', () => {
    const r = addObjectRow(base(), 'shelf-1', 'manga')
    if (!r.ok) throw new Error(r.error)
    expect(r.plan.rows).toEqual([{ id: 'row-1', shelfBelowId: 'shelf-1', kind: 'manga', count: 54 }])
    const layout = layoutStage(r.plan, getStages(r.plan)[0])
    expect(layout.objects).toHaveLength(54)
    expect(layout.objects[0].x).toBe(18)
    expect(layout.objects[1].x).toBe(32)
    expect(layout.rows[0].overflow).toBe(0)
  })

  it('les objets sautent les cales et signalent ceux qui n’ont plus de place', () => {
    const p = base()
    p.wedges.push({ id: 'wedge-1', shelfBelowId: 'shelf-1', x: 400, thickness: 18, depth: 250, cornerRadius: 0, edgeRadius: 0 })
    const r = addObjectRow(p, 'shelf-1', 'manga', 60)
    if (!r.ok) throw new Error(r.error)
    const layout = layoutStage(r.plan, getStages(r.plan)[0])
    expect(layout.objects.every((o) => o.x + o.width <= 400 || o.x >= 418)).toBe(true)
    // 382 mm à gauche (27 mangas) + 364 mm à droite (26 mangas) = 53.
    expect(layout.rows[0]).toMatchObject({ placed: 53, overflow: 7 })
  })

  it('signale un objet plus haut que l’étage', () => {
    // Étages de 31 cm : un album de 32 cm ne rentre pas, un manga de 17,5 cm oui.
    const album = addObjectRow(base(), 'shelf-1', 'album', 3)
    if (!album.ok) throw new Error(album.error)
    expect(layoutStage(album.plan, getStages(album.plan)[0]).rows[0].tooTall).toBe(true)
    const manga = addObjectRow(base(), 'shelf-1', 'manga', 3)
    if (!manga.ok) throw new Error(manga.error)
    expect(layoutStage(manga.plan, getStages(manga.plan)[0]).rows[0].tooTall).toBe(false)
  })

  it('modifier et supprimer une rangée', () => {
    const r = addObjectRow(base(), 'shelf-1', 'jar', 4)
    if (!r.ok) throw new Error(r.error)
    const more = setObjectRowCount(r.plan, 'row-1', 6)
    expect(more.ok && more.plan.rows?.[0].count).toBe(6)
    expect(setObjectRowCount(r.plan, 'row-1', 0).ok).toBe(false)
    const gone = removeObjectRow(r.plan, 'row-1')
    expect(gone.ok && gone.plan.rows).toBeUndefined()
  })

  it('les rangées suivent l’étage fusionné quand on supprime une tablette', () => {
    const r = addObjectRow(base(), 'shelf-2', 'jar', 4)
    if (!r.ok) throw new Error(r.error)
    const removed = removePieces(r.plan, ['shelf-2'])
    expect(removed.ok && removed.plan.rows?.[0].shelfBelowId).toBe('shelf-1')
  })

  it('survit à l’enregistrement : le fichier relu redonne les mêmes rangées', () => {
    const r = addObjectRow(base(), 'shelf-1', 'manga', 10)
    if (!r.ok) throw new Error(r.error)
    const parsed = parsePlan(JSON.parse(JSON.stringify(r.plan)))
    expect(parsed.ok && parsed.plan.rows).toEqual(r.plan.rows)
    expect(parsePlan({ ...JSON.parse(JSON.stringify(r.plan)), rows: [{ id: 'r', shelfBelowId: 'shelf-1', kind: 'ovni', count: 1 }] }).ok).toBe(false)
  })
})
