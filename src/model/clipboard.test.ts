import { describe, expect, it } from 'vitest'
import { copyPieces, distributeWedges, duplicatePieces, mirrorPiece, mirrorPieces, nudgePieces, pastePieces, stageOfSelection } from './clipboard'
import { innerSpan } from './geometry'
import { addObjectRow, layoutStage, moveObject } from './objects'
import { createPlan } from './plan'
import { getStages } from './pieces'
import { addSupport } from './supports'
import { addWedge, removePieces } from './tools'
import type { Plan } from './types'

const base = () => createPlan({ name: 'T', width: 800, height: 1000, depth: 250, stages: 3, uprightThickness: 18, shelfThickness: 18 })

function ok<T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> {
  if (!r.ok) throw new Error((r as unknown as { error: string }).error)
  return r as Extract<T, { ok: true }>
}

/** Ajoute une cale à x dans l'étage au-dessus de `stage`. */
function addWedgeAt(plan: Plan, x: number, stage = 'shelf-1'): { plan: Plan; id: string } {
  const added = ok(addWedge(plan, stage))
  const next = structuredClone(added.plan)
  next.wedges.find((w) => w.id === added.id)!.x = x
  return { plan: next, id: added.id }
}

const withWedgeAt = (x: number) => addWedgeAt(base(), x)

describe('duplicatePieces', () => {
  it('cale : copie à droite avec un écart égal à son épaisseur, copie sélectionnée', () => {
    const { plan, id } = withWedgeAt(100)
    const t = plan.wedges[0].thickness
    const r = ok(duplicatePieces(plan, [id]))
    expect(r.plan.wedges).toHaveLength(2)
    const copy = r.plan.wedges.find((w) => w.id === r.ids[0])!
    expect(copy.x).toBe(100 + 2 * t)
    expect(copy.shelfBelowId).toBe(plan.wedges[0].shelfBelowId)
  })

  it('cale : à gauche s’il n’y a pas de place à droite', () => {
    const span = innerSpan(base())
    const t = base().options.defaultWedgeThickness
    const { plan, id } = withWedgeAt(span.right - t)
    const r = ok(duplicatePieces(plan, [id]))
    expect(r.plan.wedges.find((w) => w.id === r.ids[0])!.x).toBe(span.right - t - 2 * t)
  })

  it('cale : refus clair sans place des deux côtés', () => {
    const t = base().options.defaultWedgeThickness
    const span = innerSpan(base())
    const x = Math.round((span.left + span.right - t) / 2)
    const first = withWedgeAt(x)
    const right = addWedgeAt(first.plan, x + 2 * t)
    const both = addWedgeAt(right.plan, x - 2 * t)
    const r = duplicatePieces(both.plan, [first.id])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('pas de place')
  })

  it('tablette : refus avec le message attendu', () => {
    const r = duplicatePieces(base(), ['shelf-2'])
    expect(r).toEqual({ ok: false, error: expect.stringContaining('Ajouter une tablette') })
  })

  it('support : comme « Dupliquer à côté »', () => {
    const added = ok(addSupport(base(), 'under'))
    const r = ok(duplicatePieces(added.plan, [added.id]))
    expect(r.plan.supports).toHaveLength(2)
    expect(r.ids).toHaveLength(1)
  })

  it('objet de rangée : un objet posé seul de même type, juste à côté', () => {
    const row = ok(addObjectRow(base(), 'shelf-1', 'manga', 3))
    const r = ok(duplicatePieces(row.plan, ['obj:row-1:0']))
    expect(r.plan.placedObjects).toHaveLength(1)
    expect(r.plan.placedObjects![0].kind).toBe('manga')
    expect(r.ids[0]).toMatch(/^obj:placed-\d+$/)
    expect(r.plan.rows![0].count).toBe(3)
  })

  it('objet de rangée couchée : la copie garde le sens', () => {
    const row = ok(addObjectRow(base(), 'shelf-1', 'manga', 2, 0, { orientation: 'lying' }))
    const r = ok(duplicatePieces(row.plan, ['obj:row-1:0']))
    expect(r.plan.placedObjects![0].orientation).toBe('lying')
  })

  it('objet posé seul : la copie garde le sens et la pile, et ne chevauche pas', () => {
    const plan = base()
    plan.placedObjects = [{ id: 'placed-1', shelfBelowId: 'shelf-1', kind: 'jar', x: 200, orientation: 'lying', stack: 2 }]
    const r = ok(duplicatePieces(plan, ['obj:placed-1']))
    expect(r.plan.placedObjects).toHaveLength(2)
    const copy = r.plan.placedObjects!.find((p) => `obj:${p.id}` === r.ids[0])!
    expect(copy.orientation).toBe('lying')
    expect(copy.stack).toBe(2)
    expect(copy.x).toBe(300)
  })

  it('plusieurs pièces : un seul plan résultat, tout est refusé si l’une échoue', () => {
    const { plan, id } = withWedgeAt(100)
    expect(ok(duplicatePieces(plan, [id])).ids).toHaveLength(1)
    expect(duplicatePieces(plan, [id, 'shelf-2']).ok).toBe(false)
  })
})

