import { computeCutList, describeRounding } from '../model/cutlist'
import { pieceLabel } from '../model/labels'
import type { Plan } from '../model/types'
import { formatLength, formatNumber, type LengthUnit } from '../model/units'

interface CutListViewProps {
  plan: Plan
  unit?: LengthUnit
}

/** Liste de découpe : pièces regroupées par dimensions identiques, avec quantité et repère. */
export function CutListView({ plan, unit = 'cm' }: CutListViewProps) {
  const { groups, totalPieces, sawKerf } = computeCutList(plan)

  return (
    <div className="cutlist">
      <table>
        <caption>Liste de découpe — {plan.name}</caption>
        <thead>
          <tr>
            <th scope="col">Repère</th>
            <th scope="col">Quantité</th>
            <th scope="col">Longueur ({unit})</th>
            <th scope="col">Largeur ({unit})</th>
            <th scope="col">Épaisseur ({unit})</th>
            <th scope="col">Arrondi</th>
            <th scope="col">Pièces</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <tr key={group.mark}>
              <th scope="row" className="mark-cell">
                {group.mark}
              </th>
              <td>{group.quantity}</td>
              <td>{formatNumber(group.length, unit)}</td>
              <td>{formatNumber(group.width, unit)}</td>
              <td>{formatNumber(group.thickness, unit)}</td>
              <td className="cutlist-rounding">{describeRounding(group.cornerRadius, group.edgeRadius, unit)}</td>
              <td className="cutlist-pieces">{group.pieceIds.map((id) => pieceLabel(plan, id)).join(', ')}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">Total</th>
            <td>{totalPieces}</td>
            <td colSpan={5}>pièces à découper</td>
          </tr>
          {sawKerf && (
            <tr>
              <th scope="row">Perte</th>
              <td colSpan={6}>
                Trait de scie (estimation) : {sawKerf.cuts} coupes × {formatLength(sawKerf.kerf, unit)} ={' '}
                <strong>{formatLength(sawKerf.loss, unit)}</strong> de bois perdu
              </td>
            </tr>
          )}
        </tfoot>
      </table>
      {!sawKerf && (
        <p className="panel-hint">
          Pour estimer la perte de bois due à la scie, cochez « Trait de scie » dans les propriétés de l’étagère
          (cliquez dans le vide pour les afficher).
        </p>
      )}
      <p className="panel-hint">
        Les repères sont reportés sur la vue de face. Longueur = dimension principale de la pièce, largeur = profondeur de l’étagère.
      </p>
    </div>
  )
}
