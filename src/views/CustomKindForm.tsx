import { useState } from 'react'
import { MAX_CUSTOM_MM } from '../model/objects'
import { formatLength, type LengthUnit } from '../model/units'
import { CUSTOM_COLORS, type CustomKindDraft } from './customKindDraft'
import { LengthField } from './LengthField'

interface CustomKindFormProps {
  /** Valeurs de départ (nouvel objet ou objet à modifier). */
  initial: CustomKindDraft
  /** Identifie l'objet édité : change quand on passe d'un objet à un autre. */
  formKey: string
  unit: LengthUnit
  submitLabel: string
  /** Enregistre ; renvoie le message d'erreur du modèle, ou null si c'est accepté. */
  onSubmit: (draft: CustomKindDraft) => string | null
  onCancel: () => void
}

/** Formulaire d'un objet sur mesure : nom, dimensions, forme, couleur. Les erreurs du modèle s'affichent dessous. */
export function CustomKindForm({ initial, formKey, unit, submitLabel, onSubmit, onCancel }: CustomKindFormProps) {
  const [draft, setDraft] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const change = (patch: Partial<CustomKindDraft>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setError(null)
  }
  const size = (key: 'width' | 'height' | 'depth', label: string) => (
    <LengthField
      key={`${formKey}-${key}-${draft[key]}-${unit}`}
      label={label}
      valueMm={draft[key]}
      unit={unit}
      onCommit={(mm) => {
        if (mm < 1 || mm > MAX_CUSTOM_MM) return `De 1 mm à ${formatLength(MAX_CUSTOM_MM, unit)}.`
        change({ [key]: mm })
        return null
      }}
    />
  )
  const isPaletteColor = CUSTOM_COLORS.some((c) => c.hex === draft.color.toLowerCase())

  return (
    <div className="custom-kind-form">
      <div className="field">
        <label>
          Nom
          <input
            type="text"
            autoComplete="off"
            maxLength={60}
            value={draft.label}
            placeholder="ex. Boîte à thé"
            onChange={(e) => change({ label: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setError(onSubmit(draft))
            }}
          />
        </label>
      </div>
      {size('width', 'Largeur')}
      {size('height', 'Hauteur')}
      {size('depth', 'Profondeur')}
      <p className="panel-hint">Largeur, hauteur et profondeur de l’objet tel qu’il est posé debout.</p>
      <div className="field">
        <label>
          Forme
          <select value={draft.shape} onChange={(e) => change({ shape: e.target.value === 'cylinder' ? 'cylinder' : 'box' })}>
            <option value="box">Boîte</option>
            <option value="cylinder">Cylindre (bocal, boîte ronde)</option>
          </select>
        </label>
      </div>
      <div className="field">
        <span>Couleur</span>
        <div className="custom-kind-colors" role="radiogroup" aria-label="Couleur">
          {CUSTOM_COLORS.map((c) => (
            <button
              key={c.hex}
              type="button"
              role="radio"
              aria-checked={draft.color.toLowerCase() === c.hex}
              className={`custom-kind-swatch${draft.color.toLowerCase() === c.hex ? ' selected' : ''}`}
              style={{ background: c.hex }}
              title={c.label}
              aria-label={c.label}
              onClick={() => change({ color: c.hex })}
            />
          ))}
          <label className={`custom-kind-free${isPaletteColor ? '' : ' selected'}`} title="Autre couleur">
            <input type="color" value={draft.color} aria-label="Autre couleur" onChange={(e) => change({ color: e.target.value })} />
          </label>
        </div>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="tool-buttons">
        <button type="button" onClick={() => setError(onSubmit(draft))}>
          {submitLabel}
        </button>
        <button type="button" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </div>
  )
}
