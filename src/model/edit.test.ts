import { describe, expect, it } from 'vitest'
import { checkPlan, readPiece, setPieceProperty, setPlanProperty } from './edit'
import { pieceLabel } from './labels'
import { createPlan } from './plan'
import { computePieces, getStages } from './pieces'
import { selectPiece } from './selection'
import type { Plan } from './types'

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
  plan.wedges.push({ id: 'wedge-1', shelfBelowId: 'shelf-1', x: 300, thickness: 18, depth: 250, cornerRadius: 0, edgeRadius: 0 })
  return plan
}

function okPlan(result: ReturnType<typeof setPieceProperty>): Plan {
  if (!result.ok) throw new Error(`échec inattendu : ${result.error}`)
  return result.plan
}

describe('checkPlan', () => {
  it('accepte un plan créé par l’assistant', () => {
    expect(checkPlan(createPlan(base))).toEqual([])
    expect(checkPlan(planWithWedge())).toEqual([])
  })

  it('détecte des tablettes qui se chevauchent', () => {
    const plan = createPlan(base)
    plan.shelves[1].y = plan.shelves[2].y
    expect(checkPlan(plan)).toContain('Il doit rester de la place entre deux tablettes (elles se chevauchent ou se touchent).')
  })

  it('détecte une cale hors du cadre', () => {
    const plan = planWithWedge()
    plan.wedges[0].x = 5
    expect(checkPlan(plan)).toContain('Une cale sort du cadre.')
  })
})

describe('setPieceProperty', () => {
  it('modifie plusieurs tablettes à la fois et ne touche pas au plan d’origine', () => {
    const plan = createPlan(base)
    const next = okPlan(setPieceProperty(plan, ['shelf-2', 'shelf-3'], 'depth', 200))
    expect(next.shelves.map((s) => s.depth)).toEqual([250, 200, 200, 250])
    expect(plan.shelves.map((s) => s.depth)).toEqual([250, 250, 250, 250])
  })

  it('la longueur des tablettes suit l’épaisseur des montants', () => {
    const next = okPlan(setPieceProperty(createPlan(base), ['upright-left', 'upright-right'], 'thickness', 25))
    const shelf = computePieces(next).find((p) => p.kind === 'shelf')
    expect(shelf?.length).toBe(800 - 50)
  })

  it('garde la tablette du haut collée au haut quand son épaisseur change', () => {
    const next = okPlan(setPieceProperty(createPlan(base), ['shelf-4'], 'thickness', 25))
    const top = next.shelves[3]
    expect(top.y + top.thickness).toBe(1000)
  })

  it('une tablette intermédiaire garde sa face inférieure quand son épaisseur change', () => {
    const plan = createPlan(base)
    const before = plan.shelves[1].y
    const next = okPlan(setPieceProperty(plan, ['shelf-2'], 'thickness', 30))
    expect(next.shelves[1].y).toBe(before)
    expect(next.shelves[1].thickness).toBe(30)
  })

  it('déplace une tablette en hauteur', () => {
    const next = okPlan(setPieceProperty(createPlan(base), ['shelf-2'], 'y', 400))
    expect(getStages(next).map((s) => s.clearHeight)).toEqual([382, 237, 309])
    expect(next.shelves[1].y).toBe(400)
  })

  it('refuse de déplacer une tablette sur une autre', () => {
    const plan = createPlan(base)
    const result = setPieceProperty(plan, ['shelf-2'], 'y', plan.shelves[2].y)
    expect(result).toEqual({ ok: false, error: 'Il doit rester de la place entre deux tablettes (elles se chevauchent ou se touchent).' })
  })

  it('refuse qu’une tablette passe par-dessus une autre, même sans chevauchement', () => {
    const plan = createPlan(base) // shelf-3 à 655, shelf-4 à 982
    const result = setPieceProperty(plan, ['shelf-2'], 'y', 800)
    expect(result).toEqual({ ok: false, error: 'Une tablette ne peut pas passer par-dessus une autre.' })
  })

  it('déplace une cale horizontalement', () => {
    const next = okPlan(setPieceProperty(planWithWedge(), ['wedge-1'], 'x', 500))
    expect(next.wedges[0].x).toBe(500)
  })

  it('refuse une cale qui sort du cadre', () => {
    const result = setPieceProperty(planWithWedge(), ['wedge-1'], 'x', 790)
    expect(result).toEqual({ ok: false, error: 'Une cale sort du cadre.' })
  })

  it('refuse de déplacer une tablette si une cale n’a plus la place dans son étage', () => {
    const plan = planWithWedge() // cale dans l'étage 1 (310 mm)
    const result = setPieceProperty(plan, ['shelf-2'], 'y', plan.shelves[1].y - 309)
    expect(result.ok).toBe(false)
  })

  it('refuse une valeur nulle, négative ou décimale', () => {
    const plan = createPlan(base)
    expect(setPieceProperty(plan, ['shelf-2'], 'thickness', 0).ok).toBe(false)
    expect(setPieceProperty(plan, ['shelf-2'], 'depth', -5).ok).toBe(false)
    expect(setPieceProperty(plan, ['shelf-2'], 'depth', 10.5).ok).toBe(false)
  })

  it('refuse une cote qui ne s’applique pas à la sélection', () => {
    const plan = planWithWedge()
    expect(setPieceProperty(plan, ['shelf-2', 'wedge-1'], 'y', 300).ok).toBe(false)
    expect(setPieceProperty(plan, ['upright-left'], 'x', 10).ok).toBe(false)
  })

  it('refuse une pièce inconnue ou une sélection vide', () => {
    const plan = createPlan(base)
    expect(setPieceProperty(plan, ['nope'], 'depth', 100).ok).toBe(false)
    expect(setPieceProperty(plan, [], 'depth', 100).ok).toBe(false)
  })
})

