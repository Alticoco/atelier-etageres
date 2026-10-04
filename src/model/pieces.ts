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
      clearHeight: above.y - (below.y + below.thickness),
    })
  }
  return stages
}

/** Longueur d'une tablette : entre les montants, ou pleine largeur si elle est posée dessus/dessous. */
function shelfLength(plan: Plan, isOuter: boolean): number {
  if (isOuter && plan.options.framePlacement === 'onTop') return plan.width
  return plan.width - plan.leftUpright.thickness - plan.rightUpright.thickness
}

/** Hauteur d'un montant : raccourcie des tablettes extrêmes si elles sont posées dessus/dessous. */
function uprightLength(plan: Plan): number {
  if (plan.options.framePlacement === 'between') return plan.height
  const shelves = sortedShelves(plan)
  const bottom = shelves[0]
  const top = shelves[shelves.length - 1]
  return plan.height - (bottom?.thickness ?? 0) - (top?.thickness ?? 0)
}

/**
 * Hauteur d'une cale : hauteur libre de l'étage moins le jeu.
 * Peut être négative si le plan est incohérent ; c'est aux contrôles de cohérence (étape 6) de l'empêcher.
 */
export function wedgeLength(plan: Plan, wedge: Wedge): number {
  const stage = getStages(plan).find((s) => s.shelfBelowId === wedge.shelfBelowId)
  if (!stage) {
    throw new Error(`La cale ${wedge.id} référence une tablette inconnue : ${wedge.shelfBelowId}`)
  }
  return stage.clearHeight - plan.options.wedgeClearance
}

/** Toutes les pièces à découper : 2 montants, les tablettes, les cales. */
export function computePieces(plan: Plan): Piece[] {
  const shelves = sortedShelves(plan)
  const lastIndex = shelves.length - 1

  const pieces: Piece[] = [
    {
      id: 'upright-left',
      kind: 'upright',
      length: uprightLength(plan),
      width: plan.leftUpright.depth,
      thickness: plan.leftUpright.thickness,
    },
    {
      id: 'upright-right',
      kind: 'upright',
      length: uprightLength(plan),
      width: plan.rightUpright.depth,
      thickness: plan.rightUpright.thickness,
    },
  ]

  shelves.forEach((shelf, i) => {
    pieces.push({
      id: shelf.id,
      kind: 'shelf',
      length: shelfLength(plan, i === 0 || i === lastIndex),
      width: shelf.depth,
      thickness: shelf.thickness,
    })
  })

  for (const wedge of plan.wedges) {
    pieces.push({
      id: wedge.id,
      kind: 'wedge',
      length: wedgeLength(plan, wedge),
      width: wedge.depth,
      thickness: wedge.thickness,
    })
  }

  return pieces
}
