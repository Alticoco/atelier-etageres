import { innerSpan } from './geometry'
import { findDrawnObject } from './guides'
import { layoutStage } from './objects'
import { getStages, sortedShelves } from './pieces'
import type { Plan } from './types'

/**
 * Cotes « dynamiques » affichées pendant un glisser en vue de face (façon SketchUp / Figma) : la place libre à gauche
 * et à droite d'une cale, d'un objet posé seul ou d'un support, la hauteur libre sous et sur une tablette.
 * Coordonnées du plan, en mm, y vers le haut. Fonctions pures.
 */
export type LiveDimension =
  /** Cote horizontale, de `from` à `to` (x), tracée à la hauteur `y`. */
  | { axis: 'x'; side: 'left' | 'right'; from: number; to: number; y: number; value: number }
  /** Cote verticale, de `from` à `to` (y), tracée à l'abscisse `x`. */
  | { axis: 'y'; side: 'below' | 'above'; from: number; to: number; x: number; value: number }

interface Span {
  from: number
  to: number
}

/**
 * Distances libres à gauche et à droite de `piece` : le bord le plus proche parmi `leftEdges` (à gauche de la pièce)
 * et `rightEdges` (à droite), plus les obstacles qui ne la chevauchent pas. Un côté sans bord n'a pas de cote.
 */
function sideGaps(piece: Span, y: number, leftEdges: number[], rightEdges: number[], obstacles: Span[]): LiveDimension[] {
  const lefts = [...leftEdges, ...obstacles.map((o) => o.to)].filter((e) => e <= piece.from)
  const rights = [...rightEdges, ...obstacles.map((o) => o.from)].filter((e) => e >= piece.to)
  const dims: LiveDimension[] = []
  if (lefts.length > 0) {
    const from = Math.max(...lefts)
    dims.push({ axis: 'x', side: 'left', from, to: piece.from, y, value: piece.from - from })
  }
  if (rights.length > 0) {
    const to = Math.min(...rights)
    dims.push({ axis: 'x', side: 'right', from: piece.to, to, y, value: to - piece.to })
  }
  return dims
}

/** Cales et objets posés seuls d'un étage (sauf `ignoreId`), en intervalles de x. */
function stageObstacles(plan: Plan, shelfBelowId: string, ignoreId: string): Span[] {
  const spans = plan.wedges.filter((w) => w.shelfBelowId === shelfBelowId && w.id !== ignoreId).map((w) => ({ from: w.x, to: w.x + w.thickness }))
  const stage = getStages(plan).find((s) => s.shelfBelowId === shelfBelowId)
  if (stage) {
    for (const o of layoutStage(plan, stage).objects) {
      // Objets posés seuls seulement (les rangées se rangent autour) ; une pile = un seul obstacle (niveau 0).
      if (o.rowId === null && o.id !== ignoreId && o.level === 0) spans.push({ from: o.x, to: o.x + o.width })
    }
  }
  return spans
}

/**
 * Cotes dynamiques de la pièce `pieceId` dans le plan `plan` (le plan « brouillon » du glisser) :
 * - cale ou objet posé seul : distance libre à gauche et à droite jusqu'au montant, à la cale ou à l'objet posé seul
 *   le plus proche du même étage ;
 * - support : distance jusqu'au bord de l'étagère ou au support voisin (à la même hauteur) de chaque côté ;
 * - tablette intermédiaire : hauteur libre de l'étage du dessous et de celui du dessus.
 * Autre pièce (montant, tablette du haut ou du bas, pièce inconnue) : aucune cote.
 */
export function liveDimensions(plan: Plan, pieceId: string): LiveDimension[] {
  const span = innerSpan(plan)

  const wedge = plan.wedges.find((w) => w.id === pieceId)
  if (wedge) {
    const stage = getStages(plan).find((s) => s.shelfBelowId === wedge.shelfBelowId)
    if (!stage) return []
    const piece = { from: wedge.x, to: wedge.x + wedge.thickness }
    return sideGaps(piece, stage.y + stage.clearHeight / 2, [span.left], [span.right], stageObstacles(plan, wedge.shelfBelowId, pieceId))
  }

  const support = plan.supports?.find((s) => s.id === pieceId)
  if (support) {
    const neighbours = plan.supports!.filter(
      (o) => o.id !== pieceId && o.y < support.y + support.height && support.y < o.y + o.height,
    )
    const piece = { from: support.x, to: support.x + support.width }
    const edges = [0, plan.width]
    return sideGaps(piece, support.y + support.height / 2, edges, edges, neighbours.map((o) => ({ from: o.x, to: o.x + o.width })))
  }

  const shelves = sortedShelves(plan)
  const index = shelves.findIndex((s) => s.id === pieceId)
  if (index >= 0) {
    if (index === 0 || index === shelves.length - 1) return []
    const shelf = shelves[index]
    const belowTop = shelves[index - 1].y + shelves[index - 1].thickness
    const aboveBottom = shelves[index + 1].y
    const x = (span.left + span.right) / 2
    return [
      { axis: 'y', side: 'below', from: belowTop, to: shelf.y, x, value: shelf.y - belowTop },
      { axis: 'y', side: 'above', from: shelf.y + shelf.thickness, to: aboveBottom, x, value: aboveBottom - shelf.y - shelf.thickness },
    ]
  }

  const found = findDrawnObject(plan, pieceId)
  if (found && found.object.rowId === null) {
    const stage = getStages(plan).find((s) => s.shelfBelowId === found.shelfBelowId)!
    // Pile : la cote passe au milieu de la partie visible de la pile (sous le haut de l'étage).
    const pile = layoutStage(plan, stage).objects.filter((o) => o.id === pieceId)
    const top = Math.min(stage.y + stage.clearHeight, Math.max(...pile.map((o) => o.y + o.height)))
    const piece = { from: found.object.x, to: found.object.x + found.object.width }
    return sideGaps(piece, (found.object.y + top) / 2, [span.left], [span.right], stageObstacles(plan, found.shelfBelowId, pieceId))
  }

  return []
}

/**
 * Position où amener la pièce pour que sa cote principale (distance à gauche pour une cale, un objet ou un support ;
 * hauteur libre du dessous pour une tablette) vaille `mm` : bord gauche (`axis` x) ou dessous (`axis` y), en mm.
 * Null si la pièce n'a pas de cote principale. La position n'est pas contrôlée : le glisser l'arrête où le plan le permet.
 */
export function typedTarget(plan: Plan, pieceId: string, mm: number): { axis: 'x' | 'y'; value: number } | null {
  const main = liveDimensions(plan, pieceId).find((d) => d.side === 'left' || d.side === 'below')
  return main ? { axis: main.axis, value: main.from + mm } : null
}
