import { frontDepth, setSupportProperty, type SupportProperty } from '../model/supports'
import type { Plan, Support } from '../model/types'
import type { LengthUnit } from '../model/units'
import type { EditorAction } from '../store/editor'
import { LengthField } from './LengthField'
import { PanelSection } from './PanelSection'

interface SupportsSectionProps {
  plan: Plan
  selection: string[]
  unit: LengthUnit
  dispatch: (action: EditorAction) => void
}

const FIELDS: { property: SupportProperty; label: string }[] = [
  { property: 'width', label: 'Largeur' },
  { property: 'height', label: 'Hauteur' },
  { property: 'depth', label: 'Profondeur' },
  { property: 'x', label: 'Position depuis la gauche' },
  { property: 'y', label: 'Hauteur du dessous' },
  { property: 'z', label: 'Recul depuis le mur' },
]

/**
 * Supports : planches à part, sous ou autour de l'étagère, qui portent son poids. Elles ne font pas partie de
 * l'étagère. On les règle ici au clavier, ou en les tirant dans les vues de face, de profil et de dessous.
 */
export function SupportsSection({ plan, selection, unit, dispatch }: SupportsSectionProps) {
  const supports = plan.supports ?? []
  const front = frontDepth(plan)

  const commit = (support: Support, property: SupportProperty, mm: number): string | null => {
    const result = setSupportProperty(plan, support.id, property, mm)
    if (!result.ok) return result.error
    dispatch({ type: 'setSupportProperty', id: support.id, property, mm })
    return null
  }

  return (
    <PanelSection title="Supports" className="supports">
      <p className="panel-hint">
        Planches à part qui portent l’étagère ou la calent contre son environnement. Placez-les en vue de face, de profil ou de
        dessous.
      </p>
      <div className="tool-buttons">
        <button type="button" onClick={() => dispatch({ type: 'addSupport', placement: 'under' })}>
          Ajouter sous l’étagère
        </button>
        <button type="button" onClick={() => dispatch({ type: 'addSupport', placement: 'left' })}>
          Ajouter à gauche
        </button>
        <button type="button" onClick={() => dispatch({ type: 'addSupport', placement: 'right' })}>
          Ajouter à droite
        </button>
        <button
          type="button"
          title="Une planche horizontale sous tous les supports du dessous, pour les relier et donner une base stable"
          onClick={() => dispatch({ type: 'addSupport', placement: 'base' })}
        >
          Ajouter une planche de base
        </button>
      </div>

      {supports.map((support, index) => {
        const open = selection.includes(support.id)
        const gapFront = front - (support.z + support.depth)
        return (
          <div key={support.id} className={`support-card${open ? ' open' : ''}`}>
            <button
              type="button"
              className="support-title"
              aria-expanded={open}
              onClick={() => dispatch(open ? { type: 'clearSelection' } : { type: 'selectPiece', id: support.id, additive: false })}
            >
              Support {index + 1}
              <small>
                {` — ${support.width / 10} × ${support.height / 10} × ${support.depth / 10} cm`}
              </small>
            </button>
            {open && (
              <>
                {FIELDS.map(({ property, label }) => (
                  <LengthField
                    key={`${support.id}-${property}-${support[property]}-${unit}`}
                    label={label}
                    valueMm={support[property]}
                    unit={unit}
                    onCommit={(mm) => commit(support, property, mm)}
                  />
                ))}
                <p className="panel-hint">
                  Position : négative = à gauche de l’étagère ; hauteur du dessous : 0 = bas de l’étagère, négative = en dessous ; recul : 0 = contre le mur.
                </p>
                <p className="panel-hint">
                  {gapFront > 0
                    ? `Il reste ${gapFront / 10} cm entre l’avant du support et l’avant de l’étagère.`
                    : gapFront === 0
                      ? 'Le support affleure l’avant de l’étagère.'
                      : `Le support dépasse de ${-gapFront / 10} cm devant l’étagère.`}
                </p>
                <div className="tool-buttons">
                  <button type="button" onClick={() => dispatch({ type: 'alignSupportFront', id: support.id })}>
                    Coller à l’avant
                  </button>
                  <button type="button" onClick={() => dispatch({ type: 'duplicateSupport', id: support.id, mode: 'next' })}>
                    Dupliquer
                  </button>
                  <button
                    type="button"
                    title="Copie placée de l’autre côté de l’étagère"
                    onClick={() => dispatch({ type: 'duplicateSupport', id: support.id, mode: 'mirror' })}
                  >
                    Copie symétrique
                  </button>
                  <button type="button" className="danger" onClick={() => dispatch({ type: 'removePieces', ids: [support.id] })}>
                    Supprimer
                  </button>
                </div>
              </>
            )}
          </div>
        )
      })}
    </PanelSection>
  )
}
