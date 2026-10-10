import { useState } from 'react'
import { OBJECT_KINDS, layoutStage, objectKind, remainingCapacity, rowLabel } from '../model/objects'
import { getStages } from '../model/pieces'
import type { Plan } from '../model/types'
import type { EditorAction } from '../store/editor'

interface ObjectsSectionProps {
  plan: Plan
  dispatch: (action: EditorAction) => void
}

/** Simulation : poser des mangas, des livres, des bocaux… pour se faire une idée de ce qui rentre. */
export function ObjectsSection({ plan, dispatch }: ObjectsSectionProps) {
  const stages = getStages(plan)
  const [stageChoice, setStageChoice] = useState('')
  const [kindId, setKindId] = useState(OBJECT_KINDS[0].id)
  const [countText, setCountText] = useState('')
  const stageId = stages.some((s) => s.shelfBelowId === stageChoice) ? stageChoice : stages[0]?.shelfBelowId
  const kind = objectKind(kindId)
  const room = stageId ? remainingCapacity(plan, stageId, kindId) : 0
  const layouts = new Map(stages.map((s, i) => [s.shelfBelowId, { index: i + 1, layout: layoutStage(plan, s) }]))
  const rows = plan.rows ?? []

  const add = () => {
    if (!stageId) return
    const n = countText.trim() === '' ? undefined : Number(countText.replace(',', '.'))
    dispatch({ type: 'addObjectRow', shelfBelowId: stageId, kind: kindId, count: n })
    setCountText('')
  }

  return (
    <fieldset className="panel-section objects">
      <legend>Simulation de rangement</legend>
      <p className="panel-hint">Pose des objets dans un étage pour voir ce qui rentre. Ils ne changent pas la liste de découpe.</p>
      <div className="field">
        <label>
          Étage
          <select value={stageId} onChange={(e) => setStageChoice(e.target.value)}>
            {stages.map((stage, i) => (
              <option key={stage.shelfBelowId} value={stage.shelfBelowId}>{`Étage ${i + 1}`}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="field">
        <label>
          Objet
          <select value={kindId} onChange={(e) => setKindId(e.target.value)}>
            {OBJECT_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {`${k.label} (${k.width / 10} × ${k.height / 10} × ${k.depth / 10} cm)`}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="field">
        <label>
          Quantité
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={countText}
            placeholder={`Remplir (${room} max)`}
            onChange={(e) => setCountText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
        </label>
      </div>
      <div className="tool-buttons">
        <button type="button" onClick={add} disabled={!stageId || !kind}>
          Poser les objets
        </button>
      </div>

      {rows.length > 0 && (
        <ul className="object-rows">
          {rows.map((row) => {
            const info = layouts.get(row.shelfBelowId)
            const status = info?.layout.rows.find((r) => r.rowId === row.id)
            return (
              <li key={row.id}>
                <span>
                  Étage {info?.index ?? '?'} : {rowLabel(row)}
                  {status && status.overflow > 0 && <small className="field-error"> — {status.overflow} sans place</small>}
                  {status?.tooTall && <small className="field-error"> — plus haut que l’étage</small>}
                  {status?.tooDeep && <small className="field-error"> — plus profond que la tablette</small>}
                </span>
                <button type="button" onClick={() => dispatch({ type: 'setObjectRowCount', rowId: row.id, count: row.count + 1 })} aria-label="Ajouter un objet">
                  +
                </button>
                <button
                  type="button"
                  disabled={row.count <= 1}
                  onClick={() => dispatch({ type: 'setObjectRowCount', rowId: row.id, count: row.count - 1 })}
                  aria-label="Retirer un objet"
                >
                  −
                </button>
                <button type="button" onClick={() => dispatch({ type: 'removeObjectRow', rowId: row.id })} aria-label="Supprimer la rangée">
                  ✕
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </fieldset>
  )
}
