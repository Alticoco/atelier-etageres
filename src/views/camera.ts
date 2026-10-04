/**
 * Caméra 2D : quelle partie du dessin est visible, et à quel zoom.
 * Fonctions pures, indépendantes de React.
 *
 * Le dessin SVG est en mm (y vers le bas). La caméra est définie par le point
 * du dessin au centre de l'écran (cx, cy) et l'échelle `s` en mm par pixel écran.
 */

export interface Camera {
  cx: number
  cy: number
  /** Millimètres du dessin par pixel d'écran (plus petit = plus zoomé). */
  s: number
}

export interface Size {
  width: number
  height: number
}

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export const MIN_SCALE = 0.05
export const MAX_SCALE = 50

function clampScale(s: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s))
}

/** Caméra qui montre tout le contenu, avec une marge en pixels autour. */
export function fitCamera(bounds: Bounds, size: Size, paddingPx: number): Camera {
  const availW = Math.max(1, size.width - 2 * paddingPx)
  const availH = Math.max(1, size.height - 2 * paddingPx)
  const s = clampScale(Math.max(bounds.width / availW, bounds.height / availH))
  return { cx: bounds.x + bounds.width / 2, cy: bounds.y + bounds.height / 2, s }
}

/** Rectangle visible du dessin (valeur de l'attribut SVG viewBox). */
export function cameraViewBox(camera: Camera, size: Size): Bounds {
  const width = size.width * camera.s
  const height = size.height * camera.s
  return { x: camera.cx - width / 2, y: camera.cy - height / 2, width, height }
}

/** Convertit un point de l'écran (px, relatif au coin du dessin) en point du dessin (mm). */
export function screenToWorld(camera: Camera, size: Size, px: { x: number; y: number }): { x: number; y: number } {
  return {
    x: camera.cx + (px.x - size.width / 2) * camera.s,
    y: camera.cy + (px.y - size.height / 2) * camera.s,
  }
}

/** Déplace la vue : le dessin suit le doigt/la souris de (dxPx, dyPx) pixels. */
export function panCamera(camera: Camera, dxPx: number, dyPx: number): Camera {
  return { ...camera, cx: camera.cx - dxPx * camera.s, cy: camera.cy - dyPx * camera.s }
}

/**
 * Zoome d'un facteur (> 1 = rapprocher) en gardant fixe le point du dessin
 * situé sous le curseur.
 */
export function zoomCamera(camera: Camera, factor: number, focusPx: { x: number; y: number }, size: Size): Camera {
  const s = clampScale(camera.s / factor)
  const focus = screenToWorld(camera, size, focusPx)
  return {
    s,
    cx: focus.x - (focusPx.x - size.width / 2) * s,
    cy: focus.y - (focusPx.y - size.height / 2) * s,
  }
}
