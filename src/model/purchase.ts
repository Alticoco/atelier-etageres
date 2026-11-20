import { computeCutList } from './cutlist'
import { fail, finish, type EditResult } from './edit'
import type { Plan } from './types'

/** Longueur de planche du commerce proposée par défaut (mm). */
export const DEFAULT_STOCK_LENGTH = 2400
/** Longueurs proposées dans la liste (mm) ; toute autre valeur se saisit librement. */
export const STOCK_LENGTH_CHOICES = [2000, 2400, 2500, 3000]
export const MIN_STOCK_LENGTH = 100
export const MAX_STOCK_LENGTH = 6000
export const MAX_STOCK_KEYS = 50

/** D'où vient une pièce : étagère (montants, tablettes, cales), support, ou porte / tiroir. */
export type PieceOrigin = 'shelf' | 'support' | 'front'

/** Une pièce à sortir d'une planche : repère de son lot (A, S1, P1…), longueur, section. */
export interface PurchasePiece {
  mark: string
  length: number
  /** Largeur de la section (mm) : la `width` de la pièce dans les listes de découpe. */
  width: number
  thickness: number
  origin: PieceOrigin
}

export interface PurchaseRow {
  /** Clé de section « largeurxépaisseur » (mm), aussi la clé de `options.stockLengths`. */
  key: string
  width: number
  thickness: number
  pieces: number
  /** Somme des longueurs des pièces (mm), sans trait de scie. */
  totalLength: number
  /** Nombre de pièces par origine (seules les origines présentes apparaissent). */
  origins: Partial<Record<PieceOrigin, number>>
}

export interface BoardCut {
  mark: string
  length: number
}

export interface Board {
  pieces: BoardCut[]
  /** Chute restante (mm), trait de scie déduit, jamais négative. */
  waste: number
}

export interface SectionCuts {
  boards: Board[]
  /** Pièces trop longues pour la planche du commerce (message en français) ; elles ne sont pas placées. */
  errors: string[]
}

export interface SectionPurchase extends PurchaseRow {
  stockLength: number
  boards: Board[]
  errors: string[]
  /** Chute totale (mm) de toutes les planches de la section. */
  totalWaste: number
}

export function sectionKey(width: number, thickness: number): string {
  return `${width}x${thickness}`
}

/**
 * Toutes les pièces à acheter, chacune avec le repère de son lot. Choix : on compte les trois listes de
 * cutlist.ts (étagère, supports, portes et tiroirs) car elles ont toutes la forme longueur × largeur × épaisseur
 * d'une planche ; l'origine est conservée pour l'afficher. Les portes sont supposées coupées dans une planche
 * de bois massif de leur largeur (pas de panneau collé, pas de quincaillerie).
 */
export function purchasePieces(plan: Plan): PurchasePiece[] {
  const cutList = computeCutList(plan)
  const pieces: PurchasePiece[] = []
  const add = (
    groups: { mark: string; length: number; width: number; thickness: number; quantity: number }[],
    origin: PieceOrigin,
  ) => {
    for (const g of groups) {
      for (let i = 0; i < g.quantity; i++) {
        pieces.push({ mark: g.mark, length: g.length, width: g.width, thickness: g.thickness, origin })
      }
    }
  }
  add(cutList.groups, 'shelf')
  add(cutList.supports, 'support')
  add(cutList.fronts, 'front')
  return pieces
}

/** Synthèse par section (largeur × épaisseur), triée par épaisseur puis largeur. */
export function purchaseSummary(plan: Plan): PurchaseRow[] {
  const rows = new Map<string, PurchaseRow>()
  for (const p of purchasePieces(plan)) {
    const key = sectionKey(p.width, p.thickness)
    let row = rows.get(key)
    if (!row) {
      row = { key, width: p.width, thickness: p.thickness, pieces: 0, totalLength: 0, origins: {} }
      rows.set(key, row)
    }
    row.pieces += 1
    row.totalLength += p.length
    row.origins[p.origin] = (row.origins[p.origin] ?? 0) + 1
  }
  return [...rows.values()].sort((a, b) => a.thickness - b.thickness || a.width - b.width)
}

/** « 1850 » → « 1 850 mm » (message d'erreur, indépendant de l'unité d'affichage). */
function mmText(mm: number): string {
  return `${String(mm).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} mm`
}

