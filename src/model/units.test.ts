import { describe, expect, it } from 'vitest'
import { formatLength, mmToCm } from './units'

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
