import { useEffect, useRef, useState } from 'react'

interface ExportMenuProps {
  onPdf: () => void
  onJson: () => void
  /** Génération du PDF en cours. */
  busy?: boolean
  /** Le plan a des supports : l'option « supports sur le plan PDF » est proposée. */
  hasSupports?: boolean
  pdfSupports?: boolean
  onPdfSupportsChange?: (value: boolean) => void
}

/** Menu « Exporter » : plan PDF imprimable, ou fichier de sauvegarde `.etagere.json`. */
export function ExportMenu({ onPdf, onJson, busy = false, hasSupports = false, pdfSupports = true, onPdfSupportsChange }: ExportMenuProps) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  // Se referme quand on clique ailleurs ou qu'on appuie sur Échap.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const choose = (action: () => void) => () => {
    setOpen(false)
    action()
  }

  return (
    <div className="export-menu" ref={root}>
      <button
        type="button"
        className="header-button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
      >
        {busy ? 'Création du PDF…' : 'Exporter ▾'}
      </button>
      {open && (
        <div className="export-items" role="menu">
          <button type="button" role="menuitem" onClick={choose(onPdf)}>
            <strong>Plan PDF</strong>
            <small>A4 paysage, à imprimer ; ré-importable</small>
          </button>
          {hasSupports && (
            <label className="export-option">
              <input type="checkbox" checked={pdfSupports} onChange={(e) => onPdfSupportsChange?.(e.target.checked)} />
              <span>
                Supports sur le plan PDF
                <small>en tireté, avec leurs repères S1, S2… et leur liste</small>
              </span>
            </label>
          )}
          <button type="button" role="menuitem" onClick={choose(onJson)}>
            <strong>Fichier de sauvegarde</strong>
            <small>.etagere.json</small>
          </button>
        </div>
      )}
    </div>
  )
}
