import { sortedShelves } from './pieces'
import type { Plan } from './types'

/** Montant d'un étage (modèle sans cadre) : « vertical-left-shelf-2 » → côté et tablette du dessous. */
export function parseVerticalId(id: string): { side: 'left' | 'right'; shelfBelowId: string } | null {
  const match = /^vertical-(left|right)-(.+)$/.exec(id)
  return match ? { side: match[1] as 'left' | 'right', shelfBelowId: match[2] } : null
}

/** Nom lisible d'une pièce pour l'interface : « Tablette 2 », « Montant gauche », « Montant droit, étage 3 », « Cale 1 ». */
export function pieceLabel(plan: Plan, id: string): string {
  if (id === 'upright-left') return 'Montant gauche'
  if (id === 'upright-right') return 'Montant droit'

  const vertical = parseVerticalId(id)
  if (vertical) {
    const stage = sortedShelves(plan).findIndex((s) => s.id === vertical.shelfBelowId)
    const side = vertical.side === 'left' ? 'gauche' : 'droit'
    return stage >= 0 ? `Montant ${side}, étage ${stage + 1}` : `Montant ${side}`
  }

  const shelfIndex = sortedShelves(plan).findIndex((s) => s.id === id)
  if (shelfIndex >= 0) return `Tablette ${shelfIndex + 1}`

  const wedgeIndex = plan.wedges.findIndex((w) => w.id === id)
  if (wedgeIndex >= 0) return `Cale ${wedgeIndex + 1}`

  return id
}
