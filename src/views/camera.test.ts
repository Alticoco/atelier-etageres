import { describe, expect, it } from 'vitest'
import { cameraViewBox, fitCamera, MAX_SCALE, MIN_SCALE, panCamera, screenToWorld, zoomCamera } from './camera'

const size = { width: 800, height: 600 }
const bounds = { x: 0, y: 0, width: 1000, height: 800 }

describe('fitCamera', () => {
  it('centre le contenu et le fait entrer entièrement avec la marge', () => {
    const cam = fitCamera(bounds, size, 50)
    expect(cam.cx).toBe(500)
    expect(cam.cy).toBe(400)
    const vb = cameraViewBox(cam, size)
    // marge de 50 px de chaque côté, convertie en mm
    expect(vb.x).toBeLessThanOrEqual(-50 * cam.s + 1e-9)
    expect(vb.x + vb.width).toBeGreaterThanOrEqual(1000 + 50 * cam.s - 1e-9)
    expect(vb.y).toBeLessThanOrEqual(-50 * cam.s + 1e-9)
    expect(vb.y + vb.height).toBeGreaterThanOrEqual(800 + 50 * cam.s - 1e-9)
  })

  it("garde le même rapport largeur/hauteur que l'écran", () => {
    const vb = cameraViewBox(fitCamera(bounds, size, 50), size)
    expect(vb.width / vb.height).toBeCloseTo(size.width / size.height)
  })
})

describe('panCamera', () => {
  it('déplacer de 100 px vers la droite montre ce qui est à gauche', () => {
    const cam = { cx: 500, cy: 400, s: 2 }
    expect(panCamera(cam, 100, 0)).toEqual({ cx: 300, cy: 400, s: 2 })
  })
})

describe('zoomCamera', () => {
  const cam = { cx: 500, cy: 400, s: 1.5 }
  const focus = { x: 200, y: 100 }

  it('garde fixe le point du dessin situé sous le curseur', () => {
    const before = screenToWorld(cam, size, focus)
    const after = screenToWorld(zoomCamera(cam, 2, focus, size), size, focus)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it('rapproche quand le facteur est > 1 et éloigne quand il est < 1', () => {
    expect(zoomCamera(cam, 2, focus, size).s).toBeCloseTo(0.75)
    expect(zoomCamera(cam, 0.5, focus, size).s).toBeCloseTo(3)
  })

  it('reste dans les limites de zoom', () => {
    expect(zoomCamera(cam, 1e9, focus, size).s).toBe(MIN_SCALE)
    expect(zoomCamera(cam, 1e-9, focus, size).s).toBe(MAX_SCALE)
  })
})
