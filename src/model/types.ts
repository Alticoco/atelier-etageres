/**
 * Modèle de données d'une étagère « cadre ».
 * Toutes les valeurs sont en millimètres entiers.
 *
 * Repère : x part du bord gauche extérieur (vers la droite),
 * y part du dessous du cadre (vers le haut).
 */

/**
 * Modèle de construction.
 * - `frame` : deux montants pleine hauteur, les tablettes entre eux (modèle « cadre »).
 * - `frameless` : planches apparentes. Tablettes continues avec un débord à chaque bout, montants coupés à la
 *   hauteur de chaque étage et fixés entre les tablettes, un à gauche et un à droite.
 */
export type PlanModel = 'frame' | 'frameless'

/** Position des tablettes du haut et du bas par rapport aux montants (modèle `frame` seulement). */

export type FramePlacement = 'between' | 'onTop'

export interface Upright {
  thickness: number
  depth: number
  /**
   * Arrondis (mm, 0 = angle droit). `cornerRadius` : coins de la silhouette vue de face ; `edgeRadius` : arrondi de la
   * tranche, vu de profil. Chacun est limité à la moitié de la plus petite dimension visible de la pièce.
   */
  cornerRadius: number
  edgeRadius: number
}

export interface Shelf {
  id: string
  /** Hauteur de la face inférieure de la tablette, depuis le dessous du cadre. */
  y: number
  thickness: number
  depth: number
  /**
   * Modèle `frameless` : débord à gauche / à droite, mesuré depuis la face extérieure des montants jusqu'au bout
   * de la tablette. Ignoré (0) dans le modèle `frame`.
   */
  overhangLeft: number
  overhangRight: number
  /**
   * Modèle `frameless` : y a-t-il un montant à gauche / à droite dans l'étage situé AU-DESSUS de cette tablette ?
   * Ignoré dans le modèle `frame`.
   */
  verticalLeft: boolean
  verticalRight: boolean
  /**
   * Arrondis (mm, 0 = angle droit). `cornerRadius` : coins de la silhouette vue de face ; `edgeRadius` : arrondi de la
   * tranche, vu de profil. Chacun est limité à la moitié de la plus petite dimension visible de la pièce.
   */
  cornerRadius: number
  edgeRadius: number
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
  /**
   * Arrondis (mm, 0 = angle droit). `cornerRadius` : coins de la silhouette vue de face ; `edgeRadius` : arrondi de la
   * tranche, vu de profil. Chacun est limité à la moitié de la plus petite dimension visible de la pièce.
   */
  cornerRadius: number
  edgeRadius: number
}

/** Rangée d'objets de simulation (mangas, livres, bocaux…) posée dans un étage. N'a aucun effet sur les pièces de bois. */
export interface ObjectRow {
  id: string
  /** Tablette située sous l'étage. */
  shelfBelowId: string
  /** Identifiant du type d'objet (voir `OBJECT_KINDS`). */
  kind: string
  count: number
}

/**
 * Planche de soutien posée sous ou autour de l'étagère (pieds, tasseaux, fixation latérale). Elle ne fait pas partie
 * de l'étagère : elle sert à porter son poids ou à la caler dans son environnement. Une simple boîte.
 */
export interface Support {
  id: string
  /** Bord gauche, depuis le bord gauche hors-tout de l'étagère (négatif = à gauche de l'étagère). */
  x: number
  /** Dessous de la planche, depuis le dessous du cadre (négatif = sous l'étagère). */
  y: number
  /** Recul : distance entre le mur et la face arrière de la planche (0 = contre le mur). */
  z: number
  /** Dimension horizontale vue de face. */
  width: number
  /** Dimension verticale. */
  height: number
  /** Dimension dans la profondeur (du mur vers l'avant). */
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
  /** Modèle de construction, choisi à la création. */
  model: PlanModel
  name: string
  /** Largeur hors-tout : cadre, ou tablettes avec leurs débords pour le modèle sans cadre. */
  width: number
  /** Hauteur extérieure (hors-tout) du cadre. */
  height: number
  leftUpright: Upright
  rightUpright: Upright
  shelves: Shelf[]
  wedges: Wedge[]
  /** Objets de simulation, absent s'il n'y en a pas. */
  rows?: ObjectRow[]
  /** Planches de soutien (à part de l'étagère), absentes s'il n'y en a pas. */
  supports?: Support[]
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
  cornerRadius: number
  edgeRadius: number
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
