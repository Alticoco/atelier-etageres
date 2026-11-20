import { useState } from 'react'
import { getStages } from '../../model/pieces'
import { MAX_STAGES, setStageCount } from '../../model/tools'
import type { Plan } from '../../model/types'
import type { EditorAction } from '../../store/editor'

/** Nombre d'étages : on tape un nombre ou on utilise − / +. Les étages sont alors répartis à égalité. */
export function StageCountField({ plan, dispatch }: { plan: Plan; dispatch: (action: EditorAction) => void }) {
  const count = getStages(plan).length
  const [text, setText] = useState(String(count))
  const [error, setError] = useState<string | null>(null)

  const apply = (n: number) => {
    const result = setStageCount(plan, n)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    if (n !== count) dispatch({ type: 'setStageCount', count: n })
    setText(String(n))
  }
  const commit = () => {
    const n = Number(text.trim())
    if (text.trim() === '' || !Number.isInteger(n)) {
      setError('Entrez un nombre entier d’étages.')
      return
    }
    apply(n)
  }

  return (
    <div className="field">
      <label htmlFor="stage-count">Nombre d’étages</label>
      <div className="stepper">
        <button type="button" aria-label="Un étage de moins" disabled={count <= 1} onClick={() => apply(count - 1)}>
          −
        </button>
        <input
          id="stage-count"
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
              setText(String(count))
              setError(null)
              e.stopPropagation()
            }
          }}
        />
        <button type="button" aria-label="Un étage de plus" disabled={count >= MAX_STAGES} onClick={() => apply(count + 1)}>
          +
        </button>
      </div>
      {error && (
        <small className="field-error" role="alert">
          {error}
        </small>
      )}
      <p className="panel-hint">Changer le nombre d’étages les répartit à égalité ; les cales des étages retirés disparaissent.</p>
    </div>
  )
}
