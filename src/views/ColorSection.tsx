import { useEffect, useRef } from 'react'
import {
  COLOR_CATEGORIES,
  CONTRAST_PRESETS,
  DEFAULT_COLORS,
  WOOD_PRESETS,
  colorableIds,
  type ColorCategory,
} from '../model/colors'
import type { Plan } from '../model/types'
import type { EditorAction } from '../store/editor'

interface ColorGridProps {
  /** Couleur actuelle (`#rrggbb`), ou undefined = couleur par défaut. */
  value: string | undefined
  defaultColor: string
  /** Couleur choisie, ou null pour revenir à la couleur par défaut. */
  onPick: (color: string | null) => void
  label: string
}

/** Une grille de pastilles (bois, puis contrastes), un sélecteur libre et un retour à la couleur par défaut. */
function ColorGrid({ value, defaultColor, onPick, label }: ColorGridProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const pickRef = useRef(onPick)
  useEffect(() => {
    pickRef.current = onPick
  })

  // Le sélecteur libre n'applique la couleur qu'à la fermeture : un seul pas d'historique, pas un par nuance.
  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    const onChange = () => pickRef.current(input.value)
    input.addEventListener('change', onChange)
    return () => input.removeEventListener('change', onChange)
  }, [])

  const swatch = (hex: string, name: string) => (
    <button
      key={hex}
      type="button"
      className={`swatch${value?.toLowerCase() === hex ? ' active' : ''}`}
      style={{ background: hex }}
      title={name}
      aria-label={`${label} : ${name}`}
      aria-pressed={value?.toLowerCase() === hex}
      onClick={() => onPick(hex)}
    />
  )

  return (
    <div className="color-grid">
      <div className="swatches" role="group" aria-label={`${label} : tons de bois`}>
        {WOOD_PRESETS.map((p) => swatch(p.hex, p.label))}
      </div>
      <div className="swatches" role="group" aria-label={`${label} : couleurs de contraste`}>
        {CONTRAST_PRESETS.map((p) => swatch(p.hex, p.label))}
      </div>
      <div className="color-custom">
        <label>
          Autre couleur
          <input ref={inputRef} type="color" defaultValue={value ?? defaultColor} key={value ?? 'default'} aria-label={`${label} : couleur libre`} />
        </label>
        <button type="button" onClick={() => onPick(null)} disabled={value === undefined}>
          Couleur par défaut
        </button>
      </div>
    </div>
  )
}

interface ColorSectionProps {
  plan: Plan
  selection: string[]
  dispatch: (action: EditorAction) => void
}

/**
 * Couleurs d'affichage : une couleur par catégorie (montants, tablettes, cales, supports, mur), et une couleur propre
 * à la sélection (par exemple un support en décor, une cale qui contraste). Ne change pas la liste de découpe.
 */
export function ColorSection({ plan, selection, dispatch }: ColorSectionProps) {
  const ids = colorableIds(plan, selection)
  const first = ids[0]
  const selectionColor = first ? plan.colors?.pieces?.[first] : undefined
  const sameColor = ids.every((id) => plan.colors?.pieces?.[id] === selectionColor)

  return (
    <fieldset className="panel-section colors">
      <legend>Couleurs</legend>
      <p className="panel-hint">Pour se faire une idée de l’aspect final. Cela ne change ni les dimensions ni la liste de découpe.</p>

      {ids.length > 0 && (
        <div className="color-selection">
          <strong>{ids.length === 1 ? 'Couleur de la pièce choisie' : `Couleur des ${ids.length} pièces choisies`}</strong>
          <ColorGrid
            label="Pièce choisie"
            value={sameColor ? selectionColor : undefined}
            defaultColor="#dcb985"
            onPick={(color) => dispatch({ type: 'setPieceColors', ids, color })}
          />
          <p className="panel-hint">« Couleur par défaut » : la pièce reprend la couleur de sa catégorie.</p>
        </div>
      )}

      {COLOR_CATEGORIES.map(({ category, label }) => {
        const value = plan.colors?.[category]
        return (
          <details key={category} className="color-category">
            <summary>
              <span className="swatch swatch-chip" style={{ background: value ?? DEFAULT_COLORS[category] }} aria-hidden="true" />
              {label}
            </summary>
            <ColorGrid
              label={label}
              value={value}
              defaultColor={DEFAULT_COLORS[category]}
              onPick={(color) => dispatch({ type: 'setCategoryColor', category: category as ColorCategory, color })}
            />
          </details>
        )
      })}
    </fieldset>
  )
}
