import { describe, expect, it } from 'vitest'
import { clampToValid, dragShelf, dragWedge, nudgePiece, resizeFrame, snapToStep } from './drag'
import { setPlanSize } from './edit'
import { getStages } from './pieces'
import { createPlan } from './plan'
import type { Plan } from './types'

// Tablettes à y = 0, 328, 655, 982 ; étages libres 310, 309, 309.
const base = {
  width: 800,
  height: 1000,
  depth: 250,
  stages: 3,
  uprightThickness: 18,
  shelfThickness: 18,
}

function planWithWedge(): Plan {
  const plan = createPlan(base)
  plan.wedges.push({ id: 'wedge-1', shelfBelowId: 'shelf-1', x: 300, thickness: 18, depth: 250 })
  return plan
}

describe('snapToStep', () => {
  it('arrondit à la valeur ronde la plus proche', () => {
    expect(snapToStep(333, 10)).toBe(330)
    expect(snapToStep(336, 10)).toBe(340)
    expect(snapToStep(333, 50)).toBe(350)
    expect(snapToStep(333.4, 5)).toBe(335)
  })

  it('sans aimantation (null), arrondit au mm entier', () => {
    expect(snapToStep(333.4, null)).toBe(333)
    expect(snapToStep(333.6, null)).toBe(334)
  })

  it('un pas de 1 mm revient au mm entier', () => {
    expect(snapToStep(12.7, 1)).toBe(13)
  })
})

describe('clampToValid', () => {
  const upTo100 = (v: number) => v >= 0 && v <= 100

  it('renvoie la cible si elle est valide', () => {
    expect(clampToValid(50, 80, upTo100)).toBe(80)
  })

  it('s’arrête à la dernière valeur valide, dans les deux sens', () => {
    expect(clampToValid(50, 500, upTo100)).toBe(100)
    expect(clampToValid(50, -500, upTo100)).toBe(0)
  })

  it('reste sur place si le voisin immédiat est invalide', () => {
    expect(clampToValid(100, 101, upTo100)).toBe(100)
  })
})

describe('dragShelf', () => {
  it('aimante la hauteur libre de l’étage du dessous', () => {
    // dessus de la tablette 1 = 18 ; souris vers y = 403 -> étage du dessous 385 -> 390 (pas de 10)
    const plan = dragShelf(createPlan(base), 'shelf-2', 403, 10)
    expect(getStages(plan)[0].clearHeight).toBe(390)
    expect(plan.shelves[1].y).toBe(408)
  })

  it('sans aimantation, suit la souris au mm près', () => {
    expect(dragShelf(createPlan(base), 'shelf-2', 403.4, null).shelves[1].y).toBe(403)
  })

  it('s’arrête contre la tablette du dessus', () => {
    // shelf-3 est à 655 : shelf-2 ne peut pas dépasser 655 - 18 - 1 mm de jour = 636
    const plan = dragShelf(createPlan(base), 'shelf-2', 900, null)
    expect(plan.shelves[1].y).toBe(636)
  })

  it('s’arrête contre la tablette du dessous', () => {
    // dessus de shelf-1 = 18 ; on garde 1 mm d'étage libre
    const plan = dragShelf(createPlan(base), 'shelf-2', -200, null)
    expect(plan.shelves[1].y).toBe(19)
  })

  it('s’arrête avant d’écraser une cale', () => {
    // cale dans l'étage 1, jeu 1 mm : l'étage doit garder au moins 2 mm libres, soit y >= 18 + 2
    const plan = dragShelf(planWithWedge(), 'shelf-2', 0, null)
    expect(plan.shelves[1].y).toBe(20)
  })

  it('ne modifie pas le plan d’origine', () => {
    const original = createPlan(base)
    dragShelf(original, 'shelf-2', 403, 10)
    expect(original.shelves[1].y).toBe(328)
  })

  it('ignore une tablette inconnue', () => {
    const plan = createPlan(base)
    expect(dragShelf(plan, 'nope', 400, 10)).toBe(plan)
  })
})

describe('dragWedge', () => {
  it('aimante la position', () => {
    expect(dragWedge(planWithWedge(), 'wedge-1', 447, 50).wedges[0].x).toBe(450)
  })

  it('s’arrête contre le montant gauche', () => {
    expect(dragWedge(planWithWedge(), 'wedge-1', -300, null).wedges[0].x).toBe(18)
  })

  it('s’arrête contre le montant droit', () => {
    // bord droit intérieur = 782 ; cale de 18 mm -> x max = 764
    expect(dragWedge(planWithWedge(), 'wedge-1', 5000, null).wedges[0].x).toBe(764)
  })

  it('ignore une cale inconnue', () => {
    const plan = planWithWedge()
    expect(dragWedge(plan, 'nope', 400, 10)).toBe(plan)
  })
})

