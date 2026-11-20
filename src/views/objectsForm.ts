import type { ObjectOrientation } from '../model/types'
import { OBJECT_KINDS } from '../model/objects'

/** Réglages du formulaire de simulation. Gardés par le panneau : ils survivent quand on clique une autre pièce. */
export interface ObjectsForm {
  stage: string
  kind: string
  count: string
  gap: number
  /** Sens des objets à poser. */
  orientation: ObjectOrientation
  /** Objets par pile, tel que saisi (vide = 1). */
  stack: string
  /** Marge au-dessus des objets pour « Ajuster l'étage » (mm). */
  fitMargin: number
}

export const INITIAL_OBJECTS_FORM: ObjectsForm = {
  stage: '',
  kind: OBJECT_KINDS[0].id,
  count: '',
  gap: 0,
  orientation: 'standing',
  stack: '',
  fitMargin: 20,
}
