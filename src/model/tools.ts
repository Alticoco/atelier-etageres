import { fail, finish, type EditResult } from './edit'
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
  next.shelves.push({ id, y: stage.y + Math.floor(room / 2), thickness: below.thickness, depth: below.depth })

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
  let cursor = plan.leftUpright.thickness
  const edges = [...existing.map((w) => ({ from: w.x, to: w.x + w.thickness })), { from: plan.width - plan.rightUpright.thickness, to: plan.width }]
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
  })

  const result = finish(next)
  return result.ok ? { ok: true, plan: result.plan, id } : result
}

/**
 * Supprime des tablettes intermédiaires et/ou des cales. Les montants et les tablettes du haut et du bas
 * ferment le cadre : ils ne se suppriment pas. Quand une tablette disparaît, les cales de son étage
 * passent dans l'étage fusionné.
 */
export function removePieces(plan: Plan, ids: string[]): EditResult {
  if (ids.length === 0) return fail('Aucune pièce sélectionnée.')
  const next = structuredClone(plan)

  for (const id of ids) {
    if (id === 'upright-left' || id === 'upright-right') return fail('Les montants ne se suppriment pas.')

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

