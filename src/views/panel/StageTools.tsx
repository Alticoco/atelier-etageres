import { useState } from 'react'
import { PanelSection } from '../PanelSection'
import { stageLabel } from '../stageLabel'
import { MAX_DISTRIBUTE } from '../../model/clipboard'
import { getStages } from '../../model/pieces'
import type { Plan } from '../../model/types'
import type { LengthUnit } from '../../model/units'
import type { EditorAction } from '../../store/editor'

interface StageToolsProps {
  plan: Plan
  unit: LengthUnit
  dispatch: (action: EditorAction) => void
  /** Étage proposé par défaut (celui de la pièce sélectionnée), identifié par la tablette du dessous. */
  defaultStageId?: string
}

/** Valeur du menu « Contenu de l'étage » pour un étage. */
function frontKey(plan: Plan, shelfBelowId: string): string {
  const front = plan.fronts?.find((f) => f.shelfBelowId === shelfBelowId)
  if (!front) return 'open'
  if (front.type === 'drawer') return 'drawer'
  return front.count === 2 ? 'doors-2' : `door-${front.hinge}`
}

function frontChoice(key: string): Extract<EditorAction, { type: 'setFront' }>['choice'] {
  if (key === 'drawer') return { type: 'drawer' }
  if (key === 'doors-2') return { type: 'doors', count: 2 }
  if (key === 'door-left') return { type: 'doors', count: 1, hinge: 'left' }
  if (key === 'door-right') return { type: 'doors', count: 1, hinge: 'right' }
  return null
}

/** Outils qui agissent sur un étage ou sur toute l'étagère : ajouter, espacer. */
export function StageTools({ plan, unit, dispatch, defaultStageId }: StageToolsProps) {
  const stages = getStages(plan)
  const [chosen, setChosen] = useState('')
  const valid = (id?: string) => stages.some((s) => s.shelfBelowId === id)
  const stageId = valid(chosen) ? chosen : valid(defaultStageId) ? defaultStageId : stages[0]?.shelfBelowId
  // Copie des cales : l'étage choisi ci-dessus est la source ; la destination est un étage ou « tous les autres ».
  const [copyTarget, setCopyTarget] = useState('all')
  const [distributeCount, setDistributeCount] = useState('3')
  const others = stages.filter((s) => s.shelfBelowId !== stageId)
  const target = copyTarget === 'all' || others.some((s) => s.shelfBelowId === copyTarget) ? copyTarget : 'all'
  const sourceWedges = plan.wedges.filter((w) => w.shelfBelowId === stageId).length

  return (
    <PanelSection title="Outils" className="tools">
      <div className="field">
        <label>
          Étage
          <select value={stageId} onChange={(e) => setChosen(e.target.value)}>
            {stages.map((stage, i) => (
              <option key={stage.shelfBelowId} value={stage.shelfBelowId}>
                {stageLabel(i, stages.length, stage.clearHeight, unit)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="tool-buttons">
        <button type="button" onClick={() => stageId && dispatch({ type: 'addWedge', shelfBelowId: stageId })}>
          Ajouter une cale
        </button>
        <button type="button" onClick={() => stageId && dispatch({ type: 'addShelf', shelfBelowId: stageId })}>
          Ajouter une tablette
        </button>
        <button type="button" onClick={() => dispatch({ type: 'distributeShelves' })}>
          Espacer les tablettes également
        </button>
      </div>
      <div className="clip-distribute">
        <label>
          Nombre de cales
          <input type="number" min={1} max={MAX_DISTRIBUTE} value={distributeCount} onChange={(e) => setDistributeCount(e.target.value)} />
        </label>
        <button type="button" onClick={() => stageId && dispatch({ type: 'distributeWedges', shelfBelowId: stageId, count: Number(distributeCount) })}>
          Répartir également dans cet étage
        </button>
      </div>
      <p className="panel-hint">Remplace les cales de l’étage par ce nombre de cales aux écarts égaux (épaisseur par défaut des cales).</p>
      {plan.model === 'frame' && stageId && (
        <div className="field">
          <label>
            Contenu de l’étage
            <select
              value={frontKey(plan, stageId)}
              onChange={(e) => dispatch({ type: 'setFront', shelfBelowId: stageId, choice: frontChoice(e.target.value) })}
            >
              <option value="open">Ouvert</option>
              <option value="door-left">Une porte, charnières à gauche</option>
              <option value="door-right">Une porte, charnières à droite</option>
              <option value="doors-2">Deux portes</option>
              <option value="drawer">Un tiroir</option>
            </select>
          </label>
        </div>
      )}
      {stages.length > 1 && (
        <div className="copy-wedges">
          <div className="field">
            <label>
              Copier les cales de cet étage vers
              <select value={target} onChange={(e) => setCopyTarget(e.target.value)}>
                <option value="all">Tous les autres étages</option>
                {stages.map((stage, i) =>
                  stage.shelfBelowId === stageId ? null : (
                    <option key={stage.shelfBelowId} value={stage.shelfBelowId}>{`Étage ${i + 1}`}</option>
                  ),
                )}
              </select>
            </label>
          </div>
          <button
            type="button"
            onClick={() =>
              stageId &&
              dispatch({
                type: 'copyStageWedges',
                fromId: stageId,
                toIds: target === 'all' ? others.map((s) => s.shelfBelowId) : [target],
              })
            }
          >
            Copier les cales
          </button>
          <p className="panel-hint">
            {sourceWedges === 0
              ? 'Cet étage n’a pas de cale : la copie vide les étages choisis.'
              : `${sourceWedges} cale${sourceWedges > 1 ? 's' : ''} copiée${sourceWedges > 1 ? 's' : ''}, aux mêmes positions ; celles de l’étage visé sont remplacées.`}
          </p>
        </div>
      )}
    </PanelSection>
  )
}
