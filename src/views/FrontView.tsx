import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { dragShelf, dragWedge, resizeFrame } from '../model/drag'
import { computeFrontRects } from '../model/layout'
import { getStages, sortedShelves } from '../model/pieces'
import type { Plan } from '../model/types'
import { formatLength, type LengthUnit } from '../model/units'
import type { EditorAction } from '../store/editor'
import { cameraViewBox, fitCamera, panCamera, zoomCamera, type Camera, type Size } from './camera'

const FIT_PADDING_PX = 90
const DIM_OFFSET_PX = 40
const FONT_PX = 13
const HANDLE_PX = 12
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

type Handle = 'right' | 'top' | 'corner'

/** Geste en cours. Toutes les positions de départ sont mémorisées : on calcule depuis le départ, sans dérive. */
type Gesture =
  | { kind: 'pan'; x: number; y: number; startX: number; startY: number; pieceId: string | null }
  | {
      kind: 'piece'
      pieceId: string
      pieceKind: 'shelf' | 'wedge'
      startX: number
      startY: number
      startValue: number
      scale: number
      active: boolean
    }
  | {
      kind: 'resize'
      handle: Handle
      startX: number
      startY: number
      startWidth: number
      startHeight: number
      scale: number
      active: boolean
    }

interface FrontViewProps {
  plan: Plan
  unit?: LengthUnit
  selection?: string[]
  /** Pas d'aimantation (mm) du glisser-déposer ; Alt maintenu = pas d'aimantation. */
  snapStep?: number
  /** Clic sur une pièce ; `additive` = Ctrl, Maj ou Cmd enfoncé. */
  onSelectPiece?: (id: string, additive: boolean) => void
  /** Clic dans le vide. */
  onClearSelection?: () => void
  /** Modification validée à la fin d'un glisser-déposer (une seule action par geste). */
  onChange?: (action: EditorAction) => void
}

/**
 * Vue de face de l'étagère : pièces, cotes, zoom (molette), déplacement de la vue (glisser sur le fond),
 * déplacement des tablettes et des cales, redimensionnement du cadre par ses bords.
 */
