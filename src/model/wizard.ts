import { createPlan } from './plan'
import type { FramePlacement, Plan } from './types'
import { parseLength } from './units'

/** Valeurs brutes du formulaire de création : du texte, avec les longueurs en cm. */
export interface WizardValues {
  name: string
  width: string
  height: string
  depth: string
  stages: string
  uprightThickness: string
  shelfThickness: string
  wedgeThickness: string
  framePlacement: FramePlacement
}

export type WizardField = Exclude<keyof WizardValues, 'name' | 'framePlacement'>

export type WizardResult =
  | { ok: true; plan: Plan }
  | { ok: false; fieldErrors: Partial<Record<WizardField, string>>; formError?: string }

export const DEFAULT_WIZARD_VALUES: WizardValues = {
  name: 'Nouvelle étagère',
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

  const stagesText = values.stages.trim()
  const stages = /^\d+$/.test(stagesText) ? Number(stagesText) : null
  if (stages === null) fieldErrors.stages = "Entrez un nombre entier d'étages (ex. 3)."
  else if (stages === 0) fieldErrors.stages = NOT_POSITIVE

  if (Object.keys(fieldErrors).length > 0 || stages === null) {
    return { ok: false, fieldErrors }
  }

  try {
    const plan = createPlan({
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
