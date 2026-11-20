import { lazy, Suspense } from 'react'
import type { ViewMode } from '../keyboard'
import type { LengthUnit } from '../model/units'
import type { EditorAction } from '../store/editor'
import type { Tab } from '../store/workspace'
import { BottomView } from './BottomView'
import { CutListView } from './CutListView'
import { FrontView } from './FrontView'
import { ProfileView } from './ProfileView'

/** Three.js pèse lourd : la vue 3D est chargée seulement quand on l'ouvre. */
const ThreeView = lazy(() => import('./ThreeView'))

const VIEWS: { mode: ViewMode; label: string }[] = [
  { mode: 'front', label: 'Face' },
  { mode: 'side', label: 'Profil' },
  { mode: 'cut', label: 'Découpe' },
  { mode: 'bottom', label: 'Dessous' },
  { mode: 'three', label: '3D' },
]

interface EditorPaneProps {
  tab: Tab
  split: boolean
  focused: boolean
  view: ViewMode
  unit: LengthUnit
  snapStep: number
  showMarks: boolean
  /** Les plans ouverts, pour choisir celui du volet en écran partagé. */
  choices: { key: string; name: string }[]
  onFocus: () => void
  onView: (mode: ViewMode) => void
  onShowMarks: (show: boolean) => void
  onChoose: (key: string) => void
  onChange: (action: EditorAction) => void
  onSelect: (action: EditorAction) => void
}

/** Un volet de l'éditeur : le plan d'un onglet, dans la vue choisie. Deux volets côte à côte en écran partagé. */
export function EditorPane({ tab, split, focused, view, unit, snapStep, showMarks, choices, onFocus, onView, onShowMarks, onChoose, onChange, onSelect }: EditorPaneProps) {
  const plan = tab.editor.plan!
  const { selection } = tab.editor
  const select = (id: string, additive: boolean) => onSelect({ type: 'selectPiece', id, additive })
  const clear = () => onSelect({ type: 'clearSelection' })
  const name = `view-${tab.key}`
  return (
    <div className={`canvas${split ? ' pane' : ''}${split && focused ? ' focused' : ''}`} onPointerDownCapture={onFocus} onFocusCapture={onFocus}>
      {split && (
        <div className="pane-title">
          <select value={tab.key} onChange={(e) => onChoose(e.target.value)} aria-label="Plan affiché dans ce volet">
            {choices.map((choice) => (
              <option key={choice.key} value={choice.key}>
                {choice.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="canvas-tools">
        <div className="view-switch" role="radiogroup" aria-label="Vue">
          {VIEWS.map(({ mode, label }) => (
            <label key={mode} className={mode === view ? 'active' : undefined}>
              <input type="radio" name={name} value={mode} checked={mode === view} onChange={() => onView(mode)} />
              {label}
            </label>
          ))}
        </div>
        {view === 'front' && (
          <label className="marks-toggle" title="Repères de la liste de découpe">
            <input type="checkbox" checked={showMarks} onChange={(e) => onShowMarks(e.target.checked)} />
            Repères
          </label>
        )}
      </div>
      <div className="canvas-body">
      {view === 'cut' ? (
        <CutListView plan={plan} unit={unit} />
      ) : view === 'front' ? (
        <FrontView
          key={tab.key}
          plan={plan}
          unit={unit}
          selection={selection}
          snapStep={snapStep}
          showMarks={showMarks}
          onChange={onChange}
          onSelectPiece={select}
          onClearSelection={clear}
        />
      ) : view === 'three' ? (
        <Suspense fallback={<p className="view-hint">Chargement de la vue 3D…</p>}>
          <ThreeView key={tab.key} plan={plan} unit={unit} selection={selection} />
        </Suspense>
      ) : view === 'bottom' ? (
        <BottomView
          key={tab.key}
          plan={plan}
          unit={unit}
          selection={selection}
          snapStep={snapStep}
          onChange={onChange}
          onSelectPiece={select}
          onClearSelection={clear}
        />
      ) : (
        <ProfileView
          key={tab.key}
          plan={plan}
          unit={unit}
          selection={selection}
          snapStep={snapStep}
          onChange={onChange}
          onSelectPiece={select}
          onClearSelection={clear}
        />
      )}
      </div>
    </div>
  )
}
