import { fail, finish, type EditResult } from './edit'
import { profileSize } from './profile'
import type { Plan, Support } from './types'

export type SupportPlacement = 'under' | 'left' | 'right' | 'base'
export type SupportProperty = 'x' | 'y' | 'z' | 'width' | 'height' | 'depth'

export const MAX_SUPPORTS = 100

/** Dimensions proposées pour un nouveau support (mm). */
const DEFAULT_UNDER = { width: 100, height: 40, depth: 100 }
const DEFAULT_SIDE = { width: 18, height: 200 }

export function isSupportId(id: string): boolean {
  return /^support-\d+$/.test(id)
}

/** Profondeur de l'avant de l'étagère depuis le mur (la pièce la plus profonde). */
export function frontDepth(plan: Plan): number {
  return profileSize(plan).width
}

function nextSupportId(plan: Plan): string {
  const numbers = (plan.supports ?? []).map((s) => Number(s.id.slice(8))).filter(Number.isInteger)
  return `support-${Math.max(0, ...numbers) + 1}`
}

/** Rectangle d'un support vu de face (x, y, largeur, hauteur) : repère du plan, y vers le haut. */
export function supportFrontRect(s: Support) {
  return { id: s.id, x: s.x, y: s.y, width: s.width, height: s.height }
}

/** Rectangle d'un support vu de profil depuis la gauche : x = recul depuis le mur, largeur = profondeur. */
export function supportProfileRect(s: Support) {
  return { id: s.id, x: s.z, y: s.y, width: s.depth, height: s.height }
}

/** Rectangle d'un support vu de dessous : x comme en vue de face, y = recul depuis le mur. */
export function supportBottomRect(s: Support) {
  return { id: s.id, x: s.x, z: s.z, width: s.width, depth: s.depth }
}

/**
 * Étendue des supports en dehors de l'étagère, pour cadrer les vues : dépassement à gauche, à droite, en bas
 * (vue de face et de profil) et en profondeur (vue de profil et de dessous), en mm, toujours >= 0.
 */
export function supportOverflow(plan: Plan): { left: number; right: number; below: number; above: number; front: number } {
  const out = { left: 0, right: 0, below: 0, above: 0, front: 0 }
  for (const s of plan.supports ?? []) {
    out.left = Math.max(out.left, -s.x)
    out.right = Math.max(out.right, s.x + s.width - plan.width)
    out.below = Math.max(out.below, -s.y)
    out.above = Math.max(out.above, s.y + s.height - plan.height)
    out.front = Math.max(out.front, s.z + s.depth - frontDepth(plan))
  }
  return out
}

/**
 * Ajoute un support : sous l'étagère (collé à l'avant, aux deux bouts puis au milieu), ou sur un côté.
 * Les cotes se règlent ensuite une à une.
 */
export function addSupport(plan: Plan, placement: SupportPlacement): { ok: true; plan: Plan; id: string } | { ok: false; error: string } {
  if ((plan.supports ?? []).length >= MAX_SUPPORTS) return fail(`Pas plus de ${MAX_SUPPORTS} supports.`) as { ok: false; error: string }
  const depth = frontDepth(plan)
  const id = nextSupportId(plan)
  let support: Support
  if (placement === 'base') {
    // Planche horizontale posée sous tous les supports du dessous : elle les relie et donne une base stable.
    const under = (plan.supports ?? []).filter((s) => s.y < 0)
    const thickness = plan.shelves[0]?.thickness ?? DEFAULT_UNDER.height
    if (under.length === 0) {
      support = { id, x: 0, y: -thickness, z: 0, width: plan.width, height: thickness, depth }
    } else {
      const minX = Math.min(...under.map((s) => s.x))
      const maxX = Math.max(...under.map((s) => s.x + s.width))
      const minZ = Math.min(...under.map((s) => s.z))
      const maxZ = Math.max(...under.map((s) => s.z + s.depth))
      const bottom = Math.min(...under.map((s) => s.y))
      support = { id, x: minX, y: bottom - thickness, z: minZ, width: maxX - minX, height: thickness, depth: maxZ - minZ }
    }
  } else if (placement === 'under') {
    const d = Math.min(DEFAULT_UNDER.depth, depth)
    const w = Math.min(DEFAULT_UNDER.width, plan.width)
    const slots = [0, plan.width - w, Math.round((plan.width - w) / 2)]
    const count = (plan.supports ?? []).filter((s) => s.y < 0).length
    support = { id, x: slots[count % slots.length], y: -DEFAULT_UNDER.height, z: depth - d, width: w, height: DEFAULT_UNDER.height, depth: d }
  } else {
    const height = Math.min(DEFAULT_SIDE.height, plan.height)
    support = {
      id,
      x: placement === 'left' ? -DEFAULT_SIDE.width : plan.width,
      y: 0,
      z: 0,
      width: DEFAULT_SIDE.width,
      height,
      depth,
    }
  }
  const next = structuredClone(plan)
  next.supports = [...(next.supports ?? []), support]
  const result = finish(next)
  return result.ok ? { ok: true, plan: result.plan, id } : result
}

/**
 * Duplique un support. `next` : à droite de l'original (ou à gauche s'il n'y a plus de place), avec 5 cm d'écart ;
 * `mirror` : symétrique par rapport au milieu de l'étagère. La copie est ensuite réglable comme les autres.
 */
