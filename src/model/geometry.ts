import type { Plan } from './types'

/**
 * Repères horizontaux de l'étagère, selon son modèle. Tout est en mm depuis le bord gauche hors-tout (x = 0).
 *
 * Modèle `frame` : le corps occupe toute la largeur, les montants sont aux bords.
 * Modèle `frameless` : les tablettes dépassent des montants. Le débord le plus grand à gauche touche x = 0,
 * le plus grand à droite touche x = largeur ; le corps (face extérieure des montants) est entre les deux.
 */

/** Plus grands débords à gauche et à droite (toujours 0 pour le modèle `frame`). */
export function overhangs(plan: Plan): { left: number; right: number } {
  if (plan.model !== 'frameless') return { left: 0, right: 0 }
  return {
    left: Math.max(0, ...plan.shelves.map((s) => s.overhangLeft)),
    right: Math.max(0, ...plan.shelves.map((s) => s.overhangRight)),
  }
}

/** Faces extérieures des montants (le « corps » de l'étagère). */
export function bodyEdges(plan: Plan): { left: number; right: number } {
  const o = overhangs(plan)
  return { left: o.left, right: plan.width - o.right }
}

/** Espace libre entre les faces intérieures des montants : c'est là que se posent les cales. */
export function innerSpan(plan: Plan): { left: number; right: number } {
  const body = bodyEdges(plan)
  return { left: body.left + plan.leftUpright.thickness, right: body.right - plan.rightUpright.thickness }
}
