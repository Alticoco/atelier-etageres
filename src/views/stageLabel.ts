import { formatLength, type LengthUnit } from '../model/units'

/**
 * Nom d'un étage dans les menus : « Étage 1 · en bas · 31 cm libres ». Les étages sont numérotés de bas en haut,
 * comme les numéros affichés sur le dessin.
 */
export function stageLabel(index: number, count: number, clearHeight: number, unit: LengthUnit): string {
  const place = count === 1 ? '' : index === 0 ? 'en bas' : index === count - 1 ? 'en haut' : 'au milieu'
  return ['Étage ' + (index + 1), place, `${formatLength(clearHeight, unit)} libres`].filter(Boolean).join(' · ')
}