export function duplicateSupport(
  plan: Plan,
  id: string,
  mode: 'next' | 'mirror',
): { ok: true; plan: Plan; id: string } | { ok: false; error: string } {
  const source = plan.supports?.find((s) => s.id === id)
  if (!source) return fail('Support inconnu.') as { ok: false; error: string }
  if ((plan.supports ?? []).length >= MAX_SUPPORTS) return fail(`Pas plus de ${MAX_SUPPORTS} supports.`) as { ok: false; error: string }
  let x: number
  if (mode === 'mirror') {
    x = plan.width - source.x - source.width
    if (x === source.x) return fail('Ce support est déjà au milieu de l’étagère : sa symétrique serait au même endroit.') as { ok: false; error: string }
  } else {
    x = source.x + source.width + 50
    if (x + source.width > plan.width && source.x - source.width - 50 >= 0) x = source.x - source.width - 50
  }
  const copyId = nextSupportId(plan)
  const next = structuredClone(plan)
  next.supports = [...(next.supports ?? []), { ...source, id: copyId, x }]
  const result = finish(next)
  return result.ok ? { ok: true, plan: result.plan, id: copyId } : result
}

export function setSupportProperty(plan: Plan, id: string, property: SupportProperty, mm: number): EditResult {
  if (!Number.isInteger(mm)) return fail('La valeur doit être un nombre entier de mm.')
  if ((property === 'width' || property === 'height' || property === 'depth') && mm < 1) return fail('La valeur doit être supérieure à 0.')
  if (property === 'z' && mm < 0) return fail('Le recul ne peut pas être négatif (le support ne passe pas derrière le mur).')
  const next = structuredClone(plan)
  const support = next.supports?.find((s) => s.id === id)
  if (!support) return fail('Support inconnu.')
  support[property] = mm
  return finish(next)
}

/** Colle le support à l'avant de l'étagère : sa face avant affleure la pièce la plus profonde. */
export function alignSupportFront(plan: Plan, id: string): EditResult {
  const support = plan.supports?.find((s) => s.id === id)
  if (!support) return fail('Support inconnu.')
  return setSupportProperty(plan, id, 'z', Math.max(0, frontDepth(plan) - support.depth))
}

export function removeSupports(plan: Plan, ids: string[]): EditResult {
  if (!ids.every((id) => plan.supports?.some((s) => s.id === id))) return fail('Support inconnu.')
  const next = structuredClone(plan)
  next.supports = next.supports!.filter((s) => !ids.includes(s.id))
  if (next.supports.length === 0) delete next.supports
  return finish(next)
}

/** Libellé : « Support 2 ». */
export function supportLabel(plan: Plan, id: string): string {
  const index = (plan.supports ?? []).findIndex((s) => s.id === id)
  return index >= 0 ? `Support ${index + 1}` : id
}

/** Un lot de supports identiques dans la liste de découpe (repères S1, S2…). */
export interface SupportGroup {
  mark: string
  length: number
  width: number
  thickness: number
  quantity: number
  ids: string[]
}

/** Supports regroupés par dimensions identiques. Planche : longueur = plus grande cote, épaisseur = plus petite. */
export function supportGroups(plan: Plan): SupportGroup[] {
  const groups: SupportGroup[] = []
  for (const s of plan.supports ?? []) {
    const [length, width, thickness] = [s.width, s.height, s.depth].sort((a, b) => b - a)
    let group = groups.find((g) => g.length === length && g.width === width && g.thickness === thickness)
    if (!group) {
      group = { mark: `S${groups.length + 1}`, length, width, thickness, quantity: 0, ids: [] }
      groups.push(group)
    }
    group.quantity += 1
    group.ids.push(s.id)
  }
  return groups
}

/** Nouvelle position d'un support (cotes absentes = inchangées). Un seul contrôle de cohérence. */
export function moveSupport(plan: Plan, id: string, to: { x?: number; y?: number; z?: number }): EditResult {
  const next = structuredClone(plan)
  const support = next.supports?.find((s) => s.id === id)
  if (!support) return fail('Support inconnu.')
  if (to.x !== undefined) support.x = to.x
  if (to.y !== undefined) support.y = to.y
  if (to.z !== undefined) support.z = to.z
  return finish(next)
}

/** Distance (mm) en dessous de laquelle un support s'aimante contre l'avant, le mur ou le dessous de l'étagère. */
export const SUPPORT_MAGNET_MM = 10

/**
 * Plan avec le support amené vers la position demandée (mm, non arrondie) : position arrondie au pas, puis
 * aimantée contre le mur (recul 0), contre l'avant de l'étagère, ou sous l'étagère (dessus du support au niveau du
 * dessous du cadre). `step` null = pas d'arrondi ni d'aimantation (mm entier).
 */
export function dragSupport(plan: Plan, id: string, raw: { x?: number; y?: number; z?: number }, step: number | null): Plan {
  const support = plan.supports?.find((s) => s.id === id)
  if (!support) return plan
  const round = (v: number) => (step === null || step <= 1 ? Math.round(v) : Math.round(v / step) * step)
  const to: { x?: number; y?: number; z?: number } = {}
  if (raw.x !== undefined) to.x = round(raw.x)
  if (raw.y !== undefined) to.y = round(raw.y)
  if (raw.z !== undefined) to.z = Math.max(0, round(raw.z))

  if (step !== null) {
    const front = frontDepth(plan)
    if (to.z !== undefined) {
      if (Math.abs(to.z) <= SUPPORT_MAGNET_MM) to.z = 0
      else if (Math.abs(to.z + support.depth - front) <= SUPPORT_MAGNET_MM) to.z = Math.max(0, front - support.depth)
    }
    if (to.y !== undefined && Math.abs(to.y + support.height) <= SUPPORT_MAGNET_MM) to.y = -support.height
    if (to.x !== undefined) {
      if (Math.abs(to.x) <= SUPPORT_MAGNET_MM) to.x = 0
      else if (Math.abs(to.x + support.width - plan.width) <= SUPPORT_MAGNET_MM) to.x = plan.width - support.width
    }
  }
  const result = moveSupport(plan, id, to)
  return result.ok ? result.plan : plan
}
