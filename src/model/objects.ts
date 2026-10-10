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
export const MAX_GAP = 500
export const MAX_PLACED = 500
/** Distance (mm) en dessous de laquelle un objet déplacé s'aimante contre son voisin. */
const OBJECT_MAGNET_MM = 10

export function objectKind(id: string): ObjectKind | undefined {
  return OBJECT_KINDS.find((k) => k.id === id)
}

/**
 * Identifiant d'un objet dessiné, utilisé comme identifiant de sélection :
 * `obj:row-1:3` = le 4e objet de la rangée `row-1` ; `obj:placed-2` = un objet posé seul.
 */
export function isObjectId(id: string): boolean {
  return id.startsWith('obj:')
}

function parseObjectId(id: string): { rowId: string; index: number } | { placedId: string } | null {
  const m = /^obj:(row-\d+):(\d+)$/.exec(id)
  if (m) return { rowId: m[1], index: Number(m[2]) }
  const p = /^obj:(placed-\d+)$/.exec(id)
  return p ? { placedId: p[1] } : null
}

/** L'objet désigné existe-t-il encore dans ce plan ? */
export function objectIdExists(plan: Plan, id: string): boolean {
  const parsed = parseObjectId(id)
  if (!parsed) return false
  if ('placedId' in parsed) return (plan.placedObjects ?? []).some((p) => p.id === parsed.placedId)
  const row = (plan.rows ?? []).find((r) => r.id === parsed.rowId)
  return row !== undefined && parsed.index < row.count
}

/** Un objet posé dans un étage, en mm (repère du plan). */
export interface DrawnObject {
  /** Identifiant de sélection (voir `isObjectId`). */
  id: string
  rowId: string | null
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
  objects: DrawnObject[]
  rows: RowStatus[]
  /** Places libres restantes (début, longueur), mm. */
  free: { from: number; length: number }[]
}

/** Obstacles d'un étage : cales et objets posés seuls (les rangées se rangent autour). */
function obstacles(plan: Plan, shelfBelowId: string, ignoreId?: string): { from: number; to: number }[] {
  const list = plan.wedges.filter((w) => w.shelfBelowId === shelfBelowId).map((w) => ({ from: w.x, to: w.x + w.thickness }))
  for (const p of plan.placedObjects ?? []) {
    if (p.shelfBelowId !== shelfBelowId || `obj:${p.id}` === ignoreId) continue
    const kind = objectKind(p.kind)
    if (kind) list.push({ from: p.x, to: p.x + kind.width })
  }
  return list.sort((a, b) => a.from - b.from)
}

/** Places libres d'un étage : entre les montants, hors cales et objets posés seuls. */
function stageSlots(plan: Plan, shelfBelowId: string, ignoreId?: string): { from: number; length: number }[] {
  const span = innerSpan(plan)
  const slots: { from: number; length: number }[] = []
  let cursor = span.left
  for (const edge of [...obstacles(plan, shelfBelowId, ignoreId), { from: span.right, to: span.right }]) {
    if (edge.from > cursor) slots.push({ from: cursor, length: edge.from - cursor })
    cursor = Math.max(cursor, edge.to)
  }
  return slots
}

/** Pose les objets d'un étage : les objets posés seuls à leur place, les rangées de gauche à droite autour d'eux. */
export function layoutStage(plan: Plan, stage: Stage): StageLayout {
  const slots = stageSlots(plan, stage.shelfBelowId).map((s) => ({ ...s, used: 0 }))
  const shelf = plan.shelves.find((s) => s.id === stage.shelfBelowId)
  const objects: DrawnObject[] = []
  const rows: RowStatus[] = []
  const flags = (height: number, depth: number) => ({
    tooTall: height > stage.clearHeight,
    tooDeep: shelf !== undefined && depth > shelf.depth,
  })

  for (const p of (plan.placedObjects ?? []).filter((o) => o.shelfBelowId === stage.shelfBelowId)) {
    const kind = objectKind(p.kind)
    if (!kind) continue
    objects.push({ id: `obj:${p.id}`, rowId: null, kindId: kind.id, x: p.x, y: stage.y, width: kind.width, height: kind.height, ...flags(kind.height, kind.depth) })
  }

  for (const row of (plan.rows ?? []).filter((r) => r.shelfBelowId === stage.shelfBelowId)) {
    const kind = objectKind(row.kind)
    if (!kind) continue
    const gap = row.gap ?? 0
    const f = flags(kind.height, kind.depth)
    let placed = 0
    for (let i = 0; i < row.count; i++) {
      const slot = slots.find((s) => s.length - s.used >= (s.used > 0 ? gap : 0) + kind.width)
      if (!slot) break
      const x = slot.from + slot.used + (slot.used > 0 ? gap : 0)
      objects.push({ id: `obj:${row.id}:${i}`, rowId: row.id, kindId: kind.id, x, y: stage.y, width: kind.width, height: kind.height, ...f })
      slot.used = x + kind.width - slot.from
      placed++
    }
    rows.push({ rowId: row.id, placed, overflow: row.count - placed, tooTall: f.tooTall, tooDeep: f.tooDeep })
  }

  return { objects, rows, free: slots.map((s) => ({ from: s.from + s.used, length: s.length - s.used })) }
}

