import { parsePlan } from '../model/serialize'
import type { Plan } from '../model/types'
import type { PlanStore } from './planStore'

/** Résumé d'un plan de la bibliothèque, pour la liste. */
export interface LibrarySummary {
  id: string
  name: string
  updatedAt: number
  width: number
  height: number
}

export interface LibraryListing {
  /** Plans lisibles, du plus récemment modifié au plus ancien. */
  summaries: LibrarySummary[]
  /** Nombre d'enregistrements illisibles (corrompus) qui ont été ignorés. */
  skipped: number
}

export interface Library {
  list(): Promise<LibraryListing>
  /** Le plan, ou null s'il n'existe pas ou est illisible. */
  open(id: string): Promise<Plan | null>
  /** Enregistre un nouveau plan et renvoie son identifiant. */
  create(plan: Plan): Promise<string>
  /** Met à jour un plan existant (enregistrement automatique). */
  save(id: string, plan: Plan): Promise<void>
  rename(id: string, name: string): Promise<void>
  /** Crée une copie nommée « … (copie) » et renvoie son identifiant. */
  duplicate(id: string): Promise<string>
  remove(id: string): Promise<void>
}

export interface LibraryDeps {
  now?: () => number
  newId?: () => string
}

export function createLibrary(
  store: PlanStore,
  { now = Date.now, newId = () => crypto.randomUUID() }: LibraryDeps = {},
): Library {
  async function open(id: string): Promise<Plan | null> {
    const record = await store.get(id)
    if (!record) return null
    const result = parsePlan(record.plan)
    return result.ok ? result.plan : null
  }

  async function save(id: string, plan: Plan): Promise<void> {
    await store.put({ id, updatedAt: now(), plan })
  }

  async function create(plan: Plan): Promise<string> {
    const id = newId()
    await save(id, plan)
    return id
  }

  async function require(id: string): Promise<Plan> {
    const plan = await open(id)
    if (!plan) throw new Error('Cette étagère est introuvable ou illisible.')
    return plan
  }

  return {
    async list() {
      const summaries: LibrarySummary[] = []
      let skipped = 0
      for (const record of await store.getAll()) {
        const result = parsePlan(record.plan)
        if (result.ok) {
          const { name, width, height } = result.plan
          summaries.push({ id: record.id, name, updatedAt: record.updatedAt, width, height })
        } else {
          skipped += 1
        }
      }
      summaries.sort((a, b) => b.updatedAt - a.updatedAt)
      return { summaries, skipped }
    },
    open,
    create,
    save,
    async rename(id, name) {
      const trimmed = name.trim()
      if (trimmed === '') throw new Error('Le nom ne peut pas être vide.')
      await save(id, { ...(await require(id)), name: trimmed })
    },
    async duplicate(id) {
      const plan = await require(id)
      return create({ ...plan, name: `${plan.name} (copie)` })
    },
    async remove(id) {
      await store.delete(id)
    },
  }
}
