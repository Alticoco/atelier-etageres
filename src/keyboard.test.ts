import { describe, expect, it } from 'vitest'
import { commandForKey, SHORTCUTS, type KeyContext, type KeyInfo } from './keyboard'

const key = (k: string, mods: Partial<KeyInfo> = {}): KeyInfo => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
})

const idle: KeyContext = { textEntry: false, select: false, hasSelection: false }
const selected: KeyContext = { ...idle, hasSelection: true }
const typing: KeyContext = { ...idle, textEntry: true, hasSelection: true }

describe('annuler / rétablir', () => {
  it('Ctrl+Z annule, Ctrl+Y et Ctrl+Maj+Z rétablissent', () => {
    expect(commandForKey(key('z', { ctrlKey: true }), idle)).toEqual({ type: 'undo' })
    expect(commandForKey(key('y', { ctrlKey: true }), idle)).toEqual({ type: 'redo' })
    expect(commandForKey(key('Z', { ctrlKey: true, shiftKey: true }), idle)).toEqual({ type: 'redo' })
  })

  it('Cmd (Mac) fonctionne comme Ctrl', () => {
    expect(commandForKey(key('z', { metaKey: true }), idle)).toEqual({ type: 'undo' })
  })

  it('laisse Ctrl+Z / Ctrl+Y / Ctrl+A aux champs texte', () => {
    for (const k of ['z', 'y', 'a']) expect(commandForKey(key(k, { ctrlKey: true }), typing)).toBeNull()
  })

  it('ignore Ctrl+Alt+Z (AltGr sur certains claviers)', () => {
    expect(commandForKey(key('z', { ctrlKey: true, altKey: true }), idle)).toBeNull()
  })
})

describe('sélection', () => {
  it('Ctrl+A sélectionne tout', () => {
    expect(commandForKey(key('a', { ctrlKey: true }), idle)).toEqual({ type: 'selectAll' })
  })

  it('Échap désélectionne', () => {
    expect(commandForKey(key('Escape'), idle)).toEqual({ type: 'clearSelection' })
  })

  it('Suppr et Retour arrière suppriment, seulement s’il y a une sélection', () => {
    for (const k of ['Delete', 'Backspace']) {
      expect(commandForKey(key(k), selected)).toEqual({ type: 'deleteSelection' })
      expect(commandForKey(key(k), idle)).toBeNull()
    }
  })

  it('ne supprime jamais pendant une saisie de texte', () => {
    expect(commandForKey(key('Backspace'), typing)).toBeNull()
    expect(commandForKey(key('Delete'), typing)).toBeNull()
  })
})

describe('déplacement au clavier', () => {
  it('les flèches déplacent d’un pas ; ↑ monte, → va à droite', () => {
    expect(commandForKey(key('ArrowUp'), selected)).toEqual({ type: 'nudge', dx: 0, dy: 1, fine: false })
    expect(commandForKey(key('ArrowDown'), selected)).toEqual({ type: 'nudge', dx: 0, dy: -1, fine: false })
    expect(commandForKey(key('ArrowRight'), selected)).toEqual({ type: 'nudge', dx: 1, dy: 0, fine: false })
    expect(commandForKey(key('ArrowLeft'), selected)).toEqual({ type: 'nudge', dx: -1, dy: 0, fine: false })
  })

  it('Maj + flèche déplace d’un millimètre', () => {
    expect(commandForKey(key('ArrowUp', { shiftKey: true }), selected)).toEqual({ type: 'nudge', dx: 0, dy: 1, fine: true })
  })

  it('sans sélection, les flèches ne font rien (la page garde son défilement)', () => {
    expect(commandForKey(key('ArrowUp'), idle)).toBeNull()
  })

  it('les flèches restent à la liste déroulante ou au champ texte quand ils ont le focus', () => {
    expect(commandForKey(key('ArrowUp'), { ...selected, select: true })).toBeNull()
    expect(commandForKey(key('ArrowLeft'), typing)).toBeNull()
  })

  it('Alt + flèche est laissé au navigateur (page précédente)', () => {
    expect(commandForKey(key('ArrowLeft', { altKey: true }), selected)).toBeNull()
  })
})

describe('vues, aide et enregistrement', () => {
  it('1, 2, 3 changent de vue', () => {
    expect(commandForKey(key('1'), idle)).toEqual({ type: 'view', mode: 'front' })
    expect(commandForKey(key('2'), idle)).toEqual({ type: 'view', mode: 'side' })
    expect(commandForKey(key('3'), idle)).toEqual({ type: 'view', mode: 'cut' })
  })

  it('ne change pas de vue quand on tape un chiffre dans un champ', () => {
    expect(commandForKey(key('1'), typing)).toBeNull()
    expect(commandForKey(key('2'), { ...idle, select: true })).toBeNull()
  })

  it('? affiche l’aide', () => {
    expect(commandForKey(key('?', { shiftKey: true }), idle)).toEqual({ type: 'help' })
    expect(commandForKey(key('?'), typing)).toBeNull()
  })

  it('Ctrl+S enregistre, même dans un champ (pour bloquer la boîte du navigateur)', () => {
    expect(commandForKey(key('s', { ctrlKey: true }), idle)).toEqual({ type: 'save' })
    expect(commandForKey(key('s', { ctrlKey: true }), typing)).toEqual({ type: 'save' })
    expect(commandForKey(key('s', { metaKey: true }), idle)).toEqual({ type: 'save' })
  })

  it('une lettre ordinaire ne déclenche rien', () => {
    expect(commandForKey(key('q'), idle)).toBeNull()
    expect(commandForKey(key('Enter'), selected)).toBeNull()
  })
})

describe('liste d’aide', () => {
  it('décrit chaque raccourci avec des touches et un libellé non vides', () => {
    const items = SHORTCUTS.flatMap((g) => g.items)
    expect(items.length).toBeGreaterThanOrEqual(12)
    for (const item of items) {
      expect(item.keys.trim()).not.toBe('')
      expect(item.label.trim()).not.toBe('')
    }
  })

  it('couvre les raccourcis réellement gérés', () => {
    const text = SHORTCUTS.flatMap((g) => g.items.map((i) => i.keys)).join(' | ')
    for (const expected of ['Ctrl + Z', 'Ctrl + Y', 'Suppr', 'Ctrl + A', 'Échap', 'Ctrl + S', '1   2   3', '?', 'Maj + flèche']) {
      expect(text).toContain(expected)
    }
  })
})