export function FrontView({
  plan,
  unit = 'cm',
  selection = [],
  snapStep = 10,
  onSelectPiece,
  onClearSelection,
  onChange,
}: FrontViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const gestureRef = useRef<Gesture | null>(null)
  const pendingRef = useRef<EditorAction | null>(null)
  const [size, setSize] = useState<Size | null>(null)
  // Tant que l'utilisateur n'a pas zoomé ni déplacé, la vue reste cadrée sur toute l'étagère.
  const [custom, setCustom] = useState<Camera | null>(null)
  // Plan « en cours de glisser » : affiché à la place du vrai plan jusqu'au relâchement.
  const [draft, setDraft] = useState<Plan | null>(null)

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
    const target = e.target as Element
    const scale = cameraRef.current?.s ?? 1
    const handle = target.closest('[data-handle]')?.getAttribute('data-handle') as Handle | null
    const pieceId = target.closest('[data-piece-id]')?.getAttribute('data-piece-id') ?? null
    const base = { startX: e.clientX, startY: e.clientY }

    if (handle) {
      // Le cadrage automatique ne doit pas « sauter » pendant qu'on redimensionne : on fige la vue.
      updateCamera((c) => c)
      gestureRef.current = { kind: 'resize', handle, ...base, startWidth: plan.width, startHeight: plan.height, scale, active: false }
    } else {
      const shelves = sortedShelves(plan)
      const shelfIndex = shelves.findIndex((s) => s.id === pieceId)
      const wedge = plan.wedges.find((w) => w.id === pieceId)
      if (pieceId && shelfIndex > 0 && shelfIndex < shelves.length - 1) {
        gestureRef.current = { kind: 'piece', pieceId, pieceKind: 'shelf', ...base, startValue: shelves[shelfIndex].y, scale, active: false }
      } else if (pieceId && wedge) {
        gestureRef.current = { kind: 'piece', pieceId, pieceKind: 'wedge', ...base, startValue: wedge.x, scale, active: false }
      } else {
        gestureRef.current = { kind: 'pan', x: e.clientX, y: e.clientY, ...base, pieceId }
      }
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gestureRef.current
    if (!g) return

    if (g.kind === 'pan') {
      const dx = e.clientX - g.x
      const dy = e.clientY - g.y
      gestureRef.current = { ...g, x: e.clientX, y: e.clientY }
      updateCamera((c) => panCamera(c, dx, dy))
      return
    }

    const dx = e.clientX - g.startX
    const dy = e.clientY - g.startY
    if (!g.active) {
      if (Math.hypot(dx, dy) <= CLICK_TOLERANCE_PX) return
      g.active = true
      if (g.kind === 'piece' && !selection.includes(g.pieceId)) onSelectPiece?.(g.pieceId, false)
    }

    const step = e.altKey ? null : snapStep
    if (g.kind === 'piece') {
      if (g.pieceKind === 'shelf') {
        const next = dragShelf(plan, g.pieceId, g.startValue - dy * g.scale, step)
        const y = next.shelves.find((s) => s.id === g.pieceId)!.y
        setDraft(next)
        pendingRef.current = { type: 'setPieceProperty', ids: [g.pieceId], property: 'y', mm: y }
      } else {
        const next = dragWedge(plan, g.pieceId, g.startValue + dx * g.scale, step)
        const x = next.wedges.find((w) => w.id === g.pieceId)!.x
        setDraft(next)
        pendingRef.current = { type: 'setPieceProperty', ids: [g.pieceId], property: 'x', mm: x }
      }
    } else {
      const raw: { width?: number; height?: number } = {}
      if (g.handle !== 'top') raw.width = g.startWidth + dx * g.scale
      if (g.handle !== 'right') raw.height = g.startHeight - dy * g.scale
      const next = resizeFrame(plan, raw, step)
      setDraft(next)
      pendingRef.current = { type: 'setPlanSize', width: next.width, height: next.height }
    }
  }

  const finishGesture = (e: React.PointerEvent | null) => {
    const g = gestureRef.current
    gestureRef.current = null
    const action = pendingRef.current
    pendingRef.current = null
    setDraft(null)
    if (!g || !e) return

    if (g.kind !== 'pan' && g.active) {
      if (action) onChange?.(action)
      return
    }
    // Pas de vrai glisser : c'est un clic.
    if (Math.hypot(e.clientX - g.startX, e.clientY - g.startY) > CLICK_TOLERANCE_PX) return
    const additive = e.ctrlKey || e.shiftKey || e.metaKey
    if (g.kind === 'resize') return
    const pieceId = g.pieceId
    if (pieceId) onSelectPiece?.(pieceId, additive)
    else if (!additive) onClearSelection?.()
  }

  const shown = draft ?? plan
  const H = shown.height
  const W = shown.width
  const rects = computeFrontRects(shown)
  const stages = getStages(shown)
  const shelfOrder = sortedShelves(shown).map((s) => s.id)
  const s = camera?.s ?? 1
  const dimOffset = DIM_OFFSET_PX * s
  const hs = HANDLE_PX * s
  const viewBox = camera && size ? cameraViewBox(camera, size) : null

  const movableClass = (kind: string, id: string) => {
    if (kind === 'wedge') return ' movable-x'
    const i = shelfOrder.indexOf(id)
    return kind === 'shelf' && i > 0 && i < shelfOrder.length - 1 ? ' movable-y' : ''
  }

  return (
    <div className="front-view" ref={containerRef}>
      {viewBox && (
        <svg
          className="front-view-svg"
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finishGesture}
          onPointerCancel={() => finishGesture(null)}
          role="img"
          aria-label={`Vue de face de l'étagère : ${formatLength(W, unit)} de large, ${formatLength(H, unit)} de haut`}
        >
          {rects.map((r) => (
            <rect
              key={r.id}
              data-piece-id={r.id}
              className={`piece piece-${r.kind}${selection.includes(r.id) ? ' selected' : ''}${movableClass(r.kind, r.id)}`}
              x={r.x}
              y={H - r.y - r.height}
              width={r.width}
              height={r.height}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          <g className="handles">
            <rect className="handle handle-right" data-handle="right" x={W} y={0} width={hs} height={H}>
              <title>Glisser pour changer la largeur</title>
            </rect>
            <rect className="handle handle-top" data-handle="top" x={0} y={-hs} width={W} height={hs}>
              <title>Glisser pour changer la hauteur</title>
            </rect>
            <rect className="handle handle-corner" data-handle="corner" x={W} y={-hs} width={hs} height={hs}>
              <title>Glisser pour changer la largeur et la hauteur</title>
            </rect>
          </g>

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
