import { useState } from 'react'
import {
  MAX_FIT_MARGIN,
  MAX_STACK,
  OBJECT_KINDS,
  fitStageToObjects,
  isObjectId,
  layoutStage,
  objectLabel,
  remainingCapacity,
  resolveKind,
  rowLabel,
  setObjectRowGap,
  setObjectRowStack,
} from '../model/objects'
import { getStages } from '../model/pieces'
import type { ObjectOrientation, Plan } from '../model/types'
import { formatLength, type LengthUnit } from '../model/units'
import { CustomKindsSection } from './CustomKindsSection'
import { COUNT_ERROR, ORIENTATION_CHOICES, formatDims, parseCount, parseStack, stageObjectsNeeds } from './customKindDraft'
import { LengthField } from './LengthField'
import { PanelSection } from './PanelSection'
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
function InfoButton({ plan, kindId, open, onToggle }: { plan: Plan; kindId: string; open: boolean; onToggle: () => void }) {
  const label = resolveKind(plan, kindId)?.label ?? 'objet'
  return (
    <button type="button" className="info-button" aria-expanded={open} aria-label={`Informations : ${label}`} title="Informations sur l’objet" onClick={onToggle}>
      i
    </button>
  )
}

/** Fiche d'un objet : ses dimensions et ce qu'il faut pour le ranger. */
function InfoCard({ plan, kindId, unit }: { plan: Plan; kindId: string; unit: LengthUnit }) {
  const kind = resolveKind(plan, kindId)
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
      {kind.custom ? (
        <p className="panel-hint">Objet créé par vous : modifiez-le dans « Mes objets ».</p>
      ) : (
        <p className="panel-hint">Dimensions courantes, à titre indicatif : elles varient selon les éditions.</p>
      )}
    </div>
  )
}

function OrientationSelect({ value, onChange, label }: { value: ObjectOrientation; onChange: (o: ObjectOrientation) => void; label: string }) {
  const hint = ORIENTATION_CHOICES.find((c) => c.value === value)?.hint
  return (
    <select value={value} aria-label={label} title={hint} onChange={(e) => onChange(e.target.value as ObjectOrientation)}>
      {ORIENTATION_CHOICES.map((c) => (
        <option key={c.value} value={c.value} title={c.hint}>
          {c.label}
        </option>
      ))}
    </select>
  )
}

/** Objets par pile d'une rangée déjà posée : se valide en quittant le champ ou avec Entrée. */
function RowStackField({ plan, rowId, stack, dispatch }: { plan: Plan; rowId: string; stack: number; dispatch: (action: EditorAction) => void }) {
  const [text, setText] = useState(String(stack))
  const [error, setError] = useState<string | null>(null)
  const commit = () => {
    const n = parseStack(text)
    if (n === null) return setError(`Un nombre entier de 1 à ${MAX_STACK}.`)
    if (n === stack) {
      setText(String(stack))
      return setError(null)
    }
    const result = setObjectRowStack(plan, rowId, n)
    if (!result.ok) return setError(result.error)
    setError(null)
    dispatch({ type: 'setObjectRowStack', rowId, stack: n })
  }
  return (
    <>
      <label className="object-row-stack" title="Objets empilés les uns sur les autres (1 = pas de pile)">
        Par pile
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={text}
          aria-invalid={error ? true : undefined}
          onChange={(e) => {
            setText(e.target.value)
            setError(null)
          }}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
        />
      </label>
      {error && (
        <small className="field-error" role="alert">
          {error}
        </small>
      )}
    </>
  )
}

