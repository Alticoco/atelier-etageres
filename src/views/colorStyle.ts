import { colorOf, type ColorCategory } from '../model/colors'
import type { Plan } from '../model/types'

/** Style SVG d'une pièce colorée : rien si elle garde sa couleur par défaut (la feuille de style s'en charge). */
export function fillStyle(plan: Plan, id: string, category: ColorCategory): { fill: string } | undefined {
  const color = colorOf(plan, id, category)
  return color ? { fill: color } : undefined
}
