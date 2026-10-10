import { useState } from 'react'
import { setJoint } from '../model/jointEdit'
import { MAX_BEVEL_ANGLE, jointOf, notchDepth, type Side } from '../model/joints'
import { sortedShelves } from '../model/pieces'
import type { EndStyle, Joint, JointType, Plan } from '../model/types'
import { formatLength, type LengthUnit } from '../model/units'
import type { EditorAction } from '../store/editor'
import { LengthField } from './LengthField'
import { PanelSection } from './PanelSection'

interface JointsSectionProps {
  plan: Plan
  unit: LengthUnit
  dispatch: (action: EditorAction) => void
}

/** Angle en degrés : un nombre entier, validé à la sortie du champ. */
function AngleField({ value, onCommit }: { value: number; onCommit: (degrees: number) => string | null }) {
  const [text, setText] = useState(String(value))
  const [error, setError] = useState<string | null>(null)
  const commit = () => {
    const n = Number(text.replace(',', '.').trim())
    if (text.trim() === '' || !Number.isInteger(n)) {
      setError('Entrez un angle entier, en degrés.')
      return
    }
    if (n === value) {
      setError(null)
      return
    }
    setError(onCommit(n))
  }
  return (
    <div className="field">
      <label>
        Angle de coupe (°)
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
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') {
              setText(String(value))
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

const SIDES: { side: Side; label: string }[] = [
  { side: 'left', label: 'Côté gauche' },
  { side: 'right', label: 'Côté droit' },
]

/**
 * Assemblage de chaque montant : vissé dans les tablettes (défaut), ou à encoches : montant et tablettes sont entaillés
 * à mi-bois, les tablettes traversent le montant et dépassent, avec un bout droit, arrondi ou coupé en biais.
 */
export function JointsSection({ plan, unit, dispatch }: JointsSectionProps) {
  if (plan.model !== 'frame') {
    return (
      <PanelSection title="Assemblage des montants" defaultOpen={false}>
        <p className="panel-hint">Les encoches concernent le modèle avec cadre. Le modèle sans cadre a déjà ses débords réglables.</p>
      </PanelSection>
    )
  }

  const commit = (side: Side, patch: Partial<Joint>): string | null => {
    const result = setJoint(plan, side, patch)
    if (!result.ok) return result.error
    dispatch({ type: 'setJoint', side, patch })
    return null
  }
  const shelf = sortedShelves(plan)[1] ?? sortedShelves(plan)[0]

  return (
    <PanelSection title="Assemblage des montants" className="joints" defaultOpen={false}>
      {SIDES.map(({ side, label }) => {
        const joint = jointOf(plan, side)
        const upright = side === 'left' ? plan.leftUpright : plan.rightUpright
        const depth = shelf ? notchDepth(upright.depth, shelf.depth) : 0
        return (
          <div key={side} className="joint-side">
            <div className="field">
              <label>
                {label}
                <select
                  value={joint.type}
                  onChange={(e) => dispatch({ type: 'setJoint', side, patch: { type: e.target.value as JointType } })}
                >
                  <option value="screwed">Vissé dans les tablettes</option>
                  <option value="notched">À encoches (les tablettes traversent)</option>
                </select>
              </label>
            </div>
            {joint.type === 'notched' && (
              <>
                <LengthField
                  key={`${side}-overhang-${joint.overhang}-${unit}`}
                  label="Tablette qui dépasse"
                  valueMm={joint.overhang}
                  unit={unit}
                  onCommit={(mm) => commit(side, { overhang: mm })}
                />
                <div className="field">
                  <label>
                    Bout de la tablette
                    <select
                      value={joint.endStyle}
                      onChange={(e) => dispatch({ type: 'setJoint', side, patch: { endStyle: e.target.value as EndStyle } })}
                    >
                      <option value="straight">Droit</option>
                      <option value="round">Arrondi</option>
                      <option value="bevel">Coupé en biais</option>
                    </select>
                  </label>
                </div>
                {joint.endStyle === 'round' && (
                  <LengthField
                    key={`${side}-radius-${joint.endSize}-${unit}`}
                    label="Rayon d’arrondi"
                    valueMm={joint.endSize}
                    unit={unit}
                    onCommit={(mm) => commit(side, { endSize: mm })}
                  />
                )}
                {joint.endStyle === 'bevel' && (
                  <AngleField
                    key={`${side}-angle-${joint.endSize}`}
                    value={joint.endSize}
                    onCommit={(degrees) => commit(side, { endSize: degrees })}
                  />
                )}
                {joint.endStyle === 'bevel' && (
                  <p className="panel-hint">0° = coupe droite ; plus l’angle augmente, plus la coupe est en diagonale (jusqu’à {MAX_BEVEL_ANGLE}°).</p>
                )}
                {shelf && (
                  <p className="panel-hint">
                    Encoches à mi-bois : {formatLength(shelf.thickness, unit)} de haut sur {formatLength(depth, unit)} de profondeur
                    dans le montant (côté avant), et {formatLength(upright.thickness, unit)} sur {formatLength(depth, unit)} dans chaque
                    tablette (côté arrière).
                  </p>
                )}
              </>
            )}
          </div>
        )
      })}
    </PanelSection>
  )
}
