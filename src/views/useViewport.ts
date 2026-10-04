import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { cameraViewBox, fitCamera, zoomCamera, type Bounds, type Camera, type Size } from './camera'

const FIT_PADDING_PX = 90
const WHEEL_SENSITIVITY = 0.0015
const BUTTON_ZOOM = 1.25

/**
 * Zoom et déplacement d'une vue 2D : mesure l'écran, cadre automatiquement le dessin (`width` × `height`,
 * en mm, coin en haut à gauche en (0, 0)), gère la molette et les boutons.
 * Tant que l'utilisateur n'a pas zoomé ni déplacé, la vue reste cadrée sur tout le dessin.
 */
export function useViewport(width: number, height: number) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<Size | null>(null)
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

  const bounds: Bounds = { x: 0, y: 0, width, height }
  const fit = size && size.width > 0 && size.height > 0 ? fitCamera(bounds, size, FIT_PADDING_PX) : null
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

  return {
    containerRef,
    camera,
    /** Mm du dessin par pixel écran (1 tant que la vue n'est pas mesurée). */
    scale: camera?.s ?? 1,
    viewBox: camera && size ? cameraViewBox(camera, size) : null,
    updateCamera,
    /** Revient au cadrage automatique. */
    resetView: () => setCustom(null),
    zoomIn: () => zoomFromCenter(BUTTON_ZOOM),
    zoomOut: () => zoomFromCenter(1 / BUTTON_ZOOM),
  }
}
