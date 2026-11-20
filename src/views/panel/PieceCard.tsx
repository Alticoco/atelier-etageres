import type { ReactNode } from 'react'
import { LengthField } from '../LengthField'
import { readPiece, setPieceProperty, type PieceProperty } from '../../model/edit'
import { pieceLabel } from '../../model/labels'
import { computePieces, fullUprightLength, sortedShelves } from '../../model/pieces'
import { radiusLimits } from '../../model/rounding'
import type { Plan } from '../../model/types'
import { formatLength, type LengthUnit } from '../../model/units'
import type { EditorAction } from '../../store/editor'
import { commonValue } from './commonValue'

interface PieceCardProps {
  plan: Plan
  ids: string[]
  unit: LengthUnit
  dispatch: (action: EditorAction) => void
}

/** Carte de la ou des pièces choisies : épaisseur, profondeur, position, arrondis… et suppression. */
export function PieceCard({ plan, ids, unit, dispatch }: PieceCardProps) {
  const commitPiece = (property: PieceProperty, mm: number): string | null => {
    const result = setPieceProperty(plan, ids, property, mm)
    if (!result.ok) return result.error
    dispatch({ type: 'setPieceProperty', ids, property, mm })
    return null
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
  const title: ReactNode = single ? pieceLabel(plan, single.id) : `${pieces.length} pièces choisies`

  return (
    <section className="selection-card" aria-label="Pièce choisie">
      <header className="selection-card-header">
        <h2>{title}</h2>
        <button type="button" className="link-button" onClick={() => dispatch({ type: 'clearSelection' })}>
          Désélectionner
        </button>
      </header>
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
      {single?.kind === 'upright' && plan.model === 'frame' && (
        <>
          <LengthField
            key={`ul-${single.id}-${single.length}-${unit}`}
            label="Hauteur du montant (coupé)"
            valueMm={single.length ?? 0}
            unit={unit}
            onCommit={(mm) => commitPiece('length', mm)}
          />
          {single.length !== undefined && single.length < fullUprightLength(plan) && (
            <button type="button" className="link-button" onClick={() => commitPiece('length', fullUprightLength(plan))}>
              Rétablir la hauteur complète ({formatLength(fullUprightLength(plan), unit)})
            </button>
          )}
          <p className="panel-hint">Option : raccourcir ce montant pour avoir deux côtés de hauteurs différentes. Les tablettes ne changent pas.</p>
        </>
      )}
      {single?.kind === 'upright' && plan.model === 'frameless' && (
        <p className="panel-hint">L’épaisseur et la profondeur s’appliquent à tous les montants de ce côté.</p>
      )}

      <details className="card-more">
        <summary>Arrondis</summary>
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
      </details>

      {computed && <p className="panel-hint">Longueur (calculée) : {formatLength(computed.length, unit)}</p>}
      {pieces.every((p) => p.kind === 'wedge') && (
        <div className="clip-actions">
          <button type="button" onClick={() => dispatch({ type: 'duplicatePieces', ids })} title="Ctrl+D">
            Dupliquer à côté
          </button>
          <button type="button" onClick={() => dispatch({ type: 'mirrorPieces', ids })}>
            Dupliquer en symétrique
          </button>
        </div>
      )}
      <button type="button" className="danger" onClick={() => dispatch({ type: 'removePieces', ids })}>
        {single ? 'Supprimer cette pièce' : `Supprimer ces ${pieces.length} pièces`}
      </button>
    </section>
  )
}
