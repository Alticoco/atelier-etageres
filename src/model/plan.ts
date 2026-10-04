import type { FramePlacement, Plan, PlanModel, Shelf } from './types'

export interface PlanParams {
  /** Modèle de construction (par défaut : avec cadre). */
  model?: PlanModel
  /** Modèle sans cadre : débord de chaque tablette à gauche et à droite (mm, par défaut 0). */
  overhang?: number
  name?: string
  width: number
  height: number
  depth: number
  /** Nombre d'étages (au moins 1). Il y a toujours étages + 1 tablettes. */
  stages: number
  uprightThickness: number
  shelfThickness: number
  /** Épaisseur des nouvelles cales (par défaut : celle des tablettes). */
  wedgeThickness?: number
  framePlacement?: FramePlacement
  /** Propagation intelligente (activée par défaut). */
  propagation?: boolean
  /** Fixation murale (désactivée par défaut). */
  wallMount?: boolean
  wedgeClearance?: number
  sawKerfEnabled?: boolean
  sawKerf?: number
}

export const DEFAULT_WEDGE_CLEARANCE = 1
export const DEFAULT_SAW_KERF = 3

function assertPositiveInt(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${label} doit être un nombre entier de mm strictement positif (reçu : ${value})`)
  }
}

function assertNonNegativeInt(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} doit être un nombre entier de mm positif ou nul (reçu : ${value})`)
  }
}

/**
 * Crée un plan avec des étages répartis également.
 * Si la hauteur libre ne se divise pas exactement, les mm restants sont
 * donnés un par un aux étages en partant du bas.
 */
export function createPlan(params: PlanParams): Plan {
  const {
    model = 'frame',
    overhang = 0,
    name = 'Nouvelle étagère',
    width,
    height,
    depth,
    stages,
    uprightThickness,
    shelfThickness,
    wedgeThickness = shelfThickness,
    framePlacement = 'between',
    propagation = true,
    wallMount = false,
    wedgeClearance = DEFAULT_WEDGE_CLEARANCE,
    sawKerfEnabled = false,
    sawKerf = DEFAULT_SAW_KERF,
  } = params

  assertPositiveInt(width, 'La largeur')
  assertPositiveInt(height, 'La hauteur')
  assertPositiveInt(depth, 'La profondeur')
  assertPositiveInt(stages, "Le nombre d'étages")
  assertPositiveInt(uprightThickness, "L'épaisseur des montants")
  assertPositiveInt(shelfThickness, "L'épaisseur des tablettes")
  assertPositiveInt(wedgeThickness, "L'épaisseur des cales")
  assertNonNegativeInt(wedgeClearance, 'Le jeu des cales')
  assertNonNegativeInt(sawKerf, 'Le trait de scie')
  assertNonNegativeInt(overhang, 'Le débord')

  const frameless = model === 'frameless'
  const sideOverhang = frameless ? overhang : 0
  if (width <= 2 * uprightThickness + 2 * sideOverhang) {
    throw new RangeError(
      frameless
        ? 'La largeur est trop faible pour deux montants, leurs débords et un espace entre eux'
        : 'La largeur est trop faible pour deux montants et un espace entre eux',
    )
  }

  const freeHeight = height - (stages + 1) * shelfThickness
  const baseStageHeight = Math.floor(freeHeight / stages)
  if (baseStageHeight < 1) {
    throw new RangeError("La hauteur est trop faible pour ce nombre d'étages et cette épaisseur de tablettes")
  }
  const extra = freeHeight % stages

  const shelves: Shelf[] = []
  let y = 0
  for (let i = 0; i <= stages; i++) {
    shelves.push({
      id: `shelf-${i + 1}`,
      y,
      thickness: shelfThickness,
      depth,
      overhangLeft: sideOverhang,
      overhangRight: sideOverhang,
      verticalLeft: true,
      verticalRight: true,
    })
    y += shelfThickness + baseStageHeight + (i < extra ? 1 : 0)
  }

  return {
    model,
    name,
    width,
    height,
    leftUpright: { thickness: uprightThickness, depth },
    rightUpright: { thickness: uprightThickness, depth },
    shelves,
    wedges: [],
    options: { propagation, wallMount, framePlacement, defaultWedgeThickness: wedgeThickness, wedgeClearance, sawKerfEnabled, sawKerf },
  }
}
