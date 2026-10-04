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
