import { useId, useState } from 'react'
import { STOCK_LENGTH_CHOICES, purchasePlan, type Board, type PieceOrigin, type SectionPurchase } from '../model/purchase'
import type { Plan } from '../model/types'
import { formatLength, formatNumber, parseLength, type LengthUnit } from '../model/units'
import type { EditorAction } from '../store/editor'

interface PurchaseSectionProps {
  plan: Plan
  unit: LengthUnit
  onChange: (action: EditorAction) => void
}

const ORIGIN_LABELS: Record<PieceOrigin, string> = { shelf: 'étagère', support: 'supports', front: 'portes et tiroirs' }

function originText(row: SectionPurchase): string {
  const parts = (Object.keys(ORIGIN_LABELS) as PieceOrigin[])
    .filter((o) => row.origins[o])
    .map((o) => `${row.origins[o]} ${ORIGIN_LABELS[o]}`)
  return parts.join(', ')
}

/** « 3 planches de 2,40 m » (toujours en mètres, comme au magasin). */
function boardsText(count: number, stockLength: number): string {
  const metres = (stockLength / 1000).toFixed(2).replace('.', ',')
  return `${count} planche${count > 1 ? 's' : ''} de ${metres} m`
}

/** Longueur de planche : saisie libre dans l'unité de l'écran, avec les longueurs courantes proposées. */
function StockLengthField({
  row,
  unit,
  onChange,
}: {
  row: SectionPurchase
  unit: LengthUnit
  onChange: (action: EditorAction) => void
}) {
  const listId = useId()
  const shown = formatNumber(row.stockLength, unit)
  const [text, setText] = useState(shown)
  const [error, setError] = useState<string | null>(null)
  const [lastShown, setLastShown] = useState(shown)
  if (shown !== lastShown) {
    // La valeur du plan a changé (annuler, autre plan…) : le champ la suit.
    setLastShown(shown)
    setText(shown)
  }

  const commit = () => {
    if (text.trim() === '' || text === shown) {
      setText(shown)
      setError(null)
      return
    }
    const mm = parseLength(text, unit)
    if (mm === null || mm < 100 || mm > 6000) {
      setError(`Entrez une longueur entre ${formatLength(100, unit)} et ${formatLength(6000, unit)}.`)
      return
    }
    setError(null)
    onChange({ type: 'setStockLength', key: row.key, mm })
  }

  return (
    <>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className="purchase-length-input"
        list={listId}
        value={text}
        aria-label={`Longueur des planches ${formatLength(row.width, unit)} × ${formatLength(row.thickness, unit)} (${unit})`}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
        }}
      />
      <datalist id={listId}>
        {STOCK_LENGTH_CHOICES.map((mm) => (
          <option key={mm} value={formatNumber(mm, unit)} />
        ))}
      </datalist>
      {error && <span className="purchase-error">{error}</span>}
    </>
  )
}

const BAR_WIDTH = 1000
const BAR_HEIGHT = 34

/** Une planche : barre proportionnelle, pièces (repère + longueur) et chute hachurée. */
function BoardBar({ board, stockLength, unit, title }: { board: Board; stockLength: number; unit: LengthUnit; title: string }) {
  const scale = BAR_WIDTH / stockLength
  const placed = board.pieces.map((p, i) => {
    const before = board.pieces.slice(0, i).reduce((sum, q) => sum + q.length, 0)
    return { ...p, x: before * scale, w: p.length * scale }
  })
  // Le trait de scie est compté dans la chute ou entre les pièces : on ne le dessine pas à part.
  const wasteStart = (stockLength - board.waste) * scale
  return (
    <svg
      className="purchase-board"
      viewBox={`0 0 ${BAR_WIDTH} ${BAR_HEIGHT}`}
      role="img"
      aria-label={`${title} : ${board.pieces.map((p) => `${p.mark} ${formatLength(p.length, unit)}`).join(', ')} ; chute ${formatLength(board.waste, unit)}`}
    >
      <defs>
        <pattern id="purchase-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="8" className="purchase-hatch-line" />
        </pattern>
      </defs>
      {placed.map((p, i) => (
        <g key={i}>
          <rect className="purchase-piece" x={p.x} y={0} width={p.w} height={BAR_HEIGHT} />
          {p.w >= 28 && (
            <text className="purchase-piece-text" x={p.x + p.w / 2} y={BAR_HEIGHT / 2 + 4} textAnchor="middle">
              {p.w >= 90 ? `${p.mark} · ${formatNumber(p.length, unit)}` : p.mark}
            </text>
          )}
        </g>
      ))}
      {board.waste > 0 && (
        <rect className="purchase-waste" x={wasteStart} y={0} width={board.waste * scale} height={BAR_HEIGHT} fill="url(#purchase-hatch)" />
      )}
    </svg>
  )
}

/** Synthèse d'achat par section et schéma de découpe de chaque planche. */
export function PurchaseSection({ plan, unit, onChange }: PurchaseSectionProps) {
  const rows = purchasePlan(plan)
  if (rows.length === 0) {
    return (
      <section className="purchase">
        <h3>À acheter</h3>
        <p className="panel-hint">Aucune pièce à acheter : le plan est vide.</p>
      </section>
    )
  }
  const kerfOn = plan.options.sawKerfEnabled

  return (
    <section className="purchase">
      <table>
        <caption>À acheter (planches de bois massif)</caption>
        <thead>
          <tr>
            <th scope="col">Section ({unit})</th>
            <th scope="col">Pièces</th>
            <th scope="col">Longueur totale ({unit})</th>
            <th scope="col">À acheter</th>
            <th scope="col">Longueur d’une planche ({unit})</th>
            <th scope="col">Chute ({unit})</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row">
                {formatNumber(row.width, unit)} × {formatNumber(row.thickness, unit)}
              </th>
              <td title={originText(row)}>{row.pieces}</td>
              <td>{formatNumber(row.totalLength, unit)}</td>
              <td>
                <strong>{row.boards.length > 0 ? boardsText(row.boards.length, row.stockLength) : '—'}</strong>
              </td>
              <td>
                <StockLengthField row={row} unit={unit} onChange={onChange} />
              </td>
              <td>{formatNumber(row.totalWaste, unit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="panel-hint">
        Chaque section (largeur × épaisseur) se coupe dans des planches de cette section. Les supports et les
        portes et tiroirs sont comptés avec l’étagère. {kerfOn ? 'Le trait de scie est pris en compte.' : 'Le trait de scie n’est pas pris en compte (case « Trait de scie » dans les propriétés).'}
      </p>
      {rows.map((row) => (
        <div key={row.key} className="purchase-cuts">
          <h4>
            Section {formatNumber(row.width, unit)} × {formatNumber(row.thickness, unit)} {unit} — {originText(row)}
          </h4>
          {row.errors.map((message) => (
            <p key={message} className="purchase-error" role="alert">
              Impossible : {message}. Choisissez des planches plus longues.
            </p>
          ))}
          {row.boards.map((board, i) => {
            const title = `Planche ${i + 1}`
            return (
              <div key={i} className="purchase-board-row">
                <span className="purchase-board-title">{title}</span>
                <BoardBar board={board} stockLength={row.stockLength} unit={unit} title={title} />
                <span className="purchase-board-text">
                  {board.pieces.map((p) => `${p.mark} ${formatNumber(p.length, unit)}`).join(' · ')} — chute {formatLength(board.waste, unit)}
                </span>
              </div>
            )
          })}
        </div>
      ))}
    </section>
  )
}
