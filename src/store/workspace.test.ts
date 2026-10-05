import { describe, expect, it } from 'vitest'
import { createPlan } from '../model/plan'
import { activeTab, emptyWorkspace, isSplit, workspaceReducer, type Workspace, type WorkspaceAction } from './workspace'

const plan = (name: string) =>
  ({ ...createPlan({ width: 800, height: 1000, depth: 250, stages: 3, uprightThickness: 18, shelfThickness: 18 }), name })

function run(actions: WorkspaceAction[], from: Workspace = emptyWorkspace): Workspace {
  return actions.reduce(workspaceReducer, from)
}

const open = (name: string, planId: string | null): WorkspaceAction => ({ type: 'openPlan', plan: plan(name), planId })

describe('onglets', () => {
  it('ouvrir un plan crée un onglet et l’affiche', () => {
    const ws = run([open('A', 'a'), open('B', 'b')])
    expect(ws.tabs.map((t) => t.editor.plan?.name)).toEqual(['A', 'B'])
    expect(activeTab(ws)?.planId).toBe('b')
    expect(ws.panes).toHaveLength(1)
  })

  it('rouvrir un plan déjà ouvert revient à son onglet, sans le réinitialiser', () => {
    let ws = run([open('A', 'a'), open('B', 'b')])
    ws = workspaceReducer(ws, { type: 'edit', key: ws.tabs[0].key, action: { type: 'selectAll' } })
    ws = workspaceReducer(ws, open('A bis', 'a'))
    expect(ws.tabs).toHaveLength(2)
    expect(activeTab(ws)?.planId).toBe('a')
    expect(activeTab(ws)?.editor.selection.length).toBeGreaterThan(0)
  })

  it('deux plans non enregistrés restent deux onglets', () => {
    expect(run([open('A', null), open('A', null)]).tabs).toHaveLength(2)
  })

  it('fermer l’onglet affiché montre un voisin, puis plus rien', () => {
    let ws = run([open('A', 'a'), open('B', 'b')])
    ws = workspaceReducer(ws, { type: 'closeTab', key: ws.tabs[1].key })
    expect(activeTab(ws)?.planId).toBe('a')
    ws = workspaceReducer(ws, { type: 'closeTab', key: ws.tabs[0].key })
    expect(ws.tabs).toEqual([])
    expect(ws.panes).toEqual([])
  })
})

describe('historique et sélection par onglet', () => {
  it('annuler dans un onglet ne touche pas l’autre', () => {
    let ws = run([open('A', 'a'), open('B', 'b')])
    const [a, b] = ws.tabs.map((t) => t.key)
    const before = ws.tabs[1].editor.plan
    ws = workspaceReducer(ws, { type: 'edit', key: a, action: { type: 'setPlanProperty', change: { property: 'name', value: 'Renommée' } } })
    expect(ws.tabs[0].editor.past).toHaveLength(1)
    expect(ws.tabs[1].editor.past).toHaveLength(0)
    ws = workspaceReducer(ws, { type: 'edit', key: a, action: { type: 'undo' } })
    expect(ws.tabs[0].editor.plan?.name).toBe('A')
    expect(ws.tabs.find((t) => t.key === b)?.editor.plan).toBe(before)
  })

  it('l’unité et l’aimantation valent pour tous les onglets, même ceux ouverts plus tard', () => {
    let ws = run([open('A', 'a')])
    ws = workspaceReducer(ws, { type: 'edit', key: ws.tabs[0].key, action: { type: 'setUnit', unit: 'mm' } })
    ws = workspaceReducer(ws, { type: 'edit', key: ws.tabs[0].key, action: { type: 'setSnapStep', mm: 5 } })
    ws = workspaceReducer(ws, open('B', 'b'))
    expect(ws.tabs.map((t) => t.editor.unit)).toEqual(['mm', 'mm'])
    expect(ws.tabs.map((t) => t.editor.snapStep)).toEqual([5, 5])
  })

  it('une action sur un onglet inconnu est ignorée', () => {
    const ws = run([open('A', 'a')])
    expect(workspaceReducer(ws, { type: 'edit', key: 'nope', action: { type: 'selectAll' } })).toBe(ws)
  })
})

describe('écran partagé', () => {
  const three = () => run([open('A', 'a'), open('B', 'b'), open('C', 'c')])

  it('ne s’active pas avec un seul onglet', () => {
    const ws = run([open('A', 'a'), { type: 'setSplit', split: true }])
    expect(isSplit(ws)).toBe(false)
  })

  it('s’active avec un autre onglet, l’onglet courant restant à gauche avec le focus', () => {
    const ws = workspaceReducer(run([open('A', 'a'), open('B', 'b')]), { type: 'setSplit', split: true })
    expect(ws.panes).toEqual([ws.tabs[1].key, ws.tabs[0].key])
    expect(ws.focus).toBe(0)
  })

  it('un onglet n’apparaît jamais dans les deux volets : on échange', () => {
    let ws = workspaceReducer(three(), { type: 'setSplit', split: true })
    const [left, right] = ws.panes
    ws = workspaceReducer(ws, { type: 'showTab', key: left, pane: 1 })
    expect(ws.panes).toEqual([right, left])
  })

  it('choisir un onglet pour un volet remplace seulement ce volet', () => {
    let ws = workspaceReducer(three(), { type: 'setSplit', split: true })
    const [left] = ws.panes
    const third = ws.tabs.find((t) => !ws.panes.includes(t.key))!.key
    ws = workspaceReducer(ws, { type: 'showTab', key: third, pane: 1 })
    expect(ws.panes).toEqual([left, third])
  })

  it('fermer un onglet affiché referme l’écran partagé et garde l’autre', () => {
    let ws = workspaceReducer(three(), { type: 'setSplit', split: true })
    const [left, right] = ws.panes
    ws = workspaceReducer(ws, { type: 'closeTab', key: left })
    expect(ws.panes).toEqual([right])
    expect(ws.focus).toBe(0)
  })

  it('désactiver garde l’onglet du volet qui a le focus', () => {
    let ws = workspaceReducer(three(), { type: 'setSplit', split: true })
    const left = ws.panes[0]
    ws = workspaceReducer(ws, { type: 'focusPane', pane: 0 })
    ws = workspaceReducer(ws, { type: 'setSplit', split: false })
    expect(ws.panes).toEqual([left])
  })
})

describe('bibliothèque', () => {
  it('renommer dans la bibliothèque met à jour l’onglet sans toucher à l’historique', () => {
    const ws = workspaceReducer(run([open('A', 'a')]), { type: 'planRenamed', planId: 'a', name: 'Neuf' })
    expect(ws.tabs[0].editor.plan?.name).toBe('Neuf')
    expect(ws.tabs[0].editor.past).toHaveLength(0)
  })

  it('supprimer un plan ferme son onglet', () => {
    const ws = workspaceReducer(run([open('A', 'a'), open('B', 'b')]), { type: 'planRemoved', planId: 'b' })
    expect(ws.tabs.map((t) => t.planId)).toEqual(['a'])
  })
})
