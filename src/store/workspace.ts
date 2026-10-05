import type { Plan } from '../model/types'
import type { LengthUnit } from '../model/units'
import { applyAction, initialEditorState, type EditorAction, type EditorState } from './editor'

/**
 * Espace de travail : plusieurs plans ouverts en onglets, et un écran partagé pour en voir deux côte à côte.
 *
 * Chaque onglet a son propre éditeur (plan, sélection, historique annuler / rétablir). L'unité et l'aimantation
 * sont des réglages globaux : on les recopie dans tous les onglets pour que chaque éditeur reste autonome.
 * Les fonctions de ce fichier sont pures (pas de React) et testées.
 */
export interface Tab {
  /** Identifiant de l'onglet (différent de l'identifiant d'enregistrement : un plan non enregistré a aussi un onglet). */
  key: string
  /** Identifiant dans la bibliothèque, ou null si le plan n'est pas enregistré. */
  planId: string | null
  editor: EditorState
}

export interface Workspace {
  tabs: Tab[]
  /** Onglets affichés : un seul, ou deux en écran partagé (gauche, droite). Vide s'il n'y a aucun onglet. */
  panes: string[]
  /** Volet qui a le focus (celui qui reçoit les raccourcis clavier et le panneau de propriétés). */
  focus: 0 | 1
  unit: LengthUnit
  snapStep: number
  nextKey: number
}

export const emptyWorkspace: Workspace = {
  tabs: [],
  panes: [],
  focus: 0,
  unit: initialEditorState.unit,
  snapStep: initialEditorState.snapStep,
  nextKey: 1,
}

export type WorkspaceAction =
  /** Ouvre un plan : s'il est déjà ouvert dans un onglet, on y revient ; sinon on crée un onglet. */
  | { type: 'openPlan'; plan: Plan; planId: string | null }
  | { type: 'closeTab'; key: string }
  /** Affiche un onglet dans un volet (par défaut celui qui a le focus). */
  | { type: 'showTab'; key: string; pane?: 0 | 1 }
  | { type: 'focusPane'; pane: 0 | 1 }
  /** Active ou désactive l'écran partagé. */
  | { type: 'setSplit'; split: boolean }
  /** Une action d'édition sur un onglet. Les réglages globaux sont recopiés dans tous les onglets. */
  | { type: 'edit'; key: string; action: EditorAction }
  /** Le plan enregistré a été renommé dans la bibliothèque : l'onglet suit (sans pas d'historique). */
  | { type: 'planRenamed'; planId: string; name: string }
  /** Le plan enregistré a été supprimé : son onglet se ferme. */
  | { type: 'planRemoved'; planId: string }

export function tabByKey(ws: Workspace, key: string | undefined): Tab | undefined {
  return key === undefined ? undefined : ws.tabs.find((t) => t.key === key)
}

/** Onglet du volet qui a le focus. */
export function activeTab(ws: Workspace): Tab | undefined {
  return tabByKey(ws, ws.panes[ws.focus])
}

export function isSplit(ws: Workspace): boolean {
  return ws.panes.length === 2
}

function withFocus(ws: Workspace, pane: 0 | 1): Workspace {
  return ws.focus === pane ? ws : { ...ws, focus: pane }
}

function show(ws: Workspace, key: string, pane: 0 | 1 = ws.focus): Workspace {
  if (!tabByKey(ws, key)) return ws
  if (ws.panes.length === 0) return { ...ws, panes: [key], focus: 0 }
  const target = Math.min(pane, ws.panes.length - 1) as 0 | 1
  const other = 1 - target
  // Un onglet déjà visible dans l'autre volet : on échange les deux, il n'apparaît jamais deux fois.
  if (ws.panes[other] === key) {
    const panes = [...ws.panes]
    panes[other] = ws.panes[target]
    panes[target] = key
    return { ...ws, panes, focus: target }
  }
  const panes = [...ws.panes]
  panes[target] = key
  return { ...ws, panes, focus: target }
}

function mapAllTabs(ws: Workspace, change: (editor: EditorState) => EditorState): Workspace {
  return { ...ws, tabs: ws.tabs.map((t) => ({ ...t, editor: change(t.editor) })) }
}

function close(ws: Workspace, key: string): Workspace {
  const index = ws.tabs.findIndex((t) => t.key === key)
  if (index < 0) return ws
  const tabs = ws.tabs.filter((t) => t.key !== key)
  let panes = ws.panes
  let focus = ws.focus
  if (panes.includes(key)) {
    if (panes.length === 2) {
      // L'écran partagé se referme : on garde l'autre onglet.
      panes = panes.filter((k) => k !== key)
      focus = 0
    } else {
      const neighbour = tabs[Math.min(index, tabs.length - 1)]
      panes = neighbour ? [neighbour.key] : []
      focus = 0
    }
  }
  return { ...ws, tabs, panes, focus }
}

function setSplit(ws: Workspace, split: boolean): Workspace {
  if (split === isSplit(ws)) return ws
  if (!split) return { ...ws, panes: ws.panes.slice(focusIndex(ws), focusIndex(ws) + 1), focus: 0 }
  // On compare avec l'onglet suivant (ou le premier) qui n'est pas déjà affiché.
  const current = ws.panes[0]
  const start = ws.tabs.findIndex((t) => t.key === current)
  const candidates = [...ws.tabs.slice(start + 1), ...ws.tabs.slice(0, start)]
  const other = candidates.find((t) => t.key !== current)
  if (!other) return ws
  return { ...ws, panes: [current, other.key], focus: 0 }
}

function focusIndex(ws: Workspace): number {
  return Math.min(ws.focus, ws.panes.length - 1)
}

export function workspaceReducer(ws: Workspace, action: WorkspaceAction): Workspace {
  switch (action.type) {
    case 'openPlan': {
      const existing = action.planId === null ? undefined : ws.tabs.find((t) => t.planId === action.planId)
      if (existing) return show(ws, existing.key)
      const key = `tab-${ws.nextKey}`
      const editor = applyAction(
        { ...initialEditorState, unit: ws.unit, snapStep: ws.snapStep },
        { type: 'newPlan', plan: action.plan },
      ).state
      const added: Workspace = { ...ws, tabs: [...ws.tabs, { key, planId: action.planId, editor }], nextKey: ws.nextKey + 1 }
      return show(added, key)
    }
    case 'closeTab':
      return close(ws, action.key)
    case 'showTab':
      return show(ws, action.key, action.pane)
    case 'focusPane':
      return ws.panes.length > action.pane ? withFocus(ws, action.pane) : ws
    case 'setSplit':
      return setSplit(ws, action.split)
    case 'planRenamed':
      return {
        ...ws,
        tabs: ws.tabs.map((t) =>
          t.planId === action.planId && t.editor.plan ? { ...t, editor: { ...t.editor, plan: { ...t.editor.plan, name: action.name } } } : t,
        ),
      }
    case 'planRemoved': {
      const tab = ws.tabs.find((t) => t.planId === action.planId)
      return tab ? close(ws, tab.key) : ws
    }
    case 'edit': {
      const { action: edit } = action
      if (edit.type === 'setUnit') return mapAllTabs({ ...ws, unit: edit.unit }, (e) => ({ ...e, unit: edit.unit }))
      if (edit.type === 'setSnapStep') return mapAllTabs({ ...ws, snapStep: edit.mm }, (e) => ({ ...e, snapStep: edit.mm }))
      if (!tabByKey(ws, action.key)) return ws
      return {
        ...ws,
        tabs: ws.tabs.map((t) => (t.key === action.key ? { ...t, editor: applyAction(t.editor, edit).state } : t)),
      }
    }
  }
}
