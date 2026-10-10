import { innerSpan } from './geometry'
import { getStages, sortedShelves } from './pieces'
import type { Plan, Stage, StageFront } from './types'

/**
 * Portes et tiroirs (V3) : un « coffret » par étage, choisi parmi ouvert / une porte / deux portes / un tiroir.
 * Les portes et les façades de tiroir sont encastrées dans l'ouverture de l'étage, avec un jeu autour.
 * Fonctions pures : la géométrie est recalculée du plan, rien n'est stocké en dehors du choix par étage.
 */

/** Jeu (mm) autour d'une porte ou d'une façade de tiroir, et entre deux portes. */
export const FRONT_GAP = 2
/** Jeu (mm) de chaque côté de la caisse du tiroir, pour les coulisses. */
export const SLIDE_GAP = 13
/** Épaisseur (mm) des côtés et du fond arrière de la caisse du tiroir. */
export const DRAWER_BOX_THICKNESS = 12
/** Épaisseur (mm) du fond de la caisse. */
export const DRAWER_BOTTOM_THICKNESS = 6
/** Jeu (mm) entre l'arrière de la caisse et le mur. */
export const DRAWER_REAR_GAP = 20
/** Hauteur (mm) retranchée à la façade pour la caisse (passage des coulisses, dessus et dessous). */
export const DRAWER_HEIGHT_MARGIN = 30
/** Dimension minimale (mm) d'une porte ou d'une façade. */
export const MIN_FRONT_SIZE = 50

export const DEFAULT_DOOR: StageFront = { shelfBelowId: '', type: 'doors', count: 1, hinge: 'left' }

/** Un rectangle de porte ou de façade vu de face, dans le repère du plan (y vers le haut, mm). */
export interface FrontRect {
  id: string
  type: 'door' | 'drawer'
  shelfBelowId: string
  x: number
  y: number
  width: number
  height: number
  /** Profondeur de l'avant de l'étage depuis le mur, et épaisseur de la porte : la porte occupe z..z+thickness. */
  z: number
  thickness: number
  /** Portes : côté des charnières (pour le dessin). */
  hinge?: 'left' | 'right'
}

/** Une planche à découper pour une porte ou un tiroir. */
export interface FrontPiece {
  id: string
  label: string
  length: number
  width: number
  thickness: number
}

export function isFrontId(id: string): boolean {
  return /^(door|drawer)-/.test(id)
}

/** Choix valables : ceux dont l'étage existe encore. Un choix orphelin (étage supprimé) est ignoré. */
export function effectiveFronts(plan: Plan): { front: StageFront; stage: Stage; index: number }[] {
  const stages = getStages(plan)
  const result: { front: StageFront; stage: Stage; index: number }[] = []
  for (const front of plan.fronts ?? []) {
    const index = stages.findIndex((s) => s.shelfBelowId === front.shelfBelowId)
    if (index >= 0) result.push({ front, stage: stages[index], index })
  }
  return result
}

/** Épaisseur des portes et façades : celle de la première tablette. */
export function frontThickness(plan: Plan): number {
  return sortedShelves(plan)[0]?.thickness ?? 18
}

/** Rectangles des portes et façades de tiroir, de bas en haut. */
export function frontRects(plan: Plan): FrontRect[] {
  const span = innerSpan(plan)
  const spanW = span.right - span.left
  const thickness = frontThickness(plan)
  const rects: FrontRect[] = []
  for (const { front, stage } of effectiveFronts(plan)) {
    const shelf = plan.shelves.find((s) => s.id === front.shelfBelowId)
    const z = Math.max(0, (shelf?.depth ?? thickness) - thickness)
    const height = stage.clearHeight - 2 * FRONT_GAP
    const y = stage.y + FRONT_GAP
    if (front.type === 'drawer') {
      rects.push({ id: `drawer-${front.shelfBelowId}`, type: 'drawer', shelfBelowId: front.shelfBelowId, x: span.left + FRONT_GAP, y, width: spanW - 2 * FRONT_GAP, height, z, thickness })
    } else if (front.count === 2) {
      const w = Math.floor((spanW - 3 * FRONT_GAP) / 2)
      rects.push(
        { id: `door-${front.shelfBelowId}-1`, type: 'door', shelfBelowId: front.shelfBelowId, x: span.left + FRONT_GAP, y, width: w, height, z, thickness, hinge: 'left' },
        { id: `door-${front.shelfBelowId}-2`, type: 'door', shelfBelowId: front.shelfBelowId, x: span.right - FRONT_GAP - w, y, width: w, height, z, thickness, hinge: 'right' },
      )
    } else {
      rects.push({ id: `door-${front.shelfBelowId}-1`, type: 'door', shelfBelowId: front.shelfBelowId, x: span.left + FRONT_GAP, y, width: spanW - 2 * FRONT_GAP, height, z, thickness, hinge: front.hinge })
    }
  }
  return rects
}

