import { readPiece } from './edit'
import { computeFrontRects } from './layout'
import { sortedShelves } from './pieces'
import type { PieceKind, Plan } from './types'

/**
 * Pièce vue de profil, dans le repère du plan : x = profondeur depuis le mur (vers l'avant),
 * y = hauteur depuis le dessous du cadre (vers le haut), en mm.
 */
export interface ProfileRect {
  id: string
  kind: PieceKind
  x: number
  y: number
  width: number
  height: number
  /** Cachée par le montant le plus proche : dessinée en pointillés, comme un trait caché. */
  hidden: boolean
}

/**
 * Vue de profil depuis le côté gauche : le mur est à gauche, l'avant à droite, le montant gauche est
 * au premier plan. Toutes les pièces sont alignées contre le mur (x = 0). Sont cachés : le montant droit,
 * les cales, et les tablettes qui se trouvent entre les montants. Les tablettes du haut et du bas posées
 * sur / sous les montants restent visibles.
 */
export function computeProfileRects(plan: Plan): ProfileRect[] {
  const shelves = sortedShelves(plan)
  const outerIds = new Set([shelves[0]?.id, shelves[shelves.length - 1]?.id])
  const onTop = plan.options.framePlacement === 'onTop'

  return computeFrontRects(plan).map((front) => {
    const depth = readPiece(plan, front.id)?.depth ?? 0
    const hidden =
      front.kind === 'wedge' ||
      front.id === 'upright-right' ||
      (front.kind === 'shelf' && !(onTop && outerIds.has(front.id)))
    return { id: front.id, kind: front.kind, x: 0, y: front.y, width: depth, height: front.height, hidden }
  })
}

/** Dimensions du dessin de profil : profondeur hors-tout (la plus grande pièce) × hauteur hors-tout. */
export function profileSize(plan: Plan): { width: number; height: number } {
  const depths = computeProfileRects(plan).map((r) => r.width)
  return { width: Math.max(0, ...depths), height: plan.height }
}
