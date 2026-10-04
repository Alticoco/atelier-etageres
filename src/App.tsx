import { useEffect, useReducer, useState } from 'react'
import { SNAP_STEPS } from './model/drag'
import type { LengthUnit } from './model/units'
import { applyAction, editorReducer, initialEditorState, type EditorAction } from './store/editor'
import { CreationWizard } from './views/CreationWizard'
import { FrontView } from './views/FrontView'
import { PropertiesPanel } from './views/PropertiesPanel'

const UNITS: LengthUnit[] = ['mm', 'cm']

export default function App() {
  const [state, dispatch] = useReducer(editorReducer, initialEditorState)
  const [creating, setCreating] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)
  const { plan, selection, unit, snapStep } = state

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

  // Échap désélectionne, Suppr supprime la sélection (sauf quand on est en train de saisir dans un champ).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName) || creating) return
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
            <FrontView
              plan={plan}
              unit={unit}
              selection={selection}
              snapStep={snapStep}
              onChange={run}
              onSelectPiece={(id, additive) => dispatch({ type: 'selectPiece', id, additive })}
              onClearSelection={() => dispatch({ type: 'clearSelection' })}
            />
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
