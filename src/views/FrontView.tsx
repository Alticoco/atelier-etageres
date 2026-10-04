import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { computeFrontRects } from '../model/layout'
import { getStages } from '../model/pieces'
import type { Plan } from '../model/types'
import { formatLength, type LengthUnit } from '../model/units'
import { cameraViewBox, fitCamera, panCamera, zoomCamera, type Camera, type Size } from './camera'

const FIT_PADDING_PX = 90
const DIM_OFFSET_PX = 40
const FONT_PX = 13
const WHEEL_SENSITIVITY = 0.0015
const BUTTON_ZOOM = 1.25
/** En dessous de ce déplacement (px), un appui est un clic et non un glisser. */
const CLICK_TOLERANCE_PX = 4

interface DimensionProps {
  x1: number
  y1: number
  x2: number
  y2: number
  label: string
  /** Mm du dessin par pixel écran : garde les textes et repères à taille constante à l'écran. */
  s: number
  /** Côté du texte par rapport à la ligne : 1 = dessous / droite, -1 = dessus / gauche. */
  side: 1 | -1
}

/** Ligne de cote avec repères aux extrémités et texte (horizontale ou verticale). */
function Dimension({ x1, y1, x2, y2, label, s, side }: DimensionProps) {
  const vertical = x1 === x2
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const tick = 5 * s
  const gap = 12 * s * side
  const tx = vertical ? mx + gap : mx
  const ty = vertical ? my : my + gap
  return (
    <g className="dim">
      <line x1={x1} y1={y1} x2={x2} y2={y2} vectorEffect="non-scaling-stroke" />
      {vertical ? (
        <>
          <line x1={x1 - tick} y1={y1} x2={x1 + tick} y2={y1} vectorEffect="non-scaling-stroke" />
          <line x1={x2 - tick} y1={y2} x2={x2 + tick} y2={y2} vectorEffect="non-scaling-stroke" />
        </>
      ) : (
        <>
          <line x1={x1} y1={y1 - tick} x2={x1} y2={y1 + tick} vectorEffect="non-scaling-stroke" />
          <line x1={x2} y1={y2 - tick} x2={x2} y2={y2 + tick} vectorEffect="non-scaling-stroke" />
        </>
      )}
      <text
        x={tx}
        y={ty}
        fontSize={FONT_PX * s}
        textAnchor="middle"
        dominantBaseline="central"
        transform={vertical ? `rotate(-90 ${tx} ${ty})` : undefined}
      >
        {label}
      </text>
    </g>
  )
}

interface FrontViewProps {
  plan: Plan
  unit?: LengthUnit
  selection?: string[]
  /** Clic sur une pièce ; `additive` = Ctrl, Maj ou Cmd enfoncé. */
  onSelectPiece?: (id: string, additive: boolean) => void
  /** Clic dans le vide. */
  onClearSelection?: () => void
}

/** Vue de face de l'étagère : pièces, cotes, zoom (molette) et déplacement (glisser). */
export function FrontView({ plan, unit = 'cm', selection = [], onSelectPiece, onClearSelection }: FrontViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ x: number; y: number; startX: number; startY: number; pieceId: string | null } | null>(null)
  const [size, setSize] = useState<Size | null>(null)
  // Tant que l'utilisateur n'a pas zoomé ni déplacé, la vue reste cadrée sur toute l'étagère.
  const [custom, setCustom] = useState<Camera | null>(null)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const fit =
    size && size.width > 0 && size.height > 0
      ? fitCamera({ x: 0, y: 0, width: plan.width, height: plan.height }, size, FIT_PADDING_PX)
      : null
  const camera = custom ?? fit

  const cameraRef = useRef(camera)
  useEffect(() => {
    cameraRef.current = camera
  })

  const updateCamera = useCallback((change: (c: Camera) => Camera) => {
    const current = cameraRef.current
    if (!current) return
    const next = change(current)
    cameraRef.current = next
    setCustom(next)
  }, [])

  const resetView = () => setCustom(null)

  // La molette doit empêcher le défilement de la page : écouteur non passif.
  useEffect(() => {
    const el = containerRef.current
    if (!el || !size) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const box = el.getBoundingClientRect()
      const focus = { x: e.clientX - box.left, y: e.clientY - box.top }
      updateCamera((c) => zoomCamera(c, Math.exp(-e.deltaY * WHEEL_SENSITIVITY), focus, size))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [size, updateCamera])

  const zoomFromCenter = (factor: number) => {
    if (size) updateCamera((c) => zoomCamera(c, factor, { x: size.width / 2, y: size.height / 2 }, size))
  }

  const onPointerDown = (e: React.PointerEvent) => {
    const pieceId = (e.target as Element).closest('[data-piece-id]')?.getAttribute('data-piece-id') ?? null
    dragRef.current = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, pieceId }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const last = dragRef.current
    if (!last) return
    const dx = e.clientX - last.x
    const dy = e.clientY - last.y
    dragRef.current = { ...last, x: e.clientX, y: e.clientY }
    updateCamera((c) => panCamera(c, dx, dy))
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag) return
    const moved = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY)
    if (moved > CLICK_TOLERANCE_PX) return
    const additive = e.ctrlKey || e.shiftKey || e.metaKey
    if (drag.pieceId) onSelectPiece?.(drag.pieceId, additive)
    else if (!additive) onClearSelection?.()
  }

  const H = plan.height
  const W = plan.width
  const rects = computeFrontRects(plan)
  const stages = getStages(plan)
  const s = camera?.s ?? 1
  const dimOffset = DIM_OFFSET_PX * s
  const viewBox = camera && size ? cameraViewBox(camera, size) : null

  return (
    <div className="front-view" ref={containerRef}>
      {viewBox && (
        <svg
          className="front-view-svg"
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (dragRef.current = null)}
          role="img"
          aria-label={`Vue de face de l'étagère : ${formatLength(W, unit)} de large, ${formatLength(H, unit)} de haut`}
        >
          {rects.map((r) => (
            <rect
              key={r.id}
              data-piece-id={r.id}
              className={`piece piece-${r.kind}${selection.includes(r.id) ? ' selected' : ''}`}
              x={r.x}
              y={H - r.y - r.height}
              width={r.width}
              height={r.height}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          <Dimension x1={0} y1={H + dimOffset} x2={W} y2={H + dimOffset} label={formatLength(W, unit)} s={s} side={1} />
          <Dimension x1={W + dimOffset} y1={0} x2={W + dimOffset} y2={H} label={formatLength(H, unit)} s={s} side={1} />
          {stages.map((stage) => {
            const top = H - (stage.y + stage.clearHeight)
            const bottom = H - stage.y
            return (
              <g key={stage.shelfBelowId}>
                <g className="dim dim-extension">
                  <line x1={0} y1={top} x2={-dimOffset - 5 * s} y2={top} vectorEffect="non-scaling-stroke" />
                  <line x1={0} y1={bottom} x2={-dimOffset - 5 * s} y2={bottom} vectorEffect="non-scaling-stroke" />
                </g>
                <Dimension
                  x1={-dimOffset}
                  y1={top}
                  x2={-dimOffset}
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

      <div className="view-controls">
        <button type="button" onClick={() => zoomFromCenter(BUTTON_ZOOM)} aria-label="Zoom avant" title="Zoom avant">
          +
        </button>
        <button type="button" onClick={() => zoomFromCenter(1 / BUTTON_ZOOM)} aria-label="Zoom arrière" title="Zoom arrière">
          −
        </button>
        <button type="button" onClick={resetView} title="Recadrer toute l'étagère">
          Tout voir
        </button>
      </div>
    </div>
  )
}
