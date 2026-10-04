import { useRef } from 'react'
import { getStages } from '../model/pieces'
import { computeProfileRects, profileSize } from '../model/profile'
import type { Plan } from '../model/types'
import { formatLength, type LengthUnit } from '../model/units'
import { panCamera } from './camera'
import { DIM_OFFSET_PX, Dimension } from './Dimension'
import { useViewport } from './useViewport'
import { ViewControls } from './ViewControls'

const WALL_PX = 14

interface ProfileViewProps {
  plan: Plan
  unit?: LengthUnit
  /** Pièces sélectionnées dans la vue de face : mises en évidence ici aussi. */
  selection?: string[]
}

/**
 * Vue de profil (lecture seule) depuis le côté gauche : le mur est à gauche, l'avant à droite.
 * Les pièces cachées par le montant du premier plan sont en pointillés. On peut zoomer et déplacer la vue.
 */
export function ProfileView({ plan, unit = 'cm', selection = [] }: ProfileViewProps) {
  const { width: depth, height } = profileSize(plan)
  const { containerRef, scale: s, viewBox, updateCamera, resetView, zoomIn, zoomOut } = useViewport(depth, height)
  const dragRef = useRef<{ x: number; y: number } | null>(null)

  const rects = computeProfileRects(plan)
  const visible = rects.filter((r) => !r.hidden)
  const hidden = rects.filter((r) => r.hidden)
  const stages = getStages(plan)
  const dimOffset = DIM_OFFSET_PX * s
  const wall = WALL_PX * s

  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const last = dragRef.current
    if (!last) return
    dragRef.current = { x: e.clientX, y: e.clientY }
    updateCamera((c) => panCamera(c, e.clientX - last.x, e.clientY - last.y))
  }
  const stopDrag = () => {
    dragRef.current = null
  }

  const rectProps = (r: (typeof rects)[number]) => ({
    className: `piece piece-${r.kind}${r.hidden ? ' piece-hidden' : ''}${selection.includes(r.id) ? ' selected' : ''}`,
    x: r.x,
    y: height - r.y - r.height,
    width: r.width,
    height: r.height,
    vectorEffect: 'non-scaling-stroke' as const,
  })

  return (
    <div className="front-view" ref={containerRef}>
      {viewBox && (
        <svg
          className="front-view-svg profile-svg"
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
          role="img"
          aria-label={`Vue de profil de l'étagère : ${formatLength(depth, unit)} de profondeur, ${formatLength(height, unit)} de haut`}
        >
          <rect className="wall" x={-wall} y={0} width={wall} height={height} vectorEffect="non-scaling-stroke" />
          <text
            className="wall-label"
            x={-wall / 2}
            y={height / 2}
            fontSize={11 * s}
            textAnchor="middle"
            dominantBaseline="central"
            transform={`rotate(-90 ${-wall / 2} ${height / 2})`}
          >
            Mur
          </text>

          {visible.map((r) => (
            <rect key={r.id} {...rectProps(r)} />
          ))}
          {hidden.map((r) => (
            <rect key={r.id} {...rectProps(r)} />
          ))}

          <Dimension x1={0} y1={height + dimOffset} x2={depth} y2={height + dimOffset} label={formatLength(depth, unit)} s={s} side={1} />
          <Dimension
            x1={depth + 2.2 * dimOffset}
            y1={0}
            x2={depth + 2.2 * dimOffset}
            y2={height}
            label={formatLength(height, unit)}
            s={s}
            side={1}
          />
          {stages.map((stage) => {
            const top = height - (stage.y + stage.clearHeight)
            const bottom = height - stage.y
            return (
              <g key={stage.shelfBelowId}>
                <g className="dim dim-extension">
                  <line x1={depth} y1={top} x2={depth + dimOffset + 5 * s} y2={top} vectorEffect="non-scaling-stroke" />
                  <line x1={depth} y1={bottom} x2={depth + dimOffset + 5 * s} y2={bottom} vectorEffect="non-scaling-stroke" />
                </g>
                <Dimension
                  x1={depth + dimOffset}
                  y1={top}
                  x2={depth + dimOffset}
                  y2={bottom}
                  label={formatLength(stage.clearHeight, unit)}
                  s={s}
                  side={-1}
                />
              </g>
            )
          })}
        </svg>
      )}

      <ViewControls onZoomIn={zoomIn} onZoomOut={zoomOut} onReset={resetView} />
    </div>
  )
}
