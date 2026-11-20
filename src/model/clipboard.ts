import { dropPieceColors } from './colors'
import { finish, setPieceProperty } from './edit'
import { evenSlots } from './guides'
import { innerSpan } from './geometry'
import { nudgePiece } from './drag'
import { addCustomKind, isObjectId, layoutStage, MAX_PLACED, moveObject, objectIdExists, resolveKind } from './objects'
import { getStages, sortedShelves } from './pieces'
import { duplicateSupport, moveSupport } from './supports'
import { moveWedge } from './tools'
import type { CustomObjectKind, PlacedObject, Plan, Support, Wedge } from './types'

/**
 * Copier, coller, dupliquer, symétrie, répartition et déplacement de plusieurs pièces à la fois.
 * Fonctions pures : elles renvoient un nouveau plan (jamais de modification en place) ou un message d'erreur en français.
 * Les pièces concernées sont les cales, les supports et les objets de simulation (de rangée ou posés seuls) ;
 * les tablettes et les montants ne se dupliquent pas.
 */

/** Résultat d'une édition qui crée des pièces : le nouveau plan et les identifiants des pièces créées (à sélectionner). */
export type PiecesResult = { ok: true; plan: Plan; ids: string[] } | { ok: false; error: string }

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error })

/** Plus grand nombre de cales demandé pour la répartition (bien au-delà de ce qui tient dans un étage). */
export const MAX_DISTRIBUTE = 50

/** Un élément du presse-papiers, avec l'étage d'origine (identifiant de la tablette du dessous + rang de l'étage). */
export type ClipItem =
  | { type: 'wedge'; shelfBelowId: string; stageIndex: number; wedge: Omit<Wedge, 'id' | 'shelfBelowId'> }
  | {
      type: 'object'
      shelfBelowId: string
      stageIndex: number
      object: Omit<PlacedObject, 'id' | 'shelfBelowId'>
      /** Définition de l'objet sur mesure copié (son identifiant n'a de sens que dans le plan d'origine). */
      customKind?: Omit<CustomObjectKind, 'id'>
    }
  | { type: 'support'; support: Omit<Support, 'id'> }

/** Contenu du presse-papiers interne de l'application (indépendant du presse-papiers du système). */
export interface Clipboard {
  items: ClipItem[]
}

// --- Aides -----------------------------------------------------------------------------------------------------

function nextNumberedId(prefix: string, ids: string[]): string {
  const numbers = ids.map((id) => Number(id.slice(prefix.length + 1))).filter(Number.isInteger)
  return `${prefix}-${Math.max(0, ...numbers) + 1}`
}

/** Un objet de simulation tel que dessiné : sa place actuelle et ce qu'il faut pour en faire un objet posé seul. */
interface ObjectInfo {
  shelfBelowId: string
  x: number
  width: number
  /** Champs de l'objet posé seul à créer (type, et tout ce que l'objet d'origine porte en plus). */
  rest: Omit<PlacedObject, 'id' | 'shelfBelowId' | 'x'>
}

/** Tous les objets dessinés du plan, par identifiant de sélection. Les objets d'une rangée sans place n'y figurent pas. */
function objectInfos(plan: Plan): Map<string, ObjectInfo> {
  const map = new Map<string, ObjectInfo>()
  for (const stage of getStages(plan)) {
    for (const o of layoutStage(plan, stage).objects) {
      // Objet posé seul : tout ce qu'il porte (type, sens, pile). Objet de rangée : son type et le sens de la rangée (pile de 1).
      const row = o.rowId === null ? undefined : (plan.rows ?? []).find((r) => r.id === o.rowId)
      const rest: Record<string, unknown> = {
        ...((plan.placedObjects ?? []).find((p) => `obj:${p.id}` === o.id) ?? { kind: o.kindId, ...(row?.orientation ? { orientation: row.orientation } : {}) }),
      }
      delete rest.id
      delete rest.shelfBelowId
      delete rest.x
      map.set(o.id, { shelfBelowId: stage.shelfBelowId, x: o.x, width: o.width, rest: rest as ObjectInfo['rest'] })
    }
  }
  return map
}

