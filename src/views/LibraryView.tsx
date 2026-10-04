import { useRef, useState } from 'react'
import { formatLength, type LengthUnit } from '../model/units'
import type { LibraryListing } from '../storage/library'
import type { LibraryStatus } from '../storage/useLibrary'

interface LibraryViewProps {
  status: LibraryStatus
  listing: LibraryListing
  unit: LengthUnit
  onNew: () => void
  onOpen: (id: string) => void
  onRename: (id: string, name: string) => Promise<void>
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
  onExport: (id: string) => void
  onImport: (file: File) => void
}

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

/** Écran d'accueil : les étagères enregistrées dans ce navigateur, et l'import d'un fichier. */
export function LibraryView({
  status,
  listing,
  unit,
  onNew,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
  onExport,
  onImport,
}: LibraryViewProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const startRename = (id: string, name: string) => {
    setRenaming(id)
    setDraft(name)
  }
  const commitRename = async (id: string) => {
    await onRename(id, draft)
    setRenaming(null)
  }

  return (
    <div className="library">
      <div className="library-head">
        <h2>Mes étagères</h2>
        <div className="library-actions">
          <button type="button" className="primary" onClick={onNew}>
            Nouvelle étagère
          </button>
          <button type="button" onClick={() => fileInput.current?.click()}>
            Importer un fichier…
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,.pdf,application/json,application/pdf"
            hidden
            data-testid="import-input"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) onImport(file)
            }}
          />
        </div>
      </div>

      <p className="panel-hint">
        « Importer » accepte un fichier de sauvegarde <code>.etagere.json</code> ou un PDF exporté par Atelier Étagères.
      </p>

      {status === 'unavailable' && (
        <p className="library-warning" role="alert">
          La sauvegarde automatique n’est pas disponible dans ce navigateur (navigation privée ou stockage bloqué). Vous
          pouvez travailler, mais pensez à utiliser « Exporter » pour garder votre plan.
        </p>
      )}
      {listing.skipped > 0 && (
        <p className="library-warning" role="status">
          {listing.skipped === 1 ? '1 étagère enregistrée est illisible et a été ignorée.' : `${listing.skipped} étagères enregistrées sont illisibles et ont été ignorées.`}
        </p>
      )}

      {status === 'loading' && <p className="panel-hint">Chargement…</p>}
      {status === 'ready' && listing.summaries.length === 0 && (
        <p className="panel-hint">Aucune étagère enregistrée pour l’instant. Créez-en une ou importez un fichier.</p>
      )}

      <ul className="library-list">
        {listing.summaries.map((entry) => (
          <li key={entry.id} className="library-item">
            <div className="library-item-main">
              {renaming === entry.id ? (
                <form
                  className="rename-form"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void commitRename(entry.id)
                  }}
                >
                  <input
                    autoFocus
                    value={draft}
                    aria-label="Nouveau nom"
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => e.key === 'Escape' && setRenaming(null)}
                  />
                  <button type="submit">Enregistrer</button>
                  <button type="button" onClick={() => setRenaming(null)}>
                    Annuler
                  </button>
                </form>
              ) : (
                <>
                  <button type="button" className="library-name" onClick={() => onOpen(entry.id)}>
                    {entry.name}
                  </button>
                  <span className="library-meta">
                    {formatLength(entry.width, unit)} × {formatLength(entry.height, unit)} · modifiée le{' '}
                    {dateFormat.format(entry.updatedAt)}
                  </span>
                </>
              )}
            </div>
            {renaming !== entry.id && (
              <div className="library-item-actions">
                <button type="button" onClick={() => onOpen(entry.id)}>
                  Ouvrir
                </button>
                <button type="button" onClick={() => startRename(entry.id, entry.name)}>
                  Renommer
                </button>
                <button type="button" onClick={() => onDuplicate(entry.id)}>
                  Dupliquer
                </button>
                <button type="button" onClick={() => onExport(entry.id)}>
                  Exporter
                </button>
                <button type="button" className="danger-outline" onClick={() => onDelete(entry.id)}>
                  Supprimer
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
