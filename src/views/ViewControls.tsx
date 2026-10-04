interface ViewControlsProps {
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
}

/** Boutons + / − / « Tout voir » en bas à droite d'une vue. */
export function ViewControls({ onZoomIn, onZoomOut, onReset }: ViewControlsProps) {
  return (
    <div className="view-controls">
      <button type="button" onClick={onZoomIn} aria-label="Zoom avant" title="Zoom avant">
        +
      </button>
      <button type="button" onClick={onZoomOut} aria-label="Zoom arrière" title="Zoom arrière">
        −
      </button>
      <button type="button" onClick={onReset} title="Recadrer toute l'étagère">
        Tout voir
      </button>
    </div>
  )
}