describe('mirrorPiece', () => {
  it('cale : miroir par rapport au milieu de l’espace entre les montants', () => {
    const { plan, id } = withWedgeAt(100)
    const span = innerSpan(plan)
    const t = plan.wedges[0].thickness
    const r = ok(mirrorPiece(plan, id))
    expect(r.plan.wedges.find((w) => w.id === r.ids[0])!.x).toBe(span.left + span.right - 100 - t)
  })

  it('cale déjà au milieu : refus', () => {
    const span = innerSpan(base())
    const t = base().options.defaultWedgeThickness
    const { plan, id } = withWedgeAt((span.left + span.right - t) / 2)
    const r = mirrorPiece(plan, id)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('au milieu')
  })

  it('place symétrique prise : refus', () => {
    const span = innerSpan(base())
    const first = withWedgeAt(100)
    const t = first.plan.wedges[0].thickness
    const blocked = addWedgeAt(first.plan, span.left + span.right - 100 - t)
    const r = mirrorPiece(blocked.plan, first.id)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('prise')
  })

  it('support : symétrique comme duplicateSupport', () => {
    const added = ok(addSupport(base(), 'left'))
    const r = ok(mirrorPiece(added.plan, added.id))
    expect(r.plan.supports!.find((s) => s.id === r.ids[0])!.x).toBe(800)
  })

  it('objet : miroir exact ; pièce non copiable en symétrique : refus', () => {
    const row = ok(addObjectRow(base(), 'shelf-1', 'jar', 1))
    const moved = ok(moveObject(row.plan, 'obj:row-1:0', 'shelf-1', 100, null))
    const span = innerSpan(moved.plan)
    const r = ok(mirrorPiece(moved.plan, moved.id))
    expect(r.plan.placedObjects!.find((p) => `obj:${p.id}` === r.ids[0])!.x).toBe(span.left + span.right - 100 - 55)
    expect(mirrorPieces(moved.plan, ['shelf-2']).ok).toBe(false)
  })
})

