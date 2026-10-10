import { innerSpan } from './geometry'
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

function dedupe(guides: Guide[]): Guide[] {
  const seen = new Set<number>()
  return guides.filter((g) => {
    if (seen.has(g.pos)) return false
    seen.add(g.pos)
    return true
  })
}