/** Ajoute (sans contrôle) un objet posé seul à `x`, puis le range à la place libre la plus proche de `wantedX`. */
function placeObject(plan: Plan, info: ObjectInfo, shelfBelowId: string, wantedX: number): PiecesResult & { x?: number } {
  if ((plan.placedObjects ?? []).length >= MAX_PLACED) return fail(`Pas plus de ${MAX_PLACED} objets posés seuls.`)
  const next = structuredClone(plan)
  const id = nextNumberedId('placed', (next.placedObjects ?? []).map((p) => p.id))
  next.placedObjects = [...(next.placedObjects ?? []), { ...info.rest, id, shelfBelowId, x: wantedX }]
  const moved = moveObject(next, `obj:${id}`, shelfBelowId, wantedX, null)
  if (!moved.ok) return fail(moved.error)
  const x = moved.plan.placedObjects!.find((p) => p.id === id)!.x
  return { ok: true, plan: moved.plan, ids: [moved.id], x }
}

/** La cale tient-elle à cet endroit : entre les montants, sans toucher une autre cale du même étage ? */
function wedgeFits(plan: Plan, shelfBelowId: string, x: number, thickness: number): boolean {
  const span = innerSpan(plan)
  if (x < span.left || x + thickness > span.right) return false
  return !plan.wedges.some((w) => w.shelfBelowId === shelfBelowId && x < w.x + w.thickness && w.x < x + thickness)
}

function withWedge(plan: Plan, source: Omit<Wedge, 'id' | 'shelfBelowId'>, shelfBelowId: string, x: number): { plan: Plan; id: string } {
  const next = structuredClone(plan)
  const id = nextNumberedId('wedge', next.wedges.map((w) => w.id))
  next.wedges.push({ ...source, id, shelfBelowId, x })
  return { plan: next, id }
}

// --- Dupliquer ---------------------------------------------------------------------------------------------------

/**
 * Duplique la sélection d'un seul coup : une cale à droite de l'original avec un écart égal à son épaisseur (à gauche
 * s'il n'y a plus de place), un support comme « Dupliquer à côté » des supports, un objet en objet posé seul juste à côté
 * (place libre la plus proche). Les tablettes et les montants ne se dupliquent pas. Tout est refusé si une pièce échoue.
 */
export function duplicatePieces(plan: Plan, ids: string[]): PiecesResult {
  if (ids.length === 0) return fail('Aucune pièce sélectionnée.')
  const objects = objectInfos(plan)
  let next = plan
  const created: string[] = []

  for (const id of ids) {
    const wedge = plan.wedges.find((w) => w.id === id)
    if (wedge) {
      const t = wedge.thickness
      const x = [wedge.x + 2 * t, wedge.x - 2 * t].find((candidate) => wedgeFits(next, wedge.shelfBelowId, candidate, t))
      if (x === undefined) return fail('Il n’y a pas de place à côté de cette cale pour la dupliquer.')
      const added = withWedge(next, wedge, wedge.shelfBelowId, x)
      next = added.plan
      created.push(added.id)
    } else if (plan.supports?.some((s) => s.id === id)) {
      const result = duplicateSupport(next, id, 'next')
      if (!result.ok) return result
      next = result.plan
      created.push(result.id)
    } else if (isObjectId(id)) {
      const info = objects.get(id)
      if (!info) return fail(objectIdExists(plan, id) ? 'Cet objet n’a plus de place dans son étage : impossible de le dupliquer.' : 'Objet inconnu.')
      const placed = placeObject(next, info, info.shelfBelowId, info.x + info.width)
      if (!placed.ok) return placed
      next = placed.plan
      created.push(...placed.ids)
    } else if (plan.shelves.some((s) => s.id === id)) {
      return fail('Une tablette ne se duplique pas : pour en ajouter une, utilisez « Ajouter une tablette ».')
    } else {
      return fail('Cette pièce ne se duplique pas (seuls les cales, les supports et les objets se dupliquent).')
    }
  }
  const result = finish(next)
  return result.ok ? { ok: true, plan: result.plan, ids: created } : result
}

// --- Symétrie ----------------------------------------------------------------------------------------------------

/**
 * Copie en miroir de chaque pièce par rapport au milieu de l'étagère (milieu de l'espace entre les montants pour les
 * cales et les objets ; milieu de la largeur hors-tout pour les supports), dans le même étage. Refusé si une pièce est déjà
 * au milieu ou si la place symétrique est prise. Tout est refusé si une pièce échoue.
 */
