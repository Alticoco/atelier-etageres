import { setPieceProperty, setPlanSize } from './edit'
import { sortedShelves } from './pieces'
import type { Plan } from './types'

/** Pas d'aimantation proposés (mm) : 1 mm, 5 mm, 1 cm, 5 cm. */
export const SNAP_STEPS = [1, 5, 10, 50] as const

/** Arrondit à la valeur ronde la plus proche. `step` null = pas d'aimantation (mm entier le plus proche). */
export function snapToStep(value: number, step: number | null): number {
  if (step === null || step <= 1) return Math.round(value)
  return Math.round(value / step) * step
}

/**
 * Valeur valide la plus proche de `target` en partant de `start` (qui doit être valide).
 * Suppose que l'ensemble des valeurs valides est un intervalle contenant `start`.
 */
export function clampToValid(start: number, target: number, isValid: (value: number) => boolean): number {
  if (isValid(target)) return target
  let good = start
  let bad = target
  while (Math.abs(bad - good) > 1) {
    const mid = Math.trunc((good + bad) / 2)
    if (isValid(mid)) good = mid
    else bad = mid
  }
  return good
}

/**
 * Plan avec une tablette amenée vers la hauteur `rawY` (dessous de la tablette, en mm, non arrondi).
 * L'aimantation porte sur la hauteur libre de l'étage du dessous, la cote affichée sur le dessin.
 * La tablette s'arrête contre ses voisines et les cales de ses étages.
 */
export function dragShelf(plan: Plan, id: string, rawY: number, step: number | null): Plan {
  const shelves = sortedShelves(plan)
  const index = shelves.findIndex((s) => s.id === id)
  if (index < 0) return plan
  const below = shelves[index - 1]
  const belowTop = below ? below.y + below.thickness : 0

  const target = belowTop + snapToStep(rawY - belowTop, step)
  const y = clampToValid(shelves[index].y, target, (v) => setPieceProperty(plan, [id], 'y', v).ok)
  const result = setPieceProperty(plan, [id], 'y', y)
  return result.ok ? result.plan : plan
}

/** Plan avec une cale amenée vers la position `rawX` (bord gauche, depuis le bord extérieur gauche du cadre). */
export function dragWedge(plan: Plan, id: string, rawX: number, step: number | null): Plan {
  const wedge = plan.wedges.find((w) => w.id === id)
  if (!wedge) return plan
  const x = clampToValid(wedge.x, snapToStep(rawX, step), (v) => setPieceProperty(plan, [id], 'x', v).ok)
  const result = setPieceProperty(plan, [id], 'x', x)
  return result.ok ? result.plan : plan
}

/** Plan avec le cadre amené vers la largeur et/ou la hauteur demandées (mm, non arrondis). */
export function resizeFrame(plan: Plan, raw: { width?: number; height?: number }, step: number | null): Plan {
  const size: { width?: number; height?: number } = {}
  if (raw.width !== undefined) {
    size.width = clampToValid(plan.width, snapToStep(raw.width, step), (v) => setPlanSize(plan, { width: v }).ok)
  }
  if (raw.height !== undefined) {
    size.height = clampToValid(plan.height, snapToStep(raw.height, step), (v) => setPlanSize(plan, { height: v }).ok)
  }
  const result = setPlanSize(plan, size)
  return result.ok ? result.plan : plan
}
