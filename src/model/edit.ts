import { getStages, sortedShelves } from './pieces'
import { propagateHeight, propagateWidth } from './propagation'
import type { FramePlacement, Plan, Shelf, Upright, Wedge } from './types'

export type EditResult = { ok: true; plan: Plan } | { ok: false; error: string }

/** Cote d'une pièce modifiable : épaisseur, profondeur, hauteur d'une tablette (y), position d'une cale (x). */
export type PieceProperty = 'thickness' | 'depth' | 'y' | 'x'

export type PlanChange =
  | { property: 'width' | 'height' | 'wedgeClearance' | 'defaultWedgeThickness'; mm: number }
  | { property: 'name'; value: string }
  | { property: 'framePlacement'; value: FramePlacement }
  | { property: 'propagation'; value: boolean }

type PieceRef =
  | { kind: 'upright'; ref: Upright }
  | { kind: 'shelf'; ref: Shelf }
  | { kind: 'wedge'; ref: Wedge }

function findPiece(plan: Plan, id: string): PieceRef | null {
  if (id === 'upright-left') return { kind: 'upright', ref: plan.leftUpright }
  if (id === 'upright-right') return { kind: 'upright', ref: plan.rightUpright }
  const shelf = plan.shelves.find((s) => s.id === id)
  if (shelf) return { kind: 'shelf', ref: shelf }
  const wedge = plan.wedges.find((w) => w.id === id)
  if (wedge) return { kind: 'wedge', ref: wedge }
  return null
}

/** Cotes actuelles d'une pièce (pour remplir le panneau de propriétés). */
export function readPiece(plan: Plan, id: string): { kind: PieceRef['kind']; thickness: number; depth: number; y?: number; x?: number } | null {
  const piece = findPiece(plan, id)
  if (!piece) return null
  const { kind, ref } = piece
  return {
    kind,
    thickness: ref.thickness,
    depth: ref.depth,
    ...(kind === 'shelf' ? { y: (ref as Shelf).y } : {}),
    ...(kind === 'wedge' ? { x: (ref as Wedge).x } : {}),
  }
}

/**
 * Contrôles de cohérence de base d'un plan. Renvoie la liste des problèmes
 * (vide = plan cohérent). L'étape 6 ajoutera les contrôles liés aux outils.
 */
export function checkPlan(plan: Plan): string[] {
  const problems: string[] = []
  const left = plan.leftUpright
  const right = plan.rightUpright

  const positive = [plan.width, plan.height, left.thickness, left.depth, right.thickness, right.depth]
  for (const s of plan.shelves) positive.push(s.thickness, s.depth)
  for (const w of plan.wedges) positive.push(w.thickness, w.depth)
  if (positive.some((v) => !Number.isInteger(v) || v <= 0)) {
    problems.push('Toutes les dimensions doivent être des nombres entiers de mm supérieurs à 0.')
  }

  if (plan.width <= left.thickness + right.thickness) {
    problems.push('La largeur est trop faible pour deux montants et un espace entre eux.')
  }

  const shelves = sortedShelves(plan)
  if (shelves.length < 2) problems.push('Il faut au moins deux tablettes (haut et bas).')
  for (let i = 0; i < shelves.length - 1; i++) {
    if (shelves[i].y + shelves[i].thickness >= shelves[i + 1].y) {
      problems.push('Il doit rester de la place entre deux tablettes (elles se chevauchent ou se touchent).')
      break
    }
  }
  if (shelves.length > 0) {
    if (shelves[0].y < 0) problems.push('La tablette du bas sort de l’étagère.')
    const top = shelves[shelves.length - 1]
    if (top.y + top.thickness > plan.height) problems.push('La tablette du haut dépasse la hauteur de l’étagère.')
  }

  const stages = getStages(plan)
  for (const wedge of plan.wedges) {
    const stage = stages.find((s) => s.shelfBelowId === wedge.shelfBelowId)
    if (!stage) {
      problems.push('Une cale n’a plus d’étage au-dessus de sa tablette.')
    } else if (stage.clearHeight - plan.options.wedgeClearance < 1) {
      problems.push('Une cale est plus haute que son étage.')
    }
    if (wedge.x < left.thickness || wedge.x + wedge.thickness > plan.width - right.thickness) {
      problems.push('Une cale sort du cadre.')
    }
  }

  for (let i = 0; i < plan.wedges.length; i++) {
    for (let j = i + 1; j < plan.wedges.length; j++) {
      const a = plan.wedges[i]
      const b = plan.wedges[j]
      if (a.shelfBelowId === b.shelfBelowId && a.x < b.x + b.thickness && b.x < a.x + a.thickness) {
        problems.push('Deux cales se chevauchent.')
        return problems
      }
    }
  }

  return problems
}

export function fail(error: string): EditResult {
  return { ok: false, error }
}

