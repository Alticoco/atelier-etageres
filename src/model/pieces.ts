import { bodyEdges } from './geometry'
import { isNotched, shelfEnd, shelfNotches, uprightNotches } from './joints'
import type { Piece, Plan, Shelf, Stage, Wedge } from './types'

/** Tablettes triées de bas en haut. */
export function sortedShelves(plan: Plan): Shelf[] {
  return [...plan.shelves].sort((a, b) => a.y - b.y)
}

/** Étages du plan, de bas en haut. */
export function getStages(plan: Plan): Stage[] {
  const shelves = sortedShelves(plan)
  const stages: Stage[] = []
  for (let i = 0; i < shelves.length - 1; i++) {
    const below = shelves[i]
    const above = shelves[i + 1]
    stages.push({
      shelfBelowId: below.id,
      shelfAboveId: above.id,
      y: below.y + below.thickness,
      clearHeight: above.y - (below.y + below.thickness),
    })
  }
  return stages
}

/**
 * Longueur d'une tablette.
 * `frame` : entre les montants, ou pleine largeur si elle est posée dessus/dessous.
 * `frameless` : le corps (entre les faces extérieures des montants) plus ses deux débords.
 */
export function shelfLength(plan: Plan, shelf: Shelf, isOuter: boolean): number {
  if (plan.model === 'frameless') {
    const body = bodyEdges(plan)
    return body.right - body.left + shelf.overhangLeft + shelf.overhangRight
  }
  if (isOuter && plan.options.framePlacement === 'onTop') return plan.width
  // Un côté à encoches : la tablette traverse le montant et va jusqu'au bout qui dépasse.
  const start = isNotched(plan, 'left') ? 0 : plan.leftUpright.thickness
  const end = isNotched(plan, 'right') ? plan.width : plan.width - plan.rightUpright.thickness
  return end - start
}

/** Position du bord gauche d'une tablette (mm depuis le bord gauche hors-tout). */
export function shelfX(plan: Plan, shelf: Shelf, isOuter: boolean): number {
  if (plan.model === 'frameless') return bodyEdges(plan).left - shelf.overhangLeft
  if (isOuter && plan.options.framePlacement === 'onTop') return 0
  return isNotched(plan, 'left') ? 0 : plan.leftUpright.thickness
}

/** Hauteur d'un montant (modèle `frame`) : raccourcie des tablettes extrêmes si elles sont posées dessus/dessous. */
export function uprightLength(plan: Plan): number {
  if (plan.options.framePlacement === 'between') return plan.height
  const shelves = sortedShelves(plan)
  const bottom = shelves[0]
  const top = shelves[shelves.length - 1]
  return plan.height - (bottom?.thickness ?? 0) - (top?.thickness ?? 0)
}

/** Montant d'un étage (modèle `frameless`) : coupé à la hauteur libre de l'étage. */
export interface Vertical {
  id: string
  side: 'left' | 'right'
  /** Tablette située sous l'étage où se trouve ce montant. */
  shelfBelowId: string
  x: number
  y: number
  height: number
  thickness: number
  depth: number
  cornerRadius: number
  edgeRadius: number
}

/** Montants du modèle sans cadre, étage par étage de bas en haut, gauche puis droite. Vide pour le modèle `frame`. */
export function stageVerticals(plan: Plan): Vertical[] {
  if (plan.model !== 'frameless') return []
  const body = bodyEdges(plan)
  const shelvesById = new Map(plan.shelves.map((s) => [s.id, s]))
  const result: Vertical[] = []
  for (const stage of getStages(plan)) {
    const shelf = shelvesById.get(stage.shelfBelowId)!
    if (shelf.verticalLeft) {
      result.push({
        id: `vertical-left-${shelf.id}`,
        side: 'left',
        shelfBelowId: shelf.id,
        x: body.left,
        y: stage.y,
        height: stage.clearHeight,
        thickness: plan.leftUpright.thickness,
        depth: plan.leftUpright.depth,
        cornerRadius: plan.leftUpright.cornerRadius,
        edgeRadius: plan.leftUpright.edgeRadius,
      })
    }
    if (shelf.verticalRight) {
      result.push({
        id: `vertical-right-${shelf.id}`,
        side: 'right',
        shelfBelowId: shelf.id,
        x: body.right - plan.rightUpright.thickness,
        y: stage.y,
        height: stage.clearHeight,
        thickness: plan.rightUpright.thickness,
        depth: plan.rightUpright.depth,
        cornerRadius: plan.rightUpright.cornerRadius,
        edgeRadius: plan.rightUpright.edgeRadius,
      })
    }
  }
  return result
}

