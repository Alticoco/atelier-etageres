/** Enregistrement brut d'un plan. Le contenu `plan` est validé à la lecture : on ne fait jamais confiance au disque. */
export interface StoredRecord {
  id: string
  /** Date de dernière modification (ms depuis 1970). */
  updatedAt: number
  plan: unknown
}

/** Magasin de plans : l'interface que la bibliothèque utilise. IndexedDB dans le navigateur, mémoire pour les tests. */
export interface PlanStore {
  getAll(): Promise<StoredRecord[]>
  get(id: string): Promise<StoredRecord | undefined>
  put(record: StoredRecord): Promise<void>
  delete(id: string): Promise<void>
}

export function createMemoryStore(): PlanStore {
  const records = new Map<string, StoredRecord>()
  return {
    getAll: async () => structuredClone([...records.values()]),
    get: async (id) => structuredClone(records.get(id)),
    put: async (record) => {
      records.set(record.id, structuredClone(record))
    },
    delete: async (id) => {
      records.delete(id)
    },
  }
}

const STORE_NAME = 'plans'

/**
 * Magasin IndexedDB (base du navigateur, propre à ce site). Échoue si IndexedDB n'est pas disponible
 * (par exemple en navigation privée dans certains navigateurs) : l'appelant doit prévoir ce cas.
 */
export async function openIndexedDbStore(dbName = 'atelier-etageres', factory?: IDBFactory): Promise<PlanStore> {
  const idb = factory ?? globalThis.indexedDB
  if (!idb) throw new Error('IndexedDB n’est pas disponible dans ce navigateur.')

  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = idb.open(dbName, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Ouverture de la base impossible.'))
    request.onblocked = () => reject(new Error('La base est bloquée par un autre onglet.'))
  })

  /** Lance une requête dans sa propre transaction et attend que la transaction soit bien terminée. */
  function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode)
      const request = action(transaction.objectStore(STORE_NAME))
      transaction.oncomplete = () => resolve(request.result)
      transaction.onerror = () => reject(transaction.error ?? new Error('Opération impossible.'))
      transaction.onabort = () => reject(transaction.error ?? new Error('Opération annulée.'))
    })
  }

  return {
    getAll: () => run<StoredRecord[]>('readonly', (store) => store.getAll()),
    get: (id) => run<StoredRecord | undefined>('readonly', (store) => store.get(id)),
    put: async (record) => {
      await run('readwrite', (store) => store.put(record))
    },
    delete: async (id) => {
      await run('readwrite', (store) => store.delete(id))
    },
  }
}
