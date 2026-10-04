import { useCallback, useEffect, useRef, useState } from 'react'
import type { Plan } from '../model/types'
import type { Library } from './library'

export type SaveState = 'saved' | 'saving' | 'error'

/** Délai avant d'enregistrer, pour regrouper des modifications rapprochées en une seule écriture. */
const SAVE_DELAY_MS = 500

/**
 * Enregistre automatiquement le plan ouvert dans la bibliothèque après chaque modification.
 * `flush` force l'enregistrement tout de suite (à appeler avant de quitter l'éditeur).
 * `markSaved` indique qu'un plan vient d'être chargé ou créé : il est déjà à jour dans la base.
 */
export function useAutosave(library: Library | null, id: string | null, plan: Plan | null) {
  const [state, setState] = useState<SaveState>('saved')
  const lastSaved = useRef<Plan | null>(null)
  const latest = useRef({ library, id, plan })

  useEffect(() => {
    latest.current = { library, id, plan }
  })

  const flush = useCallback(async () => {
    const { library, id, plan } = latest.current
    if (!library || !id || !plan || plan === lastSaved.current) return
    setState('saving')
    try {
      await library.save(id, plan)
      lastSaved.current = plan
      setState('saved')
    } catch {
      setState('error')
    }
  }, [])

  const markSaved = useCallback((saved: Plan | null) => {
    lastSaved.current = saved
    setState('saved')
  }, [])

  // Enregistre peu après la dernière modification.
  useEffect(() => {
    if (!library || !id || !plan || plan === lastSaved.current) return
    const timer = window.setTimeout(() => void flush(), SAVE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [library, id, plan, flush])

  // Dernière chance : quand l'onglet est caché ou fermé, on enregistre sans attendre.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void flush()
    }
    const onPageHide = () => void flush()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [flush])

  return { saveState: state, flush, markSaved }
}
