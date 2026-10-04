/**
 * Modèle de données d'une étagère « cadre ».
 * Toutes les valeurs sont en millimètres entiers.
 *
 * Repère : x part du bord gauche extérieur (vers la droite),
 * y part du dessous du cadre (vers le haut).
 */

/** Position des tablettes du haut et du bas par rapport aux montants. */
export type FramePlacement = 'between' | 'onTop'

export interface Upright {
  thickness: number
  depth: number
}

export interface Shelf {
  id: string
  /** Hauteur de la face inférieure de la tablette, depuis le dessous du cadre. */
  y: number
  thickness: number
  depth: number
}

/** Planche verticale non fixée, posée dans un étage pour soutenir la tablette du dessus. */
export interface Wedge {
  id: string
  /** Identifiant de la tablette située sous l'étage où se trouve la cale. */
  shelfBelowId: string
  /** Position du bord gauche de la cale, depuis le bord gauche extérieur du cadre. */
  x: number
  thickness: number
  depth: number
}

export interface PlanOptions {
  /**
   * Propagation « intelligente » : si activée, changer la largeur garde les cales à leur position
   * proportionnelle et changer la hauteur répartit les tablettes proportionnellement.
   */
  propagation: boolean
  /** Fixation murale : ajoute une note et un repère « F » sur le plan PDF. */
  wallMount: boolean
  framePlacement: FramePlacement
  /** Épaisseur proposée pour les nouvelles cales. */
  defaultWedgeThickness: number
  /** Jeu retranché à la hauteur de chaque cale. */
  wedgeClearance: number
  sawKerfEnabled: boolean
  /** Épaisseur du trait de scie. */
  sawKerf: number
}

export interface Plan {
  name: string
  /** Largeur extérieure (hors-tout) du cadre. */
  width: number
  /** Hauteur extérieure (hors-tout) du cadre. */
  height: number
  leftUpright: Upright
  rightUpright: Upright
  shelves: Shelf[]
  wedges: Wedge[]
  options: PlanOptions
}

export type PieceKind = 'upright' | 'shelf' | 'wedge'

/** Pièce de bois à découper. `length` suit le sens principal de la pièce. */
export interface Piece {
  id: string
  kind: PieceKind
  length: number
  width: number
  thickness: number
}

/** Espace entre deux tablettes consécutives. */
export interface Stage {
  shelfBelowId: string
  shelfAboveId: string
  /** Hauteur du bas de l'espace libre (dessus de la tablette du dessous). */
  y: number
  /** Hauteur libre entre la tablette du dessous et celle du dessus. */
  clearHeight: number
}
