import { pieceLabel } from './labels'
import { computeFrontRects, type Rect } from './layout'
import type { Plan } from './types'

/**
 * Rayons d'arrondi maximums d'une pièce : la moitié de la plus petite dimension visible.
 * - coins (vue de face) : le plus petit côté de la silhouette (9 mm au maximum pour du bois de 18 mm) ;
 * - arêtes (vue de profil) : le plus petit côté de la section vue de profil (profondeur × hauteur de la pièce).
 */
export function maxRadii(rect: Pick<Rect, 'width' | 'height' | 'depth'>): { corner: number; edge: number } {
  return {
    corner: Math.floor(Math.min(rect.width, rect.height) / 2),
    edge: Math.floor(Math.min(rect.depth, rect.height) / 2),
  }
}

/** Limites d'une pièce du plan, ou null si elle n'existe pas. */
export function radiusLimits(plan: Plan, id: string): { corner: number; edge: number } | null {
  const rect = computeFrontRects(plan).find((r) => r.id === id)
  return rect ? maxRadii(rect) : null
}

/** Problèmes d'arrondi du plan : valeurs non entières, négatives, ou plus grandes que la pièce ne le permet. */
export function roundingProblems(plan: Plan): string[] {
  const problems: string[] = []
  for (const rect of computeFrontRects(plan)) {
    const limits = maxRadii(rect)
    const label = pieceLabel(plan, rect.id)
    for (const [name, value, max] of [
      ['des coins', rect.cornerRadius, limits.corner],
      ['des arêtes', rect.edgeRadius, limits.edge],
    ] as const) {
      if (!Number.isInteger(value) || value < 0) {
        problems.push(`Le rayon ${name} de « ${label} » doit être un nombre entier de mm positif ou nul.`)
      } else if (value > max) {
        problems.push(`Le rayon ${name} de « ${label} » est trop grand : ${max} mm au maximum.`)
      }
    }
  }
  return problems
}
