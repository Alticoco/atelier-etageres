import { describe, expect, it } from 'vitest'
import {
  addCustomKind,
  addObjectRow,
  fitStageToObjects,
  layoutStage,
  MAX_CUSTOM_KINDS,
  moveObject,
  objectIdExists,
  objectLabel,
  objectsDepthNeeded,
  orientedSize,
  remainingCapacity,
  removeCustomKind,
  removeObject,
  removeObjectRow,
  resolveKind,
  rowLabel,
  setObjectRowCount,
  setObjectRowGap,
  setObjectRowOrientation,
  setObjectRowStack,
  stageCapacity,
  updateCustomKind,
  type CustomKindInput,
} from './objects'
import { buildScene3D } from './scene3d'
import { createPlan } from './plan'
import { getStages } from './pieces'
import { parsePlan } from './serialize'
import { removePieces } from './tools'
import type { Plan } from './types'

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

// Boîte à thé de 9 × 18 × 9 cm (largeur × hauteur × profondeur).
const TEA: CustomKindInput = { label: 'Boîte à thé', width: 90, height: 180, depth: 90 }

/** Plan de base avec la boîte à thé (`custom-1`). */
function withTea(data: CustomKindInput = TEA): Plan {
  const r = addCustomKind(base(), data)
  if (!r.ok) throw new Error(r.error)
  return r.plan
}

function stage1(plan: Plan) {
  return layoutStage(plan, getStages(plan)[0])
}

function ok<T extends { ok: true } | { ok: false; error: string }>(r: T): Extract<T, { ok: true }> {
  if (!r.ok) throw new Error((r as { error: string }).error)
  return r as Extract<T, { ok: true }>
}

