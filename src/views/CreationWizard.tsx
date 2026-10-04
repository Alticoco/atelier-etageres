import { useState } from 'react'
import type { Plan } from '../model/types'
import {
  BLANK_WIZARD_VALUES,
  DEFAULT_WIZARD_VALUES,
  resolveWizard,
  type WizardField,
  type WizardValues,
} from '../model/wizard'
import { FrontView } from './FrontView'

interface FieldProps {
  id: WizardField
  label: string
  hint?: string
  value: string
  error?: string
  onChange: (value: string) => void
}

function NumberField({ id, label, hint, value, error, onChange }: FieldProps) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && !error && <small className="field-hint">{hint}</small>}
      {error && (
        <small id={`${id}-error`} className="field-error" role="alert">
          {error}
        </small>
      )}
    </div>
  )
}

interface CreationWizardProps {
  onCreate: (plan: Plan) => void
  /** Présent seulement s'il existe déjà un plan auquel revenir. */
  onCancel?: () => void
}

/** Assistant de création : formulaire à gauche, aperçu de face en direct à droite. */
export function CreationWizard({ onCreate, onCancel }: CreationWizardProps) {
  const [values, setValues] = useState<WizardValues>(DEFAULT_WIZARD_VALUES)
  const result = resolveWizard(values)

  const set = <K extends keyof WizardValues>(key: K, value: WizardValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }))

  const errors = result.ok ? {} : result.fieldErrors
  const field = (id: WizardField, label: string, hint?: string) => (
    <NumberField id={id} label={label} hint={hint} value={values[id]} error={errors[id]} onChange={(v) => set(id, v)} />
  )

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (result.ok) onCreate(result.plan)
  }

  return (
    <div className="wizard">
      <form className="wizard-form" onSubmit={submit} noValidate>
        <h2>Nouvelle étagère</h2>

        <div className="field">
          <label htmlFor="name">Nom</label>
          <input id="name" type="text" value={values.name} onChange={(e) => set('name', e.target.value)} />
        </div>

        <fieldset>
          <legend>Dimensions extérieures (cm)</legend>
          {field('width', 'Largeur')}
          {field('height', 'Hauteur')}
          {field('depth', 'Profondeur')}
          {field('stages', 'Nombre d’étages', 'Répartis également.')}
        </fieldset>

        <fieldset>
          <legend>Épaisseurs du bois (cm)</legend>
          {field('uprightThickness', 'Montants')}
          {field('shelfThickness', 'Tablettes')}
          {field('wedgeThickness', 'Cales')}
        </fieldset>

        <div className="field">
          <label htmlFor="framePlacement">Tablettes du haut et du bas</label>
          <select
            id="framePlacement"
            value={values.framePlacement}
            onChange={(e) => set('framePlacement', e.target.value as WizardValues['framePlacement'])}
          >
            <option value="between">Entre les montants</option>
            <option value="onTop">Posées sur / sous les montants</option>
          </select>
        </div>

        {!result.ok && result.formError && (
          <p className="form-error" role="alert">
            {result.formError}
          </p>
        )}

        <div className="wizard-actions">
          <button type="submit" className="primary" disabled={!result.ok}>
            Créer l’étagère
          </button>
          <button type="button" onClick={() => setValues(BLANK_WIZARD_VALUES)}>
            Plan vierge minimal
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel}>
              Annuler
            </button>
          )}
        </div>
      </form>

      <section className="wizard-preview" aria-label="Aperçu">
        {result.ok ? (
          <FrontView plan={result.plan} />
        ) : (
          <p className="preview-empty">Corrigez les champs pour voir l’aperçu.</p>
        )}
      </section>
    </div>
  )
}
