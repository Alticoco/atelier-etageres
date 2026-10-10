import { nudgePiece } from './drag'
import { formatLength, type LengthUnit } from './units'
import { pieceLabel } from './labels'
import { frontRects, isFrontId } from './fronts'
import { isObjectId } from './objects'
import { fullUprightLength, getStages, sortedShelves, uprightLength } from './pieces'
import { isSupportId } from './supports'
import type { Plan } from './types'
import type { EditorAction } from '../store/editor'

/** Une ligne du menu qui s'ouvre au clic droit sur le dessin. `action` absent = simple titre. */
export interface MenuItem {
  label: string
  action?: EditorAction
  danger?: boolean
}

interface MenuContext {
  unit?: LengthUnit
  /** Pas d'aimantation (mm) pour les déplacements d'un cran. */
  snapStep?: number
}

/**
 * Entrées du menu pour un clic droit en vue de face. `pieceId` : la pièce sous le curseur (null = le vide) ;
 * `at` : le point cliqué dans le repère du plan (y vers le haut, mm depuis le dessous du cadre).
 * Fonction pure : le menu ne fait que proposer des actions déjà existantes de l'éditeur.
 */
export function contextMenuItems(plan: Plan, pieceId: string | null, at: { x: number; y: number }, ctx: MenuContext = {}): MenuItem[] {
  const unit = ctx.unit ?? 'cm'
  const step = ctx.snapStep ?? 10
  const items: MenuItem[] = []
  const stages = getStages(plan)
  const shelves = sortedShelves(plan)

  const stageAt = (y: number) => stages.find((s) => y >= s.y && y <= s.y + s.clearHeight)
  const addInStage = (shelfBelowId: string, where: string) => {
    items.push({ label: `Ajouter une cale ${where}`, action: { type: 'addWedge', shelfBelowId } })
    items.push({ label: `Ajouter une tablette ${where}`, action: { type: 'addShelf', shelfBelowId } })
  }
  const nudges = (id: string) => {
    const moves: [string, -1 | 0 | 1, -1 | 0 | 1][] = [
      ['Décaler à gauche', -1, 0],
      ['Décaler à droite', 1, 0],
      ['Monter', 0, 1],
      ['Descendre', 0, -1],
    ]
    for (const [label, dx, dy] of moves) {
      const move = nudgePiece(plan, id, dx, dy, step)
      if (move) {
        items.push({ label: `${label} de ${formatLength(Math.abs(move.mm - current(id, move.property)), unit)}`, action: { type: 'setPieceProperty', ids: [id], property: move.property, mm: move.mm } })
      }
    }
  }
  const current = (id: string, property: 'x' | 'y'): number => {
    if (property === 'y') return plan.shelves.find((s) => s.id === id)?.y ?? 0
    return plan.wedges.find((w) => w.id === id)?.x ?? 0
  }

  if (pieceId === null) {
    const stage = stageAt(at.y)
    items.push({ label: 'Dans le vide' })
    if (stage) addInStage(stage.shelfBelowId, 'dans cet étage')
    if (stage && plan.model === 'frame') {
      const id = stage.shelfBelowId
      items.push({ label: 'Mettre une porte dans cet étage', action: { type: 'setFront', shelfBelowId: id, choice: { type: 'doors', count: 1 } } })
      items.push({ label: 'Mettre deux portes dans cet étage', action: { type: 'setFront', shelfBelowId: id, choice: { type: 'doors', count: 2 } } })
      items.push({ label: 'Mettre un tiroir dans cet étage', action: { type: 'setFront', shelfBelowId: id, choice: { type: 'drawer' } } })
    }
    items.push({ label: 'Ajouter un support sous l’étagère', action: { type: 'addSupport', placement: 'under' } })
    return items
  }

  items.push({ label: pieceLabel(plan, pieceId) })
  if (isFrontId(pieceId)) {
    const stageId = frontRects(plan).find((r) => r.id === pieceId)?.shelfBelowId
    const front = plan.fronts?.find((f) => f.shelfBelowId === stageId)
    if (!front) return items
    if (front.type === 'doors') {
      if (front.count === 1) {
        const other = front.hinge === 'left' ? 'right' : 'left'
        items.push({ label: `Charnières à ${other === 'left' ? 'gauche' : 'droite'}`, action: { type: 'setFront', shelfBelowId: front.shelfBelowId, choice: { type: 'doors', count: 1, hinge: other } } })
      }
      items.push({ label: front.count === 1 ? 'Passer à deux portes' : 'Passer à une porte', action: { type: 'setFront', shelfBelowId: front.shelfBelowId, choice: { type: 'doors', count: front.count === 1 ? 2 : 1 } } })
      items.push({ label: 'Remplacer par un tiroir', action: { type: 'setFront', shelfBelowId: front.shelfBelowId, choice: { type: 'drawer' } } })
    } else {
      items.push({ label: 'Remplacer par une porte', action: { type: 'setFront', shelfBelowId: front.shelfBelowId, choice: { type: 'doors', count: 1 } } })
    }
    items.push({ label: 'Retirer (étage ouvert)', action: { type: 'setFront', shelfBelowId: front.shelfBelowId, choice: null }, danger: true })
    return items
  }
  items.push({ label: 'Modifier les valeurs (panneau de droite)', action: { type: 'selectPiece', id: pieceId, additive: false } })

  if (pieceId === 'upright-left' || pieceId === 'upright-right') {
    if (plan.model === 'frame') {
      const side = pieceId === 'upright-left' ? 'left' : 'right'
      const full = fullUprightLength(plan)
      const base = plan.options.framePlacement === 'onTop' ? (shelves[0]?.thickness ?? 0) : 0
      const cutAt = Math.round(at.y - base)
      if (cutAt >= 1 && cutAt < uprightLength(plan, side)) {
        items.push({
          label: `Couper ici (montant de ${formatLength(cutAt, unit)})`,
          action: { type: 'setPieceProperty', ids: [pieceId], property: 'length', mm: cutAt },
        })
      }
      if (uprightLength(plan, side) < full) {
        items.push({ label: `Rétablir la hauteur complète (${formatLength(full, unit)})`, action: { type: 'setPieceProperty', ids: [pieceId], property: 'length', mm: full } })
      }
    }
    return items
  }

  const shelfIndex = shelves.findIndex((s) => s.id === pieceId)
  if (shelfIndex >= 0) {
    const isMiddle = shelfIndex > 0 && shelfIndex < shelves.length - 1
    if (isMiddle) nudges(pieceId)
    if (shelfIndex < shelves.length - 1) addInStage(pieceId, 'dans l’étage au-dessus')
    if (isMiddle) items.push({ label: 'Supprimer cette tablette', action: { type: 'removePieces', ids: [pieceId] }, danger: true })
    return items
  }

  if (plan.wedges.some((w) => w.id === pieceId)) {
    nudges(pieceId)
    items.push({ label: 'Supprimer cette cale', action: { type: 'removePieces', ids: [pieceId] }, danger: true })
    return items
  }

  if (isSupportId(pieceId)) {
    items.push({ label: 'Dupliquer à côté', action: { type: 'duplicateSupport', id: pieceId, mode: 'next' } })
    items.push({ label: 'Dupliquer en symétrique', action: { type: 'duplicateSupport', id: pieceId, mode: 'mirror' } })
    items.push({ label: 'Aligner sur l’avant de l’étagère', action: { type: 'alignSupportFront', id: pieceId } })
    items.push({ label: 'Supprimer ce support', action: { type: 'removePieces', ids: [pieceId] }, danger: true })
    return items
  }

  if (isObjectId(pieceId)) {
    items.push({ label: 'Retirer cet objet', action: { type: 'removePieces', ids: [pieceId] }, danger: true })
  }
  return items
}
