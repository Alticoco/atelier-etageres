import { useState } from 'react'
import { formatNumber, parseLength, type LengthUnit } from '../model/units'

interface LengthFieldProps {
  label: string
  /** Valeur en mm, ou null quand les pièces sélectionnées ont des valeurs différentes. */
  valueMm: number | null
  unit: LengthUnit
  /** Applique la valeur ; renvoie un message d'erreur, ou null si c'est accepté. */
  onCommit: (mm: number) => string | null
}

export function LengthField({ label, valueMm, unit, onCommit }: LengthFieldProps) {
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

