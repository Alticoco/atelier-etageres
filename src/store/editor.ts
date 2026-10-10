import {
  setPieceProperty,
  setPlanProperty,
  setPlanSize,
  type EditResult,
  type PieceProperty,
  type PlanChange,
} from '../model/edit'
import { selectPiece } from '../model/selection'
import { pieceIds } from '../model/pieces'
import { addSupport, alignSupportFront, moveSupport, setSupportProperty, type SupportPlacement, type SupportProperty } from '../model/supports'
import { addObjectRow, moveObject, objectIdExists, removeObjectRow, setObjectRowCount, setObjectRowGap } from '../model/objects'
import { addShelf, addWedge, copyStageWedges, setStageCount, setStageHeight, distributeShelves, moveWedge, removePieces, setVertical, type AddResult } from '../model/tools'
import type { Plan } from '../model/types'
import type { LengthUnit } from '../model/units'

/**
 * État global de l'éditeur. Toute modification passe par une action nommée.
 *
 * Historique : `past` garde les versions précédentes du plan (la plus récente en dernier), `future` celles
 * qu'on a annulées (la prochaine à rétablir en premier). Seules les modifications du plan sont annulables ;
 * la sélection, l'unité et l'aimantation ne le sont pas. Il n'y a pas de limite en dehors de la mémoire.
 */
export interface EditorState {
  plan: Plan | null
  selection: string[]
  unit: LengthUnit
  /** Pas d'aimantation du glisser-déposer, en mm. */
  snapStep: number
  past: Plan[]
  future: Plan[]
}

export type EditorAction =
  | { type: 'newPlan'; plan: Plan }
  | { type: 'selectPiece'; id: string; additive: boolean }
  | { type: 'selectAll' }
  | { type: 'clearSelection' }
  | { type: 'setUnit'; unit: LengthUnit }
  | { type: 'setSnapStep'; mm: number }
  | { type: 'setPieceProperty'; ids: string[]; property: PieceProperty; mm: number }
  | { type: 'setPlanProperty'; change: PlanChange }
  | { type: 'setPlanSize'; width?: number; height?: number }
  | { type: 'addShelf'; shelfBelowId: string }
  | { type: 'addWedge'; shelfBelowId: string }
  | { type: 'setStageCount'; count: number }
  | { type: 'setStageHeight'; shelfBelowId: string; mm: number }
  | { type: 'copyStageWedges'; fromId: string; toIds: string[] }
  | { type: 'addSupport'; placement: SupportPlacement }
  | { type: 'setSupportProperty'; id: string; property: SupportProperty; mm: number }
  | { type: 'alignSupportFront'; id: string }
  | { type: 'moveSupport'; id: string; x?: number; y?: number; z?: number }
  | { type: 'addObjectRow'; shelfBelowId: string; kind: string; count?: number; gap?: number }
  | { type: 'setObjectRowCount'; rowId: string; count: number }
  | { type: 'setObjectRowGap'; rowId: string; gap: number }
  | { type: 'moveObject'; id: string; shelfBelowId: string; x: number }
  | { type: 'removeObjectRow'; rowId: string }
  | { type: 'placeWedge'; wedgeId: string; shelfBelowId: string; x: number }
  | { type: 'removePieces'; ids: string[] }
  | { type: 'distributeShelves' }
  | { type: 'setShelfVertical'; shelfId: string; side: 'left' | 'right'; present: boolean }
  | { type: 'undo' }
  | { type: 'redo' }

export const initialEditorState: EditorState = {
  plan: null,
  selection: [],
  unit: 'cm',
  snapStep: 10,
  past: [],
  future: [],
}

export interface ActionOutcome {
  state: EditorState
  /** Message en français si l'action a été refusée (l'état est alors inchangé). */
  error: string | null
}

const noPlan = 'Aucune étagère ouverte.'

function samePlan(a: Plan, b: Plan): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Ne garde dans la sélection que les pièces qui existent dans ce plan. */
function existingOnly(selection: string[], plan: Plan): string[] {
  const ids = new Set([...pieceIds(plan), ...(plan.supports ?? []).map((s) => s.id)])
  return selection.filter((id) => ids.has(id) || objectIdExists(plan, id))
}

