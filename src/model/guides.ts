import { innerSpan } from './geometry'
import { layoutStage, orientedSize, resolveKind, type DrawnObject } from './objects'
import { getStages, sortedShelves } from './pieces'
import type { Plan, Support } from './types'

/**
 * Repères d'aimantation « invisibles » : quand on déplace une pièce, elle se cale sur des positions remarquables
 * (milieu, écarts égaux entre cales, tiers, quarts, alignement avec une autre pièce). Le repère n'apparaît à l'écran
 * qu'au moment où la pièce s'y cale. Fonctions pures, sans dépendance à l'affichage.
 */
export interface Guide {
  /** Bord gauche (ou arrière) que prendrait la pièce, en mm. */
  pos: number
  /** Dimension de la pièce dans ce sens : le repère est tracé en son milieu (`pos + size / 2`). */
  size: number
  /** Texte affiché quand la pièce s'y cale : « Milieu », « Écarts égaux », « 1/3 »… */
  label: string
  /** Le repère traverse toutes les hauteurs (alignement avec une autre pièce) ou seulement l'étage / la pièce. */
  aligned?: boolean
}

/** Distance (mm) en dessous de laquelle une pièce se cale sur un repère. */
export const GUIDE_MAGNET_MM = 12

/**
 * Positions (bord gauche) de pièces de largeurs `widths`, rangées de gauche à droite dans [from, to] avec le même écart
 * partout : entre elles et avec chaque bord. Pour deux cales, elles tombent aux tiers ; pour trois, aux quarts.
 */
export function evenSlots(from: number, to: number, widths: number[]): number[] {
  const gap = (to - from - widths.reduce((sum, w) => sum + w, 0)) / (widths.length + 1)
  const positions: number[] = []
  let used = 0
  widths.forEach((w, i) => {
    positions.push(Math.round(from + gap * (i + 1) + used))
    used += w
  })
  return positions
}

/** Le repère le plus proche de `rawPos` (à moins de `GUIDE_MAGNET_MM`), ou null. */
export function nearestGuide(guides: Guide[], rawPos: number): Guide | null {
  let best: Guide | null = null
  let bestDistance = GUIDE_MAGNET_MM + 1
  for (const g of guides) {
    const d = Math.abs(g.pos - rawPos)
    if (d < bestDistance) {
      best = g
      bestDistance = d
    }
  }
  return best
}

/**
 * Repères d'une cale posée dans l'étage au-dessus de `shelfBelowId` :
 * - le milieu de l'étage ;
 * - les places qui séparent l'étage en écarts égaux avec les autres cales (milieu seul, tiers, quarts…) ;
 * - l'alignement avec les cales des autres étages.
 */
export function wedgeGuides(plan: Plan, wedgeId: string, shelfBelowId: string): Guide[] {
  const wedge = plan.wedges.find((w) => w.id === wedgeId)
  if (!wedge) return []
  const span = innerSpan(plan)
  const others = plan.wedges.filter((w) => w.id !== wedgeId && w.shelfBelowId === shelfBelowId).sort((a, b) => a.x - b.x)
  const guides: Guide[] = []

  guides.push({ pos: Math.round((span.left + span.right - wedge.thickness) / 2), size: wedge.thickness, label: 'Milieu' })

  // Écarts égaux : la cale prend chaque rang possible parmi les autres, et tous sont répartis à égalité.
  for (let index = 0; index <= others.length; index++) {
    const widths = others.map((w) => w.thickness)
    widths.splice(index, 0, wedge.thickness)
    const pos = evenSlots(span.left, span.right, widths)[index]
    const total = others.length + 1
    guides.push({ pos, size: wedge.thickness, label: total === 1 ? 'Milieu' : `Écarts égaux (${total} cales)` })
  }

  for (const w of plan.wedges) {
    if (w.id === wedgeId || w.shelfBelowId === shelfBelowId) continue
    guides.push({ pos: w.x, size: wedge.thickness, label: 'Aligné avec une autre cale', aligned: true })
  }

  return dedupe(guides)
}

const FRACTIONS: { f: number; label: string }[] = [
  { f: 1 / 2, label: 'Milieu' },
  { f: 1 / 3, label: '1/3' },
  { f: 2 / 3, label: '2/3' },
  { f: 1 / 4, label: '1/4' },
  { f: 3 / 4, label: '3/4' },
]

/**
 * Repères horizontaux d'un support : son centre au milieu, au tiers, au quart de la largeur de l'étagère, et les places
 * qui séparent les supports du dessous en écarts égaux.
 */
export function supportXGuides(plan: Plan, supportId: string): Guide[] {
  const support = plan.supports?.find((s) => s.id === supportId)
  if (!support) return []
  const guides: Guide[] = FRACTIONS.map(({ f, label }) => ({
    pos: Math.round(plan.width * f - support.width / 2),
    size: support.width,
    label,
  }))
  const under = (plan.supports ?? []).filter((s: Support) => s.y < 0 && s.id !== supportId).sort((a, b) => a.x - b.x)
  if (support.y < 0 && under.length > 0) {
    // Même rangement que l'étagère : les supports du dessous, répartis à égalité sur toute la largeur.
    for (let index = 0; index <= under.length; index++) {
      const widths = under.map((s) => s.width)
      widths.splice(index, 0, support.width)
      guides.push({ pos: evenSlots(0, plan.width, widths)[index], size: support.width, label: `Écarts égaux (${widths.length} supports)` })
    }
  }
  return dedupe(guides)
}

