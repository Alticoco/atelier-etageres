import { computeProfileRects } from './profile'
import type { Plan } from './types'

/** À surface égale, une tablette passe avant une cale, qui passe avant un montant. */
const KIND_RANK = { shelf: 0, wedge: 1, upright: 2 } as const

/**
 * Pièce choisie par un clic dans la vue de profil, où presque toutes les pièces se superposent.
 * `x` est la profondeur depuis le mur et `y` la hauteur depuis le dessous du cadre (mm, repère du plan).
 * Parmi les pièces sous le curseur (pièces cachées comprises), on prend la plus petite : une tablette fine
 * passe donc avant le grand montant qui la recouvre. `tolerance` (mm) agrandit un peu la zone de chaque pièce.
 */
export function pickProfilePiece(plan: Plan, x: number, y: number, tolerance = 0): string | null {
  const hits = computeProfileRects(plan).filter(
    (r) =>
      x >= r.x - tolerance && x <= r.x + r.width + tolerance && y >= r.y - tolerance && y <= r.y + r.height + tolerance,
  )
  if (hits.length === 0) return null
  hits.sort((a, b) => a.width * a.height - b.width * b.height || KIND_RANK[a.kind] - KIND_RANK[b.kind])
  return hits[0].id
}