/** Simulation : poser des mangas, des livres, des bocaux… pour se faire une idée de ce qui rentre. */
export function ObjectsSection({ plan, form, onForm, selection = [], unit, dispatch }: ObjectsSectionProps) {
  const stages = getStages(plan)
  // Un objet sur mesure supprimé ne peut plus rester choisi : retour au premier objet du catalogue.
  const kindId = resolveKind(plan, form.kind) ? form.kind : OBJECT_KINDS[0].id
  const countText = form.count
  const gapMm = form.gap
  const [addError, setAddError] = useState<string | null>(null)
  const [fitError, setFitError] = useState<string | null>(null)
  const setStageChoice = (stage: string) => onForm({ ...form, stage })
  const setKindId = (kind: string) => onForm({ ...form, kind })
  const setCountText = (count: string) => onForm({ ...form, count })
  const selectedObjects = selection.filter((id) => isObjectId(id) && objectLabel(plan, id) !== null)
  // Fiche ouverte : le type d'objet affiché (null = fermée).
  const [infoKind, setInfoKind] = useState<string | null>(null)
  const toggleInfo = (id: string) => setInfoKind((current) => (current === id ? null : id))
  const stageId = stages.some((s) => s.shelfBelowId === form.stage) ? form.stage : stages[0]?.shelfBelowId
  const kind = resolveKind(plan, kindId)
  const stackN = parseStack(form.stack)
  const room = stageId ? remainingCapacity(plan, stageId, kindId, gapMm, form.orientation, stackN ?? 1) : 0
  const layouts = new Map(stages.map((s, i) => [s.shelfBelowId, { index: i + 1, layout: layoutStage(plan, s) }]))
  const rows = plan.rows ?? []
  const stage = stages.find((s) => s.shelfBelowId === stageId)
  const needs = stageId ? stageObjectsNeeds(plan, stageId) : null
  const shelfDepth = plan.shelves.find((s) => s.id === stageId)?.depth

  const add = () => {
    if (!stageId) return
    if (stackN === null) return setAddError(`« Par pile » : un nombre entier de 1 à ${MAX_STACK}.`)
    const parsed = parseCount(countText)
    if (parsed === null) return setAddError(COUNT_ERROR)
    setAddError(null)
    dispatch({ type: 'addObjectRow', shelfBelowId: stageId, kind: kindId, count: parsed.count, gap: gapMm, orientation: form.orientation, stack: stackN })
    onForm({ ...form, count: '' })
  }

  const fit = () => {
    if (!stageId) return
    const result = fitStageToObjects(plan, stageId, form.fitMargin)
    if (!result.ok) return setFitError(result.error)
    setFitError(null)
    dispatch({ type: 'fitStageToObjects', shelfBelowId: stageId, margin: form.fitMargin })
  }

  return (
    <>
    <CustomKindsSection
      plan={plan}
      unit={unit}
      dispatch={dispatch}
      onCreated={(id) => onForm({ ...form, kind: id })}
      onRemoved={(id) => form.kind === id && onForm({ ...form, kind: OBJECT_KINDS[0].id })}
    />
    <PanelSection title="Simulation de rangement" className="objects">
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
                {`${k.label} (${formatDims(k, unit)})`}
              </option>
            ))}
            {(plan.customKinds ?? []).length > 0 && (
              <optgroup label="Mes objets">
                {(plan.customKinds ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {`${c.label} (${formatDims(c, unit)})`}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        <InfoButton plan={plan} kindId={kindId} open={infoKind === kindId} onToggle={() => toggleInfo(kindId)} />
      </div>
      {infoKind !== null && <InfoCard plan={plan} kindId={infoKind} unit={unit} />}
      <div className="field">
        <label>
          Sens
          <OrientationSelect label="Sens" value={form.orientation} onChange={(orientation) => onForm({ ...form, orientation })} />
        </label>
        <small className="field-hint">
          {ORIENTATION_CHOICES.find((c) => c.value === form.orientation)?.hint}
        </small>
      </div>
      <div className="field">
        <label title="Objets empilés les uns sur les autres (1 = pas de pile)">
          Par pile
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={form.stack}
            placeholder="1"
            aria-invalid={stackN === null ? true : undefined}
            onChange={(e) => {
              setAddError(null)
              onForm({ ...form, stack: e.target.value })
            }}
          />
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
      {addError && (
        <p className="form-error" role="alert">
          {addError}
        </p>
      )}

      {stage && needs && (
        <div className="custom-kind-fit">
          <strong>Ajuster l’étage</strong>
          <p className="panel-hint">
            Hauteur conseillée : {formatLength(needs.height + form.fitMargin, unit)} (objet le plus haut + marge). Hauteur actuelle :{' '}
            {formatLength(stage.clearHeight, unit)}.
          </p>
          <LengthField
            key={`fit-${form.fitMargin}-${unit}`}
            label="Marge au-dessus (pour passer la main)"
            valueMm={form.fitMargin}
            unit={unit}
            onCommit={(mm) => {
              if (mm > MAX_FIT_MARGIN) return `Au plus ${formatLength(MAX_FIT_MARGIN, unit)}.`
              setFitError(null)
              onForm({ ...form, fitMargin: mm })
              return null
            }}
          />
          <p className="panel-hint">
            Profondeur nécessaire : {formatLength(needs.depth, unit)}.
            {shelfDepth !== undefined && needs.depth > shelfDepth && (
              <span className="field-error"> Attention : la tablette ne fait que {formatLength(shelfDepth, unit)} de profondeur.</span>
            )}
          </p>
          <div className="tool-buttons">
            <button type="button" onClick={fit}>
              Ajuster l’étage à ses objets
            </button>
          </div>
          {fitError && (
            <p className="form-error" role="alert">
              {fitError}
            </p>
          )}
        </div>
      )}

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
                  Étage {info?.index ?? '?'} : {rowLabel(row, plan)}
                  {status && status.overflow > 0 && <small className="field-error"> — {status.overflow} sans place</small>}
                  {status?.tooTall && <small className="field-error"> — plus haut que l’étage</small>}
                  {status?.tooDeep && <small className="field-error"> — plus profond que la tablette</small>}
                </span>
                <InfoButton plan={plan} kindId={row.kind} open={infoKind === row.kind} onToggle={() => toggleInfo(row.kind)} />
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
                <div className="object-row-layout">
                  <label>
                    Sens
                    <OrientationSelect
                      label={`Sens : ${rowLabel(row, plan)}`}
                      value={row.orientation ?? 'standing'}
                      onChange={(orientation) => dispatch({ type: 'setObjectRowOrientation', rowId: row.id, orientation })}
                    />
                  </label>
                  <RowStackField key={`stack-${row.id}-${row.stack ?? 1}`} plan={plan} rowId={row.id} stack={row.stack ?? 1} dispatch={dispatch} />
                </div>
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
    </PanelSection>
    </>
  )
}
