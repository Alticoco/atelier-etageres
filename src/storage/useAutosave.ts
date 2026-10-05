import { useCallback, useEffect, useRef, useState } from 'react'
import type { Plan } from '../model/types'
import type { Library } from './library'

export type SaveState = 'saved' | 'saving' | 'error'

/** Délai avant d'enregistrer, pour regrouper des modifications rapprochées en une seule écriture. */
const SAVE_DELAY_MS = 500

/** Un plan ouvert dans un onglet. `id` est null s'il n'est pas dans la bibliothèque. */
export interface AutosaveDoc {
  key: string
  id: string | null
  plan: Plan | null
}

/**
 * Enregistre automatiquement chaque plan ouvert (un par onglet) dans la bibliothèque après chaque modification.
 * `flush` force l'enregistrement tout de suite (sans clé : tous les onglets) ; à appeler avant de quitter l'éditeur.
 * Le plan qu'un onglet contient la première fois qu'on le voit vient d'être chargé ou créé : il est déjà à jour dans la base.
 * `saveStates` donne l'état d'enregistrement de chaque onglet.
 */
export function useAutosave(library: Library | null, docs: AutosaveDoc[]) {
  const [states, setStates] = useState<Record<string, SaveState>>({})
  const lastSaved = useRef(new Map<string, Plan | null>())
  const latest = useRef({ library, docs })

  useEffect(() => {
    latest.current = { library, docs }
  })

  const setState = (key: string, state: SaveState) => setStates((current) => (current[key] === state ? current : { ...current, [key]: state }))

  const flushOne = useCallback(async (key: string) => {
    const { library, docs } = latest.current
    const doc = docs.find((d) => d.key === key)
    if (doc && !lastSaved.current.has(key)) lastSaved.current.set(key, doc.plan)
    if (!library || !doc?.id || !doc.plan || doc.plan === lastSaved.current.get(key)) return
    setState(key, 'saving')
    try {
      await library.save(doc.id, doc.plan)
      lastSaved.current.set(key, doc.plan)
      setState(key, 'saved')
    } catch {
      setState(key, 'error')
    }
  }, [])

  const flush = useCallback(
    async (key?: string) => {
      const keys = key ? [key] : latest.current.docs.map((d) => d.key)
      await Promise.all(keys.map(flushOne))
    },
    [flushOne],
  )

  // Enregistre peu après la dernière modification de chaque plan.
  useEffect(() => {
    for (const d of docs) if (!lastSaved.current.has(d.key)) lastSaved.current.set(d.key, d.plan)
    const timers = docs
      .filter((d) => library && d.id && d.plan && d.plan !== lastSaved.current.get(d.key))
      .map((d) => window.setTimeout(() => void flushOne(d.key), SAVE_DELAY_MS))
    return () => timers.forEach((t) => window.clearTimeout(t))
  }, [library, docs, flushOne])

  // Dernière chance : quand la page est cachée ou fermée, on enregistre sans attendre.
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

  return { saveStates: states, flush }
}