export function mirrorPieces(plan: Plan, ids: string[]): PiecesResult {
  if (ids.length === 0) return fail('Aucune pièce sélectionnée.')
  const objects = objectInfos(plan)
  const span = innerSpan(plan)
  let next = plan
  const created: string[] = []

  for (const id of ids) {
    const wedge = plan.wedges.find((w) => w.id === id)
    if (wedge) {
      const x = span.left + span.right - wedge.x - wedge.thickness
      if (x === wedge.x) return fail('Cette cale est déjà au milieu de l’étagère : sa symétrique serait au même endroit.')
      if (!wedgeFits(next, wedge.shelfBelowId, x, wedge.thickness)) return fail('La place symétrique de cette cale est déjà prise.')
      const added = withWedge(next, wedge, wedge.shelfBelowId, x)
      next = added.plan
      created.push(added.id)
    } else if (plan.supports?.some((s) => s.id === id)) {
      const result = duplicateSupport(next, id, 'mirror')
      if (!result.ok) return result
      next = result.plan
      created.push(result.id)
    } else if (isObjectId(id)) {
      const info = objects.get(id)
      if (!info) return fail(objectIdExists(plan, id) ? 'Cet objet n’a plus de place dans son étage : impossible de le copier en symétrique.' : 'Objet inconnu.')
      const x = span.left + span.right - info.x - info.width
      if (x === info.x) return fail('Cet objet est déjà au milieu de l’étagère : son symétrique serait au même endroit.')
      const placed = placeObject(next, info, info.shelfBelowId, x)
      if (!placed.ok) return placed
      if (placed.x !== x) return fail('La place symétrique de cet objet est déjà prise.')
      next = placed.plan
      created.push(...placed.ids)
    } else {
      return fail('Seuls les cales, les supports et les objets se copient en symétrique.')
    }
  }
  const result = finish(next)
  return result.ok ? { ok: true, plan: result.plan, ids: created } : result
}

/** Copie en miroir d'une seule pièce (voir `mirrorPieces`). */
export function mirrorPiece(plan: Plan, id: string): PiecesResult {
  return mirrorPieces(plan, [id])
}

// --- Copier / coller ---------------------------------------------------------------------------------------------

/** Mémorise les cales, supports et objets de la sélection (les autres pièces sont ignorées), avec leur étage d'origine. */
export function copyPieces(plan: Plan, ids: string[]): { ok: true; clipboard: Clipboard } | { ok: false; error: string } {
  const stages = getStages(plan)
  const stageIndex = (id: string) => Math.max(0, stages.findIndex((s) => s.shelfBelowId === id))
  const objects = objectInfos(plan)
  const items: ClipItem[] = []
  for (const id of ids) {
    const wedge = plan.wedges.find((w) => w.id === id)
    const support = plan.supports?.find((s) => s.id === id)
    if (wedge) {
      const { shelfBelowId } = wedge
      const rest: Record<string, unknown> = { ...wedge }
      delete rest.id
      delete rest.shelfBelowId
      items.push({ type: 'wedge', shelfBelowId, stageIndex: stageIndex(shelfBelowId), wedge: rest as Omit<Wedge, 'id' | 'shelfBelowId'> })
    } else if (support) {
      const rest: Record<string, unknown> = { ...support }
      delete rest.id
      items.push({ type: 'support', support: rest as Omit<Support, 'id'> })
    } else if (isObjectId(id)) {
      const info = objects.get(id)
      if (info) {
        const custom = plan.customKinds?.find((k) => k.id === info.rest.kind)
        const customKind: Omit<CustomObjectKind, 'id'> | undefined = custom && {
          label: custom.label,
          width: custom.width,
          height: custom.height,
          depth: custom.depth,
          shape: custom.shape,
          ...(custom.color !== undefined ? { color: custom.color } : {}),
        }
        items.push({
          type: 'object',
          shelfBelowId: info.shelfBelowId,
          stageIndex: stageIndex(info.shelfBelowId),
          object: { ...info.rest, x: info.x },
          ...(customKind ? { customKind } : {}),
        })
      }
    }
  }
  if (items.length === 0) return fail('Rien à copier : seuls les cales, les supports et les objets se copient.')
  return { ok: true, clipboard: { items } }
}

/**
 * Étage visé par la sélection au moment de coller : celui de l'unique cale ou de l'unique objet choisi, ou l'étage au-dessus
 * de l'unique tablette choisie. Null si la sélection ne désigne pas un étage (on colle alors dans l'étage d'origine).
 */
