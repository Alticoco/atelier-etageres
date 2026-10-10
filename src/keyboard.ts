/**
 * Raccourcis clavier de l'éditeur : table de correspondance pure (touche → commande), testée sans navigateur.
 * L'application exécute les commandes ; la fenêtre d'aide affiche `SHORTCUTS`.
 */

export type ViewMode = 'front' | 'side' | 'cut' | 'bottom' | 'three'

export type Command =
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'selectAll' }
  | { type: 'clearSelection' }
  | { type: 'deleteSelection' }
  /** Déplacer la pièce sélectionnée d'un pas : `fine` = 1 mm au lieu du pas d'aimantation. */
  | { type: 'nudge'; dx: -1 | 0 | 1; dy: -1 | 0 | 1; fine: boolean }
  | { type: 'view'; mode: ViewMode }
  | { type: 'save' }
  | { type: 'help' }

/** Les champs d'un événement clavier dont on a besoin (un `KeyboardEvent` convient). */
export interface KeyInfo {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
}

export interface KeyContext {
  /** On tape dans un champ texte : les touches d'édition lui appartiennent (Ctrl+Z annule la frappe…). */
  textEntry: boolean
  /** Une liste déroulante a le focus : les flèches changent son choix. */
  select: boolean
  hasSelection: boolean
}

const VIEWS: Record<string, ViewMode> = { '1': 'front', '2': 'side', '3': 'cut', '4': 'bottom', '5': 'three' }

/** Commande déclenchée par une touche, ou null si la touche ne doit rien faire de spécial. */
export function commandForKey(e: KeyInfo, ctx: KeyContext): Command | null {
  const key = e.key.toLowerCase()
  const mod = e.ctrlKey || e.metaKey

  if (mod && !e.altKey) {
    // Enregistrer marche partout, même dans un champ : il faut empêcher la boîte « Enregistrer sous » du navigateur.
    if (key === 's') return { type: 'save' }
    if (ctx.textEntry) return null
    if (key === 'z') return e.shiftKey ? { type: 'redo' } : { type: 'undo' }
    if (key === 'y') return { type: 'redo' }
    if (key === 'a') return { type: 'selectAll' }
    return null
  }
  if (mod || e.altKey) return null
  if (ctx.textEntry || ctx.select) return null

  if (e.key === 'Escape') return { type: 'clearSelection' }
  if ((e.key === 'Delete' || e.key === 'Backspace') && ctx.hasSelection) return { type: 'deleteSelection' }

  const arrows: Record<string, [-1 | 0 | 1, -1 | 0 | 1]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, 1],
    ArrowDown: [0, -1],
  }
  const arrow = arrows[e.key]
  if (arrow && ctx.hasSelection) return { type: 'nudge', dx: arrow[0], dy: arrow[1], fine: e.shiftKey }

  if (e.key === '?') return { type: 'help' }
  if (!e.shiftKey && VIEWS[e.key]) return { type: 'view', mode: VIEWS[e.key] }
  return null
}

export interface ShortcutGroup {
  title: string
  items: { keys: string; label: string }[]
}

/** Liste affichée dans la fenêtre d'aide. À garder en phase avec `commandForKey`. */
export const SHORTCUTS: ShortcutGroup[] = [
  {
    title: 'Édition',
    items: [
      { keys: 'Ctrl + Z', label: 'Annuler' },
      { keys: 'Ctrl + Y   ou   Ctrl + Maj + Z', label: 'Rétablir' },
      { keys: 'Suppr   ou   Retour arrière', label: 'Supprimer la sélection' },
      { keys: 'Ctrl + A', label: 'Tout sélectionner' },
      { keys: 'Échap', label: 'Désélectionner' },
    ],
  },
  {
    title: 'Pièce sélectionnée',
    items: [
      { keys: '↑  ↓', label: 'Monter / descendre une tablette (un pas d’aimantation)' },
      { keys: '←  →', label: 'Déplacer une cale à gauche / à droite' },
      { keys: 'Maj + flèche', label: 'Déplacer d’un seul millimètre' },
      { keys: 'Ctrl / Maj + clic', label: 'Ajouter ou retirer une pièce de la sélection' },
      { keys: 'Alt + glisser', label: 'Déplacer sans aimantation' },
    ],
  },
  {
    title: 'Affichage',
    items: [
      { keys: '1   2   3   4   5', label: 'Vue de face, de profil, liste de découpe, de dessous, 3D' },
      { keys: 'Molette', label: 'Zoom' },
      { keys: 'Glisser sur le fond', label: 'Déplacer la vue' },
      { keys: '?', label: 'Afficher cette aide' },
    ],
  },
  {
    title: 'Fichier',
    items: [{ keys: 'Ctrl + S', label: 'Enregistrer maintenant (c’est déjà automatique)' }],
  },
]
