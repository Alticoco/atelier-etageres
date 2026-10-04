/** Reconnaît un fichier PDF à son en-tête (`%PDF-`). Séparé de `pdf.ts` pour ne pas charger la bibliothèque PDF juste pour ça. */
export function isPdf(bytes: Uint8Array): boolean {
  return bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-'
}
