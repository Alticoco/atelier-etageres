import { useEffect, useReducer, useState } from 'react'
import { SNAP_STEPS } from './model/drag'
import type { LengthUnit } from './model/units'
import { editorReducer, initialEditorState } from './store/editor'
import { CreationWizard } from './views/CreationWizard'
import { FrontView } from './views/FrontView'
import { PropertiesPanel } from './views/PropertiesPanel'

const UNITS: LengthUnit[] = ['mm', 'cm']

export default function App() {
  const [state, dispatch] = useReducer(editorReducer, initialEditorState)
  const [creating, setCreating] = useState(true)
  const { plan, selection, unit, snapStep } = state

  // Échap désélectionne (sauf quand on est en train de saisir dans un champ).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (e.key === 'Escape' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) {
        dispatch({ type: 'clearSelection' })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

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
              onChange={dispatch}
              onSelectPiece={(id, additive) => dispatch({ type: 'selectPiece', id, additive })}
              onClearSelection={() => dispatch({ type: 'clearSelection' })}
            />
            <PropertiesPanel plan={plan} selection={selection} unit={unit} dispatch={dispatch} />
          </div>
        )}
      </main>
    </div>
  )
}
