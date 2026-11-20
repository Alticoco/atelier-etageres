import { useState } from 'react'
import { addCustomKind, resolveKind, updateCustomKind } from '../model/objects'
import type { Plan } from '../model/types'
import type { LengthUnit } from '../model/units'
import type { EditorAction } from '../store/editor'
import { CustomKindForm } from './CustomKindForm'
import { INITIAL_CUSTOM_KIND_DRAFT, draftFromKind, draftToInput, formatDims, removeKindMessage } from './customKindDraft'
import { PanelSection } from './PanelSection'

interface CustomKindsSectionProps {
  plan: Plan
  unit: LengthUnit
  dispatch: (action: EditorAction) => void
  /** Appelé avec l'identifiant d'un objet qui vient d'être créé (pour le choisir dans le menu « Objet »). */
  onCreated: (kindId: string) => void
  /** Un objet va être supprimé : le menu « Objet » ne doit plus le montrer. */
  onRemoved: (kindId: string) => void
}

/** « Mes objets » : créer, modifier et supprimer ses propres objets (boîte à thé, bocal, pot…). */
export function CustomKindsSection({ plan, unit, dispatch, onCreated, onRemoved }: CustomKindsSectionProps) {
  // null = formulaire fermé ; 'new' = nouvel objet ; sinon l'identifiant de l'objet modifié.
  const [editing, setEditing] = useState<string | null>(null)
  const kinds = plan.customKinds ?? []
  const editedKind = editing && editing !== 'new' ? resolveKind(plan, editing) : undefined

  const submit = (draftInput: ReturnType<typeof draftToInput>): string | null => {
    if (editing === 'new') {
      const result = addCustomKind(plan, draftInput)
      if (!result.ok) return result.error
      dispatch({ type: 'addCustomKind', data: draftInput })
      onCreated(result.id)
    } else if (editing) {
      const result = updateCustomKind(plan, editing, draftInput)
      if (!result.ok) return result.error
      dispatch({ type: 'updateCustomKind', id: editing, patch: draftInput })
    }
    setEditing(null)
    return null
  }

  const remove = (id: string) => {
    if (!window.confirm(removeKindMessage(plan, id))) return
    dispatch({ type: 'removeCustomKind', id })
    onRemoved(id)
    if (editing === id) setEditing(null)
  }

  return (
    <PanelSection title="Mes objets" className="custom-kinds" defaultOpen={kinds.length > 0}>
      <p className="panel-hint">Crée tes propres objets (une boîte à thé, un bocal…) pour les ranger dans la simulation.</p>
      {kinds.length > 0 && (
        <ul className="custom-kind-list">
          {kinds.map((k) => (
            <li key={k.id}>
              <span className="custom-kind-dot" style={{ background: k.color ?? '#d9b98a' }} aria-hidden="true" />
              <span className="custom-kind-name">
                {k.label}
                <small> {formatDims(k, unit)}</small>
              </span>
              <button type="button" onClick={() => setEditing(editing === k.id ? null : k.id)} aria-label={`Modifier ${k.label}`}>
                Modifier
              </button>
              <button type="button" onClick={() => remove(k.id)} aria-label={`Supprimer ${k.label}`}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing === 'new' && (
        <CustomKindForm
          key="new"
          formKey="new"
          initial={INITIAL_CUSTOM_KIND_DRAFT}
          unit={unit}
          submitLabel="Créer l’objet"
          onSubmit={(draft) => submit(draftToInput(draft))}
          onCancel={() => setEditing(null)}
        />
      )}
      {editedKind && (
        <CustomKindForm
          key={editedKind.id}
          formKey={editedKind.id}
          initial={draftFromKind(editedKind)}
          unit={unit}
          submitLabel="Enregistrer"
          onSubmit={(draft) => submit(draftToInput(draft))}
          onCancel={() => setEditing(null)}
        />
      )}
      {editing === null && (
        <div className="tool-buttons">
          <button type="button" onClick={() => setEditing('new')}>
            + Nouvel objet
          </button>
        </div>
      )}
    </PanelSection>
  )
}
