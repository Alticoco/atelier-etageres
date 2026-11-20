import { isColor } from './colors'
import { fail, finish, type EditResult } from './edit'
import { innerSpan } from './geometry'
import { getStages } from './pieces'
import { setStageHeight } from './tools'
import type { CustomObjectKind, ObjectOrientation, ObjectRow, Plan, Stage } from './types'

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
  /** Coins arrondis (bocaux). Toujours égal à `shape === 'cylinder'`, gardé pour les appels existants. */
  round?: boolean
  /** Forme dessinée : absente = boîte. */
  shape?: 'box' | 'cylinder'
  /** Couleur `#rrggbb` (objets sur mesure seulement). */
  color?: string
  /** Objet créé par l'utilisateur (voir `Plan.customKinds`). */
  custom?: boolean
}

export const OBJECT_KINDS: ObjectKind[] = [
  { id: 'manga', label: 'Manga', plural: 'mangas', width: 14, height: 175, depth: 115 },
  { id: 'pocket', label: 'Livre de poche', plural: 'livres de poche', width: 25, height: 177, depth: 108 },
  { id: 'novel', label: 'Livre grand format', plural: 'livres grand format', width: 30, height: 215, depth: 140 },
  { id: 'album', label: 'Grand livre / BD', plural: 'grands livres', width: 25, height: 320, depth: 240 },
  { id: 'jar', label: 'Bocal d’épices', plural: 'bocaux d’épices', width: 55, height: 100, depth: 55, round: true, shape: 'cylinder' },
]

export const OBJECT_ORIENTATIONS: ObjectOrientation[] = ['standing', 'lying', 'facing']

export const MAX_ROW_COUNT = 500
export const MAX_GAP = 500
export const MAX_PLACED = 500
/** Objets par pile, au plus. */
export const MAX_STACK = 50
/** Objets sur mesure par plan, au plus. */
export const MAX_CUSTOM_KINDS = 100
export const MAX_CUSTOM_LABEL = 60
/** Plus grande dimension d'un objet sur mesure (mm). */
export const MAX_CUSTOM_MM = 3000
/** Marge au-dessus des objets (mm) pour `fitStageToObjects`, au plus. */
export const MAX_FIT_MARGIN = 1000
/** Distance (mm) en dessous de laquelle un objet déplacé s'aimante contre son voisin. */
const OBJECT_MAGNET_MM = 10

/** Type d'objet du catalogue (sans les objets sur mesure : pour un plan, utiliser `resolveKind`). */
export function objectKind(id: string): ObjectKind | undefined {
  return OBJECT_KINDS.find((k) => k.id === id)
}

function fromCustom(c: CustomObjectKind): ObjectKind {
  return {
    id: c.id,
    label: c.label,
    plural: pluralLabel(c.label),
    width: c.width,
    height: c.height,
    depth: c.depth,
    round: c.shape === 'cylinder',
    shape: c.shape,
    ...(c.color ? { color: c.color } : {}),
    custom: true,
  }
}

/** Type d'objet d'un plan : un objet sur mesure du plan, sinon un objet du catalogue. */
/**
 * Pluriel approché d'un nom d'objet créé par l'utilisateur : on accorde le premier mot (« Boîte à thé » → « boîtes à
 * thé », « Bocal » → « bocaux »). Les mots finissant par s, x ou z ne changent pas. Suffisant pour un libellé.
 */
export function pluralLabel(label: string): string {
  const lower = label.toLowerCase()
  const m = /^(\S+)(.*)$/su.exec(lower)
  if (!m) return lower
  const [, first, rest] = m
  if (/[sxz]$/u.test(first)) return lower
  if (/(al)$/u.test(first) && first.length > 3) return `${first.slice(0, -2)}aux${rest}`
  if (/(eau|au|eu)$/u.test(first)) return `${first}x${rest}`
  return `${first}s${rest}`
}

export function resolveKind(plan: Plan, id: string): ObjectKind | undefined {
  const custom = plan.customKinds?.find((k) => k.id === id)
  return custom ? fromCustom(custom) : objectKind(id)
}

/** Forme d'un type d'objet (les anciens types n'ont que `round`). */
export function kindShape(kind: ObjectKind): 'box' | 'cylinder' {
  return kind.shape ?? (kind.round ? 'cylinder' : 'box')
}

