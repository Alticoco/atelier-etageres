import { checkPlan } from './edit'
import { MAX_GAP, MAX_PLACED, MAX_ROW_COUNT, objectKind } from './objects'
import type { ObjectRow, PlacedObject, Plan, Support } from './types'

/**
 * Format de fichier d'un plan (`.etagere.json`) : { format, version, plan }.
 * Le même format sert à la bibliothèque du navigateur et, plus tard, au plan embarqué dans le PDF.
 */
export const FILE_FORMAT = 'atelier-etageres'
export const FILE_VERSION = 1

export type ParseResult = { ok: true; plan: Plan } | { ok: false; error: string }

// Garde-fous : un fichier importé vient de l'extérieur, on refuse ce qui est absurde.
const MAX_NAME = 120
const MAX_ID = 64
const MAX_SHELVES = 200
const MAX_WEDGES = 1000
const MAX_MM = 100_000
const RESERVED_IDS = ['upright-left', 'upright-right']

class ParseError extends Error {}

function fail(message: string): never {
  throw new ParseError(message)
}

function record(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(`${where} : un objet est attendu.`)
  return value as Record<string, unknown>
}

function int(obj: Record<string, unknown>, key: string, where: string, min: number): number {
  const value = obj[key]
  if (typeof value !== 'number' || !Number.isInteger(value)) fail(`${where} : « ${key} » doit être un nombre entier de mm.`)
  if (value < min || value > MAX_MM) fail(`${where} : « ${key} » est hors limites (${min} à ${MAX_MM} mm).`)
  return value
}

function bool(obj: Record<string, unknown>, key: string, where: string): boolean {
  const value = obj[key]
  if (typeof value !== 'boolean') fail(`${where} : « ${key} » doit valoir vrai ou faux.`)
  return value
}

/** Entier facultatif : absent = `fallback` (fichiers écrits avant l'ajout du modèle sans cadre). */
function optionalInt(obj: Record<string, unknown>, key: string, where: string, min: number, fallback: number): number {
  return obj[key] === undefined ? fallback : int(obj, key, where, min)
}

/** Booléen facultatif : absent = `fallback` (pour les fichiers écrits avant l'ajout de l'option). */
function optionalBool(obj: Record<string, unknown>, key: string, where: string, fallback: boolean): boolean {
  return obj[key] === undefined ? fallback : bool(obj, key, where)
}

function text(obj: Record<string, unknown>, key: string, where: string, max: number): string {
  const value = obj[key]
  if (typeof value !== 'string') fail(`${where} : « ${key} » doit être un texte.`)
  if (value.length > max) fail(`${where} : « ${key} » est trop long (${max} caractères au plus).`)
  return value
}

function list(obj: Record<string, unknown>, key: string, where: string, max: number): unknown[] {
  const value = obj[key]
  if (!Array.isArray(value)) fail(`${where} : « ${key} » doit être une liste.`)
  if (value.length > max) fail(`${where} : « ${key} » contient trop d'éléments (${max} au plus).`)
  return value
}

function upright(value: unknown, where: string) {
  const obj = record(value, where)
  return {
    thickness: int(obj, 'thickness', where, 1),
    depth: int(obj, 'depth', where, 1),
    cornerRadius: optionalInt(obj, 'cornerRadius', where, 0, 0),
    edgeRadius: optionalInt(obj, 'edgeRadius', where, 0, 0),
  }
}

