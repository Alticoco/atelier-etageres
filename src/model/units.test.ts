import { describe, expect, it } from 'vitest'
import { mmToCm } from './units'

describe('mmToCm', () => {
  it('convertit des millimètres en centimètres', () => {
    expect(mmToCm(250)).toBe(25)
    expect(mmToCm(18)).toBe(1.8)
  })
})
