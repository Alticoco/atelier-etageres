import { computePieces } from './pieces'
import { supportGroups, type SupportGroup } from './supports'
import { formatLength, formatNumber, type LengthUnit } from './units'
import type { Plan } from './types'

/** Un lot de pièces identiques (mêmes longueur, largeur et épaisseur), repéré par une lettre. */
export interface CutGroup {
  /** Repère : A, B, C… puis AA, AB… s'il y a plus de 26 lots. */
  mark: string
  length: number
  width: number
  thickness: number
  /** Arrondis des pièces du lot (mm, 0 = angle droit). Deux pièces d'arrondis différents ne sont jamais dans le même lot. */
  cornerRadius: number
  edgeRadius: number
  quantity: number
  /** Identifiants des pièces du lot (montants, tablettes, cales). */
  pieceIds: string[]
}

export interface SawKerfEstimate {
  /** Nombre de coupes estimé : une par pièce. */
  cuts: number
  /** Épaisseur du trait de scie (mm). */
  kerf: number
  /** Bois perdu en tout (mm) = coupes × trait de scie. */
  loss: number
}

export interface CutList {
  groups: CutGroup[]
  /** Repère de chaque pièce, pour l'afficher sur le plan : identifiant de pièce → lettre. */
  marks: Record<string, string>
  totalPieces: number
  /** Supports (planches à part, hors étagère), listés séparément : repères S1, S2… */
  supports: SupportGroup[]
  /** Estimation de la perte due au trait de scie, ou null si l'option est désactivée. */
  sawKerf: SawKerfEstimate | null
}

/** A, B, …, Z, AA, AB, … (numérotation des colonnes d'un tableur). */
export function indexToMark(index: number): string {
  let mark = ''
  let n = index
  do {
    mark = String.fromCharCode(65 + (n % 26)) + mark
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return mark
}

/**
 * Liste de découpe : pièces regroupées par dimensions identiques (longueur × largeur × épaisseur),
 * avec quantité et repère. Les lots sont repérés dans l'ordre d'apparition : montants, tablettes de bas en haut,
 * puis cales. Pas d'optimisation de découpe : on liste simplement ce qu'il faut.
 */
export function computeCutList(plan: Plan): CutList {
  const groups: CutGroup[] = []
  const byDimensions = new Map<string, CutGroup>()
  const marks: Record<string, string> = {}

  for (const piece of computePieces(plan)) {
    const key = `${piece.length}x${piece.width}x${piece.thickness}:${piece.cornerRadius}:${piece.edgeRadius}`
    let group = byDimensions.get(key)
    if (!group) {
      group = {
        mark: indexToMark(groups.length),
        length: piece.length,
        width: piece.width,
        thickness: piece.thickness,
        cornerRadius: piece.cornerRadius,
        edgeRadius: piece.edgeRadius,
        quantity: 0,
        pieceIds: [],
      }
      byDimensions.set(key, group)
      groups.push(group)
    }
    group.quantity += 1
    group.pieceIds.push(piece.id)
    marks[piece.id] = group.mark
  }

  const totalPieces = groups.reduce((sum, g) => sum + g.quantity, 0)
  const { sawKerfEnabled, sawKerf } = plan.options
  return {
    groups,
    marks,
    totalPieces,
    supports: supportGroups(plan),
    sawKerf: sawKerfEnabled ? { cuts: totalPieces, kerf: sawKerf, loss: totalPieces * sawKerf } : null,
  }
}

/** Arrondi d'un lot en toutes lettres (« coins R 0,9 cm · arêtes R 0,5 cm »), ou « — » s'il n'y en a pas. */
export function describeRounding(cornerRadius: number, edgeRadius: number, unit: LengthUnit = 'cm'): string {
  const parts: string[] = []
  if (cornerRadius > 0) parts.push(`coins R ${formatLength(cornerRadius, unit)}`)
  if (edgeRadius > 0) parts.push(`arêtes R ${formatLength(edgeRadius, unit)}`)
  return parts.length > 0 ? parts.join(' · ') : '—'
}

/** Arrondi d'un lot en abrégé pour le PDF : « C0,9 A0,5 » (C = coins, A = arêtes), ou « — ». */
export function roundingCode(cornerRadius: number, edgeRadius: number, unit: LengthUnit = 'cm'): string {
  const parts: string[] = []
  if (cornerRadius > 0) parts.push(`C${formatNumber(cornerRadius, unit)}`)
  if (edgeRadius > 0) parts.push(`A${formatNumber(edgeRadius, unit)}`)
  return parts.length > 0 ? parts.join(' ') : '—'
}
