import { useRef, useState } from 'react'
import type { Guide } from '../model/guides'
import { dragSupport, supportGuidesAt } from '../model/supports'
import type { Plan, Support } from '../model/types'
import type { EditorAction } from '../store/editor'

/** En dessous de ce déplacement (px), un appui est un clic et non un glisser. */
const CLICK_TOLERANCE_PX = 4

interface Gesture {
  id: string
  startX: number
  startY: number
  start: Support
  scale: number
  active: boolean
}

interface Options {
  plan: Plan
  /** Mm du dessin par pixel écran. */
  scale: number
  snapStep: number
  /** Cotes du support après un déplacement de (dx, dy) mm vers la droite / le bas de l'écran. */
  mapping: (dx: number, dy: number, start: Support) => { x?: number; y?: number; z?: number }
  onChange?: (action: EditorAction) => void
  onSelect?: (id: string, additive: boolean) => void
  isSelected: (id: string) => boolean
}

/**
 * Glisser un support dans une vue (face, profil ou dessous). Un glisser = une seule action au relâchement ;
 * pendant le geste, `draft` est le plan provisoire à afficher. Un appui sans glisser sélectionne le support.
 */
export function useSupportDrag({ plan, scale, snapStep, mapping, onChange, onSelect, isSelected }: Options) {
  const gestureRef = useRef<Gesture | null>(null)
  const pendingRef = useRef<EditorAction | null>(null)
  const [draft, setDraft] = useState<Plan | null>(null)
  const [guides, setGuides] = useState<{ x: Guide | null; z: Guide | null }>({ x: null, z: null })

  return {
    draft,
    /** Repères sur lesquels le support est calé pendant le glisser (x : sens horizontal, z : profondeur). */
    guides,
    /** Début d'un appui sur un support. */
    begin(e: React.PointerEvent, id: string): boolean {
      const start = plan.supports?.find((s) => s.id === id)
      if (!start) return false
      gestureRef.current = { id, startX: e.clientX, startY: e.clientY, start, scale, active: false }
      return true
    },
    /** Renvoie true si le mouvement appartient à un glisser de support. */
    move(e: React.PointerEvent): boolean {
      const g = gestureRef.current
      if (!g) return false
      const dx = e.clientX - g.startX
      const dy = e.clientY - g.startY
      if (!g.active) {
        if (Math.hypot(dx, dy) <= CLICK_TOLERANCE_PX) return true
        g.active = true
        if (!isSelected(g.id)) onSelect?.(g.id, false)
      }
      const raw = mapping(dx * g.scale, dy * g.scale, g.start)
      const next = dragSupport(plan, g.id, raw, e.altKey ? null : snapStep)
      const moved = next.supports!.find((s) => s.id === g.id)!
      setDraft(next)
      setGuides(raw.x !== undefined || raw.z !== undefined ? supportGuidesAt(next, g.id) : { x: null, z: null })
      pendingRef.current = { type: 'moveSupport', id: g.id, x: raw.x === undefined ? undefined : moved.x, y: raw.y === undefined ? undefined : moved.y, z: raw.z === undefined ? undefined : moved.z }
      return true
    },
    /** Renvoie true si le relâchement termine un geste sur un support. */
    end(e: React.PointerEvent | null): boolean {
      const g = gestureRef.current
      gestureRef.current = null
      const action = pendingRef.current
      pendingRef.current = null
      setDraft(null)
      setGuides({ x: null, z: null })
      if (!g) return false
      if (!e) return true
      if (g.active) {
        if (action) onChange?.(action)
      } else {
        onSelect?.(g.id, e.ctrlKey || e.shiftKey || e.metaKey)
      }
      return true
    },
  }
}