/**
 * Découpe en une dimension (une seule section) : heuristique « First Fit Decreasing » — pièces de la plus
 * longue à la plus courte, chacune dans la première planche où elle tient, sinon une nouvelle planche.
 * Chaque pièce posée coûte une coupe de `kerf` mm ; une planche contenant n pièces demande donc
 * somme des longueurs + kerf × (n − 1) ≤ longueur de la planche (la dernière coupe, côté chute, est gratuite
 * si elle tombe sur le bout de la planche). Pas d'amélioration supplémentaire : FFD est déjà proche de l'optimum
 * pour quelques dizaines de pièces.
 */
export function optimizeCuts(pieces: { mark: string; length: number }[], stockLength: number, kerf: number): SectionCuts {
  const errors: string[] = []
  const reported = new Set<string>()
  const usable: BoardCut[] = []
  for (const p of pieces) {
    if (p.length > stockLength) {
      const id = `${p.mark}:${p.length}`
      if (!reported.has(id)) {
        reported.add(id)
        errors.push(`la pièce ${p.mark} (${mmText(p.length)}) dépasse la longueur des planches (${mmText(stockLength)})`)
      }
    } else {
      usable.push({ mark: p.mark, length: p.length })
    }
  }
  usable.sort((a, b) => b.length - a.length)

  const boards: { pieces: BoardCut[]; sum: number }[] = []
  for (const piece of usable) {
    // Avec la pièce en plus (n + 1 pièces) : sum + length + kerf × n ≤ stock.
    const board = boards.find((b) => b.sum + piece.length + kerf * b.pieces.length <= stockLength)
    if (board) {
      board.pieces.push(piece)
      board.sum += piece.length
    } else {
      boards.push({ pieces: [piece], sum: piece.length })
    }
  }
  return {
    boards: boards.map((b) => ({ pieces: b.pieces, waste: Math.max(0, stockLength - b.sum - kerf * b.pieces.length) })),
    errors,
  }
}

/** Longueur de planche choisie pour une section (mm) : réglage du plan, sinon 2 400 mm. */
export function stockLengthFor(plan: Plan, key: string): number {
  return plan.options.stockLengths?.[key] ?? DEFAULT_STOCK_LENGTH
}

/** Synthèse + optimisation pour chaque section du plan. Trait de scie : celui des options s'il est activé, sinon 0. */
export function purchasePlan(plan: Plan): SectionPurchase[] {
  const kerf = plan.options.sawKerfEnabled ? plan.options.sawKerf : 0
  const all = purchasePieces(plan)
  return purchaseSummary(plan).map((row) => {
    const stockLength = stockLengthFor(plan, row.key)
    const own = all.filter((p) => p.width === row.width && p.thickness === row.thickness)
    const { boards, errors } = optimizeCuts(own, stockLength, kerf)
    return { ...row, stockLength, boards, errors, totalWaste: boards.reduce((sum, b) => sum + b.waste, 0) }
  })
}

/** Règle la longueur des planches d'une section (un pas d'historique via l'action `setStockLength`). */
export function setStockLength(plan: Plan, key: string, mm: number): EditResult {
  if (!/^\d+x\d+$/.test(key)) return fail('Section inconnue.')
  if (!Number.isInteger(mm) || mm < MIN_STOCK_LENGTH || mm > MAX_STOCK_LENGTH) {
    return fail(`La longueur des planches doit être un nombre entier de mm entre ${MIN_STOCK_LENGTH} et ${MAX_STOCK_LENGTH}.`)
  }
  // Seules comptent pour la limite les sections qui existent encore dans le plan (plus la section réglée ici).
  const present = new Set(purchaseSummary(plan).map((row) => row.key))
  const current: Record<string, number> = {}
  for (const [k, v] of Object.entries(plan.options.stockLengths ?? {})) if (present.has(k) || k === key) current[k] = v
  if (!(key in current) && Object.keys(current).length >= MAX_STOCK_KEYS) {
    return fail(`Pas plus de ${MAX_STOCK_KEYS} sections réglées.`)
  }
  const next = structuredClone(plan)
  next.options.stockLengths = { ...current, [key]: mm }
  return finish(next)
}
