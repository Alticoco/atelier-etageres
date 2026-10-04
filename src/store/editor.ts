import { setPieceProperty, setPlanProperty, setPlanSize, type PieceProperty, type PlanChange } from '../model/edit'
import { selectPiece } from '../model/selection'
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

export const initialEditorState: EditorState = { plan: null, selection: [], unit: 'cm', snapStep: 10 }

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'newPlan':
      return { ...state, plan: action.plan, selection: [] }
    case 'selectPiece':
      return { ...state, selection: selectPiece(state.selection, action.id, action.additive) }
    case 'clearSelection':
      return state.selection.length === 0 ? state : { ...state, selection: [] }
    case 'setUnit':
      return { ...state, unit: action.unit }
    case 'setSnapStep':
      return { ...state, snapStep: action.mm }
    case 'setPieceProperty': {
      if (!state.plan) return state
      const result = setPieceProperty(state.plan, action.ids, action.property, action.mm)
      return result.ok ? { ...state, plan: result.plan } : state
    }
    case 'setPlanSize': {
      if (!state.plan) return state
      const result = setPlanSize(state.plan, { width: action.width, height: action.height })
      return result.ok ? { ...state, plan: result.plan } : state
    }
    case 'setPlanProperty': {
      if (!state.plan) return state
      const result = setPlanProperty(state.plan, action.change)
      return result.ok ? { ...state, plan: result.plan } : state
    }
  }
}
