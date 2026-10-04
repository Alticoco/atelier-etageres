import { useEffect, useReducer, useState } from 'react'
import { SNAP_STEPS } from './model/drag'
import type { LengthUnit } from './model/units'
import { applyAction, editorReducer, initialEditorState, type EditorAction } from './store/editor'
import { CreationWizard } from './views/CreationWizard'
import { CutListView } from './views/CutListView'
import { FrontView } from './views/FrontView'
import { ProfileView } from './views/ProfileView'
import { PropertiesPanel } from './views/PropertiesPanel'

const UNITS: LengthUnit[] = ['mm', 'cm']

type ViewMode = 'front' | 'side' | 'cut'
const VIEWS: { mode: ViewMode; label: string }[] = [
  { mode: 'front', label: 'Face' },
  { mode: 'side', label: 'Profil' },
  { mode: 'cut', label: 'Découpe' },
]

/** Champ où l'on tape du texte : Ctrl+Z doit alors annuler la frappe, pas le plan. */
function isTextEntry(el: HTMLElement): boolean {
  if (el.tagName === 'TEXTAREA') return true
  return el.tagName === 'INPUT' && !['checkbox', 'radio', 'button'].includes((el as HTMLInputElement).type)
}

export default function App() {
  const [state, dispatch] = useReducer(editorReducer, initialEditorState)
  const [creating, setCreating] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)
  const [view, setView] = useState<ViewMode>('front')
  const [showMarks, setShowMarks] = useState(true)
  const { plan, selection, unit, snapStep, past, future } = state

  // Toute modification passe par ici : si les contrôles de cohérence la refusent, on explique pourquoi.
  const run = (action: EditorAction) => {
    const { error } = applyAction(state, action)
    setNotice(error)
    if (!error) dispatch(action)
  }

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 6000)
    return () => window.clearTimeout(timer)
  }, [notice])

  // Ctrl+Z annule, Ctrl+Y (ou Ctrl+Maj+Z) rétablit, Échap désélectionne, Suppr supprime la sélection.
  // Les touches d'édition sont laissées aux champs de saisie quand on est en train d'y taper.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (creating) return

      if ((e.ctrlKey || e.metaKey) && !e.altKey && !isTextEntry(target)) {
        const key = e.key.toLowerCase()
        if (key === 'z' && !e.shiftKey) {
          e.preventDefault()
          dispatch({ type: 'undo' })
        } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
          e.preventDefault()
          dispatch({ type: 'redo' })
        }
        return
      }

      if (isTextEntry(target) || target.tagName === 'SELECT') return
      if (e.key === 'Escape') dispatch({ type: 'clearSelection' })
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection.length > 0) {
        e.preventDefault()
        run({ type: 'removePieces', ids: selection })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const startNew = () => {
    if (!plan || window.confirm('Créer une nouvelle étagère ? Le plan actuel sera remplacé (rien n’est encore sauvegardé).')) {
      setCreating(true)
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Atelier Étagères</h1>
        {plan && <span className="app-plan-name">{plan.name}</span>}
        {plan && !creating && (
          <div className="header-tools">
            <div className="history-buttons">
              <button
                type="button"
                className="header-button"
                disabled={past.length === 0}
                onClick={() => dispatch({ type: 'undo' })}
                title="Annuler (Ctrl+Z)"
              >
                Annuler
              </button>
              <button
                type="button"
                className="header-button"
                disabled={future.length === 0}
                onClick={() => dispatch({ type: 'redo' })}
                title="Rétablir (Ctrl+Y)"
              >
                Rétablir
              </button>
            </div>
            <label className="snap-select" title="Maintenez Alt pour déplacer sans aimantation">
              Aimantation
              <select value={snapStep} onChange={(e) => dispatch({ type: 'setSnapStep', mm: Number(e.target.value) })}>
                {SNAP_STEPS.map((step) => (
                  <option key={step} value={step}>
                    {step < 10 ? `${step} mm` : `${step / 10} cm`}
                  </option>
                ))}
              </select>
            </label>
            <div className="unit-toggle" role="radiogroup" aria-label="Unité d’affichage">
              {UNITS.map((u) => (
                <label key={u} className={u === unit ? 'active' : undefined}>
                  <input
                    type="radio"
                    name="unit"
                    value={u}
                    checked={u === unit}
                    onChange={() => dispatch({ type: 'setUnit', unit: u })}
                  />
                  {u}
                </label>
              ))}
            </div>
            <button type="button" className="header-button" onClick={startNew}>
              Nouvelle étagère
            </button>
          </div>
        )}
      </header>
      <main className="app-main">
        {creating || !plan ? (
          <CreationWizard
            onCreate={(created) => {
              dispatch({ type: 'newPlan', plan: created })
              setCreating(false)
            }}
            onCancel={plan ? () => setCreating(false) : undefined}
          />
        ) : (
          <div className="editor">
            <div className="canvas">
              <div className="canvas-tools">
                <div className="view-switch" role="radiogroup" aria-label="Vue">
                  {VIEWS.map(({ mode, label }) => (
                    <label key={mode} className={mode === view ? 'active' : undefined}>
                      <input type="radio" name="view" value={mode} checked={mode === view} onChange={() => setView(mode)} />
                      {label}
                    </label>
                  ))}
                </div>
                {view === 'front' && (
                  <label className="marks-toggle" title="Repères de la liste de découpe">
                    <input type="checkbox" checked={showMarks} onChange={(e) => setShowMarks(e.target.checked)} />
                    Repères
                  </label>
                )}
              </div>
              {view === 'cut' ? (
                <CutListView plan={plan} unit={unit} />
              ) : view === 'front' ? (
                <FrontView
                  plan={plan}
                  unit={unit}
                  selection={selection}
                  snapStep={snapStep}
                  showMarks={showMarks}
                  onChange={run}
                  onSelectPiece={(id, additive) => dispatch({ type: 'selectPiece', id, additive })}
                  onClearSelection={() => dispatch({ type: 'clearSelection' })}
                />
              ) : (
                <ProfileView plan={plan} unit={unit} selection={selection} />
              )}
            </div>
            <PropertiesPanel plan={plan} selection={selection} unit={unit} dispatch={run} />
            {notice && (
              <div className="notice" role="alert">
                <span>{notice}</span>
                <button type="button" onClick={() => setNotice(null)} aria-label="Fermer le message">
                  ×
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