describe('setPlanProperty', () => {
  it('changer la largeur : les tablettes suivent', () => {
    const result = setPlanProperty(createPlan(base), { property: 'width', mm: 1000 })
    if (!result.ok) throw new Error(result.error)
    expect(computePieces(result.plan).find((p) => p.kind === 'shelf')?.length).toBe(964)
  })

  it('changer la hauteur : la tablette du haut reste collée au haut', () => {
    const result = setPlanProperty(createPlan(base), { property: 'height', mm: 1200 })
    if (!result.ok) throw new Error(result.error)
    const top = result.plan.shelves[3]
    expect(top.y + top.thickness).toBe(1200)
    expect(computePieces(result.plan).find((p) => p.id === 'upright-left')?.length).toBe(1200)
  })

  it('refuse de réduire la hauteur au point de faire chevaucher les tablettes', () => {
    const plan = createPlan({ ...base, propagation: false })
    expect(setPlanProperty(plan, { property: 'height', mm: 600 }).ok).toBe(false)
  })

  it('refuse une largeur trop faible pour les montants', () => {
    expect(setPlanProperty(createPlan(base), { property: 'width', mm: 36 }).ok).toBe(false)
  })

  it('règle le jeu des cales, y compris à 0', () => {
    const result = setPlanProperty(planWithWedge(), { property: 'wedgeClearance', mm: 0 })
    if (!result.ok) throw new Error(result.error)
    expect(result.plan.options.wedgeClearance).toBe(0)
  })

  it('refuse un jeu qui rendrait une cale trop haute', () => {
    const plan = planWithWedge()
    expect(setPlanProperty(plan, { property: 'wedgeClearance', mm: 400 }).ok).toBe(false)
  })

  it('renomme et garde l’ancien nom si le nouveau est vide', () => {
    const plan = createPlan({ ...base, name: 'Manga' })
    const renamed = setPlanProperty(plan, { property: 'name', value: '  Épices ' })
    const blank = setPlanProperty(plan, { property: 'name', value: '   ' })
    expect(renamed.ok && renamed.plan.name).toBe('Épices')
    expect(blank.ok && blank.plan.name).toBe('Manga')
  })

  it('change la position des tablettes du haut et du bas', () => {
    const result = setPlanProperty(createPlan(base), { property: 'framePlacement', value: 'onTop' })
    expect(result.ok && result.plan.options.framePlacement).toBe('onTop')
  })
})

describe('readPiece', () => {
  it('lit les cotes d’une pièce selon son type', () => {
    const plan = planWithWedge()
    expect(readPiece(plan, 'shelf-2')).toMatchObject({ kind: 'shelf', thickness: 18, depth: 250, y: plan.shelves[1].y })
    expect(readPiece(plan, 'wedge-1')).toMatchObject({ kind: 'wedge', x: 300 })
    expect(readPiece(plan, 'upright-left')).toEqual({ kind: 'upright', thickness: 18, depth: 250, cornerRadius: 0, edgeRadius: 0 })
    expect(readPiece(plan, 'nope')).toBeNull()
  })
})

