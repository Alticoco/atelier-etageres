import { fail, finish, type EditResult } from './edit'
import { getStages } from './pieces'
import type { Plan, StageFront } from './types'

/**
 * Choisit ce qu'il y a dans un étage : `null` = ouvert (rien), sinon une ou deux portes, ou un tiroir.
 * Un étage qui ne peut pas recevoir le choix (trop petit) le refuse avec un message.
 */
export function setFront(plan: Plan, shelfBelowId: string, choice: (Pick<StageFront, 'type'> & Partial<StageFront>) | null): EditResult {
  if (!getStages(plan).some((s) => s.shelfBelowId === shelfBelowId)) return fail('Étage inconnu.')
  const next = structuredClone(plan)
  const others = (next.fronts ?? []).filter((f) => f.shelfBelowId !== shelfBelowId)
  if (choice) {
    const previous = (next.fronts ?? []).find((f) => f.shelfBelowId === shelfBelowId)
    others.push({
      shelfBelowId,
      type: choice.type,
      count: choice.count ?? previous?.count ?? 1,
      hinge: choice.hinge ?? previous?.hinge ?? 'left',
    })
  }
  if (others.length > 0) next.fronts = others
  else delete next.fronts
  return finish(next)
}
