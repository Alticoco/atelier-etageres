import { createPlan } from './plan'
import type { FramePlacement, Plan, PlanModel } from './types'
import { parseLength } from './units'

/** Valeurs brutes du formulaire de création : du texte, avec les longueurs en cm. */
export interface WizardValues {
  name: string
  /** Modèle de construction : avec ou sans cadre. */
  model: PlanModel
  /** Débord des tablettes (cm), pour le modèle sans cadre. */
  overhang: string
  width: string
  height: string
  depth: string
  stages: string
  uprightThickness: string
  shelfThickness: string
  wedgeThickness: string
  framePlacement: FramePlacement
}

export type WizardField = Exclude<keyof WizardValues, 'name' | 'framePlacement' | 'model'>

export type WizardResult =
  | { ok: true; plan: Plan }
  | { ok: false; fieldErrors: Partial<Record<WizardField, string>>; formError?: string }

export const DEFAULT_WIZARD_VALUES: WizardValues = {
  name: 'Nouvelle étagère',
  model: 'frame',
  overhang: '2',
  width: '80',
  height: '100',
  depth: '25',
  stages: '3',
  uprightThickness: '1,8',
  shelfThickness: '1,8',
  wedgeThickness: '1,8',
  framePlacement: 'between',
}

/** Plan vierge minimal : un seul étage, épaisseurs courantes. */
export const BLANK_WIZARD_VALUES: WizardValues = {
  ...DEFAULT_WIZARD_VALUES,
  name: 'Étagère vierge',
  width: '60',
  height: '40',
  depth: '25',
  stages: '1',
}

/** Modèle de départ : pré-remplit l'assistant, l'utilisateur ajuste ensuite. */
export interface WizardPreset {
  id: string
  label: string
  description: string
  values: WizardValues
}

/**
 * Modèles de départ. Toutes les valeurs sont des estimations, à ajuster.
 * Les épaisseurs sont des épaisseurs courantes de bois massif (15, 18, 20, 22 mm).
 */
export const WIZARD_PRESETS: WizardPreset[] = [
  {
    id: 'mangatheque',
    label: 'Mangathèque',
    description: '5 étages de 19 cm libres (mangas de 17,5 cm), profondeur 15 cm.',
    // estimation, à ajuster
    values: {
      ...DEFAULT_WIZARD_VALUES,
      name: 'Mangathèque',
      width: '60',
      height: '105,8',
      depth: '15',
      stages: '5',
      uprightThickness: '1,8',
      shelfThickness: '1,8',
      wedgeThickness: '1,8',
    },
  },
  {
    id: 'epices',
    label: 'Étagère à épices',
    description: '5 petits étages de 12 cm libres, profondeur 8 cm, planches fines (15 mm).',
    // estimation, à ajuster
    values: {
      ...DEFAULT_WIZARD_VALUES,
      name: 'Étagère à épices',
      width: '40',
      height: '69',
      depth: '8',
      stages: '5',
      uprightThickness: '1,5',
      shelfThickness: '1,5',
      wedgeThickness: '1,5',
    },
  },
  {
    id: 'bibliotheque',
    label: 'Bibliothèque',
    description: '5 étages de 30 cm libres, profondeur 25 cm, bois de 22 mm.',
    // estimation, à ajuster
    values: {
      ...DEFAULT_WIZARD_VALUES,
      name: 'Bibliothèque',
      width: '80',
      height: '163,2',
      depth: '25',
      stages: '5',
      uprightThickness: '2,2',
      shelfThickness: '2,2',
      wedgeThickness: '2,2',
    },
  },
  {
    id: 'murale',
    label: 'Étagère murale sans cadre',
    description: '2 étages, planches apparentes qui dépassent de 2 cm, profondeur 20 cm.',
    // estimation, à ajuster
    values: {
      ...DEFAULT_WIZARD_VALUES,
      name: 'Étagère murale',
      model: 'frameless',
      overhang: '2',
      width: '80',
      height: '60',
      depth: '20',
      stages: '2',
      uprightThickness: '2,2',
      shelfThickness: '2,2',
      wedgeThickness: '2,2',
    },
  },
  {
    id: 'meuble-bas',
    label: 'Meuble bas',
    description: '2 étages de 32 cm libres, profondeur 35 cm, bois de 20 mm.',
    // estimation, à ajuster
    values: {
      ...DEFAULT_WIZARD_VALUES,
      name: 'Meuble bas',
      width: '90',
      height: '70',
      depth: '35',
      stages: '2',
      uprightThickness: '2',
      shelfThickness: '2',
      wedgeThickness: '2',
    },
  },
]

const LENGTH_FIELDS: WizardField[] = [
  'width',
  'height',
  'depth',
  'uprightThickness',
  'shelfThickness',
  'wedgeThickness',
]

const NOT_A_LENGTH = 'Entrez une longueur en cm, au mm près (ex. 80 ou 80,5).'
const NOT_POSITIVE = 'Doit être supérieur à 0.'

/** Lit le formulaire et construit le plan, ou explique ce qui ne va pas. */
export function resolveWizard(values: WizardValues): WizardResult {
  const fieldErrors: Partial<Record<WizardField, string>> = {}
  const mm: Partial<Record<WizardField, number>> = {}

  for (const field of LENGTH_FIELDS) {
    const parsed = parseLength(values[field], 'cm')
    if (parsed === null) fieldErrors[field] = NOT_A_LENGTH
    else if (parsed === 0) fieldErrors[field] = NOT_POSITIVE
    else mm[field] = parsed
  }

  // Le débord (modèle sans cadre) peut valoir 0 : une tablette qui affleure les montants.
  let overhangMm = 0
  if (values.model === 'frameless') {
    const parsed = parseLength(values.overhang, 'cm')
    if (parsed === null) fieldErrors.overhang = NOT_A_LENGTH
    else overhangMm = parsed
  }

  const stagesText = values.stages.trim()
  const stages = /^\d+$/.test(stagesText) ? Number(stagesText) : null
  if (stages === null) fieldErrors.stages = "Entrez un nombre entier d'étages (ex. 3)."
  else if (stages === 0) fieldErrors.stages = NOT_POSITIVE

  if (Object.keys(fieldErrors).length > 0 || stages === null) {
    return { ok: false, fieldErrors }
  }

  try {
    const plan = createPlan({
      model: values.model,
      overhang: overhangMm,
      name: values.name.trim() || DEFAULT_WIZARD_VALUES.name,
      width: mm.width!,
      height: mm.height!,
      depth: mm.depth!,
      stages,
      uprightThickness: mm.uprightThickness!,
      shelfThickness: mm.shelfThickness!,
      wedgeThickness: mm.wedgeThickness!,
      framePlacement: values.framePlacement,
    })
    return { ok: true, plan }
  } catch (error) {
    if (error instanceof RangeError) return { ok: false, fieldErrors: {}, formError: error.message }
    throw error
  }
}
