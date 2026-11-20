/**
 * Caractère saisi par une touche pendant la saisie d'une valeur (chiffre, virgule ou point), ou null pour toute autre
 * touche. Sur un clavier AZERTY, la rangée du haut donne `&`, `é`… dans `key` sans Maj : on lit alors `code`
 * (`Digit0`–`Digit9`, `Numpad0`–`Numpad9`). Fonction pure.
 */
export function typedChar({ key, code }: { key: string; code: string }): string | null {
  if (/^[0-9]$/.test(key)) return key
  if (key === ',' || key === '.') return key
  const digit = /^(?:Digit|Numpad)([0-9])$/.exec(code)
  if (digit) return digit[1]
  if (code === 'Comma') return ','
  if (code === 'Period' || code === 'NumpadDecimal') return '.'
  return null
}