/** Identifiants de tous les montants du plan (2 pour `frame`, jusqu'à 2 par étage pour `frameless`). */
export function uprightIds(plan: Plan): string[] {
  return plan.model === 'frameless' ? stageVerticals(plan).map((v) => v.id) : ['upright-left', 'upright-right']
}

/** Identifiants de toutes les pièces du plan. */
export function pieceIds(plan: Plan): string[] {
  return [...uprightIds(plan), ...sortedShelves(plan).map((s) => s.id), ...plan.wedges.map((w) => w.id)]
}

/**
 * Hauteur d'une cale : hauteur libre de l'étage moins le jeu.
 * Peut être négative si le plan est incohérent ; c'est aux contrôles de cohérence de l'empêcher.
 */
export function wedgeLength(plan: Plan, wedge: Wedge): number {
  const stage = getStages(plan).find((s) => s.shelfBelowId === wedge.shelfBelowId)
  if (!stage) {
    throw new Error(`La cale ${wedge.id} référence une tablette inconnue : ${wedge.shelfBelowId}`)
  }
  return stage.clearHeight - plan.options.wedgeClearance
}

/** `{ [key]: value }` si la valeur existe, sinon rien : évite d'ajouter des champs « undefined » aux pièces. */
function optional<K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } {
  return value === undefined ? {} : ({ [key]: value } as { [P in K]?: V })
}

/** Toutes les pièces à découper : les montants, les tablettes, les cales. */
export function computePieces(plan: Plan): Piece[] {
  const shelves = sortedShelves(plan)
  const lastIndex = shelves.length - 1
  const pieces: Piece[] = []

  if (plan.model === 'frameless') {
    for (const v of stageVerticals(plan)) {
      pieces.push({
        id: v.id,
        kind: 'upright',
        length: v.height,
        width: v.depth,
        thickness: v.thickness,
        cornerRadius: v.cornerRadius,
        edgeRadius: v.edgeRadius,
      })
    }
  } else {
    pieces.push(
      {
        id: 'upright-left',
        kind: 'upright',
        length: uprightLength(plan),
        width: plan.leftUpright.depth,
        thickness: plan.leftUpright.thickness,
        cornerRadius: plan.leftUpright.cornerRadius,
        edgeRadius: plan.leftUpright.edgeRadius,
        ...optional('notches', uprightNotches(plan, 'left', shelves)),
      },
      {
        id: 'upright-right',
        kind: 'upright',
        length: uprightLength(plan),
        width: plan.rightUpright.depth,
        thickness: plan.rightUpright.thickness,
        cornerRadius: plan.rightUpright.cornerRadius,
        edgeRadius: plan.rightUpright.edgeRadius,
        ...optional('notches', uprightNotches(plan, 'right', shelves)),
      },
    )
  }

  shelves.forEach((shelf, i) => {
    pieces.push({
      id: shelf.id,
      kind: 'shelf',
      length: shelfLength(plan, shelf, i === 0 || i === lastIndex),
      width: shelf.depth,
      thickness: shelf.thickness,
      cornerRadius: shelf.cornerRadius,
      edgeRadius: shelf.edgeRadius,
      ...optional('notches', shelfNotches(plan, shelf, i === 0 || i === lastIndex)),
      ...optional('endLeft', shelfEnd(plan, 'left')),
      ...optional('endRight', shelfEnd(plan, 'right')),
    })
  })

  for (const wedge of plan.wedges) {
    pieces.push({
      id: wedge.id,
      kind: 'wedge',
      length: wedgeLength(plan, wedge),
      width: wedge.depth,
      thickness: wedge.thickness,
      cornerRadius: wedge.cornerRadius,
      edgeRadius: wedge.edgeRadius,
    })
  }

  return pieces
}
