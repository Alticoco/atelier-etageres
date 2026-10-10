import type { Plan } from './types'

/** Contrôles de cohérence des supports (mm entiers, dimensions > 0, recul >= 0). */
export function supportProblems(plan: Plan): string[] {
  for (const s of plan.supports ?? []) {
    if (![s.x, s.y, s.z, s.width, s.height, s.depth].every(Number.isInteger)) {
      return ['Toutes les cotes d’un support doivent être des nombres entiers de mm.']
    }
    if (s.width < 1 || s.height < 1 || s.depth < 1) return ['La largeur, la hauteur et la profondeur d’un support doivent être supérieures à 0.']
    if (s.z < 0) return ['Un support ne peut pas passer derrière le mur (recul négatif).']
  }
  return []
}