export function finish(next: Plan): EditResult {
  const [problem] = checkPlan(next)
  return problem ? fail(problem) : { ok: true, plan: next }
}

/** La tablette la plus haute reste collée au haut du cadre. */
function keepTopShelfFlush(plan: Plan): void {
  const shelves = sortedShelves(plan)
  const top = shelves[shelves.length - 1]
  if (top) top.y = plan.height - top.thickness
}

/**
 * Modifie une cote d'une ou plusieurs pièces. Ne modifie pas le plan reçu.
 * Règle : changer l'épaisseur de la tablette du haut la garde collée au haut ;
 * pour les autres, la face inférieure ne bouge pas.
 * Une tablette ne peut pas dépasser ses voisines (l'ordre des tablettes ne change pas).
 */
export function setPieceProperty(plan: Plan, ids: string[], property: PieceProperty, mm: number): EditResult {
  if (!Number.isInteger(mm) || mm < 0) return fail('La valeur doit être un nombre entier de mm positif ou nul.')
  if ((property === 'thickness' || property === 'depth') && mm === 0) return fail('La valeur doit être supérieure à 0.')
  if (ids.length === 0) return fail('Aucune pièce sélectionnée.')

  const next = structuredClone(plan)
  const topBefore = sortedShelves(next).at(-1)
  let touchesTop = false

  for (const id of ids) {
    const piece = findPiece(next, id)
    if (!piece) return fail(`Pièce inconnue : ${id}`)

    if (property === 'thickness' || property === 'depth') {
      piece.ref[property] = mm
      if (property === 'thickness' && piece.kind === 'shelf' && piece.ref.id === topBefore?.id) touchesTop = true
    } else if (property === 'y' && piece.kind === 'shelf') {
      piece.ref.y = mm
    } else if (property === 'x' && piece.kind === 'wedge') {
      piece.ref.x = mm
    } else {
      return fail('Cette cote ne s’applique pas à toutes les pièces sélectionnées.')
    }
  }

  if (touchesTop) keepTopShelfFlush(next)

  if (property === 'y') {
    const order = (p: Plan) => sortedShelves(p).map((s) => s.id).join('|')
    if (order(next) !== order(plan)) return fail('Une tablette ne peut pas passer par-dessus une autre.')
  }
  if (property === 'x') {
    const order = (p: Plan) =>
      [...p.wedges]
        .sort((a, b) => a.shelfBelowId.localeCompare(b.shelfBelowId) || a.x - b.x || a.id.localeCompare(b.id))
        .map((w) => w.id)
        .join('|')
    if (order(next) !== order(plan)) return fail('Une cale ne peut pas passer par-dessus une autre.')
  }
  return finish(next)
}

/**
 * Modifie une propriété de l'étagère entière. Changer la hauteur garde la
 * tablette du haut collée au haut ; la largeur est libre (les tablettes suivent).
 */
export function setPlanProperty(plan: Plan, change: PlanChange): EditResult {
  const next = structuredClone(plan)

  if (change.property === 'name') {
    next.name = change.value.trim() || plan.name
    return { ok: true, plan: next }
  }
  if (change.property === 'framePlacement') {
    next.options.framePlacement = change.value
    return finish(next)
  }
  if (change.property === 'propagation') {
    next.options.propagation = change.value
    return { ok: true, plan: next }
  }

  const { mm } = change
  if (!Number.isInteger(mm) || mm < 0) return fail('La valeur doit être un nombre entier de mm positif ou nul.')
  if (mm === 0 && change.property !== 'wedgeClearance') return fail('La valeur doit être supérieure à 0.')

  switch (change.property) {
    case 'width':
      return setPlanSize(plan, { width: mm })
    case 'height':
      return setPlanSize(plan, { height: mm })
    case 'wedgeClearance':
      next.options.wedgeClearance = mm
      break
    case 'defaultWedgeThickness':
      next.options.defaultWedgeThickness = mm
      break
  }
  return finish(next)
}

/**
 * Change la largeur et/ou la hauteur du cadre en une seule fois (un seul contrôle de cohérence).
 * La tablette du haut reste collée au haut ; si la propagation est activée, les cales (largeur) et les
 * tablettes (hauteur) gardent leur position proportionnelle.
 */
export function setPlanSize(plan: Plan, size: { width?: number; height?: number }): EditResult {
  const { width, height } = size
  for (const value of [width, height]) {
    if (value !== undefined && (!Number.isInteger(value) || value <= 0)) {
      return fail('La valeur doit être un nombre entier de mm supérieur à 0.')
    }
  }
  const next = structuredClone(plan)
  if (width !== undefined) {
    next.width = width
    if (plan.options.propagation) propagateWidth(plan, next)
  }
  if (height !== undefined) {
    next.height = height
    if (plan.options.propagation) propagateHeight(plan, next)
    keepTopShelfFlush(next)
  }
  return finish(next)
}
