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

/**
 * Déplacement d'une pièce au clavier : une tablette intermédiaire monte / descend (`dy`), une cale va à gauche /
 * à droite (`dx`), d'un pas `step` (mm). Comme à la souris, elle s'arrête contre ses voisines.
 * Renvoie la cote à appliquer, ou null si la pièce ne se déplace pas dans ce sens ou ne peut plus bouger.
 */
export function nudgePiece(
  plan: Plan,
  id: string,
  dx: -1 | 0 | 1,
  dy: -1 | 0 | 1,
  step: number,
): { property: 'x' | 'y'; mm: number } | null {
  const shelves = sortedShelves(plan)
  const index = shelves.findIndex((s) => s.id === id)
  const isMiddleShelf = index > 0 && index < shelves.length - 1
  const wedge = plan.wedges.find((w) => w.id === id)

  let property: 'x' | 'y'
  let current: number
  let direction: number
  if (isMiddleShelf && dy !== 0) {
    property = 'y'
    current = shelves[index].y
    direction = dy
  } else if (wedge && dx !== 0) {
    property = 'x'
    current = wedge.x
    direction = dx
  } else {
    return null
  }

  const mm = clampToValid(current, current + direction * step, (v) => setPieceProperty(plan, [id], property, v).ok)
  return mm === current ? null : { property, mm }
}

/** Plus grande distance (mm) explorée un mm à la fois quand la profondeur de départ n'est elle-même pas valide. */
const SCAN_LIMIT = 3000

/**
 * Plan avec la profondeur de toutes les pièces `ids` portée à la valeur amenée par la souris (`rawDepth`, en mm,
 * non arrondi). Toutes prennent la même profondeur, comme dans le panneau de propriétés. La valeur s'arrête à ce
 * que le plan autorise (par exemple, un arrondi d'arête limite la profondeur minimale). `startDepth` est la
 * profondeur de la pièce saisie au début du geste. Renvoie null si aucune valeur valide n'est proche.
 */
export function dragDepth(
  plan: Plan,
  ids: string[],
  startDepth: number,
  rawDepth: number,
  step: number | null,
): { plan: Plan; mm: number } | null {
  const valid = (v: number) => v >= 1 && setPieceProperty(plan, ids, 'depth', v).ok
  const target = Math.max(1, snapToStep(rawDepth, step))

  let mm: number | null = null
  if (valid(startDepth)) {
    mm = clampToValid(startDepth, target, valid)
  } else if (valid(target)) {
    mm = target
  } else {
    // Départ invalide (la sélection a des profondeurs très différentes) : on cherche la valeur valide la plus proche.
    const direction = startDepth > target ? 1 : -1
    for (let v = target, i = 0; i < Math.min(SCAN_LIMIT, Math.abs(startDepth - target)); v += direction, i++) {
      if (valid(v)) {
        mm = v
        break
      }
    }
  }

  if (mm === null) return null
  const result = setPieceProperty(plan, ids, 'depth', mm)
  return result.ok ? { plan: result.plan, mm } : null
}