/** Applique une action. Une action refusée par les contrôles de cohérence renvoie l'état d'origine et un message. */
export function applyAction(state: EditorState, action: EditorAction): ActionOutcome {
  const accepted = (next: EditorState): ActionOutcome => ({ state: next, error: null })
  const refused = (error: string): ActionOutcome => ({ state, error })

  switch (action.type) {
    case 'newPlan':
      return accepted({ ...state, plan: action.plan, selection: [], past: [], future: [] })
    case 'selectPiece':
      return accepted({ ...state, selection: selectPiece(state.selection, action.id, action.additive) })
    case 'selectAll':
      return accepted(state.plan ? { ...state, selection: pieceIds(state.plan) } : state)
    case 'clearSelection':
      return accepted(state.selection.length === 0 ? state : { ...state, selection: [] })
    case 'setUnit':
      return accepted({ ...state, unit: action.unit })
    case 'setSnapStep':
      return accepted({ ...state, snapStep: action.mm })
  }

  const { plan } = state
  if (!plan) return refused(noPlan)

  /** Enregistre une modification du plan dans l'historique (sauf si elle ne change rien). */
  const commit = (next: Plan, selection: string[] = state.selection): ActionOutcome =>
    samePlan(plan, next)
      ? accepted({ ...state, selection })
      : accepted({ ...state, plan: next, selection, past: [...state.past, plan], future: [] })
  const withPlan = (result: EditResult): ActionOutcome => (result.ok ? commit(result.plan) : refused(result.error))
  const withAdded = (result: AddResult): ActionOutcome =>
    result.ok ? commit(result.plan, [result.id]) : refused(result.error)

  switch (action.type) {
    case 'undo': {
      const previous = state.past.at(-1)
      if (!previous) return accepted(state)
      return accepted({
        ...state,
        plan: previous,
        selection: existingOnly(state.selection, previous),
        past: state.past.slice(0, -1),
        future: [plan, ...state.future],
      })
    }
    case 'redo': {
      const [next, ...rest] = state.future
      if (!next) return accepted(state)
      return accepted({
        ...state,
        plan: next,
        selection: existingOnly(state.selection, next),
        past: [...state.past, plan],
        future: rest,
      })
    }
    case 'setPieceProperty':
      return withPlan(setPieceProperty(plan, action.ids, action.property, action.mm))
    case 'setPlanProperty':
      return withPlan(setPlanProperty(plan, action.change))
    case 'setPlanSize':
      return withPlan(setPlanSize(plan, { width: action.width, height: action.height }))
    case 'distributeShelves':
      return withPlan(distributeShelves(plan))
    case 'setShelfVertical': {
      const result = setVertical(plan, action.shelfId, action.side, action.present)
      if (!result.ok) return refused(result.error)
      return commit(result.plan, existingOnly(state.selection, result.plan))
    }
    case 'addShelf':
      return withAdded(addShelf(plan, action.shelfBelowId))
    case 'setStageCount':
      return withPlan(setStageCount(plan, action.count))
    case 'setStageHeight':
      return withPlan(setStageHeight(plan, action.shelfBelowId, action.mm))
    case 'copyStageWedges':
      return withPlan(copyStageWedges(plan, action.fromId, action.toIds))
    case 'addSupport': {
      const result = addSupport(plan, action.placement)
      return result.ok ? commit(result.plan, [result.id]) : refused(result.error)
    }
    case 'setSupportProperty':
      return withPlan(setSupportProperty(plan, action.id, action.property, action.mm))
    case 'moveSupport':
      return withPlan(moveSupport(plan, action.id, { x: action.x, y: action.y, z: action.z }))
    case 'alignSupportFront':
      return withPlan(alignSupportFront(plan, action.id))
    case 'addObjectRow': {
      const result = addObjectRow(plan, action.shelfBelowId, action.kind, action.count, action.gap)
      return result.ok ? commit(result.plan) : refused(result.error)
    }
    case 'setObjectRowGap':
      return withPlan(setObjectRowGap(plan, action.rowId, action.gap))
    case 'moveObject': {
      const result = moveObject(plan, action.id, action.shelfBelowId, action.x, null)
      return result.ok ? commit(result.plan, [result.id]) : refused(result.error)
    }
    case 'setObjectRowCount':
      return withPlan(setObjectRowCount(plan, action.rowId, action.count))
    case 'removeObjectRow':
      return withPlan(removeObjectRow(plan, action.rowId))
    case 'placeWedge':
      return withPlan(moveWedge(plan, action.wedgeId, action.shelfBelowId, action.x, null))
    case 'addWedge':
      return withAdded(addWedge(plan, action.shelfBelowId))
    case 'removePieces': {
      const result = removePieces(plan, action.ids)
      if (!result.ok) return refused(result.error)
      return commit(
        result.plan,
        state.selection.filter((id) => !action.ids.includes(id)),
      )
    }
  }
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  return applyAction(state, action).state
}
