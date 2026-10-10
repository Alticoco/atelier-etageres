import { fail, finish, type EditResult } from './edit'
import { innerSpan } from './geometry'
import { parseVerticalId } from './labels'
import { nearestGuide, wedgeGuides } from './guides'
import { isObjectId, removeObject } from './objects'
import { getStages, sortedShelves } from './pieces'
import type { Plan } from './types'

/** Résultat d'un ajout : le nouveau plan et l'identifiant de la pièce créée. */
export type AddResult = { ok: true; plan: Plan; id: string } | { ok: false; error: string }

/** Prochain identifiant libre : « shelf-5 », « wedge-3 »… */
function nextId(prefix: 'shelf' | 'wedge', ids: string[]): string {
  const numbers = ids.map((id) => Number(id.slice(prefix.length + 1))).filter(Number.isInteger)
  return `${prefix}-${Math.max(0, ...numbers) + 1}`
}

/**
 * Ajoute une tablette au milieu d'un étage (celui qui est au-dessus de `shelfBelowId`).
 * Elle reprend l'épaisseur et la profondeur de la tablette du dessous.
 */
export function addShelf(plan: Plan, shelfBelowId: string): AddResult {
  const stage = getStages(plan).find((s) => s.shelfBelowId === shelfBelowId)
  const below = plan.shelves.find((s) => s.id === shelfBelowId)
  if (!stage || !below) return fail('Étage inconnu.') as AddResult

  const room = stage.clearHeight - below.thickness
  if (room < 2) return fail('Cet étage est trop bas pour y ajouter une tablette.') as AddResult

  const next = structuredClone(plan)
  const id = nextId('shelf', next.shelves.map((s) => s.id))
  // La nouvelle tablette reprend les débords et les montants de celle du dessous (les deux demi-étages restent pareils).
  next.shelves.push({
    id,
    y: stage.y + Math.floor(room / 2),
    thickness: below.thickness,
    depth: below.depth,
    overhangLeft: below.overhangLeft,
    overhangRight: below.overhangRight,
    verticalLeft: below.verticalLeft,
    verticalRight: below.verticalRight,
    cornerRadius: below.cornerRadius,
    edgeRadius: below.edgeRadius,
  })

  const result = finish(next)
  return result.ok ? { ok: true, plan: result.plan, id } : result
}

/**
 * Ajoute une cale dans un étage, au milieu de la plus grande place libre entre les montants
 * et les cales déjà présentes.
 */
export function addWedge(plan: Plan, shelfBelowId: string): AddResult {
  const stage = getStages(plan).find((s) => s.shelfBelowId === shelfBelowId)
  const below = plan.shelves.find((s) => s.id === shelfBelowId)
  if (!stage || !below) return fail('Étage inconnu.') as AddResult

  const thickness = plan.options.defaultWedgeThickness
  if (stage.clearHeight - plan.options.wedgeClearance < 1) {
    return fail('Cet étage est trop bas pour y poser une cale.') as AddResult
  }

  const existing = plan.wedges.filter((w) => w.shelfBelowId === shelfBelowId).sort((a, b) => a.x - b.x)
  let best: { start: number; size: number } | null = null
  const span = innerSpan(plan)
  let cursor = span.left
  const edges = [...existing.map((w) => ({ from: w.x, to: w.x + w.thickness })), { from: span.right, to: plan.width }]
  for (const edge of edges) {
    const size = edge.from - cursor
    if (size >= thickness && (!best || size > best.size)) best = { start: cursor, size }
    cursor = Math.max(cursor, edge.to)
  }
  if (!best) return fail('Il n’y a plus de place pour une cale dans cet étage.') as AddResult

  const next = structuredClone(plan)
  const id = nextId('wedge', next.wedges.map((w) => w.id))
  next.wedges.push({
    id,
    shelfBelowId,
    x: best.start + Math.floor((best.size - thickness) / 2),
    thickness,
    depth: below.depth,
    cornerRadius: 0,
    edgeRadius: 0,
  })

  const result = finish(next)
  return result.ok ? { ok: true, plan: result.plan, id } : result
}

