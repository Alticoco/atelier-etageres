import { fail, finish, type EditResult } from './edit'
import { innerSpan } from './geometry'
import { getStages } from './pieces'
import type { ObjectRow, Plan, Stage } from './types'

/**
 * Objets de simulation : de quoi se faire une idée de ce qu'on range dans l'étagère.
 * Dimensions courantes (mm), à ajuster : `width` = largeur vue de face (rangés debout, côte à côte),
 * `height` = hauteur, `depth` = profondeur.
 */
export interface ObjectKind {
  id: string
  label: string
  plural: string
  width: number
  height: number
  depth: number
  /** Coins arrondis (bocaux). */
  round?: boolean
}

export const OBJECT_KINDS: ObjectKind[] = [
  { id: 'manga', label: 'Manga', plural: 'mangas', width: 14, height: 175, depth: 115 },
  { id: 'pocket', label: 'Livre de poche', plural: 'livres de poche', width: 25, height: 177, depth: 108 },
  { id: 'novel', label: 'Livre grand format', plural: 'livres grand format', width: 30, height: 215, depth: 140 },
  { id: 'album', label: 'Grand livre / BD', plural: 'grands livres', width: 25, height: 320, depth: 240 },
  { id: 'jar', label: 'Bocal d’épices', plural: 'bocaux d’épices', width: 55, height: 100, depth: 55, round: true },
]

export const MAX_ROW_COUNT = 500

export function objectKind(id: string): ObjectKind | undefined {
  return OBJECT_KINDS.find((k) => k.id === id)
}

/** Un objet posé dans un étage, en mm (repère du plan). */
export interface PlacedObject {
  rowId: string
  kindId: string
  x: number
  y: number
  width: number
  height: number
  /** Plus haut que l'étage, ou plus profond que la tablette : il ne rentre pas vraiment. */
  tooTall: boolean
  tooDeep: boolean
}

export interface RowStatus {
  rowId: string
  placed: number
  /** Objets qui n'ont plus de place dans l'étage. */
  overflow: number
  tooTall: boolean
  tooDeep: boolean
}

export interface StageLayout {
  objects: PlacedObject[]
  rows: RowStatus[]
  /** Places libres restantes (début, longueur), mm. */
  free: { from: number; length: number }[]
}

/** Places libres d'un étage : entre les montants, hors cales. */
function stageSlots(plan: Plan, stage: Stage): { from: number; length: number }[] {
  const span = innerSpan(plan)
  const wedges = plan.wedges.filter((w) => w.shelfBelowId === stage.shelfBelowId).sort((a, b) => a.x - b.x)
  const slots: { from: number; length: number }[] = []
  let cursor = span.left
  for (const edge of [...wedges.map((w) => ({ from: w.x, to: w.x + w.thickness })), { from: span.right, to: span.right }]) {
    if (edge.from > cursor) slots.push({ from: cursor, length: edge.from - cursor })
    cursor = Math.max(cursor, edge.to)
  }
  return slots
}

/** Pose les rangées d'un étage de gauche à droite, en sautant les cales. */
export function layoutStage(plan: Plan, stage: Stage): StageLayout {
  const slots = stageSlots(plan, stage).map((s) => ({ ...s, used: 0 }))
  const shelf = plan.shelves.find((s) => s.id === stage.shelfBelowId)
  const objects: PlacedObject[] = []
  const rows: RowStatus[] = []

  for (const row of (plan.rows ?? []).filter((r) => r.shelfBelowId === stage.shelfBelowId)) {
    const kind = objectKind(row.kind)
    if (!kind) continue
    const tooTall = kind.height > stage.clearHeight
    const tooDeep = shelf !== undefined && kind.depth > shelf.depth
    let placed = 0
    for (let i = 0; i < row.count; i++) {
      const slot = slots.find((s) => s.length - s.used >= kind.width)
      if (!slot) break
      objects.push({
        rowId: row.id,
        kindId: kind.id,
        x: slot.from + slot.used,
        y: stage.y,
        width: kind.width,
        height: kind.height,
        tooTall,
        tooDeep,
      })
      slot.used += kind.width
      placed++
    }
    rows.push({ rowId: row.id, placed, overflow: row.count - placed, tooTall, tooDeep })
  }

  return { objects, rows, free: slots.map((s) => ({ from: s.from + s.used, length: s.length - s.used })) }
}

/** Combien d'objets de ce type tiennent encore (en largeur) dans l'espace libre d'un étage. */
export function remainingCapacity(plan: Plan, shelfBelowId: string, kindId: string): number {
  const stage = getStages(plan).find((s) => s.shelfBelowId === shelfBelowId)
  const kind = objectKind(kindId)
  if (!stage || !kind) return 0
  return layoutStage(plan, stage).free.reduce((sum, f) => sum + Math.floor(f.length / kind.width), 0)
}

/** Combien d'objets de ce type tiendraient dans l'étage vide (rangées existantes ignorées). */
export function stageCapacity(plan: Plan, shelfBelowId: string, kindId: string): number {
  return remainingCapacity({ ...plan, rows: [] }, shelfBelowId, kindId)
}

function nextRowId(plan: Plan): string {
  const numbers = (plan.rows ?? []).map((r) => Number(r.id.slice(4))).filter(Number.isInteger)
  return `row-${Math.max(0, ...numbers) + 1}`
}

export type AddRowResult = { ok: true; plan: Plan; id: string } | { ok: false; error: string }

/** Ajoute une rangée d'objets dans un étage. `count` absent = remplir la place restante. */
export function addObjectRow(plan: Plan, shelfBelowId: string, kindId: string, count?: number): AddRowResult {
  if (!getStages(plan).some((s) => s.shelfBelowId === shelfBelowId)) return fail('Étage inconnu.') as AddRowResult
  if (!objectKind(kindId)) return fail('Objet inconnu.') as AddRowResult
  const n = count ?? remainingCapacity(plan, shelfBelowId, kindId)
  if (!Number.isInteger(n) || n < 1) return fail('Il n’y a pas de place pour cet objet dans cet étage.') as AddRowResult
  if (n > MAX_ROW_COUNT) return fail(`Pas plus de ${MAX_ROW_COUNT} objets par rangée.`) as AddRowResult
  const next = structuredClone(plan)
  const id = nextRowId(plan)
  next.rows = [...(next.rows ?? []), { id, shelfBelowId, kind: kindId, count: n }]
  const result = finish(next)
  return result.ok ? { ok: true, plan: result.plan, id } : result
}

export function setObjectRowCount(plan: Plan, rowId: string, count: number): EditResult {
  if (!Number.isInteger(count) || count < 1 || count > MAX_ROW_COUNT) return fail(`Entrez un nombre entier de 1 à ${MAX_ROW_COUNT}.`)
  const next = structuredClone(plan)
  const row = next.rows?.find((r) => r.id === rowId)
  if (!row) return fail('Rangée inconnue.')
  row.count = count
  return finish(next)
}

export function removeObjectRow(plan: Plan, rowId: string): EditResult {
  if (!plan.rows?.some((r) => r.id === rowId)) return fail('Rangée inconnue.')
  const next = structuredClone(plan)
  next.rows = next.rows!.filter((r) => r.id !== rowId)
  if (next.rows.length === 0) delete next.rows
  return finish(next)
}

/** Libellé court d'une rangée : « 12 mangas ». */
export function rowLabel(row: ObjectRow): string {
  const kind = objectKind(row.kind)
  return `${row.count} ${row.count > 1 ? (kind?.plural ?? row.kind) : (kind?.label.toLowerCase() ?? row.kind)}`
}
