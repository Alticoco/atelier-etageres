import { useRef } from 'react'
import { shelfEnd, shelfFootprintPath } from '../model/joints'
import { computeFrontRects } from '../model/layout'
import { profileSize } from '../model/profile'
import { supportOverflow } from '../model/supports'
import type { Plan } from '../model/types'
import { formatLength, type LengthUnit } from '../model/units'
import type { EditorAction } from '../store/editor'
import { panCamera } from './camera'
import { DIM_OFFSET_PX, Dimension } from './Dimension'
import { fillStyle } from './colorStyle'
import { GuideLine } from './GuideLine'
import { EditableDimension } from './EditableDimension'
import { useSupportDrag } from './useSupportDrag'
import { useViewport } from './useViewport'
import { ViewControls } from './ViewControls'

const WALL_PX = 14
const CLICK_TOLERANCE_PX = 4

interface BottomViewProps {
  plan: Plan
  unit?: LengthUnit
  selection?: string[]
  snapStep?: number
  onSelectPiece?: (id: string, additive: boolean) => void
  onClearSelection?: () => void
  onChange?: (action: EditorAction) => void
}

/**
 * Vue de dessous : l'étagère vue du sol, mur en haut, gauche et droite comme en vue de face. On y place les
 * supports (largeur et recul depuis le mur) : tirer un support le déplace, il s'aimante contre le mur, l'avant
 * et les bords de l'étagère.
 */