/**
 * Copie la disposition des cales de l'étage `fromId` (au-dessus de cette tablette) vers les étages `toIds` :
 * mêmes positions, épaisseurs, profondeurs et arrondis. Les cales déjà présentes dans un étage de destination sont
 * remplacées ; si l'étage source n'a pas de cale, les étages de destination sont vidés.
 */
export function copyStageWedges(plan: Plan, fromId: string, toIds: string[]): EditResult {
  const stages = getStages(plan)
  if (!stages.some((s) => s.shelfBelowId === fromId)) return fail('Étage source inconnu.')
  const targets = [...new Set(toIds)].filter((id) => id !== fromId)
  if (targets.length === 0) return fail('Choisissez au moins un autre étage.')
  if (targets.some((id) => !stages.some((s) => s.shelfBelowId === id))) return fail('Étage de destination inconnu.')

  const next = structuredClone(plan)
  const source = plan.wedges.filter((w) => w.shelfBelowId === fromId)
  next.wedges = next.wedges.filter((w) => !targets.includes(w.shelfBelowId))
  for (const target of targets) {
    for (const wedge of source) {
      next.wedges.push({ ...wedge, id: nextId('wedge', next.wedges.map((w) => w.id)), shelfBelowId: target })
    }
  }
  return finish(next)
}

/** Distance (mm) en dessous de laquelle une cale s'aimante contre un montant ou une cale voisine. */
export const MAGNET_MM = 10

/**
 * Place la cale `wedgeId` dans l'étage au-dessus de `shelfBelowId`, le plus près possible de `rawX` (bord gauche).
 * Elle reste dans les places libres de l'étage (entre les montants, sans chevaucher une autre cale) ; si `step`
 * est donné, la position est d'abord arrondie, puis aimantée contre le montant ou la cale voisine si elle en est
 * à moins de `MAGNET_MM`. Sa hauteur s'adapte seule à l'étage (hauteur libre − jeu).
 */
export function moveWedge(plan: Plan, wedgeId: string, shelfBelowId: string, rawX: number, step: number | null): EditResult {
  const wedge = plan.wedges.find((w) => w.id === wedgeId)
  if (!wedge) return fail('Cale inconnue.')
  const stage = getStages(plan).find((s) => s.shelfBelowId === shelfBelowId)
  if (!stage) return fail('Étage inconnu.')

  const span = innerSpan(plan)
  const others = plan.wedges
    .filter((w) => w.id !== wedgeId && w.shelfBelowId === shelfBelowId)
    .sort((a, b) => a.x - b.x)

  // Places libres où la cale tient : [début minimal, début maximal] du bord gauche.
  const slots: { min: number; max: number }[] = []
  let cursor = span.left
  for (const edge of [...others.map((w) => ({ from: w.x, to: w.x + w.thickness })), { from: span.right, to: span.right }]) {
    if (edge.from - cursor >= wedge.thickness) slots.push({ min: cursor, max: edge.from - wedge.thickness })
    cursor = Math.max(cursor, edge.to)
  }
  if (slots.length === 0) return fail('Il n’y a pas assez de place pour la cale dans cet étage.')

  const clampToSlots = (x: number): number => {
    let best = slots[0].min
    let bestDistance = Infinity
    for (const slot of slots) {
      const candidate = Math.min(Math.max(x, slot.min), slot.max)
      if (Math.abs(candidate - x) < bestDistance) {
        best = candidate
        bestDistance = Math.abs(candidate - x)
      }
    }
    return best
  }

  let x = clampToSlots(step === null ? Math.round(rawX) : Math.round(rawX / Math.max(step, 1)) * Math.max(step, 1))
  if (step !== null) {
    // Repères invisibles (milieu, écarts égaux, alignement) : ils l'emportent s'ils sont à portée et valides.
    const guide = nearestGuide(wedgeGuides(plan, wedgeId, shelfBelowId), rawX)
    const snapped = guide ? clampToSlots(guide.pos) : null
    if (guide && snapped !== null && Math.abs(snapped - guide.pos) <= 1) {
      x = snapped
    } else {
      // Aimantation : bords des places libres (contre un montant ou une cale voisine).
      const magnets = slots.flatMap((slot) => [slot.min, slot.max])
      const near = magnets.reduce((a, b) => (Math.abs(b - rawX) < Math.abs(a - rawX) ? b : a))
      if (Math.abs(near - rawX) <= MAGNET_MM) x = near
    }
  }

  const next = structuredClone(plan)
  const target = next.wedges.find((w) => w.id === wedgeId)!
  target.shelfBelowId = shelfBelowId
  target.x = x
  return finish(next)
}