describe('objets sur mesure', () => {
  it('se crée avec un identifiant custom-N, un nom nettoyé et une couleur en minuscules', () => {
    const first = ok(addCustomKind(base(), { ...TEA, label: '  Boîte à thé  ', color: '#AA3300' }))
    expect(first.id).toBe('custom-1')
    expect(first.plan.customKinds).toEqual([{ id: 'custom-1', label: 'Boîte à thé', width: 90, height: 180, depth: 90, shape: 'box', color: '#aa3300' }])
    const second = ok(addCustomKind(first.plan, { label: 'Pot', width: 80, height: 120, depth: 80, shape: 'cylinder' }))
    expect(second.id).toBe('custom-2')
    expect(resolveKind(second.plan, 'custom-2')).toMatchObject({ label: 'Pot', shape: 'cylinder', round: true, custom: true })
    expect(resolveKind(second.plan, 'manga')?.label).toBe('Manga')
    expect(resolveKind(second.plan, 'custom-9')).toBeUndefined()
    expect(resolveKind(base(), 'custom-1')).toBeUndefined()
  })

  it('refuse un nom, des dimensions, une forme ou une couleur invalides', () => {
    const bad: CustomKindInput[] = [
      { ...TEA, label: '   ' },
      { ...TEA, label: 'x'.repeat(61) },
      { ...TEA, width: 0 },
      { ...TEA, height: 3001 },
      { ...TEA, depth: 12.5 },
      { ...TEA, color: 'rouge' },
      { ...TEA, shape: 'sphere' as 'box' },
    ]
    for (const data of bad) expect(addCustomKind(base(), data).ok).toBe(false)
    expect(addCustomKind(base(), { ...TEA, label: ` ${'x'.repeat(60)} `, width: 3000 }).ok).toBe(true)
  })

  it(`pas plus de ${MAX_CUSTOM_KINDS} objets sur mesure`, () => {
    let plan = base()
    for (let i = 0; i < MAX_CUSTOM_KINDS; i++) plan = ok(addCustomKind(plan, TEA)).plan
    expect(addCustomKind(plan, TEA)).toEqual({ ok: false, error: `Pas plus de ${MAX_CUSTOM_KINDS} objets sur mesure.` })
  })

  it('se modifie : les rangées suivent ; couleur null = retirée', () => {
    const r = ok(addObjectRow(withTea({ ...TEA, color: '#112233' }), 'shelf-1', 'custom-1', 2))
    const taller = ok(updateCustomKind(r.plan, 'custom-1', { height: 200, color: null, label: 'Thé vert' }))
    expect(taller.plan.customKinds![0]).toEqual({ id: 'custom-1', label: 'Thé vert', width: 90, height: 200, depth: 90, shape: 'box' })
    expect(stage1(taller.plan).objects[0]).toMatchObject({ height: 200, kindId: 'custom-1' })
    expect(stage1(taller.plan).objects[0].color).toBeUndefined()
    expect(updateCustomKind(r.plan, 'custom-1', { width: -1 }).ok).toBe(false)
    expect(updateCustomKind(r.plan, 'custom-1', { label: '' }).ok).toBe(false)
    expect(updateCustomKind(r.plan, 'custom-7', { width: 10 }).ok).toBe(false)
  })

  it('supprimer un objet sur mesure retire aussi ses rangées et ses objets posés, pas les autres', () => {
    const tea = ok(addObjectRow(withTea(), 'shelf-1', 'custom-1', 3))
    const moved = ok(moveObject(tea.plan, 'obj:row-1:0', 'shelf-2', 100, null))
    const mangas = ok(addObjectRow(moved.plan, 'shelf-3', 'manga', 2))
    const removed = ok(removeCustomKind(mangas.plan, 'custom-1'))
    expect(removed.plan.customKinds).toBeUndefined()
    expect(removed.plan.placedObjects).toBeUndefined()
    expect(removed.plan.rows).toEqual([{ id: 'row-2', shelfBelowId: 'shelf-3', kind: 'manga', count: 2 }])
    expect(removeCustomKind(removed.plan, 'custom-1').ok).toBe(false)
  })

  it('a son nom dans les libellés', () => {
    const r = ok(addObjectRow(withTea(), 'shelf-1', 'custom-1', 3))
    expect(rowLabel(r.plan.rows![0], r.plan)).toBe('3 boîtes à thé')
    expect(objectLabel(r.plan, 'obj:row-1:0')).toBe('Boîte à thé (étage 1)')
  })

  it('sa forme et sa couleur sont transmises au dessin', () => {
    const r = ok(addObjectRow(withTea({ ...TEA, shape: 'cylinder', color: '#00ff00' }), 'shelf-1', 'custom-1', 1))
    expect(stage1(r.plan).objects[0]).toMatchObject({ shape: 'cylinder', color: '#00ff00', depth: 90, level: 0 })
  })
})

describe('sens des objets', () => {
  it('debout, couché (largeur ↔ hauteur), de face (largeur ↔ profondeur)', () => {
    const kind = { width: 90, height: 180, depth: 60 }
    expect(orientedSize(kind, 'standing')).toEqual({ width: 90, height: 180, depth: 60 })
    expect(orientedSize(kind)).toEqual({ width: 90, height: 180, depth: 60 })
    expect(orientedSize(kind, 'lying')).toEqual({ width: 180, height: 90, depth: 60 })
    expect(orientedSize(kind, 'facing')).toEqual({ width: 60, height: 180, depth: 90 })
  })

  it('une rangée couchée prend la largeur de la hauteur', () => {
    const r = ok(addObjectRow(withTea(), 'shelf-1', 'custom-1', 3, 0, { orientation: 'lying' }))
    expect(r.plan.rows![0].orientation).toBe('lying')
    const objects = stage1(r.plan).objects
    expect(objects.map((o) => o.x)).toEqual([18, 198, 378])
    expect(objects[0]).toMatchObject({ width: 180, height: 90, depth: 90, orientation: 'lying' })
  })

  it('« de face » compte la profondeur dans la largeur : un manga tourné prend 115 mm', () => {
    expect(stageCapacity(base(), 'shelf-1', 'manga', 'facing')).toBe(Math.floor(764 / 115))
    const r = ok(addObjectRow(base(), 'shelf-1', 'manga', 1))
    const turned = ok(setObjectRowOrientation(r.plan, 'row-1', 'facing'))
    expect(stage1(turned.plan).objects[0]).toMatchObject({ width: 115, depth: 14 })
    const back = ok(setObjectRowOrientation(turned.plan, 'row-1', 'standing'))
    expect(back.plan.rows![0].orientation).toBeUndefined()
    expect(setObjectRowOrientation(r.plan, 'row-1', 'upside' as 'lying').ok).toBe(false)
    expect(setObjectRowOrientation(r.plan, 'row-9', 'lying').ok).toBe(false)
  })
})

