import { useEffect, useReducer, useState } from 'react'
import { SNAP_STEPS } from './model/drag'
import { exportFileName, parsePlanFile, serializePlan } from './model/serialize'
import type { Plan } from './model/types'
import type { LengthUnit } from './model/units'
import { downloadTextFile } from './storage/download'
import { useAutosave } from './storage/useAutosave'
import { useLibrary } from './storage/useLibrary'
import { applyAction, editorReducer, initialEditorState, type EditorAction } from './store/editor'
import { CreationWizard } from './views/CreationWizard'
import { CutListView } from './views/CutListView'
import { FrontView } from './views/FrontView'
import { LibraryView } from './views/LibraryView'
import { ProfileView } from './views/ProfileView'
import { PropertiesPanel } from './views/PropertiesPanel'

const UNITS: LengthUnit[] = ['mm', 'cm']

type ViewMode = 'front' | 'side' | 'cut'
const VIEWS: { mode: ViewMode; label: string }[] = [
  { mode: 'front', label: 'Face' },
  { mode: 'side', label: 'Profil' },
  { mode: 'cut', label: 'Découpe' },
]

type Screen = 'library' | 'wizard' | 'editor'

interface Notice {
  text: string
  kind: 'error' | 'info'
}

/** Un plan d'étagère fait quelques ko : au-delà, ce n'est pas un de nos fichiers. */
const MAX_IMPORT_BYTES = 5_000_000

/** Champ où l'on tape du texte : Ctrl+Z doit alors annuler la frappe, pas le plan. */
function isTextEntry(el: HTMLElement): boolean {
  if (el.tagName === 'TEXTAREA') return true
  return el.tagName === 'INPUT' && !['checkbox', 'radio', 'button'].includes((el as HTMLInputElement).type)
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Une erreur est survenue.'
}

