import { useRef, useState } from 'react'
import { dragDepth, dragShelf } from '../model/drag'
import { supportOverflow } from '../model/supports'
import { useSupportDrag } from './useSupportDrag'
import { getStages, sortedShelves } from '../model/pieces'
import { computeProfileRects, profileSize } from '../model/profile'
import { pickProfilePiece } from '../model/profilePick'
import type { Plan } from '../model/types'
import { formatLength, type LengthUnit } from '../model/units'
import type { EditorAction } from '../store/editor'
import { panCamera } from './camera'
import { DIM_OFFSET_PX, Dimension } from './Dimension'
import { fillStyle } from './colorStyle'
import { EditableDimension } from './EditableDimension'
import { useViewport } from './useViewport'
import { ViewControls } from './ViewControls'

const WALL_PX = 14
const HANDLE_PX = 12
/** Le mur dépasse l'étagère en haut et en bas d'au moins ça (mm), ou de 15 % de sa hauteur. */
const WALL_MARGIN_MM = 150
const WALL_MARGIN_RATIO = 0.15
const PICK_TOLERANCE_PX = 3
/** En dessous de ce déplacement (px), un appui est un clic et non un glisser. */
const CLICK_TOLERANCE_PX = 4

/** Geste en cours. Les positions de départ sont mémorisées : on calcule depuis le départ, sans dérive. */
type Gesture =
  | { kind: 'pan'; x: number; y: number; startX: number; startY: number; pieceId: string | null }
  | { kind: 'shelf'; pieceId: string; startX: number; startY: number; startY0: number; scale: number; active: boolean }
  | { kind: 'depth'; ids: string[]; startX: number; startY: number; startDepth: number; scale: number; active: boolean }

interface ProfileViewProps {
  plan: Plan
  unit?: LengthUnit
  /** Pièces sélectionnées (la sélection est partagée avec la vue de face). */
  selection?: string[]
  /** Pas d'aimantation (mm) ; Alt maintenu = pas d'aimantation. */
  snapStep?: number
  onSelectPiece?: (id: string, additive: boolean) => void
  onClearSelection?: () => void
  /** Modification validée à la fin d'un glisser (une seule action par geste). */
  onChange?: (action: EditorAction) => void
}

/**
 * Vue de profil depuis le côté gauche : le mur est à gauche, l'avant à droite. Les pièces cachées par le montant
 * du premier plan sont en pointillés. Un clic choisit la plus petite pièce sous le curseur ; tirer la barre au bout
 * d'une pièce sélectionnée change sa profondeur ; tirer une tablette la monte ou la descend.
 */