/** Repère de profondeur d'un support : centré dans la profondeur de l'étagère. */
export function supportZGuides(support: Support, frontDepth: number): Guide[] {
  return [{ pos: Math.round((frontDepth - support.depth) / 2), size: support.depth, label: 'Milieu de la profondeur' }]
}

/** Jour (mm) laissé au-dessus de la plus haute pile d'objets par le repère « Ajusté aux objets ». */
export const OBJECT_CLEARANCE_MM = 20

/**
 * Repères d'une tablette intermédiaire (`pos` = dessous de la tablette, `size` = son épaisseur) :
 * - « Étages égaux » : l'étage du dessous et celui du dessus ont la même hauteur libre ;
 * - « Ajusté aux objets » : l'étage du dessous laisse 2 cm au-dessus de sa plus haute pile d'objets (comme le
 *   bouton « Ajuster l'étage » avec sa marge par défaut) ;
 * - « Même hauteur que l'étage N » : l'étage du dessous prend la hauteur libre d'un autre étage.
 * Une tablette du haut ou du bas n'en a pas (elle ne se glisse pas).
 */
export function shelfGuides(plan: Plan, shelfId: string): Guide[] {
  const shelves = sortedShelves(plan)
  const index = shelves.findIndex((s) => s.id === shelfId)
  if (index <= 0 || index >= shelves.length - 1) return []
  const shelf = shelves[index]
  const below = shelves[index - 1]
  const above = shelves[index + 1]
  const belowTop = below.y + below.thickness
  const size = shelf.thickness
  const guides: Guide[] = [{ pos: Math.round((belowTop + above.y - size) / 2), size, label: 'Étages égaux' }]

  const tallest = tallestPile(plan, below.id)
  if (tallest > 0) guides.push({ pos: belowTop + tallest + OBJECT_CLEARANCE_MM, size, label: 'Ajusté aux objets' })

  const stages = getStages(plan)
  stages.forEach((st, i) => {
    // Les deux étages qui touchent la tablette changent pendant le glisser : pas de repère sur eux.
    if (st.shelfBelowId === below.id || st.shelfBelowId === shelf.id) return
    guides.push({ pos: belowTop + st.clearHeight, size, label: `Même hauteur que l’étage ${i + 1}` })
  })

  return dedupe(guides)
}

/**
 * Hauteur de la plus haute pile d'objets d'un étage (rangées et objets posés seuls, dans leur sens, qu'ils aient de la
 * place en largeur ou non), 0 s'il n'y en a pas. Même calcul que « Ajuster l'étage » (`fitStageToObjects`).
 */
export function tallestPile(plan: Plan, shelfBelowId: string): number {
  const heights: number[] = []
  for (const row of plan.rows ?? []) {
    const kind = row.shelfBelowId === shelfBelowId ? resolveKind(plan, row.kind) : undefined
    if (kind) heights.push(Math.min(row.stack ?? 1, row.count) * orientedSize(kind, row.orientation).height)
  }
  for (const p of plan.placedObjects ?? []) {
    const kind = p.shelfBelowId === shelfBelowId ? resolveKind(plan, p.kind) : undefined
    if (kind) heights.push((p.stack ?? 1) * orientedSize(kind, p.orientation).height)
  }
  return Math.max(0, ...heights)
}

/** Un objet dessiné (rangée ou posé seul) et son étage, ou null. */
export function findDrawnObject(plan: Plan, id: string): { object: DrawnObject; shelfBelowId: string } | null {
  for (const stage of getStages(plan)) {
    const object = layoutStage(plan, stage).objects.find((o) => o.id === id)
    if (object) return { object, shelfBelowId: stage.shelfBelowId }
  }
  return null
}

/**
 * Repères d'un objet de simulation de largeur `width` posé dans l'étage au-dessus de `shelfBelowId` :
 * - le milieu de l'étage (entre les montants) ;
 * - le même bord gauche qu'une cale ou qu'un objet posé seul d'un autre étage (trait sur toute la hauteur).
 * Les objets des rangées ne servent pas de repère : collés les uns aux autres, ils en donneraient un tous les 1 à 3 cm.
 * Pour un alignement, `size` vaut 0 : le trait passe par le bord gauche commun, pas par le milieu de l'objet.
 */
export function objectGuides(plan: Plan, objectId: string, width: number, shelfBelowId: string): Guide[] {
  const span = innerSpan(plan)
  const guides: Guide[] = [{ pos: Math.round((span.left + span.right - width) / 2), size: width, label: 'Milieu' }]
  for (const w of plan.wedges) {
    if (w.shelfBelowId === shelfBelowId) continue
    guides.push({ pos: w.x, size: 0, label: 'Aligné avec une cale', aligned: true })
  }
  for (const p of plan.placedObjects ?? []) {
    if (p.shelfBelowId === shelfBelowId || `obj:${p.id}` === objectId) continue
    guides.push({ pos: p.x, size: 0, label: 'Aligné avec un objet', aligned: true })
  }
  return dedupe(guides)
}

function dedupe(guides: Guide[]): Guide[] {
  const seen = new Set<number>()
  return guides.filter((g) => {
    if (seen.has(g.pos)) return false
    seen.add(g.pos)
    return true
  })
}
