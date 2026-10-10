import { lazy, Suspense, useEffect, useMemo, useReducer, useState } from 'react'
import { commandForKey, type Command, type ViewMode } from './keyboard'
import { nudgePiece, SNAP_STEPS } from './model/drag'
import { exportFileName, parsePlanFile, pdfFileName, serializePlan, type ParseResult } from './model/serialize'
import type { Plan } from './model/types'
import type { LengthUnit } from './model/units'
import { isPdf } from './pdf/detect'
import { downloadBytes, downloadTextFile } from './storage/download'
import { useAutosave } from './storage/useAutosave'
import { useLibrary } from './storage/useLibrary'
import { applyAction, initialEditorState, type EditorAction } from './store/editor'
import { activeTab, emptyWorkspace, isSplit, tabByKey, workspaceReducer, type Tab } from './store/workspace'
import { CreationWizard } from './views/CreationWizard'
import { BottomView } from './views/BottomView'
import { CutListView } from './views/CutListView'
import { ExportMenu } from './views/ExportMenu'
import { FrontView } from './views/FrontView'
import { LibraryView } from './views/LibraryView'
import { Logo } from './views/Logo'
import { ProfileView } from './views/ProfileView'
import { PropertiesPanel } from './views/PropertiesPanel'
import { ShortcutsDialog } from './views/ShortcutsDialog'
import { TabBar } from './views/TabBar'

/** Three.js pèse lourd : la vue 3D est chargée seulement quand on l'ouvre. */
const ThreeView = lazy(() => import('./views/ThreeView'))

const UNITS: LengthUnit[] = ['mm', 'cm']

const VIEWS: { mode: ViewMode; label: string }[] = [
  { mode: 'front', label: 'Face' },
  { mode: 'side', label: 'Profil' },
  { mode: 'cut', label: 'Découpe' },
  { mode: 'bottom', label: 'Dessous' },
  { mode: 'three', label: '3D' },
]

type Screen = 'library' | 'wizard' | 'editor'

interface Notice {
  text: string
  kind: 'error' | 'info'
}

/** Un plan d'étagère fait quelques ko : au-delà, ce n'est pas un de nos fichiers (un PDF exporté pèse quelques dizaines de ko). */
const MAX_IMPORT_BYTES = 5_000_000
const MAX_IMPORT_PDF_BYTES = 20_000_000

/** Champ où l'on tape du texte : Ctrl+Z doit alors annuler la frappe, pas le plan. */
function isTextEntry(el: HTMLElement): boolean {
  if (el.tagName === 'TEXTAREA') return true
  return el.tagName === 'INPUT' && !['checkbox', 'radio', 'button'].includes((el as HTMLInputElement).type)
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Une erreur est survenue.'
}