export default function App() {
  const [state, dispatch] = useReducer(editorReducer, initialEditorState)
  const [screen, setScreen] = useState<Screen>('library')
  const [wizardBack, setWizardBack] = useState<'library' | 'editor'>('library')
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [view, setView] = useState<ViewMode>('front')
  const [showMarks, setShowMarks] = useState(true)
  const { plan, selection, unit, snapStep, past, future } = state

  const { status, library, listing, refresh } = useLibrary()
  const { saveState, flush, markSaved } = useAutosave(library, currentId, plan)

  const notify = (text: string, kind: Notice['kind'] = 'error') => setNotice({ text, kind })

  // Toute modification passe par ici : si les contrôles de cohérence la refusent, on explique pourquoi.
  const run = (action: EditorAction) => {
    const { error } = applyAction(state, action)
    setNotice(error ? { text: error, kind: 'error' } : null)
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
      if (screen !== 'editor') return

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

  /** Ouvre un plan dans l'éditeur. `id` est null quand il n'est pas enregistré (stockage indisponible). */
  const showPlan = (opened: Plan, id: string | null) => {
    markSaved(id ? opened : null)
    setCurrentId(id)
    dispatch({ type: 'newPlan', plan: opened })
    setView('front')
    setScreen('editor')
  }

  const goToLibrary = async () => {
    await flush()
    await refresh()
    setScreen('library')
  }

  const goToWizard = async (from: 'library' | 'editor') => {
    if (from === 'editor') {
      if (!library && !window.confirm('Créer une nouvelle étagère ? Le plan actuel n’est pas enregistré et sera perdu.')) return
      await flush()
    }
    setWizardBack(from)
    setScreen('wizard')
  }

  /** Enregistre un nouveau plan dans la bibliothèque (si elle est disponible) et l'ouvre. */
  const addPlan = async (created: Plan, info?: string) => {
    let id: string | null = null
    if (library) {
      try {
        id = await library.create(created)
      } catch (error) {
        notify(`Enregistrement impossible : ${messageOf(error)} Pensez à exporter votre plan.`)
      }
    }
    showPlan(created, id)
    if (info) notify(info, 'info')
  }

  const openPlan = async (id: string) => {
    if (!library) return
    try {
      const opened = await library.open(id)
      if (!opened) {
        notify('Cette étagère est introuvable ou illisible.')
        await refresh()
        return
      }
      showPlan(opened, id)
    } catch (error) {
      notify(messageOf(error))
    }
  }

  /** Exécute une opération sur la bibliothèque, puis rafraîchit la liste ; les erreurs deviennent un message. */
  const change = async (operation: () => Promise<unknown>) => {
    try {
      await operation()
    } catch (error) {
      notify(messageOf(error))
    }
    await refresh()
  }

  const deletePlan = (id: string) => {
    const name = listing.summaries.find((s) => s.id === id)?.name ?? 'cette étagère'
    if (!library || !window.confirm(`Supprimer « ${name} » ? Cette action est définitive.`)) return
    if (id === currentId) setCurrentId(null)
    void change(() => library.remove(id))
  }

  const exportPlan = (exported: Plan) => downloadTextFile(exportFileName(exported.name), serializePlan(exported))

  const exportEntry = async (id: string) => {
    try {
      const entry = await library?.open(id)
      if (entry) exportPlan(entry)
      else notify('Cette étagère est introuvable ou illisible.')
    } catch (error) {
      notify(messageOf(error))
    }
  }

  const importFile = async (file: File) => {
    if (file.size > MAX_IMPORT_BYTES) return notify('Ce fichier est trop volumineux pour être un plan d’étagère.')
    let content: string
    try {
      content = await file.text()
    } catch {
      return notify('Impossible de lire ce fichier.')
    }
    const result = parsePlanFile(content)
    if (!result.ok) return notify(`Import impossible : ${result.error}`)
    await addPlan(result.plan, `« ${result.plan.name} » a été importée.`)
  }

  const saveLabel = !currentId
    ? 'Non enregistrée'
    : saveState === 'saving'
      ? 'Enregistrement…'
      : saveState === 'error'
        ? 'Échec de l’enregistrement'
        : 'Enregistrée dans ce navigateur'

  return (
    <div className="app">
      <header className="app-header">
        <h1>Atelier Étagères</h1>
        {screen === 'editor' && plan && (
          <>
            <span className="app-plan-name">{plan.name}</span>
            <span className={`save-state${!currentId || saveState === 'error' ? ' warn' : ''}`} role="status">
              {saveLabel}
            </span>
            <div className="header-tools">
              <button type="button" className="header-button" onClick={() => void goToLibrary()}>
                Mes étagères
              </button>
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
              <button type="button" className="header-button" onClick={() => exportPlan(plan)} title="Télécharger le plan (.etagere.json)">
                Exporter
              </button>
              <button type="button" className="header-button" onClick={() => void goToWizard('editor')}>
                Nouvelle étagère
              </button>
            </div>
          </>
        )}
        {screen !== 'editor' && (
          <div className="header-tools">
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
          </div>
        )}
      </header>

      <main className="app-main">
        {screen === 'library' && (
          <LibraryView
            status={status}
            listing={listing}
            unit={unit}
            onNew={() => void goToWizard('library')}
            onOpen={(id) => void openPlan(id)}
            onRename={(id, name) => change(() => library!.rename(id, name))}
            onDuplicate={(id) => void change(() => library!.duplicate(id))}
            onDelete={deletePlan}
            onExport={(id) => void exportEntry(id)}
            onImport={(file) => void importFile(file)}
          />
        )}
        {screen === 'wizard' && <CreationWizard onCreate={(created) => void addPlan(created)} onCancel={() => setScreen(wizardBack)} />}
        {screen === 'editor' && plan && (
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
          </div>
        )}
      </main>

      {notice && (
        <div className={`notice ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Fermer le message">
            ×
          </button>
        </div>
      )}
    </div>
  )
}
