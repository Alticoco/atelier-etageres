import { useState, type ReactNode } from 'react'
import { JointsSection } from './JointsSection'
import { LengthField } from './LengthField'
import { ColorSection } from './ColorSection'
import { ObjectsSection } from './ObjectsSection'
import { INITIAL_OBJECTS_FORM } from './objectsForm'
import { stageLabel } from './stageLabel'
import { SupportsSection } from './SupportsSection'
import { readPiece, setPieceProperty, setPlanProperty, type PieceProperty, type PlanChange } from '../model/edit'
import { parseVerticalId, pieceLabel } from '../model/labels'
import { computePieces, getStages, sortedShelves } from '../model/pieces'
import { radiusLimits } from '../model/rounding'
import { MAX_STAGES, setStageCount } from '../model/tools'
import type { Plan } from '../model/types'
import { formatLength, type LengthUnit } from '../model/units'
import type { EditorAction } from '../store/editor'

/** Nombre d'étages : on tape un nombre ou on utilise − / +. Les étages sont alors répartis à égalité. */
function StageCountField({ plan, dispatch }: { plan: Plan; dispatch: (action: EditorAction) => void }) {
  const count = getStages(plan).length
  const [text, setText] = useState(String(count))
  const [error, setError] = useState<string | null>(null)

  const apply = (n: number) => {
    const result = setStageCount(plan, n)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    if (n !== count) dispatch({ type: 'setStageCount', count: n })
    setText(String(n))
  }
  const commit = () => {
    const n = Number(text.trim())
    if (text.trim() === '' || !Number.isInteger(n)) {
      setError('Entrez un nombre entier d’étages.')
      return
    }
    apply(n)
  }

  return (
    <div className="field">
      <label htmlFor="stage-count">Nombre d’étages</label>
      <div className="stepper">
        <button type="button" aria-label="Un étage de moins" disabled={count <= 1} onClick={() => apply(count - 1)}>
          −
        </button>
        <input
          id="stage-count"
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
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') {
              setText(String(count))
              setError(null)
              e.stopPropagation()
            }
          }}
        />
        <button type="button" aria-label="Un étage de plus" disabled={count >= MAX_STAGES} onClick={() => apply(count + 1)}>
          +
        </button>
      </div>
      {error && (
        <small className="field-error" role="alert">
          {error}
        </small>
      )}
      <p className="panel-hint">Changer le nombre d’étages les répartit à égalité ; les cales des étages retirés disparaissent.</p>
    </div>
  )
}

/** Valeur commune à toutes les pièces, ou null si elles diffèrent. */
function commonValue(values: number[]): number | null {
  return values.every((v) => v === values[0]) ? values[0] : null
}

interface StageToolsProps {
  plan: Plan
  unit: LengthUnit
  dispatch: (action: EditorAction) => void
  /** Étage proposé par défaut (celui de la pièce sélectionnée), identifié par la tablette du dessous. */
  defaultStageId?: string
}

/** Outils qui agissent sur un étage ou sur toute l'étagère : ajouter, espacer. */
function StageTools({ plan, unit, dispatch, defaultStageId }: StageToolsProps) {
  const stages = getStages(plan)
  const [chosen, setChosen] = useState('')
  const valid = (id?: string) => stages.some((s) => s.shelfBelowId === id)
  const stageId = valid(chosen) ? chosen : valid(defaultStageId) ? defaultStageId : stages[0]?.shelfBelowId
  // Copie des cales : l'étage choisi ci-dessus est la source ; la destination est un étage ou « tous les autres ».
  const [copyTarget, setCopyTarget] = useState('all')
  const others = stages.filter((s) => s.shelfBelowId !== stageId)
  const target = copyTarget === 'all' || others.some((s) => s.shelfBelowId === copyTarget) ? copyTarget : 'all'
  const sourceWedges = plan.wedges.filter((w) => w.shelfBelowId === stageId).length

  return (
    <fieldset className="panel-section tools">
      <legend>Outils</legend>
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
    </fieldset>
  )
}

interface PropertiesPanelProps {
  plan: Plan
  selection: string[]
  unit: LengthUnit
  dispatch: (action: EditorAction) => void
}