/** Combien d'objets de ce type tiennent encore (en largeur) dans l'espace libre d'un étage. */
export function remainingCapacity(plan: Plan, shelfBelowId: string, kindId: string, gap = 0): number {
  const stage = getStages(plan).find((s) => s.shelfBelowId === shelfBelowId)
  const kind = objectKind(kindId)
  if (!stage || !kind) return 0
  return layoutStage(plan, stage).free.reduce((sum, f) => sum + Math.max(0, Math.floor((f.length + gap) / (kind.width + gap))), 0)
}

/** Combien d'objets de ce type tiendraient dans l'étage vide (rangées et objets existants ignorés). */
export function stageCapacity(plan: Plan, shelfBelowId: string, kindId: string): number {
  return remainingCapacity({ ...plan, rows: [], placedObjects: [] }, shelfBelowId, kindId)
}

function nextRowId(plan: Plan): string {
  const numbers = (plan.rows ?? []).map((r) => Number(r.id.slice(4))).filter(Number.isInteger)
  return `row-${Math.max(0, ...numbers) + 1}`
}

function nextPlacedId(plan: Plan): string {
  const numbers = (plan.placedObjects ?? []).map((p) => Number(p.id.slice(7))).filter(Number.isInteger)
  return `placed-${Math.max(0, ...numbers) + 1}`
}

export type AddRowResult = { ok: true; plan: Plan; id: string } | { ok: false; error: string }

