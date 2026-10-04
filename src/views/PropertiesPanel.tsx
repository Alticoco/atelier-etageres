import { useState, type ReactNode } from 'react'
import { readPiece, setPieceProperty, setPlanProperty, type PieceProperty, type PlanChange } from '../model/edit'
import { pieceLabel } from '../model/labels'
import { computePieces } from '../model/pieces'
import type { Plan } from '../model/types'
import { formatLength, formatNumber, parseLength, type LengthUnit } from '../model/units'
import type { EditorAction } from '../store/editor'

interface LengthFieldProps {
  label: string
  /** Valeur en mm, ou null quand les pièces sélectionnées ont des valeurs différentes. */
  valueMm: number | null
  unit: LengthUnit
  /** Applique la valeur ; renvoie un message d'erreur, ou null si c'est accepté. */
  onCommit: (mm: number) => string | null
}

function LengthField({ label, valueMm, unit, onCommit }: LengthFieldProps) {
  const shown = valueMm === null ? '' : formatNumber(valueMm, unit)
  const [text, setText] = useState(shown)
  const [error, setError] = useState<string | null>(null)

  const commit = () => {
    if (text.trim() === '' || text === shown) {
      setText(shown)
      setError(null)
      return
    }
    const mm = parseLength(text, unit)
    if (mm === null) {
      setError(unit === 'mm' ? 'Entrez un nombre entier de mm.' : 'Entrez une longueur en cm, au mm près (ex. 80,5).')
      return
    }
    setError(onCommit(mm))
  }

  return (
    <div className="field">
      <label>
        {label} ({unit})
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={text}
          placeholder={valueMm === null ? 'Valeurs différentes' : undefined}
          aria-invalid={error ? true : undefined}
          onChange={(e) => {
            setText(e.target.value)
            setError(null)
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') {
              setText(shown)
              setError(null)
              e.stopPropagation()
            }
          }}
        />
      </label>
      {error && (
        <small className="field-error" role="alert">
          {error}
        </small>
      )}
    </div>
  )
}

/** Valeur commune à toutes les pièces, ou null si elles diffèrent. */
function commonValue(values: number[]): number | null {
  return values.every((v) => v === values[0]) ? values[0] : null
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
        <LengthField
          key={`w-${plan.width}-${unit}`}
          label="Largeur hors-tout"
          valueMm={plan.width}
          unit={unit}
          onCommit={(mm) => commitPlan({ property: 'width', mm })}
        />
        <LengthField
          key={`h-${plan.height}-${unit}`}
          label="Hauteur hors-tout"
          valueMm={plan.height}
          unit={unit}
          onCommit={(mm) => commitPlan({ property: 'height', mm })}
        />
        <LengthField
          key={`c-${plan.options.wedgeClearance}-${unit}`}
          label="Jeu des cales"
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
        <p className="panel-hint">Cliquez sur une pièce pour modifier ses cotes. Ctrl ou Maj + clic pour en sélectionner plusieurs.</p>
      </aside>
    )
  }

  const pieces = ids.map((id) => ({ id, ...readPiece(plan, id)! }))
  const single = pieces.length === 1 ? pieces[0] : null
  const computed = single ? computePieces(plan).find((p) => p.id === single.id) : undefined
  const sameKey = pieces.map((p) => p.id).join('|')

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
    </aside>
  )
}
