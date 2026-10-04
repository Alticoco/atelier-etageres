import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { createPlan } from '../model/plan'
import type { Plan } from '../model/types'
import { createLibrary } from './library'
import { createMemoryStore, openIndexedDbStore, type PlanStore } from './planStore'

function plan(name = 'Mangathèque', width = 800): Plan {
  return createPlan({ name, width, height: 1000, depth: 250, stages: 3, uprightThickness: 18, shelfThickness: 18 })
}

/** Horloge et identifiants prévisibles. */
function deps() {
  let time = 1000
  let counter = 0
  return { now: () => (time += 10), newId: () => `id-${++counter}` }
}

// La même série de tests sur le magasin en mémoire ET sur IndexedDB (simulé).
const stores: [string, () => Promise<PlanStore>][] = [
  ['mémoire', async () => createMemoryStore()],
  ['IndexedDB', () => openIndexedDbStore('test', new IDBFactory())],
]

describe.each(stores)('bibliothèque (%s)', (_name, makeStore) => {
  async function setup() {
    const store = await makeStore()
    return { store, library: createLibrary(store, deps()) }
  }

  it('commence vide', async () => {
    const { library } = await setup()
    expect(await library.list()).toEqual({ summaries: [], skipped: 0 })
  })

  it('crée, liste puis rouvre un plan à l’identique', async () => {
    const { library } = await setup()
    const original = plan()
    const id = await library.create(original)
    expect(await library.open(id)).toEqual(original)
    const { summaries } = await library.list()
    expect(summaries).toEqual([{ id, name: 'Mangathèque', updatedAt: expect.any(Number), width: 800, height: 1000 }])
  })

  it('range les plans du plus récent au plus ancien', async () => {
    const { library } = await setup()
    const a = await library.create(plan('A'))
    const b = await library.create(plan('B'))
    const c = await library.create(plan('C'))
    await library.save(a, plan('A'))
    const { summaries } = await library.list()
    expect(summaries.map((s) => s.id)).toEqual([a, c, b])
  })

  it('l’enregistrement automatique remplace le plan et met à jour la date', async () => {
    const { library } = await setup()
    const id = await library.create(plan())
    const before = (await library.list()).summaries[0].updatedAt
    await library.save(id, plan('Mangathèque', 900))
    const [after] = (await library.list()).summaries
    expect(after.width).toBe(900)
    expect(after.updatedAt).toBeGreaterThan(before)
    expect((await library.list()).summaries).toHaveLength(1)
  })

  it('renomme', async () => {
    const { library } = await setup()
    const id = await library.create(plan())
    await library.rename(id, '  Épices  ')
    expect((await library.open(id))?.name).toBe('Épices')
    expect((await library.list()).summaries[0].name).toBe('Épices')
  })

  it('refuse un nom vide ou un plan inconnu', async () => {
    const { library } = await setup()
    const id = await library.create(plan())
    await expect(library.rename(id, '   ')).rejects.toThrow('vide')
    await expect(library.rename('inconnu', 'X')).rejects.toThrow('introuvable')
    await expect(library.duplicate('inconnu')).rejects.toThrow('introuvable')
  })

  it('duplique en gardant l’original intact', async () => {
    const { library } = await setup()
    const id = await library.create(plan())
    const copyId = await library.duplicate(id)
    expect(copyId).not.toBe(id)
    expect((await library.open(copyId))?.name).toBe('Mangathèque (copie)')
    expect((await library.open(id))?.name).toBe('Mangathèque')
    expect((await library.open(copyId))?.shelves).toEqual((await library.open(id))?.shelves)
  })

  it('modifier une copie ne touche pas à l’original', async () => {
    const { library } = await setup()
    const id = await library.create(plan())
    const copyId = await library.duplicate(id)
    await library.save(copyId, plan('Autre', 1200))
    expect((await library.open(id))?.width).toBe(800)
  })

  it('supprime', async () => {
    const { library } = await setup()
    const keep = await library.create(plan('Garde'))
    const drop = await library.create(plan('Jette'))
    await library.remove(drop)
    expect(await library.open(drop)).toBeNull()
    expect((await library.list()).summaries.map((s) => s.id)).toEqual([keep])
  })

  it('supprimer un plan inconnu ne fait pas d’erreur', async () => {
    const { library } = await setup()
    await expect(library.remove('inconnu')).resolves.toBeUndefined()
  })

  it('ignore les enregistrements corrompus et le dit', async () => {
    const { store, library } = await setup()
    const good = await library.create(plan())
    await store.put({ id: 'corrompu', updatedAt: 1, plan: { name: 'cassé', width: 'beaucoup' } })
    await store.put({ id: 'vide', updatedAt: 2, plan: null })
    const listing = await library.list()
    expect(listing.summaries.map((s) => s.id)).toEqual([good])
    expect(listing.skipped).toBe(2)
    expect(await library.open('corrompu')).toBeNull()
  })

  it('ne fait pas confiance aux plans stockés : un plan incohérent est ignoré', async () => {
    const { store, library } = await setup()
    const broken = plan()
    broken.shelves[1].y = broken.shelves[2].y
    await store.put({ id: 'incoherent', updatedAt: 1, plan: broken })
    expect((await library.list()).skipped).toBe(1)
  })
})

describe('IndexedDB', () => {
  it('conserve les plans quand on rouvre la base (comme un rechargement de page)', async () => {
    const factory = new IDBFactory()
    const first = createLibrary(await openIndexedDbStore('atelier', factory), deps())
    const id = await first.create(plan('Épices'))

    const second = createLibrary(await openIndexedDbStore('atelier', factory), deps())
    expect((await second.open(id))?.name).toBe('Épices')
  })

  it('sépare des bases de noms différents', async () => {
    const factory = new IDBFactory()
    const a = createLibrary(await openIndexedDbStore('a', factory), deps())
    const b = createLibrary(await openIndexedDbStore('b', factory), deps())
    await a.create(plan())
    expect((await b.list()).summaries).toEqual([])
  })

  it('échoue clairement quand IndexedDB n’est pas disponible', async () => {
    const original = globalThis.indexedDB
    // @ts-expect-error simulation d'un navigateur sans IndexedDB
    delete globalThis.indexedDB
    try {
      await expect(openIndexedDbStore('x')).rejects.toThrow('IndexedDB')
    } finally {
      globalThis.indexedDB = original
    }
  })
})
