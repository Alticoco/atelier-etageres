import { effectiveColor } from './colors'
import { computeFrontRects } from './layout'
import { layoutStage, objectKind } from './objects'
import { getStages } from './pieces'
import type { Plan } from './types'

/**
 * Scène 3D de l'étagère : une liste de boîtes (et de cylindres pour les bocaux), en mm, calculée depuis le plan.
 * Fonction pure, sans dépendance à Three.js : la vue 3D ne fait que dessiner cette liste.
 *
 * Repère : x vers la droite (comme en vue de face), y vers le haut (depuis le dessous du cadre), z vers l'avant
 * (depuis le mur : le mur est en z = 0, les pièces vont de z = 0 vers z = profondeur).
 */
export type Box3DKind = 'upright' | 'shelf' | 'wedge' | 'support' | 'object' | 'wall'

export interface Box3D {
  id: string
  kind: Box3DKind
  /** Cylindre (bocal) : sinon boîte. */
  shape: 'box' | 'cylinder'
  /** Coin minimal. */
  x: number
  y: number
  z: number
  /** Dimensions. */
  sx: number
  sy: number
  sz: number
  /** Objet qui ne rentre pas (trop haut ou trop profond). */
  bad?: boolean
  /** Type d'objet de simulation (couleur). */
  objectKind?: string
  /** Couleur `#rrggbb` choisie ou par défaut (pièces, supports et mur ; pas les objets). */
  color?: string
}

export interface Scene3D {
  /** Pièces de l'étagère, supports et objets (sans le mur). */
  boxes: Box3D[]
  /** Le mur, derrière l'étagère : dépasse de partout pour qu'on voie l'étagère posée contre lui. */
  wall: Box3D
  /** Boîte englobante de l'étagère, des supports et des objets (sans le mur). */
  min: [number, number, number]
  max: [number, number, number]
}

/** Épaisseur dessinée du mur (mm). */
export const WALL_THICKNESS = 100
/** Le mur dépasse de l'ensemble d'au moins ça (mm) : 25 % de la plus grande dimension, plus ce minimum. */
const WALL_MARGIN_MM = 150

export function buildScene3D(plan: Plan, options: { objects?: boolean; supports?: boolean } = {}): Scene3D {
  const { objects = true, supports = true } = options
  const boxes: Box3D[] = []

  for (const r of computeFrontRects(plan)) {
    boxes.push({ id: r.id, kind: r.kind, shape: 'box', x: r.x, y: r.y, z: 0, sx: r.width, sy: r.height, sz: r.depth, color: effectiveColor(plan, r.id, r.kind) })
  }

  if (supports) {
    for (const s of plan.supports ?? []) {
      boxes.push({ id: s.id, kind: 'support', shape: 'box', x: s.x, y: s.y, z: s.z, sx: s.width, sy: s.height, sz: s.depth, color: effectiveColor(plan, s.id, 'support') })
    }
  }

  if (objects) {
    const shelves = new Map(plan.shelves.map((s) => [s.id, s]))
    for (const stage of getStages(plan)) {
      const shelfDepth = shelves.get(stage.shelfBelowId)?.depth ?? 0
      for (const o of layoutStage(plan, stage).objects) {
        const kind = objectKind(o.kindId)
        if (!kind) continue
        boxes.push({
          id: o.id,
          kind: 'object',
          shape: kind.round ? 'cylinder' : 'box',
          x: o.x,
          y: o.y,
          // Contre le fond de l'étage ; un objet plus profond que la tablette dépasse devant.
          z: 0,
          sx: o.width,
          sy: o.height,
          sz: kind.depth,
          bad: o.tooTall || o.tooDeep || kind.depth > shelfDepth,
          objectKind: kind.id,
        })
      }
    }
  }

  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (const b of boxes) {
    min[0] = Math.min(min[0], b.x)
    min[1] = Math.min(min[1], b.y)
    min[2] = Math.min(min[2], b.z)
    max[0] = Math.max(max[0], b.x + b.sx)
    max[1] = Math.max(max[1], b.y + b.sy)
    max[2] = Math.max(max[2], b.z + b.sz)
  }
  if (boxes.length === 0) {
    min.fill(0)
    max.fill(0)
  }

  const margin = WALL_MARGIN_MM + Math.round(0.25 * Math.max(max[0] - min[0], max[1] - min[1]))
  const wall: Box3D = {
    id: 'wall',
    kind: 'wall',
    shape: 'box',
    x: min[0] - margin,
    y: min[1] - margin,
    z: -WALL_THICKNESS,
    sx: max[0] - min[0] + 2 * margin,
    sy: max[1] - min[1] + 2 * margin,
    sz: WALL_THICKNESS,
    color: effectiveColor(plan, 'wall', 'wall'),
  }

  return { boxes, wall, min, max }
}