interface PaneProps {
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
function Pane({ tab, split, focused, view, unit, snapStep, showMarks, choices, onFocus, onView, onShowMarks, onChoose, onChange, onSelect }: PaneProps) {
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

export default function App() {
  const [ws, wsDispatch] = useReducer(workspaceReducer, emptyWorkspace)
  const [screen, setScreen] = useState<Screen>('library')
  const [wizardBack, setWizardBack] = useState<'library' | 'editor'>('library')
  const [notice, setNotice] = useState<Notice | null>(null)
  /** Vue affichée dans chaque volet (gauche, droite). */
  const [paneViews, setPaneViews] = useState<ViewMode[]>(['front', 'front'])
  const [showMarks, setShowMarks] = useState(true)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const tab = activeTab(ws)
  const state = tab?.editor ?? initialEditorState
  const { plan, selection, past, future } = state
  const { unit, snapStep } = ws
  const currentId = tab?.planId ?? null
  const split = isSplit(ws)
  const setView = (mode: ViewMode) => setPaneViews((views) => views.map((v, i) => (i === ws.focus ? mode : v)))

  const { status, library, listing, refresh } = useLibrary()
  const docs = useMemo(() => ws.tabs.map((t) => ({ key: t.key, id: t.planId, plan: t.editor.plan })), [ws.tabs])
  const { saveStates, flush } = useAutosave(library, docs)

  /** Envoie une action d'édition à un onglet donné. */
  const dispatchTo = (key: string, action: EditorAction) => wsDispatch({ type: 'edit', key, action })
  const dispatch = (action: EditorAction) => {
    if (tab) dispatchTo(tab.key, action)
    else wsDispatch({ type: 'edit', key: '', action })
  }

  const notify = (text: string, kind: Notice['kind'] = 'error') => setNotice({ text, kind })

  // Toute modification passe par ici : si les contrôles de cohérence la refusent, on explique pourquoi.
  const runOn = (key: string, action: EditorAction) => {
    const target = tabByKey(ws, key)
    if (!target) return
    const { error } = applyAction(target.editor, action)
    setNotice(error ? { text: error, kind: 'error' } : null)
    if (!error) dispatchTo(key, action)
  }
  const run = (action: EditorAction) => {
    if (tab) runOn(tab.key, action)
  }

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 6000)
    return () => window.clearTimeout(timer)
  }, [notice])

  /** Exécute un raccourci clavier (voir `src/keyboard.ts`). */
  const execute = (command: Command) => {
    switch (command.type) {
      case 'undo':
      case 'redo':
      case 'selectAll':
      case 'clearSelection':
        dispatch({ type: command.type })
        break
      case 'deleteSelection':
        run({ type: 'removePieces', ids: selection })
        break
      case 'nudge': {
        // Le déplacement au clavier concerne une seule pièce à la fois.
        if (!plan || selection.length !== 1) break
        const move = nudgePiece(plan, selection[0], command.dx, command.dy, command.fine ? 1 : snapStep)
        if (move) run({ type: 'setPieceProperty', ids: selection, property: move.property, mm: move.mm })
        break
      }
      case 'view':
        setView(command.mode)
        break
      case 'help':
        setHelpOpen(true)
        break
      case 'save':
        if (!currentId) notify('Cette étagère n’est pas enregistrée dans ce navigateur : utilisez « Exporter » pour la garder.')
        else void flush().then(() => notify('Étagère enregistrée.', 'info'))
        break
    }
  }

  // Raccourcis clavier. Les touches d'édition restent aux champs de saisie quand on y tape.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (screen !== 'editor' || helpOpen) return
      const target = e.target as HTMLElement
      const command = commandForKey(e, {
        textEntry: isTextEntry(target),
        select: target.tagName === 'SELECT',
        hasSelection: selection.length > 0,
      })
      if (!command) return
      e.preventDefault()
      execute(command)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  /** Ouvre un plan dans l'éditeur. `id` est null quand il n'est pas enregistré (stockage indisponible). */
  const showPlan = (opened: Plan, id: string | null) => {
    wsDispatch({ type: 'openPlan', plan: opened, planId: id })
    setScreen('editor')
  }

  const goToLibrary = async () => {
    await flush()
    await refresh()
    setScreen('library')
  }

  /** Ferme un onglet après avoir enregistré son plan ; sans onglet restant, on revient à la bibliothèque. */
  const closeTab = async (key: string) => {
    const target = tabByKey(ws, key)
    if (!target) return
    if (!target.planId && !window.confirm(`« ${target.editor.plan?.name ?? 'Cette étagère'} » n’est pas enregistrée dans ce navigateur. Fermer l’onglet la perdra : continuer ?`)) return
    await flush(key)
    wsDispatch({ type: 'closeTab', key })
    if (ws.tabs.length === 1) {
      await refresh()
      setScreen('library')
    }
  }

  const selectTab = (key: string) => {
    wsDispatch({ type: 'showTab', key })
    setScreen('editor')
  }

  // Les plans ouverts restent dans leurs onglets : créer une étagère n'en fait perdre aucune.
  const goToWizard = async (from: 'library' | 'editor') => {
    if (from === 'editor') await flush()
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
    wsDispatch({ type: 'planRemoved', planId: id })
    void change(() => library.remove(id))
  }

  const exportPlan = (exported: Plan) => downloadTextFile(exportFileName(exported.name), serializePlan(exported))

  /** Plan PDF A4 paysage avec le plan éditable joint. La bibliothèque PDF n'est chargée qu'à ce moment-là. */
  const exportPdf = async (exported: Plan) => {
    setExportingPdf(true)
    try {
      const { buildPlanPdf } = await import('./pdf/pdf')
      const bytes = await buildPlanPdf(exported, { unit })
      downloadBytes(pdfFileName(exported.name), bytes, 'application/pdf')
      notify('Le plan PDF a été créé. Vous pouvez le ré-importer plus tard pour le modifier.', 'info')
    } catch (error) {
      notify(`Création du PDF impossible : ${messageOf(error)}`)
    } finally {
      setExportingPdf(false)
    }
  }

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
    if (file.size > MAX_IMPORT_PDF_BYTES) return notify('Ce fichier est trop volumineux pour être un plan d’étagère.')
    let bytes: Uint8Array
    try {
      bytes = new Uint8Array(await file.arrayBuffer())
    } catch {
      return notify('Impossible de lire ce fichier.')
    }

    let result: ParseResult
    if (isPdf(bytes)) {
      try {
        const { readPlanFromPdf } = await import('./pdf/pdf')
        result = await readPlanFromPdf(bytes)
      } catch (error) {
        return notify(`Import impossible : ${messageOf(error)}`)
      }
    } else if (bytes.length > MAX_IMPORT_BYTES) {
      return notify('Ce fichier est trop volumineux pour être un plan d’étagère.')
    } else {
      result = parsePlanFile(new TextDecoder().decode(bytes))
    }
    if (!result.ok) return notify(`Import impossible : ${result.error}`)
    await addPlan(result.plan, `« ${result.plan.name} » a été importée.`)
  }

  const saveState = (tab && saveStates[tab.key]) || 'saved'
  const tabInfos = ws.tabs.map((t) => ({
    key: t.key,
    name: t.editor.plan?.name ?? 'Étagère',
    warn: !t.planId || saveStates[t.key] === 'error',
  }))
  const saveLabel = !currentId
    ? 'Non enregistrée'
    : saveState === 'saving'
      ? 'Enregistrement…'
      : saveState === 'error'
        ? 'Échec d’enregistrement'
        : 'Enregistrée'

  return (
    <div className="app">
      <header className="app-header">
        <h1>
          <Logo />
          Atelier Étagères
        </h1>
        {screen === 'editor' && plan && (
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
              <button
                type="button"
                className="header-button"
                onClick={() => void addPlan({ ...structuredClone(plan), name: `${plan.name} (variante)` }, 'Variante créée dans un nouvel onglet : choisissez l’onglet pour comparer, ou activez l’écran partagé.')}
                title="Créer une copie de cette étagère dans un nouvel onglet, pour en faire une variante"
              >
                Dupliquer
              </button>
              <ExportMenu onPdf={() => void exportPdf(plan)} onJson={() => exportPlan(plan)} busy={exportingPdf} />
              <button
                type="button"
                className="header-button icon-button"
                onClick={() => setHelpOpen(true)}
                title="Raccourcis clavier (?)"
                aria-label="Raccourcis clavier"
              >
                ?
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

      {ws.tabs.length > 0 && screen !== 'wizard' && (
        <TabBar
          tabs={tabInfos}
          panes={ws.panes}
          activeKey={tab?.key}
          inEditor={screen === 'editor'}
          split={split}
          onLibrary={() => void goToLibrary()}
          onSelect={selectTab}
          onClose={(key) => void closeTab(key)}
          onNew={() => void goToWizard(screen === 'editor' ? 'editor' : 'library')}
          onToggleSplit={() => {
            wsDispatch({ type: 'setSplit', split: !split })
            setScreen('editor')
          }}
        />
      )}

      <main className="app-main">
        {screen === 'library' && (
          <LibraryView
            status={status}
            listing={listing}
            unit={unit}
            onNew={() => void goToWizard('library')}
            onOpen={(id) => void openPlan(id)}
            onRename={(id, name) =>
              change(async () => {
                await library!.rename(id, name)
                wsDispatch({ type: 'planRenamed', planId: id, name: name.trim() })
              })
            }
            onDuplicate={(id) => void change(() => library!.duplicate(id))}
            onDelete={deletePlan}
            onExport={(id) => void exportEntry(id)}
            onImport={(file) => void importFile(file)}
          />
        )}
        {screen === 'wizard' && <CreationWizard onCreate={(created) => void addPlan(created)} onCancel={() => setScreen(wizardBack)} />}
        {screen === 'editor' && plan && (
          <div className="editor">
            <div className={`panes${split ? ' split' : ''}`}>
              {ws.panes.map((key, index) => {
                const paneTab = tabByKey(ws, key)
                if (!paneTab?.editor.plan) return null
                return (
                  <Pane
                    key={index}
                    tab={paneTab}
                    split={split}
                    focused={ws.focus === index}
                    view={paneViews[index]}
                    unit={unit}
                    snapStep={snapStep}
                    showMarks={showMarks}
                    choices={tabInfos}
                    onFocus={() => wsDispatch({ type: 'focusPane', pane: index as 0 | 1 })}
                    onView={(mode) => setPaneViews((views) => views.map((v, i) => (i === index ? mode : v)))}
                    onShowMarks={setShowMarks}
                    onChoose={(chosen) => wsDispatch({ type: 'showTab', key: chosen, pane: index as 0 | 1 })}
                    onChange={(action) => runOn(key, action)}
                    onSelect={(action) => dispatchTo(key, action)}
                  />
                )
              })}
            </div>
            <PropertiesPanel plan={plan} selection={selection} unit={unit} dispatch={run} />
          </div>
        )}
      </main>

      {helpOpen && <ShortcutsDialog onClose={() => setHelpOpen(false)} />}

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
