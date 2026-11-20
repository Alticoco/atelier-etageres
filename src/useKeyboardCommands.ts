import { useEffect } from 'react'
import { commandForKey, type Command } from './keyboard'

/** Champ où l'on tape du texte : Ctrl+Z doit alors annuler la frappe, pas le plan. */
function isTextEntry(el: HTMLElement): boolean {
  if (el.tagName === 'TEXTAREA') return true
  return el.tagName === 'INPUT' && !['checkbox', 'radio', 'button'].includes((el as HTMLInputElement).type)
}

/**
 * Raccourcis clavier (voir `src/keyboard.ts`). Les touches d'édition restent aux champs de saisie quand on y tape.
 * `active` : faux hors de l'éditeur ou quand l'aide est ouverte.
 */
export function useKeyboardCommands(active: boolean, hasSelection: boolean, execute: (command: Command) => void) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!active) return
      const target = e.target as HTMLElement
      const command = commandForKey(e, {
        textEntry: isTextEntry(target),
        select: target.tagName === 'SELECT',
        hasSelection,
        textSelected: (window.getSelection()?.toString() ?? '') !== '',
      })
      if (!command) return
      e.preventDefault()
      execute(command)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })
}
