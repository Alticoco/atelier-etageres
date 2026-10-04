/** Fait télécharger un fichier texte par le navigateur (rien n'est envoyé nulle part : le fichier est créé sur place). */
export function downloadTextFile(fileName: string, content: string, mimeType = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([content], { type: `${mimeType};charset=utf-8` }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  // On laisse au navigateur le temps de démarrer le téléchargement avant de libérer l'adresse.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