/**
 * Supprime des tablettes intermédiaires et/ou des cales. Les montants et les tablettes du haut et du bas
 * ferment le cadre : ils ne se suppriment pas. Quand une tablette disparaît, les cales de son étage
 * passent dans l'étage fusionné.
 */
export function removePieces(plan: Plan, ids: string[]): EditResult {
  if (ids.length === 0) return fail('Aucune pièce sélectionnée.')
  const next = structuredClone(plan)

  // Plusieurs objets d'une même rangée : on supprime les derniers d'abord pour que les numéros ne se décalent pas.
  const objectIndex = (id: string) => Number(/:(\d+)$/.exec(id)?.[1] ?? -1)
  ids = [...ids].sort((a, b) => objectIndex(b) - objectIndex(a))

  for (const id of ids) {
    // Modèle sans cadre : supprimer un montant d'étage laisse l'extrémité se terminer par la seule tablette.
    const vertical = parseVerticalId(id)
    if (vertical && next.model === 'frameless') {
      const shelf = next.shelves.find((s) => s.id === vertical.shelfBelowId)
      const key = vertical.side === 'left' ? 'verticalLeft' : 'verticalRight'
      if (!shelf || !shelf[key]) return fail(`Pièce inconnue : ${id}`)
      shelf[key] = false
      continue
    }

    if (id === 'upright-left' || id === 'upright-right') return fail('Les montants ne se suppriment pas.')

    if (isObjectId(id)) {
      const result = removeObject(next, id)
      if (!result.ok) return result
      next.rows = result.plan.rows
      next.placedObjects = result.plan.placedObjects
      if (!next.rows) delete next.rows
      if (!next.placedObjects) delete next.placedObjects
      continue
    }

    if (next.supports?.some((s) => s.id === id)) {
      next.supports = next.supports.filter((s) => s.id !== id)
      if (next.supports.length === 0) delete next.supports
      continue
    }

    if (next.wedges.some((w) => w.id === id)) {
      next.wedges = next.wedges.filter((w) => w.id !== id)
      continue
    }

    const shelves = sortedShelves(next)
    const index = shelves.findIndex((s) => s.id === id)
    if (index < 0) return fail(`Pièce inconnue : ${id}`)
    if (index === 0 || index === shelves.length - 1) {
      return fail('Les tablettes du haut et du bas ferment le cadre : elles ne se suppriment pas.')
    }
    const merged = shelves[index - 1].id
    for (const wedge of next.wedges) if (wedge.shelfBelowId === id) wedge.shelfBelowId = merged
    for (const row of next.rows ?? []) if (row.shelfBelowId === id) row.shelfBelowId = merged
    for (const placed of next.placedObjects ?? []) if (placed.shelfBelowId === id) placed.shelfBelowId = merged
    next.shelves = next.shelves.filter((s) => s.id !== id)
  }

  return finish(next)
}

/**
 * Répartit les tablettes intermédiaires pour que tous les étages aient la même hauteur libre.
 * Les tablettes du haut et du bas ne bougent pas ; les mm restants vont aux étages du bas.
 */
export function distributeShelves(plan: Plan): EditResult {
  const next = structuredClone(plan)
  const shelves = sortedShelves(next)
  if (shelves.length < 3) return { ok: true, plan: next }

  const bottom = shelves[0]
  const top = shelves[shelves.length - 1]
  const middleThickness = shelves.slice(1, -1).reduce((sum, s) => sum + s.thickness, 0)
  const stageCount = shelves.length - 1
  const free = top.y - (bottom.y + bottom.thickness) - middleThickness
  const base = Math.floor(free / stageCount)
  if (base < 1) return fail('Il n’y a pas assez de place pour espacer les tablettes.')
  const extra = free % stageCount

  let cursor = bottom.y + bottom.thickness
  for (let i = 0; i < stageCount - 1; i++) {
    cursor += base + (i < extra ? 1 : 0)
    shelves[i + 1].y = cursor
    cursor += shelves[i + 1].thickness
  }

  return finish(next)
}


