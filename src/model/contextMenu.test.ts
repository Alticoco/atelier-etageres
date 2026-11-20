import { describe, expect, it } from 'vitest'
import { contextMenuItems } from './contextMenu'
import { createPlan } from './plan'
import { addWedge } from './tools'

const base = () => createPlan({ name: 'T', width: 800, height: 1000, depth: 250, stages: 3, uprightThickness: 18, shelfThickness: 18 })
const labels = (items: { label: string }[]) => items.map((i) => i.label)

describe('menu du clic droit', () => {
  it('sur un montant : proposer « Couper ici » à la hauteur cliquée', () => {
    const items = contextMenuItems(base(), 'upright-right', { x: 5, y: 700 })
    const cut = items.find((i) => i.label.startsWith('Couper ici'))!
    expect(cut.action).toEqual({ type: 'setPieceProperty', ids: ['upright-right'], property: 'length', mm: 700 })
    expect(labels(items).some((l) => l.startsWith('Rétablir'))).toBe(false)
  })

  it('sur un montant déjà coupé : rétablir la hauteur complète', () => {
    const plan = base()
    plan.rightUpright.length = 700
    const items = contextMenuItems(plan, 'upright-right', { x: 5, y: 300 })
    expect(labels(items).some((l) => l.startsWith('Rétablir'))).toBe(true)
  })

  it('sur une cale : décaler et supprimer', () => {
    const r = addWedge(base(), 'shelf-1')
    if (!r.ok) throw new Error(r.error)
    const items = contextMenuItems(r.plan, r.id, { x: 100, y: 100 })
    expect(labels(items)).toContain('Supprimer cette cale')
    expect(labels(items).some((l) => l.startsWith('Décaler à droite'))).toBe(true)
  })

  it('sur une cale : dupliquer, symétrie, répartir, même disposition dans tous les étages', () => {
    const r = addWedge(base(), 'shelf-1')
    if (!r.ok) throw new Error(r.error)
    const items = contextMenuItems(r.plan, r.id, { x: 100, y: 100 })
    expect(items.find((i) => i.label === 'Dupliquer à côté')!.action).toEqual({ type: 'duplicatePieces', ids: [r.id] })
    expect(items.find((i) => i.label === 'Dupliquer en symétrique')!.action).toEqual({ type: 'mirrorPieces', ids: [r.id] })
    expect(items.find((i) => i.label === 'Mettre la même disposition dans tous les étages')!.action).toEqual({
      type: 'copyStageWedges',
      fromId: 'shelf-1',
      toIds: ['shelf-2', 'shelf-3'],
    })
  })

  it('dans le vide d’un étage : répartir N cales', () => {
    const plan = base()
    const stage = plan.shelves.sort((a, b) => a.y - b.y)[0]
    const items = contextMenuItems(plan, null, { x: 300, y: stage.y + stage.thickness + 50 })
    expect(items.find((i) => i.label.startsWith('Répartir 3 cales'))!.action).toEqual({ type: 'distributeWedges', shelfBelowId: stage.id, count: 3 })
  })

  it('dans le vide d’un étage : ajouter une cale ou une tablette dans cet étage', () => {
    const plan = base()
    const stage = plan.shelves.sort((a, b) => a.y - b.y)[0]
    const items = contextMenuItems(plan, null, { x: 300, y: stage.y + stage.thickness + 50 })
    expect(items.find((i) => i.label.startsWith('Ajouter une cale'))!.action).toEqual({ type: 'addWedge', shelfBelowId: stage.id })
  })
})