/** Panneau de droite : cotes de l'étagère, ou des pièces sélectionnées. */
export function PropertiesPanel({ plan, selection, unit, dispatch }: PropertiesPanelProps) {
  const ids = selection.filter((id) => readPiece(plan, id) !== null)
  // Réglages de la simulation de rangement : gardés ici pour ne pas être perdus quand le panneau change (clic sur une pièce).
  const [objectsForm, setObjectsForm] = useState(INITIAL_OBJECTS_FORM)

  const commitPlan = (change: PlanChange): string | null => {
    const result = setPlanProperty(plan, change)
    if (!result.ok) return result.error
    dispatch({ type: 'setPlanProperty', change })
    return null
  }

  const commitPiece = (property: PieceProperty, mm: number): string | null => {
    const result = setPieceProperty(plan, ids, property, mm)
    if (!result.ok) return result.error
    dispatch({ type: 'setPieceProperty', ids, property, mm })
    return null
  }

  if (ids.length === 0) {
    const depths = [plan.leftUpright, plan.rightUpright, ...plan.shelves, ...plan.wedges].map((p) => p.depth)
    return (
      <aside className="properties" aria-label="Propriétés">
        <h2>Étagère</h2>
        <div className="field">
          <label>
            Nom
            <input
              key={plan.name}
              type="text"
              defaultValue={plan.name}
              onBlur={(e) => commitPlan({ property: 'name', value: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
          </label>
        </div>

        <p className="panel-hint">
          Modèle : {plan.model === 'frame' ? 'avec cadre' : 'sans cadre (planches apparentes)'}, choisi à la création.
        </p>

        <fieldset className="panel-section">
          <legend>Dimensions hors-tout</legend>
          <LengthField
            key={`w-${plan.width}-${unit}`}
            label="Largeur"
            valueMm={plan.width}
            unit={unit}
            onCommit={(mm) => commitPlan({ property: 'width', mm })}
          />
          <LengthField
            key={`h-${plan.height}-${unit}`}
            label="Hauteur"
            valueMm={plan.height}
            unit={unit}
            onCommit={(mm) => commitPlan({ property: 'height', mm })}
          />
          <LengthField
            key={`d-${depths.join(',')}-${unit}`}
            label="Profondeur"
            valueMm={commonValue(depths)}
            unit={unit}
            onCommit={(mm) => commitPlan({ property: 'depth', mm })}
          />
          {commonValue(depths) === null && (
            <p className="panel-hint">Les pièces n’ont pas toutes la même profondeur ; saisir une valeur les uniformise.</p>
          )}
        </fieldset>

        <fieldset className="panel-section">
          <legend>Étages</legend>
          <StageCountField key={getStages(plan).length} plan={plan} dispatch={dispatch} />
        </fieldset>

        <JointsSection plan={plan} unit={unit} dispatch={dispatch} />

        <fieldset className="panel-section">
          <legend>Montage</legend>
          {plan.model === 'frame' && (
          <div className="field">
            <label>
              Tablettes du haut et du bas
              <select
                value={plan.options.framePlacement}
                onChange={(e) =>
                  commitPlan({ property: 'framePlacement', value: e.target.value as Plan['options']['framePlacement'] })
                }
              >
                <option value="between">Entre les montants</option>
                <option value="onTop">Posées sur / sous les montants</option>
              </select>
            </label>
          </div>
          )}
          <div className="field field-check">
            <label>
              <input
                type="checkbox"
                checked={plan.options.propagation}
                onChange={(e) => commitPlan({ property: 'propagation', value: e.target.checked })}
              />
              Propagation intelligente
            </label>
            <small className="field-hint">
              Quand on change la largeur ou la hauteur, les cales et les tablettes gardent leur position proportionnelle.
            </small>
          </div>
          <div className="field field-check">
            <label>
              <input
                type="checkbox"
                checked={plan.options.wallMount}
                onChange={(e) => commitPlan({ property: 'wallMount', value: e.target.checked })}
              />
              Fixation murale
            </label>
            <small className="field-hint">Ajoute une note et un repère « F » sur le plan PDF.</small>
          </div>
        </fieldset>

        <fieldset className="panel-section">
          <legend>Cales</legend>
          <LengthField
            key={`c-${plan.options.wedgeClearance}-${unit}`}
            label="Jeu sous la tablette"
            valueMm={plan.options.wedgeClearance}
            unit={unit}
            onCommit={(mm) => commitPlan({ property: 'wedgeClearance', mm })}
          />
          <LengthField
            key={`t-${plan.options.defaultWedgeThickness}-${unit}`}
            label="Épaisseur des nouvelles cales"
            valueMm={plan.options.defaultWedgeThickness}
            unit={unit}
            onCommit={(mm) => commitPlan({ property: 'defaultWedgeThickness', mm })}
          />
        </fieldset>

        <fieldset className="panel-section">
          <legend>Découpe</legend>
          <div className="field field-check">
            <label>
              <input
                type="checkbox"
                checked={plan.options.sawKerfEnabled}
                onChange={(e) => commitPlan({ property: 'sawKerfEnabled', value: e.target.checked })}
              />
              Trait de scie
            </label>
            <small className="field-hint">Ajoute une estimation de la perte de bois à la liste de découpe.</small>
          </div>
          {plan.options.sawKerfEnabled && (
            <LengthField
              key={`k-${plan.options.sawKerf}-${unit}`}
              label="Épaisseur du trait de scie"
              valueMm={plan.options.sawKerf}
              unit={unit}
              onCommit={(mm) => commitPlan({ property: 'sawKerf', mm })}
            />
          )}
        </fieldset>

        <StageTools plan={plan} unit={unit} dispatch={dispatch} />
        <ObjectsSection plan={plan} form={objectsForm} onForm={setObjectsForm} selection={selection} unit={unit} dispatch={dispatch} />
        <SupportsSection plan={plan} selection={selection} unit={unit} dispatch={dispatch} />
        <ColorSection plan={plan} selection={selection} dispatch={dispatch} />
        <p className="panel-hint">Cliquez sur une pièce pour modifier ses cotes. Ctrl ou Maj + clic pour en sélectionner plusieurs.</p>
      </aside>
    )
  }

  const pieces = ids.map((id) => ({ id, ...readPiece(plan, id)! }))
  const single = pieces.length === 1 ? pieces[0] : null
  const computed = single ? computePieces(plan).find((p) => p.id === single.id) : undefined
  const sameKey = pieces.map((p) => p.id).join('|')
  const shelf = single?.kind === 'shelf' ? plan.shelves.find((s) => s.id === single.id) : undefined
  const limits = ids.map((id) => radiusLimits(plan, id)).filter((l) => l !== null)
  const maxText =
    limits.length > 0
      ? `Maximum : coins ${formatLength(Math.min(...limits.map((l) => l.corner)), unit)}, arêtes ${formatLength(Math.min(...limits.map((l) => l.edge)), unit)}.`
      : ''
  const hasStageAbove = shelf ? sortedShelves(plan).at(-1)?.id !== shelf.id : false

  // Étage de la pièce sélectionnée : celui de la cale, ou celui juste au-dessus de la tablette.
  let defaultStageId: string | undefined
  if (single?.kind === 'wedge') defaultStageId = plan.wedges.find((w) => w.id === single.id)?.shelfBelowId
  if (single?.kind === 'shelf') defaultStageId = single.id
  if (single?.kind === 'upright') defaultStageId = parseVerticalId(single.id)?.shelfBelowId

  let title: ReactNode = `${pieces.length} pièces sélectionnées`
  if (single) title = pieceLabel(plan, single.id)

  return (
    <aside className="properties" aria-label="Propriétés">
      <h2>{title}</h2>
      {!single && <p className="panel-hint">{pieces.map((p) => pieceLabel(plan, p.id)).join(', ')}</p>}

      <LengthField
        key={`th-${sameKey}-${commonValue(pieces.map((p) => p.thickness))}-${unit}`}
        label="Épaisseur"
        valueMm={commonValue(pieces.map((p) => p.thickness))}
        unit={unit}
        onCommit={(mm) => commitPiece('thickness', mm)}
      />
      <LengthField
        key={`de-${sameKey}-${commonValue(pieces.map((p) => p.depth))}-${unit}`}
        label="Profondeur"
        valueMm={commonValue(pieces.map((p) => p.depth))}
        unit={unit}
        onCommit={(mm) => commitPiece('depth', mm)}
      />
      {single?.kind === 'shelf' && (
        <LengthField
          key={`y-${single.id}-${single.y}-${unit}`}
          label="Hauteur (dessous de la tablette)"
          valueMm={single.y ?? 0}
          unit={unit}
          onCommit={(mm) => commitPiece('y', mm)}
        />
      )}
      <LengthField
        key={`cr-${sameKey}-${commonValue(pieces.map((p) => p.cornerRadius))}-${unit}`}
        label="Rayon des coins (vue de face)"
        valueMm={commonValue(pieces.map((p) => p.cornerRadius))}
        unit={unit}
        onCommit={(mm) => commitPiece('cornerRadius', mm)}
      />
      <LengthField
        key={`er-${sameKey}-${commonValue(pieces.map((p) => p.edgeRadius))}-${unit}`}
        label="Rayon des arêtes (vue de profil)"
        valueMm={commonValue(pieces.map((p) => p.edgeRadius))}
        unit={unit}
        onCommit={(mm) => commitPiece('edgeRadius', mm)}
      />
      {maxText && <p className="panel-hint">0 = angle droit. {maxText}</p>}
      {single?.kind === 'shelf' && plan.model === 'frameless' && shelf && (
        <>
          <LengthField
            key={`ol-${single.id}-${single.overhangLeft}-${unit}`}
            label="Débord à gauche"
            valueMm={single.overhangLeft ?? 0}
            unit={unit}
            onCommit={(mm) => commitPiece('overhangLeft', mm)}
          />
          <LengthField
            key={`or-${single.id}-${single.overhangRight}-${unit}`}
            label="Débord à droite"
            valueMm={single.overhangRight ?? 0}
            unit={unit}
            onCommit={(mm) => commitPiece('overhangRight', mm)}
          />
          {hasStageAbove && (
            <div className="field field-check">
              <label>
                <input
                  type="checkbox"
                  checked={shelf.verticalLeft}
                  onChange={(e) => dispatch({ type: 'setShelfVertical', shelfId: shelf.id, side: 'left', present: e.target.checked })}
                />
                Montant à gauche, étage au-dessus
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={shelf.verticalRight}
                  onChange={(e) => dispatch({ type: 'setShelfVertical', shelfId: shelf.id, side: 'right', present: e.target.checked })}
                />
                Montant à droite, étage au-dessus
              </label>
              <small className="field-hint">Sans montant, l’extrémité de l’étage se termine par la seule tablette.</small>
            </div>
          )}
        </>
      )}
      {single?.kind === 'upright' && plan.model === 'frameless' && (
        <p className="panel-hint">L’épaisseur et la profondeur s’appliquent à tous les montants de ce côté.</p>
      )}
      {single?.kind === 'wedge' && (
        <LengthField
          key={`x-${single.id}-${single.x}-${unit}`}
          label="Position depuis la gauche"
          valueMm={single.x ?? 0}
          unit={unit}
          onCommit={(mm) => commitPiece('x', mm)}
        />
      )}
      {computed && (
        <p className="panel-hint">
          Longueur (calculée) : {formatLength(computed.length, unit)}
        </p>
      )}
      <button type="button" className="danger" onClick={() => dispatch({ type: 'removePieces', ids })}>
        {single ? 'Supprimer cette pièce' : `Supprimer ces ${pieces.length} pièces`}
      </button>
      <StageTools key={sameKey} plan={plan} unit={unit} dispatch={dispatch} defaultStageId={defaultStageId} />
      <ObjectsSection plan={plan} form={objectsForm} onForm={setObjectsForm} selection={selection} unit={unit} dispatch={dispatch} />
        <SupportsSection plan={plan} selection={selection} unit={unit} dispatch={dispatch} />
        <ColorSection plan={plan} selection={selection} dispatch={dispatch} />
    </aside>
  )
}
