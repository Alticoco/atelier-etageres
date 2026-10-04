import { sortedShelves } from './pieces'
import type { Plan } from './types'

/** Nom lisible d'une pièce pour l'interface : « Tablette 2 », « Montant gauche », « Cale 1 ». */
export function pieceLabel(plan: Plan, id: string): string {
  if (id === 'upright-left') return 'Montant gauche'
  if (id === 'upright-right') return 'Montant droit'

  const shelfIndex = sortedShelves(plan).findIndex((s) => s.id === id)
  if (shelfIndex >= 0) return `Tablette ${shelfIndex + 1}`

  const wedgeIndex = plan.wedges.findIndex((w) => w.id === id)
  if (wedgeIndex >= 0) return `Cale ${wedgeIndex + 1}`

  return id
}
