import { useEffect, useMemo, useRef, useState } from 'react'
import { computeCutList } from '../model/cutlist'
import { isObjectId, layoutStage, objectCornerRadius } from '../model/objects'
import { frontRects } from '../model/fronts'
import { supportOverflow } from '../model/supports'
import { useSupportDrag } from './useSupportDrag'
import { dragObjectToStage, dragShelfWithGuide, dragUpright, dragWedgeToStage, resizeFrame } from '../model/drag'
import { computeFrontRects } from '../model/layout'
import { getStages, sortedShelves } from '../model/pieces'
import { contextMenuItems, type MenuItem } from '../model/contextMenu'
import { isNotched, jointOf } from '../model/joints'
import { liveDimensions, mainDimension, typedTarget } from '../model/liveDimensions'
import { typedChar } from '../model/typedKey'
import type { Plan } from '../model/types'
import { formatLength, parseLength, type LengthUnit } from '../model/units'
import type { EditorAction } from '../store/editor'
import { panCamera } from './camera'
import { DIM_OFFSET_PX, LiveDimension } from './Dimension'
import { findDrawnObject, type Guide } from '../model/guides'
import { fillStyle } from './colorStyle'
import { GuideLine } from './GuideLine'
import { EditableDimension } from './EditableDimension'
import { useViewport } from './useViewport'
import { ViewControls } from './ViewControls'

const HANDLE_PX = 12
/** En dessous de ce déplacement (px), un appui est un clic et non un glisser. */
const CLICK_TOLERANCE_PX = 4

type Handle = 'right' | 'top' | 'corner'

