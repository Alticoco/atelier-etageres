import { MAX_STACK, orientedSize, resolveKind, type CustomKindInput, type ObjectKind } from '../model/objects'
import type { ObjectOrientation, Plan } from '../model/types'
import { formatNumber, type LengthUnit } from '../model/units'

/** Fonctions pures de l'interface « Mes objets » (formulaire, textes, calculs d'étage), testées à part. */

/** Palette proposée pour un objet sur mesure (un choix libre existe en plus). */
export const CUSTOM_COLORS: { hex: string; label: string }[] = [
  { hex: '#d98c8c', label: 'Rouge doux' },
  { hex: '#e6a457', label: 'Orange' },
  { hex: '#e3c46f', label: 'Jaune' },
  { hex: '#8fbf9a', label: 'Vert' },
  { hex: '#7fb3c8', label: 'Bleu clair' },
  { hex: '#8d8fcf', label: 'Violet' },
  { hex: '#b08968', label: 'Brun' },
  { hex: '#9aa0a6', label: 'Gris' },
]

/** Brouillon du formulaire d'un objet sur mesure (dimensions en mm). */
export interface CustomKindDraft {
  label: string
  width: number
  height: number
  depth: number
  shape: 'box' | 'cylinder'
  color: string
}

export const INITIAL_CUSTOM_KIND_DRAFT: CustomKindDraft = {
  label: '',
  width: 100,
  height: 100,
  depth: 100,
  shape: 'box',
  color: CUSTOM_COLORS[0].hex,
}

/** Brouillon pré-rempli avec un objet existant (pour le modifier). */
export function draftFromKind(kind: ObjectKind): CustomKindDraft {
  return {
    label: kind.label,
    width: kind.width,
    height: kind.height,
    depth: kind.depth,
    shape: kind.shape ?? 'box',
    color: kind.color ?? INITIAL_CUSTOM_KIND_DRAFT.color,
  }
}

/** Ce que le modèle attend pour créer ou modifier l'objet. */
export function draftToInput(draft: CustomKindDraft): CustomKindInput {
  return {
    label: draft.label.trim(),
    width: draft.width,
    height: draft.height,
    depth: draft.depth,
    shape: draft.shape,
    color: draft.color,
  }
}

/** Dimensions pour l'écran : « 9 × 18 × 9 cm » (largeur × hauteur × profondeur). */
export function formatDims(kind: Pick<ObjectKind, 'width' | 'height' | 'depth'>, unit: LengthUnit): string {
  return `${formatNumber(kind.width, unit)} × ${formatNumber(kind.height, unit)} × ${formatNumber(kind.depth, unit)} ${unit}`
}

/** Nombre d'objets posés (rangées et objets seuls, piles comprises) qui utilisent ce type d'objet. */
export function countObjectsOfKind(plan: Plan, kindId: string): number {
  const inRows = (plan.rows ?? []).filter((r) => r.kind === kindId).reduce((sum, r) => sum + r.count, 0)
  const alone = (plan.placedObjects ?? []).filter((p) => p.kind === kindId).reduce((sum, p) => sum + (p.stack ?? 1), 0)
  return inRows + alone
}

/** Question posée avant de supprimer un objet sur mesure. */
export function removeKindMessage(plan: Plan, kindId: string): string {
  const label = resolveKind(plan, kindId)?.label ?? 'cet objet'
  const n = countObjectsOfKind(plan, kindId)
  if (n === 0) return `Supprimer « ${label} » ?`
  return `Supprimer « ${label} » ? Les ${n} objet${n > 1 ? 's' : ''} posé${n > 1 ? 's' : ''} dans l’étagère disparaîtront aussi.`
}

/** Sens proposés à la pose, avec une explication courte (infobulle). */
export const ORIENTATION_CHOICES: { value: ObjectOrientation; label: string; hint: string }[] = [
  { value: 'standing', label: 'Debout', hint: 'Debout : tel quel, la hauteur de l’objet reste verticale.' },
  { value: 'lying', label: 'Couché', hint: 'Couché : posé sur le côté (la hauteur et la largeur sont échangées).' },
  { value: 'facing', label: 'De face', hint: 'De face : tourné d’un quart de tour (la profondeur et la largeur sont échangées).' },
]

/** Lit « Par pile » : un entier de 1 à `MAX_STACK`, ou null. Un champ vide vaut 1. */
export function parseStack(text: string): number | null {
  if (text.trim() === '') return 1
  if (!/^\s*\d+\s*$/.test(text)) return null
  const n = Number(text)
  return n >= 1 && n <= MAX_STACK ? n : null
}

/** Plus haute pile et plus grande profondeur des objets d'un étage (rangées et objets seuls), dans leur sens. */
export function stageObjectsNeeds(plan: Plan, shelfBelowId: string): { height: number; depth: number } | null {
  let height = 0
  let depth = 0
  let any = false
  const take = (kindId: string, orientation: ObjectOrientation | undefined, objectsInPile: number) => {
    const kind = resolveKind(plan, kindId)
    if (!kind) return
    const size = orientedSize(kind, orientation)
    any = true
    height = Math.max(height, objectsInPile * size.height)
    depth = Math.max(depth, size.depth)
  }
  for (const r of plan.rows ?? []) if (r.shelfBelowId === shelfBelowId) take(r.kind, r.orientation, Math.min(r.stack ?? 1, r.count))
  for (const p of plan.placedObjects ?? []) if (p.shelfBelowId === shelfBelowId) take(p.kind, p.orientation, p.stack ?? 1)
  return any ? { height, depth } : null
}
