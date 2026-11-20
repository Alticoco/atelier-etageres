import { useEffect, useMemo, useReducer, useState } from 'react'
import { readImportedPlan } from './importPlan'
import { type Command, type ViewMode } from './keyboard'
import { nudgePiece } from './model/drag'
import { exportFileName, pdfFileName, serializePlan } from './model/serialize'
import type { Plan } from './model/types'
import { downloadBytes, downloadTextFile } from './storage/download'
import { useAutosave } from './storage/useAutosave'
import { useLibrary } from './storage/useLibrary'
import { applyAction, initialEditorState, type EditorAction } from './store/editor'
import { activeTab, emptyWorkspace, isSplit, tabByKey, workspaceReducer } from './store/workspace'
import { useKeyboardCommands } from './useKeyboardCommands'
import { AppHeader } from './views/AppHeader'
import { CreationWizard } from './views/CreationWizard'
import { EditorPane } from './views/EditorPane'
import { LibraryView } from './views/LibraryView'
import { PropertiesPanel } from './views/PropertiesPanel'
import { ShortcutsDialog } from './views/ShortcutsDialog'
import { TabBar } from './views/TabBar'

type Screen = 'library' | 'wizard' | 'editor'

interface Notice {
  text: string
  kind: 'error' | 'info'
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Une erreur est survenue.'
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
  const [pdfSupports, setPdfSupports] = useState(true)
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

  useKeyboardCommands(screen === 'editor' && !helpOpen, selection.length > 0, execute)

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
      const bytes = await buildPlanPdf(exported, { unit, supports: pdfSupports })
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
    const result = await readImportedPlan(file)
    if (!result.ok) return notify(result.error)
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
      <AppHeader
        editor={screen === 'editor'}
        plan={plan}
        currentId={currentId}
        saveState={saveState}
        saveLabel={saveLabel}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        snapStep={snapStep}
        unit={unit}
        exportingPdf={exportingPdf}
        pdfSupports={pdfSupports}
        onPdfSupportsChange={setPdfSupports}
        dispatch={dispatch}
        onDuplicate={() =>
          void addPlan({ ...structuredClone(plan!), name: `${plan!.name} (variante)` }, 'Variante créée dans un nouvel onglet : choisissez l’onglet pour comparer, ou activez l’écran partagé.')
        }
        onPdf={() => void exportPdf(plan!)}
        onJson={() => exportPlan(plan!)}
        onHelp={() => setHelpOpen(true)}
      />

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
                  <EditorPane
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
