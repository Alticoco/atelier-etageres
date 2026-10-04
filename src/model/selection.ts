/**
 * Sélection de pièces (liste d'identifiants).
 * Clic simple : remplace la sélection. Ctrl/Maj + clic (`additive`) : ajoute ou retire la pièce.
 */
export function selectPiece(selection: string[], id: string, additive: boolean): string[] {
  if (!additive) return [id]
  return selection.includes(id) ? selection.filter((s) => s !== id) : [...selection, id]
}