describe('copyPieces / pastePieces', () => {
  it('copier ignore tablettes et montants ; rien de copiable : erreur', () => {
    const { plan, id } = withWedgeAt(100)
    const c = ok(copyPieces(plan, [id, 'shelf-2', 'upright-left']))
    expect(c.clipboard.items).toHaveLength(1)
    expect(copyPieces(plan, ['shelf-2']).ok).toBe(false)
  })

  it('coller dans l’étage d’origine : place libre la plus proche', () => {
    const { plan, id } = withWedgeAt(100)
    const clip = ok(copyPieces(plan, [id])).clipboard
    const r = ok(pastePieces(plan, clip))
    expect(r.plan.wedges).toHaveLength(2)
    const t = plan.wedges[0].thickness
    const pasted = r.plan.wedges.find((w) => w.id === r.ids[0])!
    expect(pasted.shelfBelowId).toBe('shelf-1')
    expect(Math.abs(pasted.x - 100)).toBe(t)
  })

  it('coller dans un autre étage : même x si libre', () => {
    const { plan, id } = withWedgeAt(100)
    const clip = ok(copyPieces(plan, [id])).clipboard
    const r = ok(pastePieces(plan, clip, 'shelf-2'))
    const pasted = r.plan.wedges.find((w) => w.id === r.ids[0])!
    expect(pasted.shelfBelowId).toBe('shelf-2')
    expect(pasted.x).toBe(100)
  })

  it('étage de la sélection : cale, objet ou tablette', () => {
    const { plan, id } = withWedgeAt(100)
    expect(stageOfSelection(plan, [id])).toBe('shelf-1')
    expect(stageOfSelection(plan, ['shelf-2'])).toBe('shelf-2')
    expect(stageOfSelection(plan, ['shelf-2', id])).toBeNull()
    const row = ok(addObjectRow(plan, 'shelf-2', 'manga', 2))
    expect(stageOfSelection(row.plan, ['obj:row-1:1'])).toBe('shelf-2')
  })

  it('coller des objets et des supports', () => {
    const row = ok(addObjectRow(base(), 'shelf-1', 'manga', 3))
    const sup = ok(addSupport(row.plan, 'under'))
    const clip = ok(copyPieces(sup.plan, ['obj:row-1:1', sup.id])).clipboard
    const r = ok(pastePieces(sup.plan, clip, 'shelf-2'))
    expect(r.plan.placedObjects).toHaveLength(1)
    expect(r.plan.placedObjects![0].shelfBelowId).toBe('shelf-2')
    expect(r.plan.supports).toHaveLength(2)
    expect(r.plan.supports![0].x).not.toBe(r.plan.supports![1].x)
  })

  it('d’un plan à l’autre : étage de même rang, ou refus', () => {
    const { plan, id } = withWedgeAt(100)
    const clip = ok(copyPieces(plan, [id])).clipboard
    const other = base()
    other.shelves = other.shelves.map((s, i) => ({ ...s, id: `autre-${i}` }))
    const r = ok(pastePieces(other, clip))
    expect(r.plan.wedges[0].shelfBelowId).toBe(getStages(other)[0].shelfBelowId)

    const upper = addWedgeAt(base(), 100, 'shelf-2')
    const upperClip = ok(copyPieces(upper.plan, [upper.id])).clipboard
    const oneStage = createPlan({ name: 'U', width: 800, height: 300, depth: 250, stages: 1, uprightThickness: 18, shelfThickness: 18 })
    oneStage.shelves = oneStage.shelves.map((s, i) => ({ ...s, id: `u-${i}` }))
    const refused = pastePieces(oneStage, upperClip)
    expect(refused.ok).toBe(false)
    if (!refused.ok) expect(refused.error).toContain('étage')
  })

  it('objet d’un type sur mesure absent du plan visé : refus', () => {
    const plan = base()
    plan.customKinds = [{ id: 'custom-1', label: 'Boîte', shape: 'box', width: 50, height: 50, depth: 50 }]
    plan.placedObjects = [{ id: 'placed-1', shelfBelowId: 'shelf-1', kind: 'custom-1', x: 100 }]
    const clip = ok(copyPieces(plan, ['obj:placed-1'])).clipboard
    expect(pastePieces(base(), clip).ok).toBe(false)
    expect(pastePieces(plan, clip).ok).toBe(true)
  })

  it('presse-papiers vide : refus', () => {
    expect(pastePieces(base(), { items: [] }).ok).toBe(false)
  })
})