describe('piles d’objets', () => {
  it('7 boîtes couchées par piles de 3 : 3 piles, la dernière incomplète', () => {
    const r = ok(addObjectRow(withTea(), 'shelf-1', 'custom-1', 7, 0, { orientation: 'lying', stack: 3 }))
    expect(r.plan.rows![0]).toMatchObject({ count: 7, stack: 3 })
    const layout = stage1(r.plan)
    expect(layout.objects).toHaveLength(7)
    expect(layout.objects.map((o) => o.id)).toEqual([0, 1, 2, 3, 4, 5, 6].map((i) => `obj:row-1:${i}`))
    expect(layout.objects.map((o) => o.x)).toEqual([18, 18, 18, 198, 198, 198, 378])
    expect(layout.objects.map((o) => o.level)).toEqual([0, 1, 2, 0, 1, 2, 0])
    expect(layout.objects.map((o) => o.y)).toEqual([18, 108, 198, 18, 108, 198, 18])
    expect(layout.rows[0]).toMatchObject({ placed: 7, overflow: 0, tooTall: false })
    // Une pile occupe la largeur d'une seule boîte : la place libre commence après la 3e pile.
    expect(layout.free[0].from).toBe(558)
  })

  it('trop haut : une pile pleine qui dépasse l’étage ; seuls les objets qui dépassent sont signalés', () => {
    const clear = getStages(base())[0].clearHeight
    // 4 boîtes couchées = 360 mm, plus que l'étage (~309 mm) ; 3 = 270 mm, ça rentre.
    expect(clear).toBeGreaterThanOrEqual(270)
    expect(clear).toBeLessThan(360)
    const r = ok(addObjectRow(withTea(), 'shelf-1', 'custom-1', 8, 0, { orientation: 'lying', stack: 4 }))
    const layout = stage1(r.plan)
    expect(layout.rows[0].tooTall).toBe(true)
    expect(layout.objects.filter((o) => o.tooTall).map((o) => o.level)).toEqual([3, 3])
    // Seulement 2 objets : la pile n'en a que 2, elle rentre (on compte min(pile, nombre)).
    const two = ok(setObjectRowCount(r.plan, 'row-1', 2))
    expect(stage1(two.plan).rows[0].tooTall).toBe(false)
  })

  it('la capacité compte des objets : piles × objets par pile', () => {
    // Manga couché : 175 mm de large, 4 piles dans 764 mm.
    expect(stageCapacity(base(), 'shelf-1', 'manga', 'lying')).toBe(4)
    expect(stageCapacity(base(), 'shelf-1', 'manga', 'lying', 3)).toBe(12)
    expect(stageCapacity(base(), 'shelf-1', 'manga', 'standing', 2)).toBe(108)
    const fill = ok(addObjectRow(base(), 'shelf-1', 'manga', undefined, 0, { orientation: 'lying', stack: 3 }))
    expect(fill.plan.rows![0].count).toBe(12)
    expect(remainingCapacity(fill.plan, 'shelf-1', 'manga')).toBe(Math.floor((764 - 4 * 175) / 14))
    expect(remainingCapacity(fill.plan, 'shelf-1', 'manga', 0, 'standing', 0)).toBe(0)
  })

  it('ce qui ne tient pas en largeur déborde, pile par pile', () => {
    const r = ok(addObjectRow(base(), 'shelf-1', 'manga', 14, 0, { orientation: 'lying', stack: 3 }))
    expect(stage1(r.plan).rows[0]).toMatchObject({ placed: 12, overflow: 2 })
  })

  it('changer la pile garde le nombre d’objets ; bornes 1 à 50', () => {
    const r = ok(addObjectRow(base(), 'shelf-1', 'manga', 6))
    const stacked = ok(setObjectRowStack(r.plan, 'row-1', 3))
    expect(stacked.plan.rows![0]).toMatchObject({ count: 6, stack: 3 })
    expect(stage1(stacked.plan).objects.map((o) => o.x)).toEqual([18, 18, 18, 32, 32, 32])
    expect(ok(setObjectRowStack(stacked.plan, 'row-1', 1)).plan.rows![0].stack).toBeUndefined()
    for (const n of [0, 51, 2.5]) expect(setObjectRowStack(r.plan, 'row-1', n).ok).toBe(false)
    expect(addObjectRow(base(), 'shelf-1', 'manga', 3, 0, { stack: 51 }).ok).toBe(false)
    expect(setObjectRowStack(r.plan, 'row-9', 2).ok).toBe(false)
  })

  it('un objet détaché d’une rangée empilée garde son sens et devient seul ; une pile posée reste une pile', () => {
    const r = ok(addObjectRow(withTea(), 'shelf-1', 'custom-1', 6, 0, { orientation: 'lying', stack: 3 }))
    const moved = ok(moveObject(r.plan, 'obj:row-1:4', 'shelf-2', 100, null))
    expect(moved.plan.rows![0].count).toBe(5)
    expect(moved.plan.placedObjects).toEqual([{ id: 'placed-1', shelfBelowId: 'shelf-2', kind: 'custom-1', x: 100, orientation: 'lying' }])

    const pile = structuredClone(moved.plan)
    pile.placedObjects![0].stack = 3
    const y = getStages(pile)[1].y
    const drawn = layoutStage(pile, getStages(pile)[1]).objects
    expect(drawn.map((o) => [o.id, o.y, o.level])).toEqual([
      ['obj:placed-1', y, 0],
      ['obj:placed-1', y + 90, 1],
      ['obj:placed-1', y + 180, 2],
    ])
    const again = ok(moveObject(pile, 'obj:placed-1', 'shelf-3', 200, null))
    expect(again.plan.placedObjects).toEqual([{ id: 'placed-1', shelfBelowId: 'shelf-3', kind: 'custom-1', x: 200, orientation: 'lying', stack: 3 }])
  })
})

