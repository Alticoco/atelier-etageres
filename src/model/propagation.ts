import { sortedShelves } from './pieces'
import type { Plan } from './types'

/**
 * Propagation d'un changement de largeur : chaque cale garde sa position relative
 * dans l'espace libre entre les montants. `next` est la copie modifiée (largeur déjà changée).
 */
export function propagateWidth(before: Plan, next: Plan): void {
  const left = next.leftUpright.thickness
  const innerBefore = before.width - left - before.rightUpright.thickness
  const innerAfter = next.width - left - next.rightUpright.thickness
  for (const wedge of next.wedges) {
    const roomBefore = innerBefore - wedge.thickness
    const roomAfter = innerAfter - wedge.thickness
    if (roomBefore <= 0 || roomAfter < 0) continue
    wedge.x = left + Math.round(((wedge.x - left) / roomBefore) * roomAfter)
  }
}

/**
 * Propagation d'un changement de hauteur : l'espace libre (hors épaisseur des tablettes)
 * est redistribué proportionnellement, donc chaque étage garde sa part. `next` a déjà sa nouvelle hauteur.
 */
export function propagateHeight(before: Plan, next: Plan): void {
  const shelves = sortedShelves(next)
  const totalThickness = shelves.reduce((sum, s) => sum + s.thickness, 0)
  const freeBefore = before.height - totalThickness
  const freeAfter = next.height - totalThickness
  if (freeBefore <= 0 || freeAfter <= 0) return

  const oldY = shelves.map((s) => s.y)
  let thicknessBelow = 0
  shelves.forEach((shelf, i) => {
    const freeBelow = oldY[i] - thicknessBelow
    shelf.y = Math.round((freeBelow * freeAfter) / freeBefore) + thicknessBelow
    thicknessBelow += shelf.thickness
  })
}