describe('setPlanSize', () => {
  it('change largeur et hauteur ensemble', () => {
    const result = setPlanSize(createPlan(base), { width: 900, height: 1100 })
    if (!result.ok) throw new Error(result.error)
    expect(result.plan.width).toBe(900)
    expect(result.plan.height).toBe(1100)
    expect(result.plan.shelves[3].y + 18).toBe(1100)
  })

  it('refuse des valeurs nulles ou décimales', () => {
    expect(setPlanSize(createPlan(base), { width: 0 }).ok).toBe(false)
    expect(setPlanSize(createPlan(base), { height: 10.5 }).ok).toBe(false)
  })
})

describe('resizeFrame', () => {
  it('aimante la largeur et la hauteur', () => {
    const plan = resizeFrame(createPlan(base), { width: 933, height: 1121 }, 50)
    expect(plan.width).toBe(950)
    expect(plan.height).toBe(1100)
  })

  it('peut ne changer qu’une dimension', () => {
    const plan = resizeFrame(createPlan(base), { width: 900 }, null)
    expect(plan.width).toBe(900)
    expect(plan.height).toBe(1000)
  })

  it('ne rétrécit pas la largeur au-delà d’une cale', () => {
    // bord droit de la cale = 318 ; il faut garder le montant droit (18) : largeur min = 336
    const fixed = planWithWedge()
    fixed.options.propagation = false
    const plan = resizeFrame(fixed, { width: 100 }, null)
    expect(plan.width).toBe(336)
  })

  it('ne rétrécit pas la hauteur au-delà des tablettes', () => {
    // shelf-3 finit à 673 ; la tablette du haut (18) doit rester à 1 mm au moins au-dessus : hauteur min = 692
    const plan = resizeFrame(createPlan({ ...base, propagation: false }), { height: 100 }, null)
    expect(plan.height).toBe(692)
  })

  it('agrandit sans limite particulière', () => {
    expect(resizeFrame(createPlan(base), { width: 3000 }, null).width).toBe(3000)
  })
})

describe('nudgePiece (flèches du clavier)', () => {
  it('monte et descend une tablette intermédiaire d’un pas', () => {
    const plan = createPlan(base) // shelf-2 à y = 328
    expect(nudgePiece(plan, 'shelf-2', 0, 1, 10)).toEqual({ property: 'y', mm: 338 })
    expect(nudgePiece(plan, 'shelf-2', 0, -1, 10)).toEqual({ property: 'y', mm: 318 })
    expect(nudgePiece(plan, 'shelf-2', 0, 1, 1)).toEqual({ property: 'y', mm: 329 })
  })

  it('déplace une cale à droite et à gauche', () => {
    const plan = planWithWedge() // x = 300
    expect(nudgePiece(plan, 'wedge-1', 1, 0, 10)).toEqual({ property: 'x', mm: 310 })
    expect(nudgePiece(plan, 'wedge-1', -1, 0, 5)).toEqual({ property: 'x', mm: 295 })
  })

  it('ne déplace pas dans le mauvais sens : une tablette ne va pas de côté, une cale ne monte pas', () => {
    expect(nudgePiece(createPlan(base), 'shelf-2', 1, 0, 10)).toBeNull()
    expect(nudgePiece(planWithWedge(), 'wedge-1', 0, 1, 10)).toBeNull()
  })

  it('ne déplace pas les montants ni les tablettes du haut et du bas', () => {
    const plan = createPlan(base)
    expect(nudgePiece(plan, 'upright-left', 1, 0, 10)).toBeNull()
    expect(nudgePiece(plan, 'shelf-1', 0, 1, 10)).toBeNull()
    expect(nudgePiece(plan, 'shelf-4', 0, -1, 10)).toBeNull()
  })

  it('s’arrête contre la voisine au lieu de la traverser (dernier pas partiel)', () => {
    const plan = createPlan(base) // shelf-3 à 655, shelf-2 ne peut pas dépasser 636
    plan.shelves[1].y = 630
    expect(nudgePiece(plan, 'shelf-2', 0, 1, 50)).toEqual({ property: 'y', mm: 636 })
  })

  it('renvoie null quand la pièce est déjà contre sa voisine', () => {
    const plan = createPlan(base)
    plan.shelves[1].y = 636
    expect(nudgePiece(plan, 'shelf-2', 0, 1, 10)).toBeNull()
  })

  it('s’arrête contre le montant pour une cale', () => {
    const plan = planWithWedge()
    plan.wedges[0].x = 20
    expect(nudgePiece(plan, 'wedge-1', -1, 0, 10)).toEqual({ property: 'x', mm: 18 })
  })

  it('ignore une pièce inconnue', () => {
    expect(nudgePiece(createPlan(base), 'nope', 0, 1, 10)).toBeNull()
  })
})