export function stageOfSelection(plan: Plan, selection: string[]): string | null {
  if (selection.length !== 1) return null
  const id = selection[0]
  const wedge = plan.wedges.find((w) => w.id === id)
  if (wedge) return wedge.shelfBelowId
  if (isObjectId(id)) return objectInfos(plan).get(id)?.shelfBelowId ?? null
  return getStages(plan).find((s) => s.shelfBelowId === id)?.shelfBelowId ?? null
}

/**
 * Colle le presse-papiers. Cales et objets vont dans `targetStageId` s'il est donné, sinon dans leur étage d'origine
 * (même tablette du dessous si elle existe dans ce plan, sinon étage de même rang, sinon refus). Chaque pièce prend sa
 * position x d'origine si elle est libre, sinon la place libre la plus proche. Un support garde sa position ; s'il y a déjà
 * un support identique, il se décale à côté.
 */
export function pastePieces(plan: Plan, clipboard: Clipboard, targetStageId: string | null = null): PiecesResult {
  if (clipboard.items.length === 0) return fail('Le presse-papiers est vide.')
  const stages = getStages(plan)
  if (targetStageId !== null && !stages.some((s) => s.shelfBelowId === targetStageId)) return fail('Étage inconnu.')
  const stageFor = (item: { shelfBelowId: string; stageIndex: number }): string | null =>
    targetStageId ?? (stages.some((s) => s.shelfBelowId === item.shelfBelowId) ? item.shelfBelowId : (stages[item.stageIndex]?.shelfBelowId ?? null))
  const noStage = 'Cet étage n’existe pas dans cette étagère : impossible de coller ici.'

  let next = plan
  const created: string[] = []
  for (const item of clipboard.items) {
    if (item.type === 'wedge') {
      const stageId = stageFor(item)
      const below = plan.shelves.find((s) => s.id === stageId)
      if (!stageId || !below) return fail(noStage)
      const source = { ...item.wedge, depth: Math.min(item.wedge.depth, below.depth) }
      const added = withWedge(next, source, stageId, item.wedge.x)
      const moved = moveWedge(added.plan, added.id, stageId, item.wedge.x, null)
      if (!moved.ok) return fail(moved.error)
      next = moved.plan
      created.push(added.id)
    } else if (item.type === 'object') {
      const stageId = stageFor(item)
      if (!stageId) return fail(noStage)
      let rest = item.object
      if (item.customKind) {
        // Objet sur mesure : on le cherche dans ce plan par sa définition (pas par son identifiant), sinon on le crée.
        const d = item.customKind
        let kindId = next.customKinds?.find((k) => k.label === d.label && k.width === d.width && k.height === d.height && k.depth === d.depth && k.shape === d.shape)?.id
        if (!kindId) {
          const created = addCustomKind(next, d)
          if (!created.ok) return fail(created.error)
          next = created.plan
          kindId = created.id
        }
        rest = { ...item.object, kind: kindId }
      } else if (!resolveKind(next, item.object.kind)) {
        return fail('Ce type d’objet n’existe pas dans cette étagère : impossible de le coller.')
      }
      const placed = placeObject(next, { shelfBelowId: stageId, x: rest.x, width: 0, rest }, stageId, rest.x)
      if (!placed.ok) return placed
      next = placed.plan
      created.push(...placed.ids)
    } else {
      const s = item.support
      const taken = (x: number) => (next.supports ?? []).some((o) => o.x === x && o.y === s.y && o.z === s.z && o.width === s.width && o.height === s.height && o.depth === s.depth)
      let x: number | undefined = taken(s.x) ? undefined : s.x
      for (const direction of [1, -1]) {
        for (let k = 1; x === undefined && k <= 20; k++) {
          const candidate = s.x + direction * k * (s.width + 50)
          if (candidate >= 0 && candidate + s.width <= next.width && !taken(candidate)) x = candidate
        }
      }
      if (x === undefined) return fail('Il n’y a pas de place pour coller ce support.')
      const copy = structuredClone(next)
      const id = nextNumberedId('support', (copy.supports ?? []).map((o) => o.id))
      copy.supports = [...(copy.supports ?? []), { ...s, id, x }]
      next = copy
      created.push(id)
    }
  }
  const result = finish(next)
  return result.ok ? { ok: true, plan: result.plan, ids: created } : result
}

// --- Répartir ----------------------------------------------------------------------------------------------------