/** Dimensions d'un objet dans le sens choisi (voir `ObjectOrientation`). */
export function orientedSize(
  kind: Pick<ObjectKind, 'width' | 'height' | 'depth'>,
  orientation: ObjectOrientation = 'standing',
): { width: number; height: number; depth: number } {
  if (orientation === 'lying') return { width: kind.height, height: kind.width, depth: kind.depth }
  if (orientation === 'facing') return { width: kind.depth, height: kind.height, depth: kind.width }
  return { width: kind.width, height: kind.height, depth: kind.depth }
}

function isOrientation(value: unknown): value is ObjectOrientation {
  return OBJECT_ORIENTATIONS.includes(value as ObjectOrientation)
}

function validStack(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= MAX_STACK
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
  /** Dessous de l'objet : le dessus de la tablette, plus `level` hauteurs d'objet s'il est empilé. */
  y: number
  /** Dimensions dans le sens de l'objet (voir `orientedSize`). */
  width: number
  height: number
  depth: number
  shape: 'box' | 'cylinder'
  orientation: ObjectOrientation
  /** Couleur de l'objet sur mesure, s'il en a une. */
  color?: string
  /** Rang dans la pile : 0 = posé sur la tablette. */
  level: number
  /** Plus haut que l'étage (le dessus de l'objet, dans sa pile), ou plus profond que la tablette. */
  tooTall: boolean
  tooDeep: boolean
}

