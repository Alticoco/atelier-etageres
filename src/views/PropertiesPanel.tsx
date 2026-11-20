import { useState } from 'react'
import { ColorSection } from './ColorSection'
import { ObjectsSection } from './ObjectsSection'
import { INITIAL_OBJECTS_FORM } from './objectsForm'
import { PieceCard } from './panel/PieceCard'
import { ShelfTab } from './panel/ShelfTab'
import { StagesTab } from './panel/StagesTab'
import { SupportsSection } from './SupportsSection'
import { readPiece, setPlanProperty, type PlanChange } from '../model/edit'
import { parseVerticalId } from '../model/labels'
import { isObjectId } from '../model/objects'
import { isSupportId } from '../model/supports'
import type { Plan } from '../model/types'
import type { LengthUnit } from '../model/units'
import type { EditorAction } from '../store/editor'

interface PropertiesPanelProps {
  plan: Plan
  selection: string[]
  unit: LengthUnit
  dispatch: (action: EditorAction) => void
}

type TabId = 'plan' | 'stages' | 'objects' | 'supports' | 'colors'

const TABS: { id: TabId; label: string }[] = [
  { id: 'plan', label: 'Étagère' },
  { id: 'stages', label: 'Étages' },
  { id: 'objects', label: 'Rangement' },
  { id: 'supports', label: 'Supports' },
  { id: 'colors', label: 'Couleurs' },
]

/** Onglet à ouvrir quand on choisit un support ou un objet dans le dessin (null = on reste où on est). */
function tabForSelection(selection: string[]): TabId | null {
  const last = selection.at(-1)
  if (!last) return null
  if (isSupportId(last)) return 'supports'
  if (isObjectId(last)) return 'objects'
  return null
}

/**
 * Panneau de droite, en cinq onglets : l'étagère (nom, dimensions, assemblage, montage, découpe), les étages et les
 * cales, la simulation de rangement, les supports, les couleurs. La pièce choisie dans le dessin s'affiche dans une
 * carte en haut, quel que soit l'onglet ; choisir un support ou un objet ouvre l'onglet qui lui correspond.
 */
export function PropertiesPanel({ plan, selection, unit, dispatch }: PropertiesPanelProps) {
  const ids = selection.filter((id) => readPiece(plan, id) !== null)
  // Réglages de la simulation de rangement : gardés ici pour ne pas être perdus quand le panneau change (clic sur une pièce).
  const [objectsForm, setObjectsForm] = useState(INITIAL_OBJECTS_FORM)
  const [tab, setTab] = useState<TabId>('plan')
  // Onglet imposé par un nouveau choix dans le dessin (support, objet) : ajusté pendant l'affichage, pas dans un effet.
  const [seenSelection, setSeenSelection] = useState('')
  const selectionKey = selection.join('|')
  if (selectionKey !== seenSelection) {
    setSeenSelection(selectionKey)
    const target = tabForSelection(selection)
    if (target) setTab(target)
  }

  const commitPlan = (change: PlanChange): string | null => {
    const result = setPlanProperty(plan, change)
    if (!result.ok) return result.error
    dispatch({ type: 'setPlanProperty', change })
    return null
  }

  // Étage de la pièce choisie : celui de la cale, ou celui juste au-dessus de la tablette.
  const single = ids.length === 1 ? { id: ids[0], ...readPiece(plan, ids[0])! } : null
  let defaultStageId: string | undefined
  if (single?.kind === 'wedge') defaultStageId = plan.wedges.find((w) => w.id === single.id)?.shelfBelowId
  if (single?.kind === 'shelf') defaultStageId = single.id
  if (single?.kind === 'upright') defaultStageId = parseVerticalId(single.id)?.shelfBelowId

  return (
    <aside className="properties" aria-label="Propriétés">
      <div className="panel-tabs" role="tablist" aria-label="Réglages">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls="panel-content"
            className={tab === id ? 'active' : undefined}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="panel-content" id="panel-content" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {ids.length > 0 && <PieceCard plan={plan} ids={ids} unit={unit} dispatch={dispatch} />}

        {tab === 'plan' && <ShelfTab plan={plan} unit={unit} hasPiece={ids.length > 0} dispatch={dispatch} commitPlan={commitPlan} />}

        {tab === 'stages' && (
          <StagesTab
            plan={plan}
            unit={unit}
            piecesKey={ids.join('|')}
            defaultStageId={defaultStageId}
            dispatch={dispatch}
            commitPlan={commitPlan}
          />
        )}

        {tab === 'objects' && (
          <ObjectsSection plan={plan} form={objectsForm} onForm={setObjectsForm} selection={selection} unit={unit} dispatch={dispatch} />
        )}
        {tab === 'supports' && <SupportsSection plan={plan} selection={selection} unit={unit} dispatch={dispatch} />}
        {tab === 'colors' && <ColorSection plan={plan} selection={selection} dispatch={dispatch} />}
      </div>
    </aside>
  )
}
