import { LengthField } from '../LengthField'
import { PanelSection } from '../PanelSection'
import type { PlanChange } from '../../model/edit'
import { getStages } from '../../model/pieces'
import type { Plan } from '../../model/types'
import type { LengthUnit } from '../../model/units'
import type { EditorAction } from '../../store/editor'
import { StageCountField } from './StageCountField'
import { StageTools } from './StageTools'

interface StagesTabProps {
  plan: Plan
  unit: LengthUnit
  /** Clé des pièces choisies : réinitialise les outils quand on change de pièce. */
  piecesKey: string
  defaultStageId?: string
  dispatch: (action: EditorAction) => void
  commitPlan: (change: PlanChange) => string | null
}

/** Onglet « Étages » : nombre d'étages, cales, outils. */
export function StagesTab({ plan, unit, piecesKey, defaultStageId, dispatch, commitPlan }: StagesTabProps) {
  return (
    <>
            <PanelSection title="Nombre d’étages">
              <StageCountField key={getStages(plan).length} plan={plan} dispatch={dispatch} />
            </PanelSection>

            <PanelSection title="Cales">
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
            </PanelSection>

            <StageTools key={piecesKey} plan={plan} unit={unit} dispatch={dispatch} defaultStageId={defaultStageId} />
    </>
  )
}