/**
 * Remplace les cales de l'étage au-dessus de `shelfBelowId` par `count` cales (épaisseur par défaut des cales, profondeur de
 * la tablette du dessous) aux écarts égaux entre elles et avec chaque montant.
 */
export function distributeWedges(plan: Plan, shelfBelowId: string, count: number): PiecesResult {
  if (!Number.isInteger(count) || count < 1 || count > MAX_DISTRIBUTE) return fail(`Entrez un nombre entier de cales, de 1 à ${MAX_DISTRIBUTE}.`)
  const stage = getStages(plan).find((s) => s.shelfBelowId === shelfBelowId)
  const below = plan.shelves.find((s) => s.id === shelfBelowId)
  if (!stage || !below) return fail('Étage inconnu.')
  const thickness = plan.options.defaultWedgeThickness
  const span = innerSpan(plan)
  if (count * thickness > span.right - span.left) return fail(`Il n’y a pas assez de place pour ${count} cales dans cet étage.`)

  const next = structuredClone(plan)
  dropPieceColors(next, next.wedges.filter((w) => w.shelfBelowId === shelfBelowId).map((w) => w.id))
  next.wedges = next.wedges.filter((w) => w.shelfBelowId !== shelfBelowId)
  const positions = evenSlots(span.left, span.right, Array<number>(count).fill(thickness))
  const created: string[] = []
  for (const x of positions) {
    const id = nextNumberedId('wedge', next.wedges.map((w) => w.id))
    next.wedges.push({ id, shelfBelowId, x, thickness, depth: below.depth, cornerRadius: 0, edgeRadius: 0 })
    created.push(id)
  }
  const result = finish(next)
  return result.ok ? { ok: true, plan: result.plan, ids: created } : result
}

// --- Déplacer plusieurs pièces ------------------------------------------------------------------------------------

/**
 * Déplace d'un pas toutes les pièces choisies qui vont dans ce sens : cales en x (`dx`), tablettes intermédiaires en y
 * (`dy`), supports en x et en y. Les pièces se déplacent de la plus avancée à la plus en retrait pour ne pas se gêner.
 * Si l'une d'elles est bloquée, rien ne bouge (message). Aucune pièce concernée : plan inchangé.
 */
export function nudgePieces(plan: Plan, ids: string[], dx: -1 | 0 | 1, dy: -1 | 0 | 1, step: number): { ok: true; plan: Plan } | { ok: false; error: string } {
  const shelves = sortedShelves(plan)
  const direction = dx !== 0 ? dx : dy
  const movers: { id: string; position: number }[] = []
  for (const id of ids) {
    const shelfIndex = shelves.findIndex((s) => s.id === id)
    const wedge = plan.wedges.find((w) => w.id === id)
    const support = plan.supports?.find((s) => s.id === id)
    if (dy !== 0 && shelfIndex > 0 && shelfIndex < shelves.length - 1) movers.push({ id, position: shelves[shelfIndex].y })
    else if (dx !== 0 && wedge) movers.push({ id, position: wedge.x })
    else if (support && (dx !== 0 || dy !== 0)) movers.push({ id, position: dx !== 0 ? support.x : support.y })
  }
  movers.sort((a, b) => (b.position - a.position) * direction)

  const blocked = movers.length > 1 ? 'Déplacement impossible : l’une des pièces est bloquée (contre un montant, une autre pièce…).' : 'Cette pièce est bloquée : elle ne peut pas aller plus loin.'
  let next = plan
  for (const { id } of movers) {
    const support = next.supports?.find((s) => s.id === id)
    if (support) {
      const result = moveSupport(next, id, dx !== 0 ? { x: support.x + dx * step } : { y: support.y + dy * step })
      if (!result.ok) return fail(result.error)
      next = result.plan
      continue
    }
    const move = nudgePiece(next, id, dx, dy, step)
    if (!move) return fail(blocked)
    // En sélection multiple, une pièce qui n'avance que d'une partie du pas changerait les écarts : tout est refusé.
    if (movers.length > 1) {
      const before = move.property === 'x' ? next.wedges.find((w) => w.id === id)?.x : next.shelves.find((s) => s.id === id)?.y
      if (before === undefined || Math.abs(move.mm - before) !== step) return fail(blocked)
    }
    const result = setPieceProperty(next, [id], move.property, move.mm)
    if (!result.ok) return fail(result.error)
    next = result.plan
  }
  return { ok: true, plan: next }
}
