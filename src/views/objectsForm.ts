import { OBJECT_KINDS } from '../model/objects'

/** Réglages du formulaire de simulation. Gardés par le panneau : ils survivent quand on clique une autre pièce. */
export interface ObjectsForm {
  stage: string
  kind: string
  count: string
  gap: number
}

export const INITIAL_OBJECTS_FORM: ObjectsForm = { stage: '', kind: OBJECT_KINDS[0].id, count: '', gap: 0 }
