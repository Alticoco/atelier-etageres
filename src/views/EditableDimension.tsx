import { useState } from 'react'
import { formatNumber, parseLength, type LengthUnit } from '../model/units'
import { Dimension } from './Dimension'

const FONT_PX = 13

interface EditableDimensionProps {
  x1: number
  y1: number
  x2: number
  y2: number
  /** Valeur actuelle (mm) : affichée dans le champ quand on clique la cote. */
  valueMm: number
  unit: LengthUnit
  label: string
  /** Mm du dessin par pixel écran. */
  s: number
  side: 1 | -1
  /** Nouvelle valeur validée (mm). Un refus est expliqué par l'application (bandeau d'erreur). */
  onCommit: (mm: number) => void
}

/**
 * Cote cliquable : un clic ouvre un champ à la place du texte ; Entrée (ou quitter le champ) applique la valeur,
 * Échap annule. Le dessin se met à jour tout seul puisqu'il est calculé depuis le plan.
 */
export function EditableDimension({ x1, y1, x2, y2, valueMm, unit, label, s, side, onCommit }: EditableDimensionProps) {
  const [text, setText] = useState<string | null>(null)
  const [invalid, setInvalid] = useState(false)
  const vertical = x1 === x2
  const gap = 12 * s * side
  const tx = vertical ? (x1 + x2) / 2 + gap : (x1 + x2) / 2
  const ty = vertical ? (y1 + y2) / 2 : (y1 + y2) / 2 + gap

  const close = () => {
    setText(null)
    setInvalid(false)
  }
  const apply = () => {
    if (text === null) return
    const mm = parseLength(text, unit)
    if (mm === null) {
      setInvalid(true)
      return
    }
    close()
    if (mm !== valueMm) onCommit(mm)
  }

  return (
    <g
      className={`dim-editable${text !== null ? ' editing' : ''}`}
      data-dim-edit
      onClick={() => text === null && setText(formatNumber(valueMm, unit))}
    >
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={16} vectorEffect="non-scaling-stroke" pointerEvents="stroke" />
      <Dimension x1={x1} y1={y1} x2={x2} y2={y2} label={label} s={s} side={side} />
      <title>Cliquer pour modifier cette cote</title>
      {text !== null && (
        <foreignObject x={tx - 45 * s} y={ty - 13 * s} width={90 * s} height={26 * s}>
          <input
            className={`dim-input${invalid ? ' invalid' : ''}`}
            style={{ fontSize: FONT_PX * s, height: '100%', width: '100%', padding: `0 ${4 * s}px` }}
            autoFocus
            inputMode="decimal"
            aria-label={`Modifier la cote (${unit})`}
            aria-invalid={invalid || undefined}
            value={text}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              setText(e.target.value)
              setInvalid(false)
            }}
            onBlur={apply}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') apply()
              if (e.key === 'Escape') close()
            }}
          />
        </foreignObject>
      )}
    </g>
  )
}
