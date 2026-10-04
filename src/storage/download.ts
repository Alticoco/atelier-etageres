/** Fait télécharger un fichier par le navigateur (rien n'est envoyé nulle part : le fichier est créé sur place). */
export function downloadBytes(fileName: string, content: string | Uint8Array, mimeType: string): void {
  // Copie dans un tampon standard : le type des octets renvoyés par la bibliothèque PDF n'est pas accepté tel quel par Blob.
  const part = typeof content === 'string' ? content : new Uint8Array(content)
  const url = URL.createObjectURL(new Blob([part], { type: mimeType }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  // On laisse au navigateur le temps de démarrer le téléchargement avant de libérer l'adresse.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Fait télécharger un fichier texte (par exemple la sauvegarde `.etagere.json`). */
export function downloadTextFile(fileName: string, content: string, mimeType = 'application/json'): void {
  downloadBytes(fileName, content, `${mimeType};charset=utf-8`)
}
