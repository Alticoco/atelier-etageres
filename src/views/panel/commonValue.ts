/** Valeur commune à toutes les pièces, ou null si elles diffèrent. */
export function commonValue(values: number[]): number | null {
  return values.every((v) => v === values[0]) ? values[0] : null
}