describe('ajuster l’étage à ses objets', () => {
  it('hauteur de l’étage = plus haute pile + marge', () => {
    const r = ok(addObjectRow(withTea(), 'shelf-2', 'custom-1', 4, 0, { stack: 2 }))
    const withManga = ok(addObjectRow(r.plan, 'shelf-2', 'manga', 3))
    const fitted = ok(fitStageToObjects(withManga.plan, 'shelf-2', 10))
    // Pile de 2 boîtes debout : 360 mm, plus 10 mm de marge.
    expect(getStages(fitted.plan)[1].clearHeight).toBe(370)
  })

  it('compte un objet posé seul empilé', () => {
    const r = ok(addObjectRow(withTea(), 'shelf-1', 'custom-1', 1, 0, { orientation: 'lying' }))
    const moved = ok(moveObject(r.plan, 'obj:row-1:0', 'shelf-2', 100, null))
    moved.plan.placedObjects![0].stack = 2
    const fitted = ok(fitStageToObjects(moved.plan, 'shelf-2', 0))
    expect(getStages(fitted.plan)[1].clearHeight).toBe(180)
  })

  it('refuse un étage sans objet, une marge invalide, un étage inconnu', () => {
    expect(fitStageToObjects(base(), 'shelf-1', 10)).toEqual({ ok: false, error: 'Cet étage n’a aucun objet : impossible d’ajuster sa hauteur à ses objets.' })
    const r = ok(addObjectRow(base(), 'shelf-1', 'manga', 2))
    expect(fitStageToObjects(r.plan, 'shelf-1', -1).ok).toBe(false)
    expect(fitStageToObjects(r.plan, 'shelf-9', 10).ok).toBe(false)
  })

  it('refuse une hauteur impossible (les autres étages n’auraient plus de place)', () => {
    const r = ok(addObjectRow(withTea({ ...TEA, height: 3000 }), 'shelf-2', 'custom-1', 1))
    expect(fitStageToObjects(r.plan, 'shelf-2', 0).ok).toBe(false)
  })

  it('profondeur nécessaire : la plus grande, dans le sens des objets ; 0 sans objet', () => {
    expect(objectsDepthNeeded(base(), 'shelf-1')).toBe(0)
    const r = ok(addObjectRow(withTea({ ...TEA, width: 100, depth: 200 }), 'shelf-1', 'custom-1', 1))
    expect(objectsDepthNeeded(r.plan, 'shelf-1')).toBe(200)
    const turned = ok(setObjectRowOrientation(r.plan, 'row-1', 'facing'))
    expect(objectsDepthNeeded(turned.plan, 'shelf-1')).toBe(100)
    const mangas = ok(addObjectRow(turned.plan, 'shelf-1', 'manga', 1))
    expect(objectsDepthNeeded(mangas.plan, 'shelf-1')).toBe(115)
  })
})

