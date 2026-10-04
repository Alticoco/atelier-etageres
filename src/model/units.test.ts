import { describe, expect, it } from 'vitest'
import { formatLength, formatNumber, mmToCm, parseLength } from './units'

describe('mmToCm', () => {
  it('convertit des millimètres en centimètres', () => {
    expect(mmToCm(250)).toBe(25)
    expect(mmToCm(18)).toBe(1.8)
  })
})

describe('formatLength', () => {
  it('affiche en cm avec virgule, sans décimale inutile', () => {
    expect(formatLength(800)).toBe('80 cm')
    expect(formatLength(309)).toBe('30,9 cm')
    expect(formatLength(18, 'cm')).toBe('1,8 cm')
  })

  it('affiche en mm', () => {
    expect(formatLength(309, 'mm')).toBe('309 mm')
  })
})

describe('parseLength', () => {
  it('lit des cm avec virgule ou point et renvoie des mm entiers', () => {
    expect(parseLength('80')).toBe(800)
    expect(parseLength('80,5')).toBe(805)
    expect(parseLength(' 1.8 ')).toBe(18)
    expect(parseLength('0,1')).toBe(1)
  })

  it('refuse plus d’une décimale en cm (moins d’un mm)', () => {
    expect(parseLength('1,85')).toBeNull()
  })

  it('refuse les textes qui ne sont pas des nombres', () => {
    expect(parseLength('')).toBeNull()
    expect(parseLength('abc')).toBeNull()
    expect(parseLength('-5')).toBeNull()
    expect(parseLength('1,')).toBeNull()
  })

  it('lit des mm entiers', () => {
    expect(parseLength('309', 'mm')).toBe(309)
    expect(parseLength('30,9', 'mm')).toBeNull()
  })
})

describe('formatNumber', () => {
  it('donne le nombre seul pour un champ de saisie', () => {
    expect(formatNumber(309)).toBe('30,9')
    expect(formatNumber(800)).toBe('80')
    expect(formatNumber(309, 'mm')).toBe('309')
  })

  it('est relu à l’identique par parseLength', () => {
    for (const unit of ['cm', 'mm'] as const) {
      expect(parseLength(formatNumber(309, unit), unit)).toBe(309)
    }
  })
})
