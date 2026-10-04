export type LengthUnit = 'mm' | 'cm'

/** Convertit des millimètres entiers en centimètres, pour l'affichage uniquement. */
export function mmToCm(mm: number): number {
  return mm / 10
}

/** Texte d'une longueur pour l'écran : « 80 cm », « 30,9 cm » ou « 309 mm ». */
export function formatLength(mm: number, unit: LengthUnit = 'cm'): string {
  if (unit === 'mm') return `${mm} mm`
  return `${mmToCm(mm).toString().replace('.', ',')} cm`
}

/**
 * Lit une longueur saisie par l'utilisateur et la renvoie en mm entiers.
 * En cm : « 80 », « 80,5 » ou « 80.5 » (une décimale = le mm). En mm : entier seulement.
 * Renvoie null si le texte n'est pas une longueur valide.
 */
export function parseLength(text: string, unit: LengthUnit = 'cm'): number | null {
  const match = /^\s*(\d+)(?:[.,](\d+))?\s*$/.exec(text)
  if (!match) return null
  const [, whole, decimals = ''] = match
  if (unit === 'mm') return decimals === '' ? Number(whole) : null
  if (decimals.length > 1) return null
  return Number(whole) * 10 + (decimals === '' ? 0 : Number(decimals))
}
