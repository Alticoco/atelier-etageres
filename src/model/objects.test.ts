import { describe, expect, it } from 'vitest'
import { addObjectRow, layoutStage, moveObject, objectIdExists, removeObject, removeObjectRow, setObjectRowCount, setObjectRowGap, stageCapacity } from './objects'
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

  it('espace entre les objets : 5 mm entre chaque manga', () => {
    const r = addObjectRow(base(), 'shelf-1', 'manga', 3)
    if (!r.ok) throw new Error(r.error)
    const gapped = setObjectRowGap(r.plan, 'row-1', 5)
    if (!gapped.ok) throw new Error(gapped.error)
    const xs = layoutStage(gapped.plan, getStages(gapped.plan)[0]).objects.map((o) => o.x)
    expect(xs).toEqual([18, 37, 56])
    expect(setObjectRowGap(r.plan, 'row-1', -1).ok).toBe(false)
  })

  it('« remplir » tient compte de l’espace : (764 + 10) / (14 + 10) = 32 mangas', () => {
    const r = addObjectRow(base(), 'shelf-1', 'manga', undefined, 10)
    expect(r.ok && r.plan.rows![0].count).toBe(32)
  })

  it('supprimer un objet de la rangée la raccourcit ; le dernier supprime la rangée', () => {
    const r = addObjectRow(base(), 'shelf-1', 'manga', 2)
    if (!r.ok) throw new Error(r.error)
    const one = removeObject(r.plan, 'obj:row-1:0')
    expect(one.ok && one.plan.rows![0].count).toBe(1)
    const none = removeObject(one.ok ? one.plan : r.plan, 'obj:row-1:0')
    expect(none.ok && none.plan.rows).toBeUndefined()
    expect(removeObject(r.plan, 'obj:row-9:0').ok).toBe(false)
  })

  it('déplacer un objet le détache de sa rangée, qui se resserre autour de lui', () => {
    const r = addObjectRow(base(), 'shelf-1', 'manga', 5)
    if (!r.ok) throw new Error(r.error)
    const moved = moveObject(r.plan, 'obj:row-1:2', 'shelf-2', 300, null)
    if (!moved.ok) throw new Error(moved.error)
    expect(moved.id).toBe('obj:placed-1')
    expect(moved.plan.rows![0].count).toBe(4)
    expect(moved.plan.placedObjects).toEqual([{ id: 'placed-1', shelfBelowId: 'shelf-2', kind: 'manga', x: 300 }])
    expect(objectIdExists(moved.plan, 'obj:placed-1')).toBe(true)
    expect(objectIdExists(moved.plan, 'obj:row-1:4')).toBe(false)
    // Le même objet, déplacé à nouveau, reste le même objet (pas de doublon).
    const again = moveObject(moved.plan, 'obj:placed-1', 'shelf-2', 400, null)
    expect(again.ok && again.plan.placedObjects).toEqual([{ id: 'placed-1', shelfBelowId: 'shelf-2', kind: 'manga', x: 400 }])
  })

  it('un objet posé seul s’aimante contre le montant, contre une cale, et ne la chevauche pas', () => {
    const p = base()
    p.wedges.push({ id: 'wedge-1', shelfBelowId: 'shelf-1', x: 400, thickness: 18, depth: 250, cornerRadius: 0, edgeRadius: 0 })
    const r = addObjectRow(p, 'shelf-1', 'manga', 1)
    if (!r.ok) throw new Error(r.error)
    const nearUpright = moveObject(r.plan, 'obj:row-1:0', 'shelf-1', 24, 10)
    expect(nearUpright.ok && nearUpright.plan.placedObjects![0].x).toBe(18)
    const nearWedge = moveObject(r.plan, 'obj:row-1:0', 'shelf-1', 380, 10)
    expect(nearWedge.ok && nearWedge.plan.placedObjects![0].x).toBe(386)
    const onWedge = moveObject(r.plan, 'obj:row-1:0', 'shelf-1', 405, null)
    expect(onWedge.ok && (onWedge.plan.placedObjects![0].x <= 386 || onWedge.plan.placedObjects![0].x >= 418)).toBe(true)
  })

  it('les rangées se rangent autour d’un objet posé seul', () => {
    const r = addObjectRow(base(), 'shelf-1', 'manga', 1)
    if (!r.ok) throw new Error(r.error)
    const placed = moveObject(r.plan, 'obj:row-1:0', 'shelf-1', 18, null)
    if (!placed.ok) throw new Error(placed.error)
    const more = addObjectRow(placed.plan, 'shelf-1', 'manga', 2)
    if (!more.ok) throw new Error(more.error)
    const xs = layoutStage(more.plan, getStages(more.plan)[0]).objects.map((o) => o.x).sort((a, b) => a - b)
    expect(xs).toEqual([18, 32, 46])
  })

  it('survit à l’enregistrement (rangées avec espace, objets posés)', () => {
    const r = addObjectRow(base(), 'shelf-1', 'manga', 4, 5)
    if (!r.ok) throw new Error(r.error)
    const moved = moveObject(r.plan, 'obj:row-1:1', 'shelf-2', 100, null)
    if (!moved.ok) throw new Error(moved.error)
    const parsed = parsePlan(JSON.parse(JSON.stringify(moved.plan)))
    expect(parsed.ok && parsed.plan.placedObjects).toEqual(moved.plan.placedObjects)
    expect(parsed.ok && parsed.plan.rows).toEqual(moved.plan.rows)
  })

  it('supprimer une tablette fait suivre les objets posés seuls', () => {
    const r = addObjectRow(base(), 'shelf-1', 'manga', 1)
    if (!r.ok) throw new Error(r.error)
    const moved = moveObject(r.plan, 'obj:row-1:0', 'shelf-2', 100, null)
    if (!moved.ok) throw new Error(moved.error)
    const removed = removePieces(moved.plan, ['shelf-2'])
    expect(removed.ok && removed.plan.placedObjects![0].shelfBelowId).toBe('shelf-1')
  })
})
