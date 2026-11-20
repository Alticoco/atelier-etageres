import { SNAP_STEPS } from '../model/drag'
import type { Plan } from '../model/types'
import type { LengthUnit } from '../model/units'
import type { EditorAction } from '../store/editor'
import { ExportMenu } from './ExportMenu'
import { Logo } from './Logo'

const UNITS: LengthUnit[] = ['mm', 'cm']

function UnitToggle({ unit, dispatch }: { unit: LengthUnit; dispatch: (action: EditorAction) => void }) {
  return (
    <div className="unit-toggle" role="radiogroup" aria-label="Unité d’affichage">
      {UNITS.map((u) => (
        <label key={u} className={u === unit ? 'active' : undefined}>
          <input type="radio" name="unit" value={u} checked={u === unit} onChange={() => dispatch({ type: 'setUnit', unit: u })} />
          {u}
        </label>
      ))}
    </div>
  )
}

interface AppHeaderProps {
  /** true quand l'éditeur est affiché (sinon seule l'unité est proposée). */
  editor: boolean
  /** Plan ouvert, ou null s'il n'y en a pas. */
  plan: Plan | null
  currentId: string | null
  saveState: string
  saveLabel: string
  canUndo: boolean
  canRedo: boolean
  snapStep: number
  unit: LengthUnit
  exportingPdf: boolean
  pdfSupports: boolean
  onPdfSupportsChange: (value: boolean) => void
  dispatch: (action: EditorAction) => void
  onDuplicate: () => void
  onPdf: () => void
  onJson: () => void
  onHelp: () => void
}

/** En-tête de l'application : titre, enregistrement, annuler/rétablir, aimantation, unités, variante, export, aide. */
export function AppHeader({
  editor,
  plan,
  currentId,
  saveState,
  saveLabel,
  canUndo,
  canRedo,
  snapStep,
  unit,
  exportingPdf,
  pdfSupports,
  onPdfSupportsChange,
  dispatch,
  onDuplicate,
  onPdf,
  onJson,
  onHelp,
}: AppHeaderProps) {
  return (
    <header className="app-header">
      <h1>
        <Logo />
        Atelier Étagères
      </h1>
      {editor && plan && (
        <>
          <span className="app-plan-name">{plan.name}</span>
          <span
            className={`save-state${!currentId || saveState === 'error' ? ' warn' : ''}`}
            role="status"
            title={currentId && saveState === 'saved' ? 'Enregistrée automatiquement dans ce navigateur' : undefined}
          >
            {saveLabel}
          </span>
          <div className="header-tools">
            <div className="history-buttons">
              <button
                type="button"
                className="header-button"
                disabled={!canUndo}
                onClick={() => dispatch({ type: 'undo' })}
                title="Annuler (Ctrl+Z)"
              >
                Annuler
              </button>
              <button
                type="button"
                className="header-button"
                disabled={!canRedo}
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
            <UnitToggle unit={unit} dispatch={dispatch} />
            <button
              type="button"
              className="header-button"
              onClick={onDuplicate}
              title="Créer une copie de cette étagère dans un nouvel onglet, pour en faire une variante"
            >
              Dupliquer
            </button>
            <ExportMenu
              onPdf={onPdf}
              onJson={onJson}
              busy={exportingPdf}
              hasSupports={(plan.supports ?? []).length > 0}
              pdfSupports={pdfSupports}
              onPdfSupportsChange={onPdfSupportsChange}
            />
            <button
              type="button"
              className="header-button icon-button"
              onClick={onHelp}
              title="Raccourcis clavier (?)"
              aria-label="Raccourcis clavier"
            >
              ?
            </button>
          </div>
        </>
      )}
      {!editor && (
        <div className="header-tools">
          <UnitToggle unit={unit} dispatch={dispatch} />
        </div>
      )}
    </header>
  )
}
