import { innerSpan } from './geometry'
import { sortedShelves } from './pieces'
import type { Plan } from './types'

/**
 * Propagation d'un changement de largeur : chaque cale garde sa position relative
 * dans l'espace libre entre les montants. `next` est la copie modifiée (largeur déjà changée).
 */
export function propagateWidth(before: Plan, next: Plan): void {
  const spanBefore = innerSpan(before)
  const spanAfter = innerSpan(next)
  for (const wedge of next.wedges) {
    const roomBefore = spanBefore.right - spanBefore.left - wedge.thickness
    const roomAfter = spanAfter.right - spanAfter.left - wedge.thickness
    if (roomBefore <= 0 || roomAfter < 0) continue
    wedge.x = spanAfter.left + Math.round(((wedge.x - spanBefore.left) / roomBefore) * roomAfter)
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