export function ProfileView({
  plan,
  unit = 'cm',
  selection = [],
  snapStep = 10,
  onSelectPiece,
  onClearSelection,
  onChange,
}: ProfileViewProps) {
  const { width: baseDepth, height } = profileSize(plan)
  const overflow = supportOverflow(plan)
  const wallMargin = Math.max(WALL_MARGIN_MM, Math.round(height * WALL_MARGIN_RATIO))
  const { containerRef, scale: s, viewBox, updateCamera, resetView, zoomIn, zoomOut } = useViewport(baseDepth, height, {
    right: overflow.front,
    top: overflow.above + wallMargin,
    bottom: overflow.below + wallMargin,
  })
  const gestureRef = useRef<Gesture | null>(null)
  const pendingRef = useRef<EditorAction | null>(null)
  // Plan « en cours de glisser » : affiché à la place du vrai plan jusqu'au relâchement.
  const [draft, setDraft] = useState<Plan | null>(null)
  const supportDrag = useSupportDrag({
    plan,
    scale: s,
    snapStep,
    mapping: (dx, dy, start) => ({ z: start.z + dx, y: start.y - dy }),
    onChange,
    onSelect: onSelectPiece,
    isSelected: (id) => selection.includes(id),
  })

  const shown = draft ?? supportDrag.draft ?? plan
  const depth = profileSize(shown).width
  const rects = computeProfileRects(shown)
  const visible = rects.filter((r) => !r.hidden)
  const hidden = rects.filter((r) => r.hidden)
  const stages = getStages(shown)
  const dimOffset = DIM_OFFSET_PX * s
  const wall = WALL_PX * s
  const hs = HANDLE_PX * s
  const selected = new Set(selection)

  const onPointerDown = (e: React.PointerEvent) => {
    if (!viewBox) return
    if ((e.target as Element).closest('[data-dim-edit]')) return
    const base = { startX: e.clientX, startY: e.clientY }
    const handle = (e.target as Element).closest('[data-handle-piece]')?.getAttribute('data-handle-piece')
    const supportId = (e.target as Element).closest('[data-support-id]')?.getAttribute('data-support-id')
    if (supportId && supportDrag.begin(e, supportId)) {
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }

    if (handle) {
      // Le cadrage automatique ne doit pas « sauter » pendant qu'on change la profondeur : on fige la vue.
      updateCamera((c) => c)
      const ids = selection.includes(handle) ? selection : [handle]
      const startDepth = rects.find((r) => r.id === handle)?.width ?? 0
      gestureRef.current = { kind: 'depth', ids, ...base, startDepth, scale: s, active: false }
    } else {
      // Point du dessin sous le curseur : x = profondeur, y = hauteur depuis le dessous du cadre.
      const box = e.currentTarget.getBoundingClientRect()
      const ratio = viewBox.width / box.width
      const wx = viewBox.x + (e.clientX - box.left) * ratio
      const wy = plan.height - (viewBox.y + (e.clientY - box.top) * ratio)
      const pieceId = pickProfilePiece(plan, wx, wy, PICK_TOLERANCE_PX * s)
      const shelves = sortedShelves(plan)
      const shelfIndex = shelves.findIndex((sh) => sh.id === pieceId)
      if (pieceId && shelfIndex > 0 && shelfIndex < shelves.length - 1) {
        gestureRef.current = { kind: 'shelf', pieceId, ...base, startY0: shelves[shelfIndex].y, scale: s, active: false }
      } else {
        gestureRef.current = { kind: 'pan', x: e.clientX, y: e.clientY, ...base, pieceId }
      }
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (supportDrag.move(e)) return
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
      if (g.kind === 'shelf' && !selection.includes(g.pieceId)) onSelectPiece?.(g.pieceId, false)
    }

    const step = e.altKey ? null : snapStep
    if (g.kind === 'shelf') {
      const next = dragShelf(plan, g.pieceId, g.startY0 - dy * g.scale, step)
      const y = next.shelves.find((sh) => sh.id === g.pieceId)!.y
      setDraft(next)
      pendingRef.current = { type: 'setPieceProperty', ids: [g.pieceId], property: 'y', mm: y }
    } else {
      const result = dragDepth(plan, g.ids, g.startDepth, g.startDepth + dx * g.scale, step)
      if (!result) return
      setDraft(result.plan)
      pendingRef.current = { type: 'setPieceProperty', ids: g.ids, property: 'depth', mm: result.mm }
    }
  }

  const finishGesture = (e: React.PointerEvent | null) => {
    if (supportDrag.end(e)) return
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
    if (g.kind === 'depth') return
    const additive = e.ctrlKey || e.shiftKey || e.metaKey
    if (g.pieceId) onSelectPiece?.(g.pieceId, additive)
    else if (!additive) onClearSelection?.()
  }

  const rectProps = (r: (typeof rects)[number]) => ({
    'data-piece-id': r.id,
    className: `piece piece-${r.kind}${r.hidden ? ' piece-hidden' : ''}${selected.has(r.id) ? ' selected' : ''}`,
    x: r.x,
    y: height - r.y - r.height,
    width: r.width,
    height: r.height,
    rx: r.radius,
    ry: r.radius,
    // Une pièce cachée est en pointillés, sans remplissage : pas de couleur.
    style: r.hidden ? undefined : fillStyle(shown, r.id, r.kind),
    vectorEffect: 'non-scaling-stroke' as const,
  })

  const H = shown.height

  return (
    <div className="front-view" ref={containerRef}>
      {viewBox && (
        <svg
          className="front-view-svg profile-svg"
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finishGesture}
          onPointerCancel={() => finishGesture(null)}
          role="img"
          aria-label={`Vue de profil de l'étagère : ${formatLength(depth, unit)} de profondeur, ${formatLength(H, unit)} de haut`}
        >
          <rect
            className="wall"
            style={fillStyle(shown, 'wall', 'wall')}
            x={-wall}
            y={-(overflow.above + wallMargin)}
            width={wall}
            height={height + overflow.above + overflow.below + 2 * wallMargin}
            vectorEffect="non-scaling-stroke"
          />
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

          {(shown.supports ?? []).map((sp) => (
            <rect
              key={sp.id}
              data-support-id={sp.id}
              className={`piece piece-support movable-x movable-y${selected.has(sp.id) ? ' selected' : ''}`}
              x={sp.z}
              y={height - sp.y - sp.height}
              width={sp.depth}
              height={sp.height}
              style={fillStyle(shown, sp.id, 'support')}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {(shown.supports ?? [])
            .filter((sp) => selected.has(sp.id))
            .flatMap((sp) => {
              const yMid = height - sp.y - sp.height / 2
              const gapBack = sp.z
              const gapFront = depth - (sp.z + sp.depth)
              return [
                gapBack > 0 && (
                  <Dimension key={`${sp.id}-back`} x1={0} y1={yMid} x2={sp.z} y2={yMid} label={formatLength(gapBack, unit)} s={s} side={-1} />
                ),
                gapFront > 0 && (
                  <Dimension key={`${sp.id}-front`} x1={sp.z + sp.depth} y1={yMid} x2={depth} y2={yMid} label={formatLength(gapFront, unit)} s={s} side={-1} />
                ),
              ]
            })}

          {/* Poignée de profondeur : une barre juste devant le bord avant de chaque pièce sélectionnée. */}
          <g className="handles">
            {rects
              .filter((r) => selected.has(r.id))
              .map((r) => (
                <rect
                  key={r.id}
                  className="handle handle-depth"
                  data-handle-piece={r.id}
                  x={r.width}
                  y={H - r.y - r.height}
                  width={hs}
                  height={r.height}
                >
                  <title>Glisser pour changer la profondeur</title>
                </rect>
              ))}
          </g>

          <EditableDimension
            x1={0}
            y1={H + dimOffset}
            x2={depth}
            y2={H + dimOffset}
            valueMm={depth}
            unit={unit}
            label={formatLength(depth, unit)}
            s={s}
            side={1}
            onCommit={(mm) => onChange?.({ type: 'setPlanProperty', change: { property: 'depth', mm } })}
          />
          <EditableDimension
            x1={depth + 2.2 * dimOffset}
            y1={0}
            x2={depth + 2.2 * dimOffset}
            y2={H}
            valueMm={H}
            unit={unit}
            label={formatLength(H, unit)}
            s={s}
            side={1}
            onCommit={(mm) => onChange?.({ type: 'setPlanProperty', change: { property: 'height', mm } })}
          />
          {stages.map((stage) => {
            const top = H - (stage.y + stage.clearHeight)
            const bottom = H - stage.y
            return (
              <g key={stage.shelfBelowId}>
                <g className="dim dim-extension">
                  <line x1={depth} y1={top} x2={depth + dimOffset + 5 * s} y2={top} vectorEffect="non-scaling-stroke" />
                  <line x1={depth} y1={bottom} x2={depth + dimOffset + 5 * s} y2={bottom} vectorEffect="non-scaling-stroke" />
                </g>
                <EditableDimension
                  x1={depth + dimOffset}
                  y1={top}
                  x2={depth + dimOffset}
                  y2={bottom}
                  valueMm={stage.clearHeight}
                  unit={unit}
                  label={formatLength(stage.clearHeight, unit)}
                  s={s}
                  side={-1}
                  onCommit={(mm) => onChange?.({ type: 'setStageHeight', shelfBelowId: stage.shelfBelowId, mm })}
                />
              </g>
            )
          })}
        </svg>
      )}

      <p className="view-hint">
        Cliquez une pièce pour la choisir (la plus petite sous le curseur). Tirez la barre au bout d’une pièce choisie pour
        changer sa profondeur, ou tirez une tablette pour la monter / descendre.
      </p>
      <ViewControls onZoomIn={zoomIn} onZoomOut={zoomOut} onReset={resetView} />
    </div>
  )
}