export interface RowStatus {
  rowId: string
  placed: number
  /** Objets qui n'ont plus de place dans l'étage. */
  overflow: number
  /** Une pile pleine (`min(stack, count)` objets) dépasse la hauteur libre. */
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
    const kind = resolveKind(plan, p.kind)
    if (kind) list.push({ from: p.x, to: p.x + orientedSize(kind, p.orientation).width })
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

/**
 * Pose les objets d'un étage : les objets posés seuls à leur place, les rangées de gauche à droite autour d'eux.
 * Une rangée empilée (`stack` N) pose des piles de N objets côte à côte, la dernière pouvant être incomplète ; chaque
 * objet de la pile est un `DrawnObject` distinct, de plus en plus haut (`level`). Une pile posée seule (objet posé
 * avec `stack` N) donne N objets qui partagent l'identifiant `obj:placed-N` : la pile se choisit et se déplace d'un bloc.
 */
export function layoutStage(plan: Plan, stage: Stage): StageLayout {
  const slots = stageSlots(plan, stage.shelfBelowId).map((s) => ({ ...s, used: 0 }))
  const shelf = plan.shelves.find((s) => s.id === stage.shelfBelowId)
  const objects: DrawnObject[] = []
  const rows: RowStatus[] = []
  const tooDeep = (depth: number) => shelf !== undefined && depth > shelf.depth
  const draw = (id: string, rowId: string | null, kind: ObjectKind, orientation: ObjectOrientation, x: number, level: number) => {
    const size = orientedSize(kind, orientation)
    objects.push({
      id,
      rowId,
      kindId: kind.id,
      x,
      y: stage.y + level * size.height,
      ...size,
      shape: kindShape(kind),
      orientation,
      ...(kind.color ? { color: kind.color } : {}),
      level,
      tooTall: (level + 1) * size.height > stage.clearHeight,
      tooDeep: tooDeep(size.depth),
    })
  }

  for (const p of (plan.placedObjects ?? []).filter((o) => o.shelfBelowId === stage.shelfBelowId)) {
    const kind = resolveKind(plan, p.kind)
    if (!kind) continue
    for (let level = 0; level < (p.stack ?? 1); level++) draw(`obj:${p.id}`, null, kind, p.orientation ?? 'standing', p.x, level)
  }

  for (const row of (plan.rows ?? []).filter((r) => r.shelfBelowId === stage.shelfBelowId)) {
    const kind = resolveKind(plan, row.kind)
    if (!kind) continue
    const orientation = row.orientation ?? 'standing'
    const size = orientedSize(kind, orientation)
    const gap = row.gap ?? 0
    const stack = row.stack ?? 1
    let placed = 0
    while (placed < row.count) {
      const slot = slots.find((s) => s.length - s.used >= (s.used > 0 ? gap : 0) + size.width)
      if (!slot) break
      const x = slot.from + slot.used + (slot.used > 0 ? gap : 0)
      const inPile = Math.min(stack, row.count - placed)
      for (let level = 0; level < inPile; level++) draw(`obj:${row.id}:${placed + level}`, row.id, kind, orientation, x, level)
      slot.used = x + size.width - slot.from
      placed += inPile
    }
    rows.push({
      rowId: row.id,
      placed,
      overflow: row.count - placed,
      tooTall: Math.min(stack, row.count) * size.height > stage.clearHeight,
      tooDeep: tooDeep(size.depth),
    })
  }

  return { objects, rows, free: slots.map((s) => ({ from: s.from + s.used, length: s.length - s.used })) }
}

/**
 * Combien d'objets de ce type tiennent encore (en largeur) dans l'espace libre d'un étage, dans le sens choisi et
 * empilés par `stack` : piles qui tiennent × `stack`. La hauteur de l'étage n'est pas prise en compte.
 */
export function remainingCapacity(
  plan: Plan,
  shelfBelowId: string,
  kindId: string,
  gap = 0,
  orientation: ObjectOrientation = 'standing',
  stack = 1,
): number {
  const stage = getStages(plan).find((s) => s.shelfBelowId === shelfBelowId)
  const kind = resolveKind(plan, kindId)
  if (!stage || !kind || !validStack(stack)) return 0
  const width = orientedSize(kind, orientation).width
  const piles = layoutStage(plan, stage).free.reduce((sum, f) => sum + Math.max(0, Math.floor((f.length + gap) / (width + gap))), 0)
  return piles * stack
}

/** Combien d'objets de ce type tiendraient dans l'étage vide (rangées et objets existants ignorés). */
export function stageCapacity(plan: Plan, shelfBelowId: string, kindId: string, orientation: ObjectOrientation = 'standing', stack = 1): number {
  return remainingCapacity({ ...plan, rows: [], placedObjects: [] }, shelfBelowId, kindId, 0, orientation, stack)
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

/** Sens et empilement d'une rangée (ou d'un objet posé seul). */
export interface ObjectRowOptions {
  orientation?: ObjectOrientation
  stack?: number
}

const stackError = `Une pile compte de 1 à ${MAX_STACK} objets.`

/** Champs facultatifs à écrire : rien pour les valeurs par défaut (debout, sans pile). */
function layoutFields(orientation: ObjectOrientation, stack: number): ObjectRowOptions {
  return { ...(orientation !== 'standing' ? { orientation } : {}), ...(stack > 1 ? { stack } : {}) }
}

/**
 * Ajoute une rangée d'objets dans un étage. `count` absent = remplir la place restante (piles comprises).
 * `options` : sens des objets et nombre d'objets par pile.
 */
export function addObjectRow(
  plan: Plan,
  shelfBelowId: string,
  kindId: string,
  count?: number,
  gap = 0,
  options: ObjectRowOptions = {},
): AddRowResult {
  const { orientation = 'standing', stack = 1 } = options
  if (!getStages(plan).some((s) => s.shelfBelowId === shelfBelowId)) return fail('Étage inconnu.') as AddRowResult
  if (!resolveKind(plan, kindId)) return fail('Objet inconnu.') as AddRowResult
  if (!Number.isInteger(gap) || gap < 0 || gap > MAX_GAP) return fail(`L’espace entre objets va de 0 à ${MAX_GAP} mm.`) as AddRowResult
  if (!isOrientation(orientation)) return fail('Sens d’objet inconnu.') as AddRowResult
  if (!validStack(stack)) return fail(stackError) as AddRowResult
  const n = count ?? remainingCapacity(plan, shelfBelowId, kindId, gap, orientation, stack)
  if (!Number.isInteger(n) || n < 1) return fail('Il n’y a pas de place pour cet objet dans cet étage.') as AddRowResult
  if (n > MAX_ROW_COUNT) return fail(`Pas plus de ${MAX_ROW_COUNT} objets par rangée.`) as AddRowResult
  const next = structuredClone(plan)
  const id = nextRowId(plan)
  next.rows = [
    ...(next.rows ?? []),
    { id, shelfBelowId, kind: kindId, count: n, ...(gap > 0 ? { gap } : {}), ...layoutFields(orientation, stack) },
  ]
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

/** Sens des objets d'une rangée. */
export function setObjectRowOrientation(plan: Plan, rowId: string, orientation: ObjectOrientation): EditResult {
  if (!isOrientation(orientation)) return fail('Sens d’objet inconnu.')
  const next = structuredClone(plan)
  const row = next.rows?.find((r) => r.id === rowId)
  if (!row) return fail('Rangée inconnue.')
  if (orientation === 'standing') delete row.orientation
  else row.orientation = orientation
  return finish(next)
}

/** Objets par pile dans une rangée (1 = pas d'empilement). Le nombre total d'objets ne change pas. */
export function setObjectRowStack(plan: Plan, rowId: string, stack: number): EditResult {
  if (!validStack(stack)) return fail(stackError)
  const next = structuredClone(plan)
  const row = next.rows?.find((r) => r.id === rowId)
  if (!row) return fail('Rangée inconnue.')
  if (stack === 1) delete row.stack
  else row.stack = stack
  return finish(next)
}

export function removeObjectRow(plan: Plan, rowId: string): EditResult {
  if (!plan.rows?.some((r) => r.id === rowId)) return fail('Rangée inconnue.')
  const next = structuredClone(plan)
  next.rows = next.rows!.filter((r) => r.id !== rowId)
  if (next.rows.length === 0) delete next.rows
  return finish(next)
}

/**
 * Retire un objet de la copie du plan (rangée : un objet de moins, les suivants se rapprochent). Renvoie de quoi le
 * reposer : un objet pris dans une rangée garde son sens mais devient un objet seul (pile de 1) ; un objet posé seul
 * garde son sens et sa pile.
 */
function takeObject(next: Plan, id: string): { kind: string; orientation: ObjectOrientation; stack: number } | null {
  const parsed = parseObjectId(id)
  if (!parsed) return null
  if ('placedId' in parsed) {
    const found = next.placedObjects?.find((p) => p.id === parsed.placedId)
    if (!found) return null
    next.placedObjects = next.placedObjects!.filter((p) => p.id !== parsed.placedId)
    if (next.placedObjects.length === 0) delete next.placedObjects
    return { kind: found.kind, orientation: found.orientation ?? 'standing', stack: found.stack ?? 1 }
  }
  const row = next.rows?.find((r) => r.id === parsed.rowId)
  if (!row || parsed.index >= row.count) return null
  row.count -= 1
  if (row.count === 0) {
    next.rows = next.rows!.filter((r) => r.id !== row.id)
    if (next.rows.length === 0) delete next.rows
  }
  return { kind: row.kind, orientation: row.orientation ?? 'standing', stack: 1 }
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
 * Un objet de rangée est détaché de sa rangée (qui se resserre) : il garde le sens de la rangée, seul (sans pile).
 * Un objet posé seul garde son sens et sa pile. Il reste dans les places libres de l'étage (entre les montants, hors
 * cales et autres objets posés seuls) ; la position est arrondie au pas `step`, puis aimantée contre le voisin le plus
 * proche à moins de 10 mm. `step` null = sans arrondi ni aimantation.
 */
export function moveObject(plan: Plan, id: string, shelfBelowId: string, rawX: number, step: number | null): MoveObjectResult {
  if (!objectIdExists(plan, id)) return fail('Objet inconnu.') as MoveObjectResult
  if (!getStages(plan).some((s) => s.shelfBelowId === shelfBelowId)) return fail('Étage inconnu.') as MoveObjectResult
  const next = structuredClone(plan)
  const taken = takeObject(next, id)!
  const kind = resolveKind(next, taken.kind)
  if (!kind) return fail('Objet inconnu.') as MoveObjectResult
  const width = orientedSize(kind, taken.orientation).width
  const placed = parseObjectId(id)
  const slots = stageSlots(next, shelfBelowId).filter((s) => s.length >= width)
  if (slots.length === 0) return fail('Il n’y a pas assez de place pour cet objet dans cet étage.') as MoveObjectResult

  const clamp = (x: number) => {
    let best = slots[0].from
    let bestDistance = Infinity
    for (const s of slots) {
      const c = Math.min(Math.max(x, s.from), s.from + s.length - width)
      if (Math.abs(c - x) < bestDistance) {
        best = c
        bestDistance = Math.abs(c - x)
      }
    }
    return best
  }
  let x = clamp(step === null || step <= 1 ? Math.round(rawX) : Math.round(rawX / step) * step)
  if (step !== null) {
    const magnets = slots.flatMap((s) => [s.from, s.from + s.length - width])
    const near = magnets.reduce((a, b) => (Math.abs(b - rawX) < Math.abs(a - rawX) ? b : a))
    if (Math.abs(near - rawX) <= OBJECT_MAGNET_MM) x = near
  }

  const newId = placed && 'placedId' in placed ? placed.placedId : nextPlacedId(next)
  if ((next.placedObjects ?? []).length >= MAX_PLACED) return fail(`Pas plus de ${MAX_PLACED} objets posés seuls.`) as MoveObjectResult
  next.placedObjects = [...(next.placedObjects ?? []), { id: newId, shelfBelowId, kind: kind.id, x, ...layoutFields(taken.orientation, taken.stack) }]
  const result = finish(next)
  return result.ok ? { ok: true, plan: result.plan, id: `obj:${newId}` } : result
}

/** Libellé court d'une rangée : « 12 mangas ». Avec le plan, un objet sur mesure est nommé par son nom. */
export function rowLabel(row: ObjectRow, plan?: Plan): string {
  const kind = plan ? resolveKind(plan, row.kind) : objectKind(row.kind)
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
  const kind = resolveKind(plan, item.kind)
  return `${kind?.label ?? item.kind} (étage ${stageIds.indexOf(item.shelfBelowId) + 1})`
}

// --- Objets sur mesure ---

/** Ce qu'on donne pour créer un objet sur mesure (forme absente = boîte, couleur absente = couleur par défaut). */
export interface CustomKindInput {
  label: string
  width: number
  height: number
  depth: number
  shape?: 'box' | 'cylinder'
  color?: string
}

/** Modification d'un objet sur mesure : champs absents inchangés, `color: null` = retirer la couleur. */
export type CustomKindPatch = Partial<Omit<CustomObjectKind, 'id' | 'color'>> & { color?: string | null }

export type AddCustomKindResult = { ok: true; plan: Plan; id: string } | { ok: false; error: string }

function nextCustomKindId(plan: Plan): string {
  const numbers = (plan.customKinds ?? []).map((k) => Number(k.id.slice(7))).filter(Number.isInteger)
  return `custom-${Math.max(0, ...numbers) + 1}`
}

/** Vérifie un objet sur mesure complet : le message d'erreur, ou null s'il est valable. */
function customKindProblem(k: Omit<CustomObjectKind, 'id'>): string | null {
  if (typeof k.label !== 'string' || k.label.length < 1 || k.label.length > MAX_CUSTOM_LABEL) {
    return `Le nom de l’objet compte de 1 à ${MAX_CUSTOM_LABEL} caractères.`
  }
  const sizes: [number, string][] = [[k.width, 'largeur'], [k.height, 'hauteur'], [k.depth, 'profondeur']]
  for (const [value, name] of sizes) {
    if (!Number.isInteger(value) || value < 1 || value > MAX_CUSTOM_MM) return `La ${name} de l’objet doit être un nombre entier de 1 à ${MAX_CUSTOM_MM} mm.`
  }
  if (k.shape !== 'box' && k.shape !== 'cylinder') return 'Forme d’objet inconnue.'
  if (k.color !== undefined && !isColor(k.color)) return 'Couleur invalide.'
  return null
}

const cleanLabel = (label: unknown) => (typeof label === 'string' ? label.trim() : '')
const cleanColor = (color: string) => (typeof color === 'string' ? color.toLowerCase() : color)

/** Crée un objet sur mesure (nom nettoyé des espaces au début et à la fin, couleur en minuscules). */
export function addCustomKind(plan: Plan, data: CustomKindInput): AddCustomKindResult {
  if ((plan.customKinds ?? []).length >= MAX_CUSTOM_KINDS) return fail(`Pas plus de ${MAX_CUSTOM_KINDS} objets sur mesure.`) as AddCustomKindResult
  const kind: Omit<CustomObjectKind, 'id'> = {
    label: cleanLabel(data.label),
    width: data.width,
    height: data.height,
    depth: data.depth,
    shape: data.shape ?? 'box',
    ...(data.color !== undefined ? { color: cleanColor(data.color) } : {}),
  }
  const problem = customKindProblem(kind)
  if (problem) return fail(problem) as AddCustomKindResult
  const next = structuredClone(plan)
  const id = nextCustomKindId(plan)
  next.customKinds = [...(next.customKinds ?? []), { id, ...kind }]
  const result = finish(next)
  return result.ok ? { ok: true, plan: result.plan, id } : result
}

/** Modifie un objet sur mesure ; les rangées et objets posés qui l'utilisent suivent. */
export function updateCustomKind(plan: Plan, id: string, patch: CustomKindPatch): EditResult {
  const current = plan.customKinds?.find((k) => k.id === id)
  if (!current) return fail('Objet sur mesure inconnu.')
  const updated: CustomObjectKind = { ...current }
  if (patch.label !== undefined) updated.label = cleanLabel(patch.label)
  if (patch.width !== undefined) updated.width = patch.width
  if (patch.height !== undefined) updated.height = patch.height
  if (patch.depth !== undefined) updated.depth = patch.depth
  if (patch.shape !== undefined) updated.shape = patch.shape
  if (patch.color === null) delete updated.color
  else if (patch.color !== undefined) updated.color = cleanColor(patch.color)
  const problem = customKindProblem(updated)
  if (problem) return fail(problem)
  const next = structuredClone(plan)
  next.customKinds = next.customKinds!.map((k) => (k.id === id ? updated : k))
  return finish(next)
}

/** Supprime un objet sur mesure, ainsi que les rangées et objets posés qui l'utilisent. */
export function removeCustomKind(plan: Plan, id: string): EditResult {
  if (!plan.customKinds?.some((k) => k.id === id)) return fail('Objet sur mesure inconnu.')
  const next = structuredClone(plan)
  next.customKinds = next.customKinds!.filter((k) => k.id !== id)
  if (next.customKinds.length === 0) delete next.customKinds
  if (next.rows) {
    next.rows = next.rows.filter((r) => r.kind !== id)
    if (next.rows.length === 0) delete next.rows
  }
  if (next.placedObjects) {
    next.placedObjects = next.placedObjects.filter((p) => p.kind !== id)
    if (next.placedObjects.length === 0) delete next.placedObjects
  }
  return finish(next)
}

/** Piles d'objets d'un étage (rangées et objets posés seuls), dans leur sens, qu'elles aient de la place ou non. */
function stagePiles(plan: Plan, shelfBelowId: string): { height: number; depth: number }[] {
  const piles: { height: number; depth: number }[] = []
  for (const row of plan.rows ?? []) {
    const kind = row.shelfBelowId === shelfBelowId ? resolveKind(plan, row.kind) : undefined
    if (!kind) continue
    const size = orientedSize(kind, row.orientation)
    piles.push({ height: Math.min(row.stack ?? 1, row.count) * size.height, depth: size.depth })
  }
  for (const p of plan.placedObjects ?? []) {
    const kind = p.shelfBelowId === shelfBelowId ? resolveKind(plan, p.kind) : undefined
    if (!kind) continue
    const size = orientedSize(kind, p.orientation)
    piles.push({ height: (p.stack ?? 1) * size.height, depth: size.depth })
  }
  return piles
}

/**
 * Ajuste la hauteur libre de l'étage au-dessus de `shelfBelowId` à ses objets : la plus haute pile (rangées et objets
 * posés seuls, qu'ils aient de la place en largeur ou non) plus `margin` mm. Mêmes règles que `setStageHeight`.
 */
export function fitStageToObjects(plan: Plan, shelfBelowId: string, margin: number): EditResult {
  if (!Number.isInteger(margin) || margin < 0 || margin > MAX_FIT_MARGIN) return fail(`La marge va de 0 à ${MAX_FIT_MARGIN} mm.`)
  if (!getStages(plan).some((s) => s.shelfBelowId === shelfBelowId)) return fail('Étage inconnu.')
  const piles = stagePiles(plan, shelfBelowId)
  if (piles.length === 0) return fail('Cet étage n’a aucun objet : impossible d’ajuster sa hauteur à ses objets.')
  return setStageHeight(plan, shelfBelowId, Math.max(...piles.map((p) => p.height)) + margin)
}

/** Profondeur nécessaire aux objets d'un étage (la plus grande, dans leur sens), ou 0 s'il n'en a pas. */
export function objectsDepthNeeded(plan: Plan, shelfBelowId: string): number {
  return Math.max(0, ...stagePiles(plan, shelfBelowId).map((p) => p.depth))
}
