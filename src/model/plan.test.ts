import { describe, expect, it } from 'vitest'
import { createPlan } from './plan'
import { computePieces, getStages, wedgeLength } from './pieces'
import type { Plan, Wedge } from './types'

const base = {
  width: 800,
  height: 1000,
  depth: 250,
  stages: 3,
  uprightThickness: 18,
  shelfThickness: 18,
}

function wedgeOn(plan: Plan, stageIndex: number): Wedge {
  return {
    id: 'wedge-1',
    shelfBelowId: getStages(plan)[stageIndex].shelfBelowId,
    x: 300,
    thickness: 18,
    depth: 250,
  }
}

describe('createPlan', () => {
  it('crée étages + 1 tablettes, de bas en haut, bord à bord avec le cadre', () => {
    const plan = createPlan(base)
    expect(plan.shelves).toHaveLength(4)
    expect(plan.shelves[0].y).toBe(0)
    const top = plan.shelves[3]
    expect(top.y + top.thickness).toBe(plan.height)
  })

  it('répartit également les étages quand la division tombe juste', () => {
    // 1002 - 4*18 = 930 mm libres = 3 x 310
    const plan = createPlan({ ...base, height: 1002 })
    const heights = getStages(plan).map((s) => s.clearHeight)
    expect(heights).toEqual([310, 310, 310])
  })

  it('donne les mm restants aux étages du bas, sans perdre de hauteur', () => {
    const plan = createPlan(base) // 928 mm libres pour 3 étages : 310, 309, 309
    const heights = getStages(plan).map((s) => s.clearHeight)
    expect(heights).toEqual([310, 309, 309])
    expect(heights.reduce((a, b) => a + b, 0) + 4 * 18).toBe(1000)
  })

  it('applique les valeurs par défaut', () => {
    const plan = createPlan(base)
    expect(plan.options).toEqual({
      propagation: true,
      wallMount: false,
      framePlacement: 'between',
      defaultWedgeThickness: 18,
      wedgeClearance: 1,
      sawKerfEnabled: false,
      sawKerf: 3,
    })
    expect(plan.wedges).toEqual([])
  })

  it('refuse les valeurs invalides', () => {
    expect(() => createPlan({ ...base, width: 0 })).toThrow(RangeError)
    expect(() => createPlan({ ...base, height: 100.5 })).toThrow(RangeError)
    expect(() => createPlan({ ...base, stages: 0 })).toThrow(RangeError)
    expect(() => createPlan({ ...base, wedgeClearance: -1 })).toThrow(RangeError)
    expect(() => createPlan({ ...base, wedgeThickness: 0 })).toThrow(RangeError)
    expect(() => createPlan({ ...base, width: 36 })).toThrow(RangeError)
    expect(() => createPlan({ ...base, height: 72 })).toThrow(RangeError)
  })
})

describe('computePieces — cadre « entre les montants »', () => {
  const plan = createPlan(base)
  const pieces = computePieces(plan)

  it('montants pleine hauteur', () => {
    const uprights = pieces.filter((p) => p.kind === 'upright')
    expect(uprights).toHaveLength(2)
    for (const u of uprights) {
      expect(u).toMatchObject({ length: 1000, width: 250, thickness: 18 })
    }
  })

  it('toutes les tablettes = largeur - 2 épaisseurs de montant', () => {
    const shelves = pieces.filter((p) => p.kind === 'shelf')
    expect(shelves).toHaveLength(4)
    for (const s of shelves) {
      expect(s).toMatchObject({ length: 764, width: 250, thickness: 18 })
    }
  })

  it("tient compte d'épaisseurs de montants différentes", () => {
    const p = createPlan(base)
    p.rightUpright.thickness = 25
    const shelf = computePieces(p).find((x) => x.kind === 'shelf')
    expect(shelf?.length).toBe(800 - 18 - 25)
  })
})

describe('computePieces — tablettes haut/bas posées sur les montants', () => {
  const plan = createPlan({ ...base, framePlacement: 'onTop' })
  const pieces = computePieces(plan)

  it('raccourcit les montants des tablettes du haut et du bas', () => {
    const upright = pieces.find((p) => p.id === 'upright-left')
    expect(upright?.length).toBe(1000 - 18 - 18)
  })

  it('donne la pleine largeur aux tablettes extrêmes seulement', () => {
    const byId = Object.fromEntries(pieces.map((p) => [p.id, p]))
    expect(byId['shelf-1'].length).toBe(800)
    expect(byId['shelf-4'].length).toBe(800)
    expect(byId['shelf-2'].length).toBe(764)
    expect(byId['shelf-3'].length).toBe(764)
  })
})

describe('cales', () => {
  it("hauteur = hauteur libre de l'étage - jeu", () => {
    const plan = createPlan(base)
    const wedge = wedgeOn(plan, 0) // étage de 310 mm
    expect(wedgeLength(plan, wedge)).toBe(309)
  })

  it("un jeu de 0 donne exactement la hauteur de l'étage", () => {
    const plan = createPlan({ ...base, wedgeClearance: 0 })
    expect(wedgeLength(plan, wedgeOn(plan, 1))).toBe(309)
  })

  it('apparaît dans la liste des pièces avec sa profondeur propre', () => {
    const plan = createPlan(base)
    plan.wedges.push({ ...wedgeOn(plan, 2), depth: 200, thickness: 12 })
    const piece = computePieces(plan).find((p) => p.kind === 'wedge')
    expect(piece).toMatchObject({ length: 308, width: 200, thickness: 12 })
  })

  it("suit le déplacement d'une tablette", () => {
    const plan = createPlan(base)
    const wedge = wedgeOn(plan, 0)
    plan.shelves[1].y -= 50 // l'étage du bas rétrécit
    expect(wedgeLength(plan, wedge)).toBe(309 - 50)
  })

  it('signale une cale rattachée à une tablette inconnue', () => {
    const plan = createPlan(base)
    expect(() => wedgeLength(plan, { ...wedgeOn(plan, 0), shelfBelowId: 'nope' })).toThrow()
  })
})
