import { useState } from 'react'
import { OBJECT_KINDS, isObjectId, layoutStage, objectKind, objectLabel, remainingCapacity, rowLabel, setObjectRowGap } from '../model/objects'
import { getStages } from '../model/pieces'
import type { Plan } from '../model/types'
import { formatLength, type LengthUnit } from '../model/units'
import { LengthField } from './LengthField'
import type { ObjectsForm } from './objectsForm'
import { stageLabel } from './stageLabel'
import type { EditorAction } from '../store/editor'

interface ObjectsSectionProps {
  plan: Plan
  form: ObjectsForm
  onForm: (form: ObjectsForm) => void
  selection?: string[]
  unit: LengthUnit
  dispatch: (action: EditorAction) => void
}

/** Bouton « i » qui ouvre ou ferme la fiche d'un objet. */
function InfoButton({ kindId, open, onToggle }: { kindId: string; open: boolean; onToggle: () => void }) {
  const label = objectKind(kindId)?.label ?? 'objet'
  return (
    <button type="button" className="info-button" aria-expanded={open} aria-label={`Informations : ${label}`} title="Informations sur l’objet" onClick={onToggle}>
      i
    </button>
  )
}

/** Fiche d'un objet : ses dimensions et ce qu'il faut pour le ranger. */
function InfoCard({ kindId, unit }: { kindId: string; unit: LengthUnit }) {
  const kind = objectKind(kindId)
  if (!kind) return null
  return (
    <div className="info-card" role="note">
      <strong>{kind.label}</strong>
      <dl>
        <dt>Largeur (rangé debout)</dt>
        <dd>{formatLength(kind.width, unit)}</dd>
        <dt>Hauteur</dt>
        <dd>{formatLength(kind.height, unit)}</dd>
        <dt>Profondeur</dt>
        <dd>{formatLength(kind.depth, unit)}</dd>
      </dl>
      <p>
        Il lui faut un étage d’au moins {formatLength(kind.height, unit)} de haut et une tablette d’au moins{' '}
        {formatLength(kind.depth, unit)} de profondeur. On en range environ {Math.floor(1000 / kind.width)} par mètre de largeur.
      </p>
      <p className="panel-hint">Dimensions courantes, à titre indicatif : elles varient selon les éditions.</p>
    </div>
  )
}

/** Simulation : poser des mangas, des livres, des bocaux… pour se faire une idée de ce qui rentre. */
export function ObjectsSection({ plan, form, onForm, selection = [], unit, dispatch }: ObjectsSectionProps) {
  const stages = getStages(plan)
  const kindId = form.kind
  const countText = form.count
  const gapMm = form.gap
  const setStageChoice = (stage: string) => onForm({ ...form, stage })
  const setKindId = (kind: string) => onForm({ ...form, kind })
  const setCountText = (count: string) => onForm({ ...form, count })
  const selectedObjects = selection.filter((id) => isObjectId(id) && objectLabel(plan, id) !== null)
  // Fiche ouverte : le type d'objet affiché (null = fermée).
  const [infoKind, setInfoKind] = useState<string | null>(null)
  const toggleInfo = (id: string) => setInfoKind((current) => (current === id ? null : id))
  const stageId = stages.some((s) => s.shelfBelowId === form.stage) ? form.stage : stages[0]?.shelfBelowId
  const kind = objectKind(kindId)
  const room = stageId ? remainingCapacity(plan, stageId, kindId, gapMm) : 0
  const layouts = new Map(stages.map((s, i) => [s.shelfBelowId, { index: i + 1, layout: layoutStage(plan, s) }]))
  const rows = plan.rows ?? []

  const add = () => {
    if (!stageId) return
    const n = countText.trim() === '' ? undefined : Number(countText.replace(',', '.'))
    dispatch({ type: 'addObjectRow', shelfBelowId: stageId, kind: kindId, count: n, gap: gapMm })
    onForm({ ...form, count: '' })
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
              <option key={stage.shelfBelowId} value={stage.shelfBelowId}>
                {stageLabel(i, stages.length, stage.clearHeight, unit)}
              </option>
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
        <InfoButton kindId={kindId} open={infoKind === kindId} onToggle={() => toggleInfo(kindId)} />
      </div>
      {infoKind !== null && <InfoCard kindId={infoKind} unit={unit} />}
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
      <LengthField
        key={`gap-new-${gapMm}-${unit}`}
        label="Espace entre les objets"
        valueMm={gapMm}
        unit={unit}
        onCommit={(mm) => {
          if (mm > 500) return 'Au plus 50 cm.'
          onForm({ ...form, gap: mm })
          return null
        }}
      />
      <div className="tool-buttons">
        <button type="button" onClick={add} disabled={!stageId || !kind}>
          Poser les objets
        </button>
      </div>

      {selectedObjects.length > 0 && (
        <div className="object-selected" role="status">
          <strong>
            {selectedObjects.length === 1 ? objectLabel(plan, selectedObjects[0]) : `${selectedObjects.length} objets choisis`}
          </strong>
          <p className="panel-hint">Tirez l’objet dans le dessin pour le déplacer (il se détache de sa rangée), ou supprimez-le.</p>
          <div className="tool-buttons">
            <button type="button" className="danger" onClick={() => dispatch({ type: 'removePieces', ids: selectedObjects })}>
              Supprimer {selectedObjects.length === 1 ? 'l’objet' : 'les objets'}
            </button>
          </div>
        </div>
      )}

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
                <InfoButton kindId={row.kind} open={infoKind === row.kind} onToggle={() => toggleInfo(row.kind)} />
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
                <div className="row-gap">
                  <LengthField
                    key={`gap-${row.id}-${row.gap ?? 0}-${unit}`}
                    label="Espace entre les objets"
                    valueMm={row.gap ?? 0}
                    unit={unit}
                    onCommit={(mm) => {
                      const result = setObjectRowGap(plan, row.id, mm)
                      if (!result.ok) return result.error
                      dispatch({ type: 'setObjectRowGap', rowId: row.id, gap: mm })
                      return null
                    }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </fieldset>
  )
}