/** Dimensions de la caisse d'un tiroir (mm) : largeur hors-tout, profondeur, hauteur. */
export function drawerBox(plan: Plan, shelfBelowId: string): { width: number; depth: number; height: number } | null {
  const rect = frontRects(plan).find((r) => r.id === `drawer-${shelfBelowId}`)
  const shelf = plan.shelves.find((s) => s.id === shelfBelowId)
  if (!rect || !shelf) return null
  return {
    width: rect.width - 2 * SLIDE_GAP + 2 * FRONT_GAP,
    depth: shelf.depth - rect.thickness - DRAWER_REAR_GAP,
    height: rect.height - DRAWER_HEIGHT_MARGIN,
  }
}

function stageNumber(plan: Plan, shelfBelowId: string): number {
  return getStages(plan).findIndex((s) => s.shelfBelowId === shelfBelowId) + 1
}

/** Toutes les planches des portes et des tiroirs, étage par étage. */
export function frontPieces(plan: Plan): FrontPiece[] {
  const pieces: FrontPiece[] = []
  for (const r of frontRects(plan)) {
    const n = stageNumber(plan, r.shelfBelowId)
    if (r.type === 'door') {
      pieces.push({ id: r.id, label: `Porte, étage ${n}`, length: r.height, width: r.width, thickness: r.thickness })
      continue
    }
    pieces.push({ id: r.id, label: `Façade de tiroir, étage ${n}`, length: r.width, width: r.height, thickness: r.thickness })
    const box = drawerBox(plan, r.shelfBelowId)
    if (!box) continue
    const t = DRAWER_BOX_THICKNESS
    pieces.push(
      { id: `${r.id}#side-1`, label: `Tiroir, côté, étage ${n}`, length: box.depth, width: box.height, thickness: t },
      { id: `${r.id}#side-2`, label: `Tiroir, côté, étage ${n}`, length: box.depth, width: box.height, thickness: t },
      { id: `${r.id}#back`, label: `Tiroir, arrière, étage ${n}`, length: box.width - 2 * t, width: box.height, thickness: t },
      { id: `${r.id}#bottom`, label: `Tiroir, fond, étage ${n}`, length: box.width - 2 * t, width: box.depth, thickness: DRAWER_BOTTOM_THICKNESS },
    )
  }
  return pieces
}

export interface FrontGroup {
  mark: string
  length: number
  width: number
  thickness: number
  quantity: number
  ids: string[]
  /** Rôles des planches du lot (« Porte, étage 2 »…), sans doublon. */
  labels: string[]
}

/** Planches des portes et tiroirs regroupées par dimensions identiques, repères P1, P2… */
export function frontGroups(plan: Plan): FrontGroup[] {
  const groups: FrontGroup[] = []
  for (const piece of frontPieces(plan)) {
    const [length, width] = piece.length >= piece.width ? [piece.length, piece.width] : [piece.width, piece.length]
    let group = groups.find((g) => g.length === length && g.width === width && g.thickness === piece.thickness)
    if (!group) {
      group = { mark: `P${groups.length + 1}`, length, width, thickness: piece.thickness, quantity: 0, ids: [], labels: [] }
      groups.push(group)
    }
    group.quantity += 1
    group.ids.push(piece.id)
    if (!group.labels.includes(piece.label)) group.labels.push(piece.label)
  }
  return groups
}

/** Problèmes de cohérence des portes et tiroirs (liste vide = tout va bien). */
export function frontProblems(plan: Plan): string[] {
  const problems: string[] = []
  for (const { front, stage, index } of effectiveFronts(plan)) {
    const n = index + 1
    const what = front.type === 'drawer' ? 'son tiroir' : front.count === 2 ? 'ses portes' : 'sa porte'
    const rects = frontRects(plan).filter((r) => r.shelfBelowId === front.shelfBelowId)
    if (rects.some((r) => r.width < MIN_FRONT_SIZE || r.height < MIN_FRONT_SIZE)) {
      problems.push(`L'étage ${n} est trop petit pour ${what} (au moins ${MIN_FRONT_SIZE / 10} cm de chaque côté).`)
    } else if (front.type === 'drawer') {
      const box = drawerBox(plan, front.shelfBelowId)
      if (!box || box.width - 2 * DRAWER_BOX_THICKNESS < 1 || box.depth < MIN_FRONT_SIZE || box.height < DRAWER_BOX_THICKNESS * 2) {
        problems.push(`L'étage ${n} (${stage.clearHeight} mm de haut) est trop petit pour la caisse de son tiroir.`)
      }
    }
  }
  return problems
}