/** Geste en cours. Toutes les positions de départ sont mémorisées : on calcule depuis le départ, sans dérive. */
type Gesture =
  | { kind: 'pan'; x: number; y: number; startX: number; startY: number; pieceId: string | null }
  | {
      kind: 'piece'
      pieceId: string
      pieceKind: 'shelf' | 'wedge' | 'object' | 'upright'
      startX: number
      startY: number
      startValue: number
      /** Cale : hauteur (mm) du centre de la cale au départ. */
      startCenterY?: number
      /** Objet : largeur (mm) au départ du geste. */
      width?: number
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
  /** Affiche le repère (A, B, C…) de la liste de découpe sur chaque pièce. */
  showMarks?: boolean
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
  showMarks = false,
  onSelectPiece,
  onClearSelection,
  onChange,
}: FrontViewProps) {
  const overflow = supportOverflow(plan)
  const { containerRef, scale, viewBox, updateCamera, resetView, zoomIn, zoomOut } = useViewport(plan.width, plan.height, {
    left: overflow.left,
    right: overflow.right,
    top: overflow.above,
    bottom: overflow.below,
  })
  const gestureRef = useRef<Gesture | null>(null)
  const pendingRef = useRef<EditorAction | null>(null)
  // Plan « en cours de glisser » : affiché à la place du vrai plan jusqu'au relâchement.
  const [draft, setDraft] = useState<Plan | null>(null)
  // Repère sur lequel la pièce glissée est calée (milieu, écarts égaux, alignement…), affiché pendant le geste.
  // `shelfBelowId` : étage de la cale ou de l'objet (trait vertical) ; absent pour une tablette (trait horizontal).
  const [dragGuide, setDragGuide] = useState<{ guide: Guide; shelfBelowId?: string } | null>(null)
  // Pièce dont on affiche les cotes dynamiques pendant le glisser (l'objet détaché d'une rangée change d'identifiant).
  const [liveId, setLiveId] = useState<string | null>(null)
  // Valeur tapée au clavier pendant le glisser (texte brut) et position du petit champ dans la vue (px).
  const [typed, setTyped] = useState<{ text: string; left: number; top: number; invalid?: boolean } | null>(null)
  // Dernière position du pointeur (px écran) ; convertie en position dans la vue seulement à l'ouverture du champ.
  const pointerRef = useRef<{ clientX: number; clientY: number }>({ clientX: 0, clientY: 0 })
  const supportDrag = useSupportDrag({
    plan,
    scale,
    snapStep,
    mapping: (dx, dy, start) => ({ x: start.x + dx, y: start.y - dy }),
    onChange,
    onSelect: onSelectPiece,
    isSelected: (id) => selection.includes(id),
  })

  // Menu du clic droit : proposé sur la pièce sous le curseur (ou dans le vide), avec les actions courantes.
  const [menu, setMenu] = useState<{ left: number; top: number; items: MenuItem[] } | null>(null)
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', close)
    }
  }, [menu])
  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    const svg = e.currentTarget as SVGSVGElement
    const ctm = svg.getScreenCTM()
    if (!ctm) return
    const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    const pieceId = (e.target as Element).closest('[data-piece-id]')?.getAttribute('data-piece-id') ?? null
    if (pieceId && !selection.includes(pieceId)) onSelectPiece?.(pieceId, false)
    const box = containerRef.current?.getBoundingClientRect()
    const items = contextMenuItems(plan, pieceId, { x: point.x, y: plan.height - point.y }, { unit, snapStep })
    setMenu({ left: e.clientX - (box?.left ?? 0), top: e.clientY - (box?.top ?? 0), items })
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    setMenu(null)
    const target = e.target as Element
    if (target.closest('[data-dim-edit]')) return
    const handle = target.closest('[data-handle]')?.getAttribute('data-handle') as Handle | null
    const pieceId = target.closest('[data-piece-id]')?.getAttribute('data-piece-id') ?? null
    const base = { startX: e.clientX, startY: e.clientY }

    if (pieceId && supportDrag.begin(e, pieceId)) {
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }
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
      } else if (pieceId && isObjectId(pieceId)) {
        const found = getStages(plan)
          .map((st) => ({ st, o: layoutStage(plan, st).objects.find((o) => o.id === pieceId) }))
          .find((f) => f.o)
        if (found?.o) {
          const startCenterY = found.st.y + found.st.clearHeight / 2
          gestureRef.current = { kind: 'piece', pieceId, pieceKind: 'object', ...base, startValue: found.o.x, startCenterY, width: found.o.width, scale, active: false }
        } else {
          gestureRef.current = { kind: 'pan', x: e.clientX, y: e.clientY, ...base, pieceId }
        }
      } else if ((pieceId === 'upright-left' || pieceId === 'upright-right') && isNotched(plan, pieceId === 'upright-left' ? 'left' : 'right')) {
        const side = pieceId === 'upright-left' ? 'left' : 'right'
        gestureRef.current = { kind: 'piece', pieceId, pieceKind: 'upright', ...base, startValue: jointOf(plan, side).overhang, scale, active: false }
      } else if (pieceId && wedge) {
        const stage = getStages(plan).find((st) => st.shelfBelowId === wedge.shelfBelowId)
        const startCenterY = stage ? stage.y + stage.clearHeight / 2 : 0
        gestureRef.current = { kind: 'piece', pieceId, pieceKind: 'wedge', ...base, startValue: wedge.x, startCenterY, scale, active: false }
      } else {
        gestureRef.current = { kind: 'pan', x: e.clientX, y: e.clientY, ...base, pieceId }
      }
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  /**
   * Calcule le plan provisoire d'une pièce glissée et l'action à valider au relâchement. `rawX` : bord gauche (cale,
   * objet) ou débord (montant) ; `rawY` : dessous (tablette) ou hauteur du curseur (cale, objet).
   */
  const dragPieceTo = (g: Extract<Gesture, { kind: 'piece' }>, rawX: number, rawY: number, step: number | null): EditorAction | null => {
    if (g.pieceKind === 'shelf') {
      const { plan: next, guide } = dragShelfWithGuide(plan, g.pieceId, rawY, step)
      const y = next.shelves.find((s) => s.id === g.pieceId)!.y
      setDraft(next)
      setDragGuide(guide ? { guide } : null)
      setLiveId(g.pieceId)
      return { type: 'setPieceProperty', ids: [g.pieceId], property: 'y', mm: y }
    }
    if (g.pieceKind === 'upright') {
      const side = g.pieceId === 'upright-left' ? 'left' : 'right'
      const next = dragUpright(plan, side, rawX, step)
      setDraft(next)
      return { type: 'moveUpright', side, overhang: jointOf(next, side).overhang }
    }
    if (g.pieceKind === 'object') {
      const placed = dragObjectToStage(plan, g.pieceId, rawX, rawY, step, g.width)
      if (!placed) return null
      setDraft(placed.plan)
      setDragGuide(placed.guide ? { guide: placed.guide, shelfBelowId: placed.shelfBelowId } : null)
      setLiveId(placed.id)
      return { type: 'moveObject', id: g.pieceId, shelfBelowId: placed.shelfBelowId, x: placed.x }
    }
    const moved = dragWedgeToStage(plan, g.pieceId, rawX, rawY, step)
    if (!moved) return null
    setDraft(moved.plan)
    setDragGuide(moved.guide ? { guide: moved.guide, shelfBelowId: moved.shelfBelowId } : null)
    setLiveId(g.pieceId)
    return { type: 'placeWedge', wedgeId: g.pieceId, shelfBelowId: moved.shelfBelowId, x: moved.x }
  }

  /** Fin d'un glisser sans valider (Entrée d'une valeur tapée l'a déjà fait). */
  const clearGesture = () => {
    gestureRef.current = null
    pendingRef.current = null
    setDraft(null)
    setDragGuide(null)
    setLiveId(null)
    setTyped(null)
  }

  /** Entrée : place la pièce glissée pour que sa cote principale vaille la valeur tapée. */
  const commitTyped = (text: string) => {
    const mm = parseLength(text, unit)
    const g = gestureRef.current
    if (supportDrag.activeId && supportDrag.draft) {
      const target = mm === null ? null : typedTarget(supportDrag.draft, supportDrag.activeId, mm)
      if (!target) return setTyped((t) => t && { ...t, invalid: true })
      const current = supportDrag.draft.supports!.find((sp) => sp.id === supportDrag.activeId)!
      if (!supportDrag.place({ x: target.value, y: current.y })) return setTyped((t) => t && { ...t, invalid: true })
      setTyped(null)
      return
    }
    if (!g || g.kind !== 'piece' || !draft || !liveId) return
    const target = mm === null ? null : typedTarget(draft, liveId, mm)
    if (!target) return setTyped((t) => t && { ...t, invalid: true })
    // La pièce reste dans son étage : on vise le milieu de la hauteur de l'étage où elle est dans le plan provisoire.
    const shelfBelowId =
      g.pieceKind === 'wedge'
        ? draft.wedges.find((w) => w.id === liveId)?.shelfBelowId
        : g.pieceKind === 'object'
          ? findDrawnObject(draft, liveId)?.shelfBelowId
          : undefined
    const stage = getStages(draft).find((st) => st.shelfBelowId === shelfBelowId)
    const rawY = target.axis === 'y' ? target.value : stage ? stage.y + stage.clearHeight / 2 : 0
    const action = dragPieceTo(g, target.value, rawY, null)
    clearGesture()
    if (action) onChange?.(action)
  }

  // Pendant un glisser : taper des chiffres ouvre un petit champ ; Entrée place la pièce, Échap ferme le champ.
  // Écoute en phase de capture pour passer avant les raccourcis de l'application (les chiffres changent de vue).
  const activeLiveId = liveId ?? supportDrag.activeId
  const shown = draft ?? supportDrag.draft ?? plan
  const liveDims = useMemo(() => (activeLiveId ? liveDimensions(shown, activeLiveId) : []), [shown, activeLiveId])
  const mainDim = mainDimension(liveDims)
  // Valeurs courantes lues par l'écouteur clavier (qui n'est pas recréé à chaque rendu).
  const keyStateRef = useRef({ typed, hasMain: !!mainDim, commit: commitTyped, box: () => containerRef.current?.getBoundingClientRect() })
  useEffect(() => {
    keyStateRef.current = { typed, hasMain: !!mainDim, commit: commitTyped, box: () => containerRef.current?.getBoundingClientRect() }
  })
  useEffect(() => {
    if (!activeLiveId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) return
      const { typed: current, hasMain, commit, box: getBox } = keyStateRef.current
      const take = () => {
        e.preventDefault()
        e.stopPropagation()
      }
      // Pendant un glisser, Suppr et Retour arrière ne doivent jamais supprimer la pièce.
      if (e.key === 'Delete' || e.key === 'Backspace') {
        take()
        if (e.key === 'Backspace' && current) setTyped((t) => t && { ...t, text: t.text.slice(0, -1), invalid: false })
        return
      }
      const char = typedChar(e)
      if (char !== null) {
        take()
        if (!hasMain && !current) return
        const box = getBox()
        const { clientX, clientY } = pointerRef.current
        setTyped((t) => ({
          text: (t?.text ?? '') + char,
          left: t?.left ?? clientX - (box?.left ?? 0),
          top: t?.top ?? clientY - (box?.top ?? 0),
        }))
      } else if (current && e.key === 'Escape') {
        take()
        setTyped(null)
      } else if (current && e.key === 'Enter') {
        take()
        commit(current.text)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [activeLiveId])

  const onPointerMove = (e: React.PointerEvent) => {
    pointerRef.current = { clientX: e.clientX, clientY: e.clientY }
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
      if (g.kind === 'piece' && !selection.includes(g.pieceId)) onSelectPiece?.(g.pieceId, false)
    }

    const step = e.altKey ? null : snapStep
    if (g.kind === 'piece') {
      let rawX = g.startValue + dx * g.scale
      let rawY = (g.startCenterY ?? 0) - dy * g.scale
      if (g.pieceKind === 'shelf') rawY = g.startValue - dy * g.scale
      if (g.pieceKind === 'upright') rawX = g.startValue + (g.pieceId === 'upright-left' ? dx : -dx) * g.scale
      const action = dragPieceTo(g, rawX, rawY, step)
      if (action) pendingRef.current = action
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
    setTyped(null)
    if (supportDrag.end(e)) return
    const g = gestureRef.current
    const action = pendingRef.current
    clearGesture()
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

  const H = shown.height
  const W = shown.width
  const rects = computeFrontRects(shown)
  const marks = showMarks ? computeCutList(shown).marks : {}
  const stages = getStages(shown)
  const shelfOrder = sortedShelves(shown).map((s) => s.id)
  const s = scale
  const dimOffset = DIM_OFFSET_PX * s
  const hs = HANDLE_PX * s

  const movableClass = (kind: string, id: string) => {
    if (kind === 'wedge') return ' movable-x movable-y'
    if (kind === 'upright' && (id === 'upright-left' || id === 'upright-right') && isNotched(shown, id === 'upright-left' ? 'left' : 'right')) return ' movable-x'
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
          onContextMenu={onContextMenu}
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
              rx={r.cornerRadius}
              ry={r.cornerRadius}
              style={fillStyle(shown, r.id, r.kind)}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {(shown.supports ?? []).map((sp) => (
            <rect
              key={sp.id}
              data-piece-id={sp.id}
              className={`piece piece-support movable-x movable-y${selection.includes(sp.id) ? ' selected' : ''}`}
              x={sp.x}
              y={H - sp.y - sp.height}
              width={sp.width}
              height={sp.height}
              style={fillStyle(shown, sp.id, 'support')}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          <g className="objects">
            {stages.flatMap((stage) =>
              layoutStage(shown, stage).objects.map((o, i) => (
                <rect
                  key={`${o.id}-${stage.shelfBelowId}-${i}`}
                  data-piece-id={o.id}
                  className={`object object-${o.kindId}${o.tooTall || o.tooDeep ? ' object-bad' : ''}${selection.includes(o.id) ? ' selected' : ''} movable-x movable-y`}
                  x={o.x}
                  y={H - o.y - o.height}
                  width={o.width}
                  height={o.height}
                  rx={objectCornerRadius(o)}
                  style={o.color ? { fill: o.color } : undefined}
                  vectorEffect="non-scaling-stroke"
                />
              )),
            )}
          </g>

          {frontRects(shown).map((f) => (
            <g key={f.id} className="front-door">
              <rect
                data-piece-id={f.id}
                className={`piece piece-front${selection.includes(f.id) ? ' selected' : ''}`}
                x={f.x}
                y={H - f.y - f.height}
                width={f.width}
                height={f.height}
                vectorEffect="non-scaling-stroke"
              />
              {/* Poignée : bouton côté opposé aux charnières pour une porte, barre centrée pour un tiroir. */}
              {f.type === 'drawer' ? (
                <line className="front-handle" x1={f.x + f.width / 2 - 40} x2={f.x + f.width / 2 + 40} y1={H - f.y - f.height / 2} y2={H - f.y - f.height / 2} vectorEffect="non-scaling-stroke" />
              ) : (
                <circle className="front-handle" cx={f.hinge === 'left' ? f.x + f.width - 25 : f.x + 25} cy={H - f.y - f.height / 2} r={8} vectorEffect="non-scaling-stroke" />
              )}
            </g>
          ))}

          {showMarks &&
            rects.map((r) => (
              <text
                key={r.id}
                className="mark"
                x={r.x + r.width / 2}
                y={H - r.y - r.height / 2}
                fontSize={12 * s}
                textAnchor="middle"
                dominantBaseline="central"
              >
                {marks[r.id]}
              </text>
            ))}

          {dragGuide &&
            (() => {
              const { guide, shelfBelowId } = dragGuide
              if (shelfBelowId === undefined) {
                // Tablette : trait horizontal au milieu de son épaisseur, sur toute la largeur.
                const cy = H - (guide.pos + guide.size / 2)
                return <GuideLine x1={0} y1={cy} x2={W} y2={cy} label={guide.label} s={s} />
              }
              const stage = stages.find((st) => st.shelfBelowId === shelfBelowId)
              if (!stage) return null
              const cx = guide.pos + guide.size / 2
              // Un alignement avec une pièce d'un autre étage traverse toute la hauteur ; les autres repères restent dans l'étage.
              const top = guide.aligned ? 0 : H - (stage.y + stage.clearHeight)
              const bottom = guide.aligned ? H : H - stage.y
              return <GuideLine x1={cx} y1={top} x2={cx} y2={bottom} label={guide.label} s={s} />
            })()}
          {liveDims
              .filter((d) => d.value > 0)
              .map((d) =>
                d.axis === 'x' ? (
                  <LiveDimension key={d.side} x1={d.from} y1={H - d.y} x2={d.to} y2={H - d.y} label={formatLength(d.value, unit)} s={s} />
                ) : (
                  <LiveDimension key={d.side} x1={d.x} y1={H - d.to} x2={d.x} y2={H - d.from} label={formatLength(d.value, unit)} s={s} />
                ),
              )}
          {supportDrag.guides.x && (
            <GuideLine
              x1={supportDrag.guides.x.pos + supportDrag.guides.x.size / 2}
              y1={0}
              x2={supportDrag.guides.x.pos + supportDrag.guides.x.size / 2}
              y2={H + overflow.below}
              label={supportDrag.guides.x.label}
              s={s}
            />
          )}

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

          <EditableDimension
            x1={0}
            y1={H + dimOffset}
            x2={W}
            y2={H + dimOffset}
            valueMm={W}
            unit={unit}
            label={formatLength(W, unit)}
            s={s}
            side={1}
            onCommit={(mm) => onChange?.({ type: 'setPlanProperty', change: { property: 'width', mm } })}
          />
          <EditableDimension
            x1={W + dimOffset}
            y1={0}
            x2={W + dimOffset}
            y2={H}
            valueMm={H}
            unit={unit}
            label={formatLength(H, unit)}
            s={s}
            side={1}
            onCommit={(mm) => onChange?.({ type: 'setPlanProperty', change: { property: 'height', mm } })}
          />
          {stages.map((stage, stageIndex) => {
            const top = H - (stage.y + stage.clearHeight)
            const bottom = H - stage.y
            return (
              <g key={stage.shelfBelowId}>
                <g className="dim dim-extension">
                  <line x1={0} y1={top} x2={-dimOffset - 5 * s} y2={top} vectorEffect="non-scaling-stroke" />
                  <line x1={0} y1={bottom} x2={-dimOffset - 5 * s} y2={bottom} vectorEffect="non-scaling-stroke" />
                </g>
                <g className="stage-badge" pointerEvents="none">
                  <circle cx={-dimOffset - 26 * s} cy={(top + bottom) / 2} r={10 * s} vectorEffect="non-scaling-stroke" />
                  <text x={-dimOffset - 26 * s} y={(top + bottom) / 2} fontSize={12 * s} textAnchor="middle" dominantBaseline="central">
                    {stageIndex + 1}
                  </text>
                  <title>{`Étage ${stageIndex + 1}`}</title>
                </g>
                <EditableDimension
                  x1={-dimOffset}
                  y1={top}
                  x2={-dimOffset}
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

      {typed && (
        <div className={`live-input${typed.invalid ? ' live-input-invalid' : ''}`} style={{ left: typed.left + 16, top: typed.top + 16 }} role="status">
          <span className="live-input-label">
            {mainDim?.side === 'below' ? 'Hauteur libre dessous' : mainDim?.side === 'right' ? 'Distance à droite' : 'Distance à gauche'}
          </span>
          <span className="live-input-value">
            {typed.text || '…'} {unit}
          </span>
          <span className="live-input-hint">{typed.invalid ? 'Valeur non valide' : 'Tapez une valeur puis Entrée · Échap : annuler'}</span>
        </div>
      )}

      {menu && (
        <div
          className="context-menu"
          role="menu"
          style={{ left: menu.left, top: menu.top }}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.key === 'Escape' && setMenu(null)}
        >
          {menu.items.map((item, i) =>
            item.action ? (
              <button
                key={i}
                type="button"
                role="menuitem"
                className={item.danger ? 'danger' : undefined}
                onClick={() => {
                  setMenu(null)
                  onChange?.(item.action!)
                }}
              >
                {item.label}
              </button>
            ) : (
              <div key={i} className="context-menu-title">
                {item.label}
              </div>
            ),
          )}
        </div>
      )}

      <ViewControls onZoomIn={zoomIn} onZoomOut={zoomOut} onReset={resetView} />
    </div>
  )
}