/**
 * Modèle sans cadre : ajoute ou retire le montant de gauche / de droite dans l'étage situé au-dessus d'une tablette.
 * Sans montant, cette extrémité de l'étage se termine par la seule tablette.
 */
export function setVertical(plan: Plan, shelfId: string, side: 'left' | 'right', present: boolean): EditResult {
  if (plan.model !== 'frameless') return fail('Ce réglage concerne seulement les étagères sans cadre.')
  if (!getStages(plan).some((s) => s.shelfBelowId === shelfId)) return fail('Il n’y a pas d’étage au-dessus de cette tablette.')
  const next = structuredClone(plan)
  const shelf = next.shelves.find((s) => s.id === shelfId)
  if (!shelf) return fail('Tablette inconnue.')
  if (side === 'left') shelf.verticalLeft = present
  else shelf.verticalRight = present
  return finish(next)
}

/**
 * Règle la hauteur libre d'un étage (celui au-dessus de `shelfBelowId`) en déplaçant une tablette :
 * celle du dessus si elle est intermédiaire, sinon celle du dessous. Une étagère d'un seul étage change de hauteur.
 * Les étages voisins s'adaptent donc ; si ça ne tient plus, le contrôle de cohérence explique pourquoi.
 */
export function setStageHeight(plan: Plan, shelfBelowId: string, mm: number): EditResult {
  if (!Number.isInteger(mm) || mm < 1) return fail('La hauteur d’un étage doit être un nombre entier de mm supérieur à 0.')
  const shelves = sortedShelves(plan)
  const i = shelves.findIndex((s) => s.id === shelfBelowId)
  if (i < 0 || i >= shelves.length - 1) return fail('Étage inconnu.')
  const below = shelves[i]
  const above = shelves[i + 1]
  const next = structuredClone(plan)

  if (i + 1 < shelves.length - 1) {
    next.shelves.find((s) => s.id === above.id)!.y = below.y + below.thickness + mm
  } else if (i > 0) {
    next.shelves.find((s) => s.id === below.id)!.y = above.y - mm - below.thickness
  } else {
    next.height = below.y + below.thickness + mm + above.thickness
    next.shelves.find((s) => s.id === above.id)!.y = below.y + below.thickness + mm
  }
  // Une tablette ne passe jamais par-dessus une autre (les cales changeraient d'étage sans prévenir).
  const order = (p: Plan) => sortedShelves(p).map((s) => s.id).join('|')
  if (order(next) !== order(plan)) return fail('Cet étage ne peut pas être aussi haut : il n’y a plus assez de place pour les autres.')
  return finish(next)
}

export const MAX_STAGES = 20

/**
 * Change le nombre d'étages (préconstruction) : on ajoute des tablettes en coupant les plus grands étages, ou on retire
 * les tablettes du haut, puis tous les étages sont répartis à égalité (hauteur et haut / bas de l'étagère inchangés).
 * Les cales des étages supprimés disparaissent ; les objets de simulation passent dans l'étage fusionné.
 */
export function setStageCount(plan: Plan, count: number): EditResult {
  if (!Number.isInteger(count) || count < 1 || count > MAX_STAGES) return fail(`Le nombre d’étages va de 1 à ${MAX_STAGES}.`)
  let next = plan
  if (getStages(next).length === count) return { ok: true, plan }

  while (getStages(next).length < count) {
    const biggest = [...getStages(next)].sort((a, b) => b.clearHeight - a.clearHeight)[0]
    const added = addShelf(next, biggest.shelfBelowId)
    if (!added.ok) return fail(`Impossible d’ajouter un étage : ${added.error}`)
    next = added.plan
  }
  while (getStages(next).length > count) {
    const shelves = sortedShelves(next)
    const removed = shelves[shelves.length - 2]
    const withoutWedges = structuredClone(next)
    withoutWedges.wedges = withoutWedges.wedges.filter((w) => w.shelfBelowId !== removed.id)
    const result = removePieces(withoutWedges, [removed.id])
    if (!result.ok) return result
    next = result.plan
  }
  return distributeShelves(next)
}
