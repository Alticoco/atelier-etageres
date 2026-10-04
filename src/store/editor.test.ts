import { describe, expect, it } from 'vitest'
import { createPlan } from '../model/plan'
import { editorReducer, initialEditorState, type EditorState } from './editor'

const plan = createPlan({
  width: 800,
  height: 1000,
  depth: 250,
  stages: 3,
  uprightThickness: 18,
  shelfThickness: 18,
})

const withPlan: EditorState = { ...initialEditorState, plan }

describe('editorReducer', () => {
  it('newPlan installe le plan et vide la sélection', () => {
    const state = editorReducer({ ...withPlan, selection: ['shelf-1'] }, { type: 'newPlan', plan })
    expect(state.plan).toBe(plan)
    expect(state.selection).toEqual([])
  })

  it('sélection simple, multiple, puis effacement', () => {
    let state = editorReducer(withPlan, { type: 'selectPiece', id: 'shelf-1', additive: false })
    state = editorReducer(state, { type: 'selectPiece', id: 'shelf-2', additive: true })
    expect(state.selection).toEqual(['shelf-1', 'shelf-2'])
    state = editorReducer(state, { type: 'clearSelection' })
    expect(state.selection).toEqual([])
  })

  it('setUnit change l’unité d’affichage sans toucher au plan', () => {
    const state = editorReducer(withPlan, { type: 'setUnit', unit: 'mm' })
    expect(state.unit).toBe('mm')
    expect(state.plan).toBe(plan)
  })

  it('setPieceProperty applique la modification', () => {
    const state = editorReducer(withPlan, { type: 'setPieceProperty', ids: ['shelf-2'], property: 'depth', mm: 200 })
    expect(state.plan?.shelves[1].depth).toBe(200)
  })

  it('une modification incohérente laisse l’état inchangé', () => {
    const state = editorReducer(withPlan, { type: 'setPieceProperty', ids: ['shelf-2'], property: 'y', mm: 5000 })
    expect(state).toBe(withPlan)
  })

  it('setPlanProperty modifie les dimensions de l’étagère', () => {
    const state = editorReducer(withPlan, { type: 'setPlanProperty', change: { property: 'width', mm: 900 } })
    expect(state.plan?.width).toBe(900)
  })

  it('sans plan, les modifications ne font rien', () => {
    const state = editorReducer(initialEditorState, { type: 'setPlanProperty', change: { property: 'width', mm: 900 } })
    expect(state).toBe(initialEditorState)
  })

  it('setSnapStep règle le pas d’aimantation (10 mm par défaut)', () => {
    expect(initialEditorState.snapStep).toBe(10)
    expect(editorReducer(withPlan, { type: 'setSnapStep', mm: 50 }).snapStep).toBe(50)
  })

  it('setPlanSize redimensionne le cadre en une seule action', () => {
    const state = editorReducer(withPlan, { type: 'setPlanSize', width: 900, height: 1100 })
    expect(state.plan?.width).toBe(900)
    expect(state.plan?.height).toBe(1100)
  })

  it('setPlanSize incohérent laisse l’état inchangé', () => {
    const state = editorReducer(withPlan, { type: 'setPlanSize', height: 100 })
    expect(state).toBe(withPlan)
  })
})
