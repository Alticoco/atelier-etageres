import { useEffect, useRef } from 'react'
import { SHORTCUTS } from '../keyboard'

interface ShortcutsDialogProps {
  onClose: () => void
}

/** Fenêtre d'aide : la liste des raccourcis clavier. Se ferme avec Échap, le bouton ou un clic à côté. */
export function ShortcutsDialog({ onClose }: ShortcutsDialogProps) {
  const closeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    // Le focus passe dans la fenêtre, puis revient où il était à la fermeture.
    const previous = document.activeElement as HTMLElement | null
    closeButton.current?.focus()
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault()
        onClose()
      }
      // Le focus ne sort pas de la fenêtre : un seul élément focalisable.
      if (e.key === 'Tab') {
        e.preventDefault()
        closeButton.current?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previous?.focus()
    }
  }, [onClose])

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">
        <div className="dialog-head">
          <h2 id="shortcuts-title">Raccourcis clavier</h2>
          <button ref={closeButton} type="button" onClick={onClose}>
            Fermer
          </button>
        </div>
        <div className="shortcut-groups">
          {SHORTCUTS.map((group) => (
            <section key={group.title}>
              <h3>{group.title}</h3>
              <dl>
                {group.items.map((item) => (
                  <div key={item.keys} className="shortcut">
                    <dt>
                      {item.keys.split(/\s{3}ou\s{3}/).map((alternative, i) => (
                        <span key={alternative}>
                          {i > 0 && <em> ou </em>}
                          <kbd>{alternative}</kbd>
                        </span>
                      ))}
                    </dt>
                    <dd>{item.label}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
