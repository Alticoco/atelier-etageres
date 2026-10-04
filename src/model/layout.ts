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
}

/** Position de chaque pièce dans la vue de face : montants, tablettes, cales. */
export function computeFrontRects(plan: Plan): Rect[] {
  const shelves = sortedShelves(plan)
  const lastIndex = shelves.length - 1
  const { leftUpright, rightUpright, options } = plan
  const rects: Rect[] = []

  if (plan.model === 'frameless') {
    for (const v of stageVerticals(plan)) {
      rects.push({ id: v.id, kind: 'upright', x: v.x, y: v.y, width: v.thickness, height: v.height })
    }
  } else {
    const onTop = options.framePlacement === 'onTop'
    const uprightY = onTop ? (shelves[0]?.thickness ?? 0) : 0
    const uprightHeight = uprightLength(plan)
    rects.push(
      { id: 'upright-left', kind: 'upright', x: 0, y: uprightY, width: leftUpright.thickness, height: uprightHeight },
      {
        id: 'upright-right',
        kind: 'upright',
        x: plan.width - rightUpright.thickness,
        y: uprightY,
        width: rightUpright.thickness,
        height: uprightHeight,
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
    })
  }

  return rects
}