describe('objets sur mesure en 3D', () => {
  it('une pile : chaque objet à sa hauteur, avec la couleur et le nom de l’objet', () => {
    const r = ok(addObjectRow(withTea({ ...TEA, color: '#123456' }), 'shelf-1', 'custom-1', 3, 0, { orientation: 'lying', stack: 3 }))
    const boxes = buildScene3D(r.plan).boxes.filter((b) => b.kind === 'object')
    expect(boxes.map((b) => b.y)).toEqual([18, 108, 198])
    expect(boxes[0]).toMatchObject({ shape: 'box', sx: 180, sy: 90, sz: 90, color: '#123456', label: 'Boîte à thé', objectKind: 'custom-1', bad: false })
  })

  it('un cylindre sur mesure est un cylindre debout ; couché, c’est un cylindre d’axe horizontal', () => {
    const r = ok(addObjectRow(withTea({ ...TEA, shape: 'cylinder' }), 'shelf-1', 'custom-1', 2))
    const standing = buildScene3D(r.plan).boxes.filter((b) => b.kind === 'object')
    expect(standing.map((b) => b.shape)).toEqual(['cylinder', 'cylinder'])
    expect(standing[0].color).toBeUndefined()
    const lying = ok(setObjectRowOrientation(r.plan, 'row-1', 'lying'))
    const lyingBoxes = buildScene3D(lying.plan).boxes.filter((b) => b.kind === 'object')
    expect(lyingBoxes.map((b) => b.shape)).toEqual(['cylinder', 'cylinder'])
    expect(lyingBoxes.map((b) => b.axis)).toEqual(['x', 'x'])
  })

  it('un objet trop profond dans son sens est signalé', () => {
    // 100 mm de profondeur debout, 300 mm tourné de face : la tablette fait 250 mm.
    const r = ok(addObjectRow(withTea({ ...TEA, width: 300, depth: 100 }), 'shelf-1', 'custom-1', 1))
    expect(buildScene3D(r.plan).boxes.find((b) => b.kind === 'object')!.bad).toBe(false)
    const turned = ok(setObjectRowOrientation(r.plan, 'row-1', 'facing'))
    expect(buildScene3D(turned.plan).boxes.find((b) => b.kind === 'object')).toMatchObject({ bad: true, sz: 300 })
  })
})

describe('pluralLabel', () => {
  it('accorde le premier mot du nom', async () => {
    const { pluralLabel } = await import('./objects')
    expect(pluralLabel('Boîte à thé')).toBe('boîtes à thé')
    expect(pluralLabel('Bocal')).toBe('bocaux')
    expect(pluralLabel('Pot')).toBe('pots')
    expect(pluralLabel('Jeux de société')).toBe('jeux de société')
    expect(pluralLabel('Gâteau')).toBe('gâteaux')
  })
})