function readPlan(value: unknown): Plan {
  const root = record(value, 'Plan')
  const options = record(root.options, 'Options')

  const framePlacement = options.framePlacement
  if (framePlacement !== 'between' && framePlacement !== 'onTop') {
    fail('Options : « framePlacement » doit valoir « between » ou « onTop ».')
  }

  const seen = new Set<string>(RESERVED_IDS)
  const uniqueId = (id: string, where: string) => {
    if (id === '' || seen.has(id)) fail(`${where} : l'identifiant « ${id} » est vide ou en double.`)
    seen.add(id)
    return id
  }

  const shelves = list(root, 'shelves', 'Plan', MAX_SHELVES).map((item, i) => {
    const where = `Tablette ${i + 1}`
    const obj = record(item, where)
    return {
      id: uniqueId(text(obj, 'id', where, MAX_ID), where),
      y: int(obj, 'y', where, 0),
      thickness: int(obj, 'thickness', where, 1),
      depth: int(obj, 'depth', where, 1),
      overhangLeft: optionalInt(obj, 'overhangLeft', where, 0, 0),
      overhangRight: optionalInt(obj, 'overhangRight', where, 0, 0),
      verticalLeft: optionalBool(obj, 'verticalLeft', where, true),
      verticalRight: optionalBool(obj, 'verticalRight', where, true),
      cornerRadius: optionalInt(obj, 'cornerRadius', where, 0, 0),
      edgeRadius: optionalInt(obj, 'edgeRadius', where, 0, 0),
    }
  })

  const wedges = list(root, 'wedges', 'Plan', MAX_WEDGES).map((item, i) => {
    const where = `Cale ${i + 1}`
    const obj = record(item, where)
    return {
      id: uniqueId(text(obj, 'id', where, MAX_ID), where),
      shelfBelowId: text(obj, 'shelfBelowId', where, MAX_ID),
      x: int(obj, 'x', where, 0),
      thickness: int(obj, 'thickness', where, 1),
      depth: int(obj, 'depth', where, 1),
      cornerRadius: optionalInt(obj, 'cornerRadius', where, 0, 0),
      edgeRadius: optionalInt(obj, 'edgeRadius', where, 0, 0),
    }
  })

  const rows: ObjectRow[] = root.rows === undefined ? [] : list(root, 'rows', 'Plan', 200).map((item, i) => {
    const where = `Rangée d’objets ${i + 1}`
    const obj = record(item, where)
    const kind = text(obj, 'kind', where, MAX_ID)
    if (!objectKind(kind)) fail(`${where} : type d’objet inconnu.`)
    const count = int(obj, 'count', where, 1)
    if (count > MAX_ROW_COUNT) fail(`${where} : trop d’objets.`)
    const gap = optionalInt(obj, 'gap', where, 0, 0)
    if (gap > MAX_GAP) fail(`${where} : espace trop grand.`)
    return { id: uniqueId(text(obj, 'id', where, MAX_ID), where), shelfBelowId: text(obj, 'shelfBelowId', where, MAX_ID), kind, count, ...(gap > 0 ? { gap } : {}) }
  })

  const placedObjects: PlacedObject[] = root.placedObjects === undefined ? [] : list(root, 'placedObjects', 'Plan', MAX_PLACED).map((item, i) => {
    const where = `Objet posé ${i + 1}`
    const obj = record(item, where)
    const kind = text(obj, 'kind', where, MAX_ID)
    if (!objectKind(kind)) fail(`${where} : type d’objet inconnu.`)
    return { id: uniqueId(text(obj, 'id', where, MAX_ID), where), shelfBelowId: text(obj, 'shelfBelowId', where, MAX_ID), kind, x: int(obj, 'x', where, 0) }
  })

  const supports: Support[] = root.supports === undefined ? [] : list(root, 'supports', 'Plan', 100).map((item, i) => {
    const where = `Support ${i + 1}`
    const obj = record(item, where)
    return {
      id: uniqueId(text(obj, 'id', where, MAX_ID), where),
      x: int(obj, 'x', where, -MAX_MM),
      y: int(obj, 'y', where, -MAX_MM),
      z: int(obj, 'z', where, 0),
      width: int(obj, 'width', where, 1),
      height: int(obj, 'height', where, 1),
      depth: int(obj, 'depth', where, 1),
    }
  })

  // On reconstruit le plan champ par champ : rien d'inattendu du fichier n'est conservé.
  const model = root.model === undefined ? 'frame' : root.model
  if (model !== 'frame' && model !== 'frameless') fail('Plan : « model » doit valoir « frame » ou « frameless ».')

  const plan: Plan = {
    model,
    name: text(root, 'name', 'Plan', MAX_NAME).trim() || 'Étagère',
    width: int(root, 'width', 'Plan', 1),
    height: int(root, 'height', 'Plan', 1),
    leftUpright: upright(root.leftUpright, 'Montant gauche'),
    rightUpright: upright(root.rightUpright, 'Montant droit'),
    shelves,
    wedges,
    ...(rows.length > 0 ? { rows } : {}),
    ...(placedObjects.length > 0 ? { placedObjects } : {}),
    ...(supports.length > 0 ? { supports } : {}),
    options: {
      propagation: bool(options, 'propagation', 'Options'),
      wallMount: optionalBool(options, 'wallMount', 'Options', false),
      framePlacement,
      defaultWedgeThickness: int(options, 'defaultWedgeThickness', 'Options', 1),
      wedgeClearance: int(options, 'wedgeClearance', 'Options', 0),
      sawKerfEnabled: bool(options, 'sawKerfEnabled', 'Options'),
      sawKerf: int(options, 'sawKerf', 'Options', 0),
    },
  }

  const [problem] = checkPlan(plan)
  if (problem) fail(`Plan incohérent : ${problem}`)
  return plan
}

/** Valide un plan lu depuis l'extérieur (fichier, base de données) : structure, types, puis cohérence. */
export function parsePlan(value: unknown): ParseResult {
  try {
    return { ok: true, plan: readPlan(value) }
  } catch (error) {
    if (error instanceof ParseError) return { ok: false, error: error.message }
    throw error
  }
}

/** Texte d'un fichier `.etagere.json`. */
export function serializePlan(plan: Plan): string {
  return JSON.stringify({ format: FILE_FORMAT, version: FILE_VERSION, plan }, null, 2)
}

/** Lit le contenu d'un fichier `.etagere.json`. */
export function parsePlanFile(content: string): ParseResult {
  let data: unknown
  try {
    data = JSON.parse(content)
  } catch {
    return { ok: false, error: 'Ce fichier n’est pas un fichier d’étagère lisible (JSON invalide).' }
  }
  if (typeof data !== 'object' || data === null || (data as { format?: unknown }).format !== FILE_FORMAT) {
    return { ok: false, error: 'Ce fichier n’a pas été créé par Atelier Étagères.' }
  }
  const { version, plan } = data as { version?: unknown; plan?: unknown }
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, error: 'Numéro de version du fichier invalide.' }
  }
  if (version > FILE_VERSION) {
    return { ok: false, error: 'Ce fichier vient d’une version plus récente de l’application : mettez la page à jour.' }
  }
  return parsePlan(plan)
}

/** Nom de fichier du PDF exporté : même règle que pour le fichier de sauvegarde, avec `.pdf`. */
export function pdfFileName(name: string): string {
  return exportFileName(name).replace(/\.etagere\.json$/, '.pdf')
}

/** Nom de fichier sûr pour exporter un plan : sans accents ni caractères interdits, avec `.etagere.json`. */
export function exportFileName(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._ -]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/^\.+/, '')
    .slice(0, 60)
  return `${base || 'etagere'}.etagere.json`
}
