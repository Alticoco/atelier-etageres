import { setPieceProperty, setPlanSize } from './edit'
import { getStages, sortedShelves } from './pieces'
import { wedgeGuides, type Guide } from './guides'
import { moveObject } from './objects'
import { moveUpright } from './jointEdit'
import { jointOf, type Side } from './joints'
import { moveWedge } from './tools'
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

/**
 * Plan avec le montant à encoches d'un côté amené vers la distance `rawOverhang` entre le bord hors-tout et sa face
 * extérieure (mm, non arrondie). La largeur hors-tout ne change pas ; le montant s'arrête là où le plan reste valide.
 */
export function dragUpright(plan: Plan, side: Side, rawOverhang: number, step: number | null): Plan {
  const start = jointOf(plan, side).overhang
  const value = clampToValid(start, snapToStep(rawOverhang, step), (v) => moveUpright(plan, side, v).ok)
  const result = moveUpright(plan, side, value)
  return result.ok ? result.plan : plan
}

/**
 * Plan avec une cale amenée vers (`rawX`, `rawY`) : le bord gauche de la cale (mm depuis le bord gauche du cadre) et la
 * hauteur du curseur (mm depuis le dessous du cadre). La cale passe dans l'étage sous le curseur (le plus proche s'il
 * est sur une tablette), s'y aligne seule (hauteur de l'étage) et s'aimante contre ses voisins.
 */
export function dragWedgeToStage(
  plan: Plan,
  id: string,
  rawX: number,
  rawY: number,
  step: number | null,
): { plan: Plan; shelfBelowId: string; x: number; guide: Guide | null } | null {
  const stages = getStages(plan)
  const distance = (s: { y: number; clearHeight: number }) =>
    rawY < s.y ? s.y - rawY : rawY > s.y + s.clearHeight ? rawY - (s.y + s.clearHeight) : 0
  const ordered = [...stages].sort((a, b) => distance(a) - distance(b))
  // L'étage le plus proche d'abord ; si la cale n'y tient pas, on garde la position actuelle.
  for (const stage of ordered.slice(0, 1)) {
    const result = moveWedge(plan, id, stage.shelfBelowId, rawX, step)
    if (result.ok) {
      const wedge = result.plan.wedges.find((w) => w.id === id)!
      const guide = step === null ? null : (wedgeGuides(result.plan, id, stage.shelfBelowId).find((g) => g.pos === wedge.x) ?? null)
      return { plan: result.plan, shelfBelowId: stage.shelfBelowId, x: wedge.x, guide }
    }
  }
  return null
}

/**
 * Plan avec un objet de simulation amené vers (`rawX`, `rawY`) : bord gauche de l'objet et hauteur du curseur (mm).
 * L'objet passe dans l'étage sous le curseur (le plus proche s'il est sur une tablette) et s'aimante contre ses voisins.
 */
export function dragObjectToStage(
  plan: Plan,
  id: string,
  rawX: number,
  rawY: number,
  step: number | null,
): { plan: Plan; id: string; shelfBelowId: string; x: number } | null {
  const stages = getStages(plan)
  const distance = (s: { y: number; clearHeight: number }) =>
    rawY < s.y ? s.y - rawY : rawY > s.y + s.clearHeight ? rawY - (s.y + s.clearHeight) : 0
  const stage = [...stages].sort((a, b) => distance(a) - distance(b))[0]
  if (!stage) return null
  const result = moveObject(plan, id, stage.shelfBelowId, rawX, step)
  if (!result.ok) return null
  const placed = result.plan.placedObjects!.find((p) => `obj:${p.id}` === result.id)!
  return { plan: result.plan, id: result.id, shelfBelowId: stage.shelfBelowId, x: placed.x }
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
