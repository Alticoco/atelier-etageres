import { describe, expect, it } from 'vitest'
import { createPlan } from '../model/plan'
import { applyAction, editorReducer, initialEditorState, type EditorAction, type EditorState } from './editor'

const plan = createPlan({
  width: 800,
  height: 1000,
  depth: 250,
  stages: 3,
  uprightThickness: 18,
  shelfThickness: 18,
})

const start: EditorState = { ...initialEditorState, plan }

function run(state: EditorState, ...actions: EditorAction[]): EditorState {
  return actions.reduce(editorReducer, state)
}

const moveShelf = (mm: number): EditorAction => ({ type: 'setPieceProperty', ids: ['shelf-2'], property: 'y', mm })

describe('annuler / rétablir', () => {
  it('annule une modification puis la rétablit', () => {
    const edited = run(start, moveShelf(400))
    expect(edited.plan?.shelves[1].y).toBe(400)

    const undone = run(edited, { type: 'undo' })
    expect(undone.plan).toEqual(plan)

    const redone = run(undone, { type: 'redo' })
    expect(redone.plan).toEqual(edited.plan)
  })

  it('annule plusieurs modifications dans l’ordre inverse (historique illimité)', () => {
    let state = start
    for (let y = 100; y <= 500; y += 100) state = run(state, moveShelf(y))
    expect(state.past).toHaveLength(5)

    const ys: number[] = []
    for (let i = 0; i < 5; i++) {
      state = run(state, { type: 'undo' })
      ys.push(state.plan!.shelves[1].y)
    }
    expect(ys).toEqual([400, 300, 200, 100, 328])
    expect(state.past).toHaveLength(0)
    expect(state.future).toHaveLength(5)
  })

  it('une nouvelle modification efface la partie « rétablir »', () => {
    const state = run(start, moveShelf(400), { type: 'undo' }, moveShelf(450))
    expect(state.future).toEqual([])
    expect(run(state, { type: 'redo' }).plan?.shelves[1].y).toBe(450)
  })

  it('annuler ou rétablir sans historique ne fait rien et ne signale pas d’erreur', () => {
    expect(applyAction(start, { type: 'undo' })).toEqual({ state: start, error: null })
    expect(applyAction(start, { type: 'redo' })).toEqual({ state: start, error: null })
  })

  it('annule chaque type de modification', () => {
    const actions: EditorAction[] = [
      { type: 'setPlanProperty', change: { property: 'name', value: 'Épices' } },
      { type: 'setPlanSize', width: 900 },
      { type: 'addWedge', shelfBelowId: 'shelf-1' },
      { type: 'addShelf', shelfBelowId: 'shelf-2' },
    ]
    for (const action of actions) {
      const after = run(start, action)
      expect(after.plan).not.toEqual(plan)
      expect(run(after, { type: 'undo' }).plan).toEqual(plan)
    }
  })

  it('annule « espacer également » et revient aux positions déplacées', () => {
    const moved = run(start, moveShelf(500))
    const spaced = run(moved, { type: 'distributeShelves' })
    expect(spaced.plan?.shelves[1].y).toBe(328)
    expect(run(spaced, { type: 'undo' }).plan?.shelves[1].y).toBe(500)
  })

  it('« espacer également » sur un plan déjà réparti n’ajoute rien à l’historique', () => {
    expect(run(start, { type: 'distributeShelves' }).past).toEqual([])
  })

  it('un seul pas pour une suppression de plusieurs pièces', () => {
    const withWedges = run(start, { type: 'addWedge', shelfBelowId: 'shelf-1' }, { type: 'addWedge', shelfBelowId: 'shelf-2' })
    const removed = run(withWedges, { type: 'removePieces', ids: ['wedge-1', 'wedge-2'] })
    expect(removed.plan?.wedges).toEqual([])
    expect(run(removed, { type: 'undo' }).plan?.wedges).toHaveLength(2)
  })
})

describe('ce qui n’entre pas dans l’historique', () => {
  it('la sélection, l’unité et l’aimantation ne sont pas annulables', () => {
    const state = run(start, { type: 'selectPiece', id: 'shelf-1', additive: false }, { type: 'setUnit', unit: 'mm' }, { type: 'setSnapStep', mm: 50 })
    expect(state.past).toEqual([])
  })

  it('une action refusée n’ajoute rien', () => {
    const state = run(start, moveShelf(5000))
    expect(state.past).toEqual([])
    expect(state.plan).toBe(plan)
  })

  it('une modification qui ne change rien n’ajoute rien', () => {
    const renamed = run(start, { type: 'setPlanProperty', change: { property: 'name', value: plan.name } })
    expect(renamed.past).toEqual([])
    const samePlace = run(start, { type: 'setPieceProperty', ids: ['shelf-2'], property: 'y', mm: plan.shelves[1].y })
    expect(samePlace.past).toEqual([])
  })

  it('annuler ne touche pas à l’unité ni à l’aimantation', () => {
    const state = run(start, moveShelf(400), { type: 'setUnit', unit: 'mm' }, { type: 'setSnapStep', mm: 5 }, { type: 'undo' })
    expect(state.unit).toBe('mm')
    expect(state.snapStep).toBe(5)
  })

  it('un nouveau plan repart d’un historique vide', () => {
    const state = run(start, moveShelf(400), moveShelf(450), { type: 'undo' }, { type: 'newPlan', plan })
    expect(state.past).toEqual([])
    expect(state.future).toEqual([])
  })
})

describe('sélection pendant annuler / rétablir', () => {
  it('retire de la sélection une pièce qui n’existe plus après annulation', () => {
    const added = run(start, { type: 'addWedge', shelfBelowId: 'shelf-1' })
    expect(added.selection).toEqual(['wedge-1']) // la nouvelle cale est sélectionnée
    const undone = run(added, { type: 'undo' })
    expect(undone.selection).toEqual([])
  })

  it('garde la sélection quand la pièce existe toujours', () => {
    const state = run(start, { type: 'selectPiece', id: 'shelf-2', additive: false }, moveShelf(400), { type: 'undo' })
    expect(state.selection).toEqual(['shelf-2'])
  })

  it('rétablir une suppression désélectionne la pièce supprimée', () => {
    const added = run(start, { type: 'addWedge', shelfBelowId: 'shelf-1' })
    const removed = run(added, { type: 'removePieces', ids: ['wedge-1'] })
    const undone = run(removed, { type: 'undo', })
    const reselected = run(undone, { type: 'selectPiece', id: 'wedge-1', additive: false })
    expect(run(reselected, { type: 'redo' }).selection).toEqual([])
  })
})
