import { bodyEdges } from './geometry'
import { shelfLength, shelfX, sortedShelves, stageVerticals, uprightLength, wedgeLength } from './pieces'
import type { PieceKind, Plan } from './types'

/** Rectangle d'une pièce vue de face, dans le repère du plan (y vers le haut, en mm). */
export interface Rect {
  id: string
  kind: PieceKind
  x: number
  y: number
  width: number
  height: number
  /** Profondeur de la pièce (vue de profil). */
  depth: number
  /** Arrondis de la pièce, en mm (voir `Shelf.cornerRadius`). */
  cornerRadius: number
  edgeRadius: number
}

/** Position de chaque pièce dans la vue de face : montants, tablettes, cales. */
export function computeFrontRects(plan: Plan): Rect[] {
  const shelves = sortedShelves(plan)
  const lastIndex = shelves.length - 1
  const { leftUpright, rightUpright, options } = plan
  const rects: Rect[] = []

  if (plan.model === 'frameless') {
    for (const v of stageVerticals(plan)) {
      rects.push({
        id: v.id,
        kind: 'upright',
        x: v.x,
        y: v.y,
        width: v.thickness,
        height: v.height,
        depth: v.depth,
        cornerRadius: v.cornerRadius,
        edgeRadius: v.edgeRadius,
      })
    }
  } else {
    const onTop = options.framePlacement === 'onTop'
    const uprightY = onTop ? (shelves[0]?.thickness ?? 0) : 0
    const uprightHeight = uprightLength(plan)
    rects.push(
      {
        id: 'upright-left',
        kind: 'upright',
        x: bodyEdges(plan).left,
        y: uprightY,
        width: leftUpright.thickness,
        height: uprightHeight,
        depth: leftUpright.depth,
        cornerRadius: leftUpright.cornerRadius,
        edgeRadius: leftUpright.edgeRadius,
      },
      {
        id: 'upright-right',
        kind: 'upright',
        x: bodyEdges(plan).right - rightUpright.thickness,
        y: uprightY,
        width: rightUpright.thickness,
        height: uprightHeight,
        depth: rightUpright.depth,
        cornerRadius: rightUpright.cornerRadius,
        edgeRadius: rightUpright.edgeRadius,
      },
    )
  }

  shelves.forEach((shelf, i) => {
    const isOuter = i === 0 || i === lastIndex
    rects.push({
      id: shelf.id,
      kind: 'shelf',
      x: shelfX(plan, shelf, isOuter),
      y: shelf.y,
      width: shelfLength(plan, shelf, isOuter),
      height: shelf.thickness,
      depth: shelf.depth,
      cornerRadius: shelf.cornerRadius,
      edgeRadius: shelf.edgeRadius,
    })
  })

  const stageBottom = new Map(shelves.map((s) => [s.id, s.y + s.thickness]))
  for (const wedge of plan.wedges) {
    rects.push({
      id: wedge.id,
      kind: 'wedge',
      x: wedge.x,
      y: stageBottom.get(wedge.shelfBelowId) ?? 0,
      width: wedge.thickness,
      height: wedgeLength(plan, wedge),
      depth: wedge.depth,
      cornerRadius: wedge.cornerRadius,
      edgeRadius: wedge.edgeRadius,
    })
  }

  return rects
}
