import { fail, finish, type EditResult } from './edit'
import type { Plan, PlanColors } from './types'

/**
 * Couleurs d'affichage : de quoi se faire une idée de l'aspect final (bois, contrastes, décor). Elles ne changent
 * ni les dimensions ni la liste de découpe.
 */
export type ColorCategory = 'upright' | 'shelf' | 'wedge' | 'support' | 'wall'

export const COLOR_CATEGORIES: { category: ColorCategory; label: string }[] = [
  { category: 'upright', label: 'Montants' },
  { category: 'shelf', label: 'Tablettes' },
  { category: 'wedge', label: 'Cales' },
  { category: 'support', label: 'Supports' },
  { category: 'wall', label: 'Mur (profil, dessous, 3D)' },
]

/** Couleurs par défaut en 3D (en 2D, c'est la feuille de style qui les donne : mêmes teintes). */
export const DEFAULT_COLORS: Record<ColorCategory, string> = {
  upright: '#dcb985',
  shelf: '#dcb985',
  wedge: '#ecd7b0',
  support: '#c9d6c1',
  wall: '#e4ddd0',
}

export interface ColorPreset {
  hex: string
  label: string
}

/** Tons de bois d'abord, puis des couleurs qui font contraste (cales, décor, mur). */
export const WOOD_PRESETS: ColorPreset[] = [
  { hex: '#efe3c8', label: 'Frêne blanchi' },
  { hex: '#e6cf9a', label: 'Pin' },
  { hex: '#dcb985', label: 'Chêne clair' },
  { hex: '#c8a066', label: 'Chêne doré' },
  { hex: '#a8663a', label: 'Merisier' },
  { hex: '#7b5434', label: 'Noyer' },
  { hex: '#4a3426', label: 'Noyer foncé' },
  { hex: '#3e2f27', label: 'Wengé' },
]

export const CONTRAST_PRESETS: ColorPreset[] = [
  { hex: '#f4f1ea', label: 'Blanc cassé' },
  { hex: '#9aa3a8', label: 'Gris' },
  { hex: '#2b2b2b', label: 'Noir' },
  { hex: '#4f7cac', label: 'Bleu' },
  { hex: '#7a9a7e', label: 'Vert sauge' },
  { hex: '#c8603f', label: 'Terracotta' },
  { hex: '#d9a82b', label: 'Jaune moutarde' },
  { hex: '#d9a3a3', label: 'Rose poudré' },
]

const HEX = /^#[0-9a-fA-F]{6}$/

export function isColor(value: unknown): value is string {
  return typeof value === 'string' && HEX.test(value)
}

/** Catégorie de couleur d'une pièce, d'un montant d'étage ou d'un support, ou null (objet, identifiant inconnu). */
export function categoryOf(plan: Plan, id: string): ColorCategory | null {
  if (id === 'upright-left' || id === 'upright-right') return 'upright'
  if (/^vertical-(left|right)-/.test(id)) return 'upright'
  if (plan.shelves.some((s) => s.id === id)) return 'shelf'
  if (plan.wedges.some((w) => w.id === id)) return 'wedge'
  if (plan.supports?.some((s) => s.id === id)) return 'support'
  return null
}

/** Couleur choisie pour une pièce (propre à la pièce, sinon de sa catégorie), ou undefined = couleur par défaut. */
export function colorOf(plan: Plan, id: string, category: ColorCategory): string | undefined {
  return plan.colors?.pieces?.[id] ?? plan.colors?.[category]
}

/** Couleur effective, par défaut comprise (pour la 3D). */
export function effectiveColor(plan: Plan, id: string, category: ColorCategory): string {
  return colorOf(plan, id, category) ?? DEFAULT_COLORS[category]
}

function tidy(next: Plan): void {
  const colors = next.colors
  if (!colors) return
  if (colors.pieces) {
    for (const id of Object.keys(colors.pieces)) if (categoryOf(next, id) === null) delete colors.pieces[id]
    if (Object.keys(colors.pieces).length === 0) delete colors.pieces
  }
  if (Object.keys(colors).length === 0) delete next.colors
}

/** Couleur d'une catégorie entière (`null` = couleur par défaut). Les couleurs propres à une pièce restent. */
export function setCategoryColor(plan: Plan, category: ColorCategory, color: string | null): EditResult {
  if (color !== null && !isColor(color)) return fail('Couleur invalide.')
  const next = structuredClone(plan)
  const colors: PlanColors = next.colors ?? {}
  if (color === null) delete colors[category]
  else colors[category] = color.toLowerCase()
  next.colors = colors
  tidy(next)
  return finish(next)
}

/** Couleur propre à des pièces précises (`null` = elles reprennent la couleur de leur catégorie). */
export function setPieceColors(plan: Plan, ids: string[], color: string | null): EditResult {
  if (color !== null && !isColor(color)) return fail('Couleur invalide.')
  if (ids.length === 0) return fail('Aucune pièce sélectionnée.')
  if (ids.some((id) => categoryOf(plan, id) === null)) return fail('Cette pièce ne peut pas être colorée.')
  const next = structuredClone(plan)
  const colors: PlanColors = next.colors ?? {}
  const pieces = { ...(colors.pieces ?? {}) }
  for (const id of ids) {
    if (color === null) delete pieces[id]
    else pieces[id] = color.toLowerCase()
  }
  colors.pieces = pieces
  next.colors = colors
  tidy(next)
  return finish(next)
}

/** Identifiants colorables parmi une sélection (pièces et supports, pas les objets de simulation). */
export function colorableIds(plan: Plan, selection: string[]): string[] {
  return selection.filter((id) => categoryOf(plan, id) !== null)
}