describe('selectPiece', () => {
  it('un clic simple remplace la sélection', () => {
    expect(selectPiece(['a', 'b'], 'c', false)).toEqual(['c'])
  })

  it('Ctrl/Maj + clic ajoute puis retire', () => {
    expect(selectPiece(['a'], 'b', true)).toEqual(['a', 'b'])
    expect(selectPiece(['a', 'b'], 'a', true)).toEqual(['b'])
  })
})

describe('pieceLabel', () => {
  it('nomme les pièces de façon lisible, tablettes numérotées du bas vers le haut', () => {
    const plan = planWithWedge()
    expect(pieceLabel(plan, 'upright-left')).toBe('Montant gauche')
    expect(pieceLabel(plan, 'upright-right')).toBe('Montant droit')
    expect(pieceLabel(plan, 'shelf-1')).toBe('Tablette 1')
    expect(pieceLabel(plan, 'shelf-4')).toBe('Tablette 4')
    expect(pieceLabel(plan, 'wedge-1')).toBe('Cale 1')
  })
})

describe('propagation', () => {
  it('largeur : les cales gardent leur position proportionnelle', () => {
    // espace libre entre montants : 764 ; cale de 18 -> marge 746 ; x = 300 -> (300-18)/746
    const plan = planWithWedge()
    const result = setPlanProperty(plan, { property: 'width', mm: 1000 })
    if (!result.ok) throw new Error(result.error)
    // marge 946 : 18 + round(282 / 746 * 946) = 18 + 358
    expect(result.plan.wedges[0].x).toBe(376)
  })

  it('largeur : sans propagation, les cales restent à leur place', () => {
    const plan = planWithWedge()
    plan.options.propagation = false
    const result = setPlanProperty(plan, { property: 'width', mm: 1000 })
    if (!result.ok) throw new Error(result.error)
    expect(result.plan.wedges[0].x).toBe(300)
  })

  it('hauteur : chaque étage garde sa part de l’espace libre', () => {
    // étages 310 / 309 / 309 (928 libres) -> 1200 : 1128 libres, facteur 1128/928
    const result = setPlanProperty(createPlan(base), { property: 'height', mm: 1200 })
    if (!result.ok) throw new Error(result.error)
    const stages = getStages(result.plan).map((s) => s.clearHeight)
    expect(stages).toEqual([377, 375, 376])
    expect(stages.reduce((a, b) => a + b, 0) + 4 * 18).toBe(1200)
  })

  it('hauteur : sans propagation, seul l’étage du haut s’agrandit', () => {
    const plan = createPlan({ ...base, propagation: false })
    const result = setPlanProperty(plan, { property: 'height', mm: 1200 })
    if (!result.ok) throw new Error(result.error)
    expect(getStages(result.plan).map((s) => s.clearHeight)).toEqual([310, 309, 509])
  })

  it('hauteur réduite : les étages rétrécissent ensemble au lieu de se chevaucher', () => {
    const result = setPlanProperty(createPlan(base), { property: 'height', mm: 600 })
    expect(result.ok).toBe(true)
  })

  it('l’option fixation murale se règle', () => {
    const on = setPlanProperty(createPlan(base), { property: 'wallMount', value: true })
    expect(on.ok && on.plan.options.wallMount).toBe(true)
    expect(createPlan(base).options.wallMount).toBe(false)
  })

  it('peut être activée ou désactivée', () => {
    const off = setPlanProperty(createPlan(base), { property: 'propagation', value: false })
    expect(off.ok && off.plan.options.propagation).toBe(false)
  })
})

describe('cales entre elles', () => {
  function twoWedges(): Plan {
    const plan = planWithWedge()
    plan.wedges.push({ id: 'wedge-2', shelfBelowId: 'shelf-1', x: 500, thickness: 18, depth: 250, cornerRadius: 0, edgeRadius: 0 })
    return plan
  }

  it('détecte deux cales qui se chevauchent dans le même étage', () => {
    const plan = twoWedges()
    plan.wedges[1].x = 310
    expect(checkPlan(plan)).toContain('Deux cales se chevauchent.')
  })

  it('accepte deux cales à la même position dans des étages différents', () => {
    const plan = twoWedges()
    plan.wedges[1].shelfBelowId = 'shelf-2'
    plan.wedges[1].x = 300
    expect(checkPlan(plan)).toEqual([])
  })

  it('une cale ne passe pas par-dessus sa voisine', () => {
    const result = setPieceProperty(twoWedges(), ['wedge-1'], 'x', 600)
    expect(result).toEqual({ ok: false, error: 'Une cale ne peut pas passer par-dessus une autre.' })
  })
})

