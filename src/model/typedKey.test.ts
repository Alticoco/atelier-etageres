import { describe, expect, it } from 'vitest'
import { typedChar } from './typedKey'

describe('typedChar', () => {
  it('chiffre QWERTY ou pavé numérique : la touche', () => {
    expect(typedChar({ key: '5', code: 'Digit5' })).toBe('5')
    expect(typedChar({ key: '7', code: 'Numpad7' })).toBe('7')
  })

  it('AZERTY sans Maj : le chiffre vient de code', () => {
    expect(typedChar({ key: '&', code: 'Digit1' })).toBe('1')
    expect(typedChar({ key: 'é', code: 'Digit2' })).toBe('2')
    expect(typedChar({ key: 'à', code: 'Digit0' })).toBe('0')
  })

  it('virgule et point', () => {
    expect(typedChar({ key: ',', code: 'KeyM' })).toBe(',')
    expect(typedChar({ key: '.', code: 'NumpadDecimal' })).toBe('.')
    expect(typedChar({ key: 'Unidentified', code: 'NumpadDecimal' })).toBe('.')
    expect(typedChar({ key: ';', code: 'Comma' })).toBe(',')
    expect(typedChar({ key: ':', code: 'Period' })).toBe('.')
  })

  it('autres touches : null', () => {
    expect(typedChar({ key: 'a', code: 'KeyQ' })).toBeNull()
    expect(typedChar({ key: 'Enter', code: 'Enter' })).toBeNull()
    expect(typedChar({ key: 'Backspace', code: 'Backspace' })).toBeNull()
  })
})
