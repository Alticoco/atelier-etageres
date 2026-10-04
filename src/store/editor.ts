import {
  setPieceProperty,
  setPlanProperty,
  setPlanSize,
  type EditResult,
  type PieceProperty,
  type PlanChange,
} from '../model/edit'
import { selectPiece } from '../model/selection'
import { addShelf, addWedge, distributeShelves, removePieces, type AddResult } from '../model/tools'
import type { Plan } from '../model/types'
import type { LengthUnit } from '../model/units'

/**
 * État global de l'éditeur. Toute modification passe par une action nommée ;
 * l'historique annuler/rétablir (étape 7) viendra s'y brancher.
 */
export interface EditorState {
  plan: Plan | null
  selection: string[]
  unit: LengthUnit
  /** Pas d'aimantation du glisser-déposer, en mm. */
  snapStep: number
}

export type EditorAction =
  | { type: 'newPlan'; plan: Plan }
  | { type: 'selectPiece'; id: string; additive: boolean }
  | { type: 'clearSelection' }
  | { type: 'setUnit'; unit: LengthUnit }
  | { type: 'setSnapStep'; mm: number }
  | { type: 'setPieceProperty'; ids: string[]; property: PieceProperty; mm: number }
  | { type: 'setPlanProperty'; change: PlanChange }
  | { type: 'setPlanSize'; width?: number; height?: number }
  | { type: 'addShelf'; shelfBelowId: string }
  | { type: 'addWedge'; shelfBelowId: string }
  | { type: 'removePieces'; ids: string[] }
  | { type: 'distributeShelves' }

export const initialEditorState: EditorState = { plan: null, selection: [], unit: 'cm', snapStep: 10 }

export interface ActionOutcome {
  state: EditorState
  /** Message en français si l'action a été refusée (l'état est alors inchangé). */
  error: string | null
}

const noPlan = 'Aucune étagère ouverte.'

/** Applique une action. Une action refusée par les contrôles de cohérence renvoie l'état d'origine et un message. */
export function applyAction(state: EditorState, action: EditorAction): ActionOutcome {
  const accepted = (next: EditorState): ActionOutcome => ({ state: next, error: null })
  const refused = (error: string): ActionOutcome => ({ state, error })
  const withPlan = (result: EditResult): ActionOutcome =>
    result.ok ? accepted({ ...state, plan: result.plan }) : refused(result.error)
  const withAdded = (result: AddResult): ActionOutcome =>
    result.ok ? accepted({ ...state, plan: result.plan, selection: [result.id] }) : refused(result.error)

  switch (action.type) {
    case 'newPlan':
      return accepted({ ...state, plan: action.plan, selection: [] })
    case 'selectPiece':
      return accepted({ ...state, selection: selectPiece(state.selection, action.id, action.additive) })
    case 'clearSelection':
      return accepted(state.selection.length === 0 ? state : { ...state, selection: [] })
    case 'setUnit':
      return accepted({ ...state, unit: action.unit })
    case 'setSnapStep':
      return accepted({ ...state, snapStep: action.mm })
  }

  const { plan } = state
  if (!plan) return refused(noPlan)

  switch (action.type) {
    case 'setPieceProperty':
      return withPlan(setPieceProperty(plan, action.ids, action.property, action.mm))
    case 'setPlanProperty':
      return withPlan(setPlanProperty(plan, action.change))
    case 'setPlanSize':
      return withPlan(setPlanSize(plan, { width: action.width, height: action.height }))
    case 'distributeShelves':
      return withPlan(distributeShelves(plan))
    case 'addShelf':
      return withAdded(addShelf(plan, action.shelfBelowId))
    case 'addWedge':
      return withAdded(addWedge(plan, action.shelfBelowId))
    case 'removePieces': {
      const result = removePieces(plan, action.ids)
      if (!result.ok) return refused(result.error)
      return accepted({
        ...state,
        plan: result.plan,
        selection: state.selection.filter((id) => !action.ids.includes(id)),
      })
    }
  }
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  return applyAction(state, action).state
}
