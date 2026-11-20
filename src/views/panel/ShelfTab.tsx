import { JointsSection } from '../JointsSection'
import { LengthField } from '../LengthField'
import { PanelSection } from '../PanelSection'
import type { PlanChange } from '../../model/edit'
import type { Plan } from '../../model/types'
import type { LengthUnit } from '../../model/units'
import type { EditorAction } from '../../store/editor'
import { commonValue } from './commonValue'

interface ShelfTabProps {
  plan: Plan
  unit: LengthUnit
  /** Y a-t-il une pièce choisie ? (sinon on affiche l'aide) */
  hasPiece: boolean
  dispatch: (action: EditorAction) => void
  commitPlan: (change: PlanChange) => string | null
}

/** Onglet « Étagère » : nom, dimensions hors-tout, assemblage, montage, découpe. */
export function ShelfTab({ plan, unit, hasPiece, dispatch, commitPlan }: ShelfTabProps) {
  const depths = [plan.leftUpright, plan.rightUpright, ...plan.shelves, ...plan.wedges].map((p) => p.depth)

  return (
    <>
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

            <PanelSection title="Dimensions hors-tout">
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
            </PanelSection>

            <JointsSection plan={plan} unit={unit} dispatch={dispatch} />

            <PanelSection title="Montage" defaultOpen={false}>
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
            </PanelSection>

            <PanelSection title="Découpe" defaultOpen={false}>
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
            </PanelSection>

            {!hasPiece && (
              <p className="panel-hint">Cliquez sur une pièce pour modifier ses cotes. Ctrl ou Maj + clic pour en sélectionner plusieurs.</p>
            )}
    </>
  )
}
