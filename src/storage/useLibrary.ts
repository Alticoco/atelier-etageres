import { useCallback, useEffect, useState } from 'react'
import { createLibrary, type Library, type LibraryListing } from './library'
import { openIndexedDbStore } from './planStore'

export type LibraryStatus = 'loading' | 'ready' | 'unavailable'

const EMPTY: LibraryListing = { summaries: [], skipped: 0 }

/**
 * Ouvre la bibliothèque du navigateur (IndexedDB) et garde sa liste à jour.
 * Si IndexedDB est indisponible, `status` vaut « unavailable » et l'application continue sans sauvegarde automatique.
 */
export function useLibrary() {
  const [status, setStatus] = useState<LibraryStatus>('loading')
  const [library, setLibrary] = useState<Library | null>(null)
  const [listing, setListing] = useState<LibraryListing>(EMPTY)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const opened = createLibrary(await openIndexedDbStore())
        const initial = await opened.list()
        if (cancelled) return
        setLibrary(opened)
        setListing(initial)
        setStatus('ready')
      } catch {
        if (!cancelled) setStatus('unavailable')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  /** Relit la liste depuis la base. */
  const refresh = useCallback(async () => {
    if (library) setListing(await library.list())
  }, [library])

  return { status, library, listing, refresh }
}