/** Ajoute une rangée d'objets dans un étage. `count` absent = remplir la place restante. */
export function addObjectRow(plan: Plan, shelfBelowId: string, kindId: string, count?: number, gap = 0): AddRowResult {
  if (!getStages(plan).some((s) => s.shelfBelowId === shelfBelowId)) return fail('Étage inconnu.') as AddRowResult
  if (!objectKind(kindId)) return fail('Objet inconnu.') as AddRowResult
  if (!Number.isInteger(gap) || gap < 0 || gap > MAX_GAP) return fail(`L’espace entre objets va de 0 à ${MAX_GAP} mm.`) as AddRowResult
  const n = count ?? remainingCapacity(plan, shelfBelowId, kindId, gap)
  if (!Number.isInteger(n) || n < 1) return fail('Il n’y a pas de place pour cet objet dans cet étage.') as AddRowResult
  if (n > MAX_ROW_COUNT) return fail(`Pas plus de ${MAX_ROW_COUNT} objets par rangée.`) as AddRowResult
  const next = structuredClone(plan)
  const id = nextRowId(plan)
  next.rows = [...(next.rows ?? []), { id, shelfBelowId, kind: kindId, count: n, ...(gap > 0 ? { gap } : {}) }]
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

/** Espace entre les objets d'une rangée (mm) : 0 = collés. */
export function setObjectRowGap(plan: Plan, rowId: string, gap: number): EditResult {
  if (!Number.isInteger(gap) || gap < 0 || gap > MAX_GAP) return fail(`L’espace entre objets va de 0 à ${MAX_GAP} mm.`)
  const next = structuredClone(plan)
  const row = next.rows?.find((r) => r.id === rowId)
  if (!row) return fail('Rangée inconnue.')
  if (gap === 0) delete row.gap
  else row.gap = gap
  return finish(next)
}

export function removeObjectRow(plan: Plan, rowId: string): EditResult {
  if (!plan.rows?.some((r) => r.id === rowId)) return fail('Rangée inconnue.')
  const next = structuredClone(plan)
  next.rows = next.rows!.filter((r) => r.id !== rowId)
  if (next.rows.length === 0) delete next.rows
  return finish(next)
}

/** Retire un objet de la copie du plan (rangée : un objet de moins, les suivants se rapprochent). */
function takeObject(next: Plan, id: string): { kind: string } | null {
  const parsed = parseObjectId(id)
  if (!parsed) return null
  if ('placedId' in parsed) {
    const found = next.placedObjects?.find((p) => p.id === parsed.placedId)
    if (!found) return null
    next.placedObjects = next.placedObjects!.filter((p) => p.id !== parsed.placedId)
    if (next.placedObjects.length === 0) delete next.placedObjects
    return { kind: found.kind }
  }
  const row = next.rows?.find((r) => r.id === parsed.rowId)
  if (!row || parsed.index >= row.count) return null
  row.count -= 1
  if (row.count === 0) {
    next.rows = next.rows!.filter((r) => r.id !== row.id)
    if (next.rows.length === 0) delete next.rows
  }
  return { kind: row.kind }
}

/** Supprime un objet. */
export function removeObject(plan: Plan, id: string): EditResult {
  const next = structuredClone(plan)
  if (!takeObject(next, id)) return fail('Objet inconnu.')
  return finish(next)
}

export type MoveObjectResult = { ok: true; plan: Plan; id: string } | { ok: false; error: string }

/**
 * Pose l'objet `id` dans l'étage au-dessus de `shelfBelowId`, le plus près possible de `rawX` (bord gauche).
 * Un objet de rangée est détaché de sa rangée (qui se resserre). Il reste dans les places libres de l'étage
 * (entre les montants, hors cales et autres objets posés seuls) ; la position est arrondie au pas `step`, puis
 * aimantée contre le voisin le plus proche à moins de 10 mm. `step` null = sans arrondi ni aimantation.
 */
export function moveObject(plan: Plan, id: string, shelfBelowId: string, rawX: number, step: number | null): MoveObjectResult {
  if (!objectIdExists(plan, id)) return fail('Objet inconnu.') as MoveObjectResult
  if (!getStages(plan).some((s) => s.shelfBelowId === shelfBelowId)) return fail('Étage inconnu.') as MoveObjectResult
  const next = structuredClone(plan)
  const taken = takeObject(next, id)!
  const kind = objectKind(taken.kind)!
  const placed = parseObjectId(id)
  const slots = stageSlots(next, shelfBelowId).filter((s) => s.length >= kind.width)
  if (slots.length === 0) return fail('Il n’y a pas assez de place pour cet objet dans cet étage.') as MoveObjectResult

  const clamp = (x: number) => {
    let best = slots[0].from
    let bestDistance = Infinity
    for (const s of slots) {
      const c = Math.min(Math.max(x, s.from), s.from + s.length - kind.width)
      if (Math.abs(c - x) < bestDistance) {
        best = c
        bestDistance = Math.abs(c - x)
      }
    }
    return best
  }
  let x = clamp(step === null || step <= 1 ? Math.round(rawX) : Math.round(rawX / step) * step)
  if (step !== null) {
    const magnets = slots.flatMap((s) => [s.from, s.from + s.length - kind.width])
    const near = magnets.reduce((a, b) => (Math.abs(b - rawX) < Math.abs(a - rawX) ? b : a))
    if (Math.abs(near - rawX) <= OBJECT_MAGNET_MM) x = near
  }

  const newId = placed && 'placedId' in placed ? placed.placedId : nextPlacedId(next)
  if ((next.placedObjects ?? []).length >= MAX_PLACED) return fail(`Pas plus de ${MAX_PLACED} objets posés seuls.`) as MoveObjectResult
  next.placedObjects = [...(next.placedObjects ?? []), { id: newId, shelfBelowId, kind: kind.id, x }]
  const result = finish(next)
  return result.ok ? { ok: true, plan: result.plan, id: `obj:${newId}` } : result
}

/** Libellé court d'une rangée : « 12 mangas ». */
export function rowLabel(row: ObjectRow): string {
  const kind = objectKind(row.kind)
  return `${row.count} ${row.count > 1 ? (kind?.plural ?? row.kind) : (kind?.label.toLowerCase() ?? row.kind)}`
}

/** Libellé d'un objet choisi : « Manga (étage 1) », ou null s'il n'existe plus. */
export function objectLabel(plan: Plan, id: string): string | null {
  const parsed = parseObjectId(id)
  if (!parsed || !objectIdExists(plan, id)) return null
  const stageIds = getStages(plan).map((s) => s.shelfBelowId)
  const item =
    'placedId' in parsed
      ? plan.placedObjects!.find((p) => p.id === parsed.placedId)!
      : plan.rows!.find((r) => r.id === parsed.rowId)!
  const kind = objectKind(item.kind)
  return `${kind?.label ?? item.kind} (étage ${stageIds.indexOf(item.shelfBelowId) + 1})`
}