export function BottomView({ plan, unit = 'cm', selection = [], snapStep = 10, onSelectPiece, onClearSelection, onChange }: BottomViewProps) {
  const depth = profileSize(plan).width
  const overflow = supportOverflow(plan)
  const { containerRef, scale: s, viewBox, updateCamera, resetView, zoomIn, zoomOut } = useViewport(plan.width, depth, {
    left: overflow.left,
    right: overflow.right,
    bottom: overflow.front,
  })
  const panRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null)
  const supportDrag = useSupportDrag({
    plan,
    scale: s,
    snapStep,
    mapping: (dx, dy, start) => ({ x: start.x + dx, z: start.z + dy }),
    onChange,
    onSelect: onSelectPiece,
    isSelected: (id) => selection.includes(id),
  })

  const shown = supportDrag.draft ?? plan
  const supports = shown.supports ?? []
  const front = computeFrontRects(shown)
  const lowestShelf = front.filter((r) => r.kind === 'shelf').sort((a, b) => a.y - b.y)[0]
  const uprights = front.filter((r) => r.kind === 'upright')
  const selected = new Set(selection)
  const wall = WALL_PX * s
  const dimOffset = DIM_OFFSET_PX * s

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as Element).closest('[data-dim-edit]')) return
    const id = (e.target as Element).closest('[data-support-id]')?.getAttribute('data-support-id')
    if (id && supportDrag.begin(e, id)) {
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }
    panRef.current = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (supportDrag.move(e)) return
    const pan = panRef.current
    if (!pan) return
    const dx = e.clientX - pan.x
    const dy = e.clientY - pan.y
    panRef.current = { ...pan, x: e.clientX, y: e.clientY }
    updateCamera((c) => panCamera(c, dx, dy))
  }

  const finish = (e: React.PointerEvent | null) => {
    if (supportDrag.end(e)) return
    const pan = panRef.current
    panRef.current = null
    if (pan && e && Math.hypot(e.clientX - pan.startX, e.clientY - pan.startY) <= CLICK_TOLERANCE_PX && !(e.ctrlKey || e.shiftKey || e.metaKey)) {
      onClearSelection?.()
    }
  }

  return (
    <div className="front-view" ref={containerRef}>
      {viewBox && (
        <svg
          className="front-view-svg bottom-svg"
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finish}
          onPointerCancel={() => finish(null)}
          role="img"
          aria-label={`Vue de dessous de l'étagère : ${formatLength(plan.width, unit)} de large, ${formatLength(depth, unit)} de profondeur`}
        >
          <rect className="wall" style={fillStyle(shown, 'wall', 'wall')} x={-overflow.left - wall} y={-wall} width={plan.width + overflow.left + overflow.right + 2 * wall} height={wall} vectorEffect="non-scaling-stroke" />
          <text className="wall-label" x={plan.width / 2} y={-wall / 2} fontSize={11 * s} textAnchor="middle" dominantBaseline="central">
            Mur
          </text>

          {/* Les montants sont cachés par la tablette du bas : traits pointillés. */}
          {uprights.map((r) => (
            <rect key={r.id} className="piece piece-upright piece-hidden" x={r.x} y={0} width={r.width} height={r.depth} vectorEffect="non-scaling-stroke" />
          ))}
          {lowestShelf && (
            <path
              className="piece piece-shelf"
              style={fillStyle(shown, lowestShelf.id, 'shelf')}
              d={shelfFootprintPath(lowestShelf.x, lowestShelf.width, lowestShelf.depth, shelfEnd(shown, 'left'), shelfEnd(shown, 'right'))}
              vectorEffect="non-scaling-stroke"
            />
          )}

          {supports.map((sp) => (
            <rect
              key={sp.id}
              data-support-id={sp.id}
              className={`piece piece-support movable-x movable-y${selected.has(sp.id) ? ' selected' : ''}`}
              x={sp.x}
              y={sp.z}
              width={sp.width}
              height={sp.depth}
              style={fillStyle(shown, sp.id, 'support')}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {supports
            .filter((sp) => selected.has(sp.id))
            .flatMap((sp) => {
              const xMid = sp.x + sp.width / 2
              const gapFront = depth - (sp.z + sp.depth)
              return [
                sp.z > 0 && <Dimension key={`${sp.id}-back`} x1={xMid} y1={0} x2={xMid} y2={sp.z} label={formatLength(sp.z, unit)} s={s} side={1} />,
                gapFront > 0 && (
                  <Dimension key={`${sp.id}-front`} x1={xMid} y1={sp.z + sp.depth} x2={xMid} y2={depth} label={formatLength(gapFront, unit)} s={s} side={1} />
                ),
              ]
            })}

          {supportDrag.guides.x && (
            <GuideLine
              x1={supportDrag.guides.x.pos + supportDrag.guides.x.size / 2}
              y1={0}
              x2={supportDrag.guides.x.pos + supportDrag.guides.x.size / 2}
              y2={depth + overflow.front}
              label={supportDrag.guides.x.label}
              s={s}
            />
          )}
          {supportDrag.guides.z && (
            <GuideLine
              x1={0}
              y1={supportDrag.guides.z.pos + supportDrag.guides.z.size / 2}
              x2={plan.width}
              y2={supportDrag.guides.z.pos + supportDrag.guides.z.size / 2}
              label={supportDrag.guides.z.label}
              s={s}
            />
          )}

          <EditableDimension
            x1={0}
            y1={depth + dimOffset}
            x2={plan.width}
            y2={depth + dimOffset}
            valueMm={plan.width}
            unit={unit}
            label={formatLength(plan.width, unit)}
            s={s}
            side={1}
            onCommit={(mm) => onChange?.({ type: 'setPlanProperty', change: { property: 'width', mm } })}
          />
          <EditableDimension
            x1={plan.width + dimOffset}
            y1={0}
            x2={plan.width + dimOffset}
            y2={depth}
            valueMm={depth}
            unit={unit}
            label={formatLength(depth, unit)}
            s={s}
            side={1}
            onCommit={(mm) => onChange?.({ type: 'setPlanProperty', change: { property: 'depth', mm } })}
          />
        </svg>
      )}

      <p className="view-hint">
        Vue du sol, mur en haut. Tirez un support pour le placer : il s’aimante contre le mur, l’avant et les bords (Alt pour
        désactiver). Les valeurs exactes sont dans le panneau de droite.
      </p>
      <ViewControls onZoomIn={zoomIn} onZoomOut={zoomOut} onReset={resetView} />
    </div>
  )
}