describe('distributeWedges', () => {
  it('remplace les cales de l’étage par N cales aux écarts égaux', () => {
    const { plan } = withWedgeAt(50)
    const r = ok(distributeWedges(plan, 'shelf-1', 3))
    const t = plan.options.defaultWedgeThickness
    const span = innerSpan(plan)
    const wedges = r.plan.wedges.filter((w) => w.shelfBelowId === 'shelf-1').sort((a, b) => a.x - b.x)
    expect(wedges).toHaveLength(3)
    expect(wedges.every((w) => w.thickness === t)).toBe(true)
    const gaps = [wedges[0].x - span.left, wedges[1].x - wedges[0].x - t, wedges[2].x - wedges[1].x - t, span.right - wedges[2].x - t]
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(1)
    expect(r.ids).toHaveLength(3)
  })

  it('ne touche pas aux autres étages ; refus si nombre invalide ou trop de cales', () => {
    const { plan } = withWedgeAt(50)
    const added = ok(addWedge(plan, 'shelf-2'))
    const r = ok(distributeWedges(added.plan, 'shelf-1', 2))
    expect(r.plan.wedges.filter((w) => w.shelfBelowId === 'shelf-2')).toHaveLength(1)
    expect(distributeWedges(plan, 'shelf-1', 0).ok).toBe(false)
    expect(distributeWedges(plan, 'shelf-1', 1.5).ok).toBe(false)
    expect(distributeWedges(plan, 'shelf-1', 50).ok).toBe(false)
    expect(distributeWedges(plan, 'inconnu', 2).ok).toBe(false)
  })
})

describe('nudgePieces', () => {
  it('déplace toutes les cales choisies, même collées l’une à l’autre', () => {
    const t = base().options.defaultWedgeThickness
    const first = withWedgeAt(100)
    const second = addWedgeAt(first.plan, 100 + t)
    const r = ok(nudgePieces(second.plan, [first.id, second.id], 1, 0, 10))
    expect(r.plan.wedges.map((w) => w.x).sort((a, b) => a - b)).toEqual([110, 110 + t])
  })

  it('refuse tout si l’une est bloquée', () => {
    const span = innerSpan(base())
    const t = base().options.defaultWedgeThickness
    const free = withWedgeAt(span.left + t + 50)
    const stuck = addWedgeAt(free.plan, span.left)
    const r = nudgePieces(stuck.plan, [stuck.id, free.id], -1, 0, 10)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('bloquée')
  })

  it('tablettes en y, supports en x ; pièces non concernées ignorées', () => {
    const plan = base()
    const y = plan.shelves.find((s) => s.id === 'shelf-2')!.y
    const r = ok(nudgePieces(plan, ['shelf-2', 'shelf-1', 'upright-left'], 0, 1, 10))
    expect(r.plan.shelves.find((s) => s.id === 'shelf-2')!.y).toBe(y + 10)
    expect(r.plan.shelves.find((s) => s.id === 'shelf-1')!.y).toBe(plan.shelves.find((s) => s.id === 'shelf-1')!.y)
    const sup = ok(addSupport(plan, 'under'))
    const x0 = sup.plan.supports![0].x
    expect(ok(nudgePieces(sup.plan, [sup.id], 1, 0, 10)).plan.supports![0].x).toBe(x0 + 10)
    expect(ok(nudgePieces(plan, ['shelf-2'], 1, 0, 10)).plan).toBe(plan)
  })
})

describe('suppression de la sélection multiple', () => {
  it('supprime ensemble cale, support, objet de rangée et objet posé', () => {
    const { plan, id } = withWedgeAt(100)
    const sup = ok(addSupport(plan, 'under'))
    const row = ok(addObjectRow(sup.plan, 'shelf-2', 'manga', 3))
    const moved = ok(moveObject(row.plan, 'obj:row-1:2', 'shelf-2', 300, null))
    const r = ok(removePieces(moved.plan, [id, sup.id, 'obj:row-1:0', moved.id]))
    expect(r.plan.wedges).toHaveLength(0)
    expect(r.plan.supports).toBeUndefined()
    expect(r.plan.placedObjects).toBeUndefined()
    expect(r.plan.rows![0].count).toBe(1)
    expect(layoutStage(r.plan, getStages(r.plan)[1]).objects).toHaveLength(1)
  })
})
