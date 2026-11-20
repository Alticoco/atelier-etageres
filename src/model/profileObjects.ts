import { layoutStage } from './objects'
import { getStages } from './pieces'
import type { ObjectOrientation, Plan } from './types'

/** Un rectangle d'objets vus de côté : profondeur (depuis le mur) × hauteur, en mm (repère du plan, y vers le haut). */
export interface ProfileObjectRect {
  /** Clé stable : étage, type, sens et niveau de pile. */
  key: string
  kindId: string
  orientation: ObjectOrientation
  level: number
  /** Distance au mur (toujours 0 : les objets sont rangés contre le fond). */
  z: number
  /** Dessous du rectangle. */
  y: number
  depth: number
  height: number
  shape: 'box' | 'cylinder'
  /** Couleur de l'objet sur mesure, s'il en a une. */
  color?: string
  /** Trop haut ou trop profond pour l'étage : contour d'alerte. */
  bad: boolean
}

/**
 * Objets rangés vus de côté. De profil, tous les objets d'un même type, dans le même sens et au même niveau de pile
 * se superposent : on ne garde qu'un rectangle par (étage, type, sens, niveau), le plus profond.
 */
export function computeProfileObjects(plan: Plan): ProfileObjectRect[] {
  const groups = new Map<string, ProfileObjectRect>()
  for (const stage of getStages(plan)) {
    for (const o of layoutStage(plan, stage).objects) {
      const key = `${stage.shelfBelowId}|${o.kindId}|${o.orientation}|${o.level}`
      const existing = groups.get(key)
      if (existing) {
        existing.bad = existing.bad || o.tooTall || o.tooDeep
        if (o.depth > existing.depth) existing.depth = o.depth
        continue
      }
      groups.set(key, {
        key,
        kindId: o.kindId,
        orientation: o.orientation,
        level: o.level,
        z: 0,
        y: o.y,
        depth: o.depth,
        height: o.height,
        shape: o.shape,
        ...(o.color ? { color: o.color } : {}),
        bad: o.tooTall || o.tooDeep,
      })
    }
  }
  return [...groups.values()]
}
