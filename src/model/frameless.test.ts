/**
 * Modèle sans cadre (planches apparentes) : tablettes continues avec débords, montants coupés à la hauteur de
 * chaque étage, un à gauche et un à droite, supprimables un par un.
 *
 * Étagère de référence : 900 × 1000 mm hors-tout, profondeur 250, 3 étages, bois de 18 mm, débord de 20 mm.
 *   Corps (face extérieure des montants) : de x = 20 à x = 880, soit 860 mm.
 *   Tablettes : 860 + 20 + 20 = 900 mm, de x = 0 à x = 900.
 *   Hauteur libre : 1000 − 4 × 18 = 928 = 3 × 309 + 1  →  étages de 310, 309, 309.
 *   Montants : 2 par étage → 6 pièces de 310 / 309 / 309 mm.
 */
import { describe, expect, it } from 'vitest'
import { computeCutList } from './cutlist'
import { checkPlan, readPiece, setPieceProperty, setPlanProperty } from './edit'
import { bodyEdges, innerSpan, overhangs } from './geometry'
import { parseVerticalId, pieceLabel } from './labels'
import { computeFrontRects } from './layout'
import { computePieces, pieceIds, shelfLength, sortedShelves, stageVerticals } from './pieces'
import { createPlan } from './plan'
import { computeProfileRects } from './profile'
import { parsePlan, parsePlanFile, serializePlan } from './serialize'
import { addShelf, addWedge, distributeShelves, removePieces, setVertical } from './tools'
import type { Plan } from './types'
import { resolveWizard } from './wizard'

const base = {
  model: 'frameless' as const,
  width: 900,
  height: 1000,
  depth: 250,
  stages: 3,
  uprightThickness: 18,
  shelfThickness: 18,
  overhang: 20,
}

const frameless = (overrides: Partial<Parameters<typeof createPlan>[0]> = {}) => createPlan({ ...base, ...overrides })

function ok<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  if (!result.ok) throw new Error(`échec inattendu : ${(result as unknown as { error: string }).error}`)
  return result as Extract<T, { ok: true }>
}

describe('création', () => {
  it('crée un plan sans cadre avec le débord demandé sur toutes les tablettes', () => {
    const plan = frameless()
    expect(plan.model).toBe('frameless')
    for (const s of plan.shelves) {
      expect(s).toMatchObject({ overhangLeft: 20, overhangRight: 20, verticalLeft: true, verticalRight: true })
    }
  })

  it('le modèle avec cadre reste le défaut et n’a aucun débord', () => {
    const plan = createPlan({ ...base, model: undefined, overhang: undefined })
    expect(plan.model).toBe('frame')
    expect(plan.shelves.every((s) => s.overhangLeft === 0 && s.overhangRight === 0)).toBe(true)
  })

  it('refuse une largeur trop faible pour les montants et les débords', () => {
    // 2 × 18 + 2 × 20 = 76 : à 76 mm il ne reste aucun espace entre les montants
    expect(() => frameless({ width: 76 })).toThrow(RangeError)
    expect(() => frameless({ width: 77 })).not.toThrow()
  })

  it('refuse un débord négatif ou décimal', () => {
    expect(() => frameless({ overhang: -1 })).toThrow(RangeError)
    expect(() => frameless({ overhang: 2.5 })).toThrow(RangeError)
  })

  it('un débord de 0 est permis : les tablettes affleurent les montants', () => {
    const plan = frameless({ overhang: 0 })
    expect(computePieces(plan).find((p) => p.id === 'shelf-1')?.length).toBe(900)
    expect(checkPlan(plan)).toEqual([])
  })
})

describe('géométrie', () => {
  it('le corps est entre les débords, les tablettes touchent les bords hors-tout', () => {
    const plan = frameless()
    expect(overhangs(plan)).toEqual({ left: 20, right: 20 })
    expect(bodyEdges(plan)).toEqual({ left: 20, right: 880 })
    expect(innerSpan(plan)).toEqual({ left: 38, right: 862 })
  })

  it('le modèle avec cadre garde ses repères d’origine', () => {
    const plan = createPlan({ ...base, model: 'frame', overhang: 0 })
    expect(bodyEdges(plan)).toEqual({ left: 0, right: 900 })
    expect(innerSpan(plan)).toEqual({ left: 18, right: 882 })
  })

  it('des débords différents : le plus grand de chaque côté fixe le corps', () => {
    const plan = frameless()
    plan.shelves[2].overhangLeft = 50
    plan.shelves[1].overhangRight = 35
    expect(overhangs(plan)).toEqual({ left: 50, right: 35 })
    expect(bodyEdges(plan)).toEqual({ left: 50, right: 865 })
  })

  it('les tablettes ont une longueur propre à leur débord et restent dans la largeur hors-tout', () => {
    // largeur 900, plus grands débords 50 (g) et 35 (d) → corps de 815
    const plan = frameless()
    plan.shelves[2].overhangLeft = 50
    plan.shelves[1].overhangRight = 35
    const lengths = sortedShelves(plan).map((s, i) => shelfLength(plan, s, i === 0 || i === 3))
    // shelf-1 : 815+20+20 = 855 ; shelf-2 : 815+20+35 = 870 ; shelf-3 : 815+50+20 = 885 ; shelf-4 : 855
    expect(lengths).toEqual([855, 870, 885, 855])
    const rects = computeFrontRects(plan).filter((r) => r.kind === 'shelf')
    expect(Math.min(...rects.map((r) => r.x))).toBe(0)
    expect(Math.max(...rects.map((r) => r.x + r.width))).toBe(900)
  })
})

describe('pièces à découper', () => {
  it('2 montants par étage, coupés à la hauteur libre de l’étage', () => {
    const verticals = stageVerticals(frameless())
    expect(verticals.map((v) => [v.id, v.height])).toEqual([
      ['vertical-left-shelf-1', 310],
      ['vertical-right-shelf-1', 310],
      ['vertical-left-shelf-2', 309],
      ['vertical-right-shelf-2', 309],
      ['vertical-left-shelf-3', 309],
      ['vertical-right-shelf-3', 309],
    ])
    expect(verticals.every((v) => v.thickness === 18 && v.depth === 250)).toBe(true)
  })

  it('les montants sont alignés sur le corps : face extérieure à x = 20 et x = 880', () => {
    const [left, right] = stageVerticals(frameless())
    expect(left.x).toBe(20)
    expect(right.x + right.thickness).toBe(880)
  })

  it('liste de découpe : 6 montants, 4 tablettes de 900', () => {
    const { groups, totalPieces } = computeCutList(frameless())
    expect(groups.map((g) => [g.mark, g.length, g.width, g.thickness, g.quantity])).toEqual([
      ['A', 310, 250, 18, 2],
      ['B', 309, 250, 18, 4],
      ['C', 900, 250, 18, 4],
    ])
    expect(totalPieces).toBe(10)
  })

  it('les montants ne sont plus « pleine hauteur » : aucune pièce n’a la hauteur de l’étagère', () => {
    expect(computePieces(frameless()).some((p) => p.length === 1000)).toBe(false)
  })

  it('les cales restent entre les montants, avec leur jeu', () => {
    const plan = ok(addWedge(frameless(), 'shelf-1')).plan
    const wedge = computePieces(plan).find((p) => p.kind === 'wedge')
    expect(wedge?.length).toBe(309) // 310 − 1 mm de jeu
  })
})

describe('dessin', () => {
  it('vue de face : montants par étage, tablettes avec débords', () => {
    const rects = computeFrontRects(frameless())
    const left1 = rects.find((r) => r.id === 'vertical-left-shelf-1')
    expect(left1).toMatchObject({ x: 20, y: 18, width: 18, height: 310 })
    const shelf = rects.find((r) => r.id === 'shelf-2')
    expect(shelf).toMatchObject({ x: 0, width: 900, height: 18 })
    expect(rects.some((r) => r.id === 'upright-left')).toBe(false)
  })

  it('vue de profil : tablettes et montants de gauche visibles, montants de droite et cales cachés', () => {
    const plan = ok(addWedge(frameless(), 'shelf-2')).plan
    const rects = computeProfileRects(plan)
    const hidden = (id: string) => rects.find((r) => r.id === id)?.hidden
    expect(hidden('shelf-2')).toBe(false)
    expect(hidden('vertical-left-shelf-1')).toBe(false)
    expect(hidden('vertical-right-shelf-1')).toBe(true)
    expect(hidden('wedge-1')).toBe(true)
  })

  it('la vue de profil d’un plan avec cadre n’a pas changé', () => {
    const plan = createPlan({ ...base, model: 'frame', overhang: 0 })
    const hidden = Object.fromEntries(computeProfileRects(plan).map((r) => [r.id, r.hidden]))
    expect(hidden['upright-left']).toBe(false)
    expect(hidden['upright-right']).toBe(true)
    expect(hidden['shelf-2']).toBe(true)
  })
})

describe('modification', () => {
  it('règle le débord d’une tablette ; la longueur et la largeur du corps suivent', () => {
    const plan = ok(setPieceProperty(frameless(), ['shelf-2'], 'overhangLeft', 50)).plan
    expect(readPiece(plan, 'shelf-2')).toMatchObject({ overhangLeft: 50, overhangRight: 20 })
    // corps : de 50 à 880 = 830 ; shelf-2 = 830 + 50 + 20 = 900 ; les autres 830 + 20 + 20 = 870
    expect(computePieces(plan).filter((p) => p.kind === 'shelf').map((p) => p.length)).toEqual([870, 900, 870, 870])
  })

  it('un débord de 0 est accepté', () => {
    expect(setPieceProperty(frameless(), ['shelf-2'], 'overhangRight', 0).ok).toBe(true)
  })

  it('refuse un débord négatif, décimal, ou sur un plan avec cadre', () => {
    expect(setPieceProperty(frameless(), ['shelf-2'], 'overhangLeft', -5).ok).toBe(false)
    expect(setPieceProperty(frameless(), ['shelf-2'], 'overhangLeft', 2.5).ok).toBe(false)
    const framed = createPlan({ ...base, model: 'frame', overhang: 0 })
    expect(setPieceProperty(framed, ['shelf-2'], 'overhangLeft', 10).ok).toBe(false)
  })

  it('refuse un débord qui ne laisse plus de place entre les montants', () => {
    // corps de 850 à 880 = 30 mm < 2 montants de 18 mm : les montants se chevaucheraient
    expect(setPieceProperty(frameless(), ['shelf-2'], 'overhangLeft', 850).ok).toBe(false)
    // à 800 il reste 44 mm entre les montants : valide
    expect(setPieceProperty(frameless(), ['shelf-2'], 'overhangLeft', 800).ok).toBe(true)
  })

  it('refuse un débord qui pousserait une cale hors des montants', () => {
    const plan = ok(addWedge(frameless(), 'shelf-1')).plan // cale au milieu, x = 441
    plan.wedges[0].x = 840 // contre le montant droit (inner droit = 862)
    const result = setPieceProperty(plan, ['shelf-3'], 'overhangRight', 60) // corps droit 840 → inner droit 822
    expect(result.ok).toBe(false)
  })

  it('l’épaisseur d’un montant s’applique à tous les montants du même côté', () => {
    const plan = ok(setPieceProperty(frameless(), ['vertical-left-shelf-2'], 'thickness', 25)).plan
    const lefts = stageVerticals(plan).filter((v) => v.side === 'left')
    expect(lefts.every((v) => v.thickness === 25)).toBe(true)
    expect(stageVerticals(plan).filter((v) => v.side === 'right').every((v) => v.thickness === 18)).toBe(true)
  })

  it('la largeur hors-tout se règle : les tablettes suivent, les montants restent aux débords', () => {
    const plan = ok(setPlanProperty(frameless(), { property: 'width', mm: 1000 })).plan
    expect(bodyEdges(plan)).toEqual({ left: 20, right: 980 })
    expect(computePieces(plan).find((p) => p.id === 'shelf-1')?.length).toBe(1000)
  })

  it('la propagation garde les cales à leur position relative dans l’espace entre montants', () => {
    // espace libre 38..862 (824), cale 18 : marge 806 ; cale à x = 200 → (200−38)/806 ; largeur 1000 → espace 38..962
    let plan = ok(addWedge(frameless(), 'shelf-1')).plan
    plan.wedges[0].x = 200
    plan = ok(setPlanProperty(plan, { property: 'width', mm: 1000 })).plan
    // marge 906 : 38 + round(162/806 × 906) = 38 + 182
    expect(plan.wedges[0].x).toBe(220)
  })

  it('la hauteur se règle, les montants suivent la hauteur des étages', () => {
    const plan = ok(setPlanProperty(frameless(), { property: 'height', mm: 1200 })).plan
    const heights = stageVerticals(plan).map((v) => v.height)
    expect(heights.reduce((a, b) => a + b, 0) / 2 + 4 * 18).toBe(1200)
  })
})

describe('montants supprimables un par un', () => {
  it('supprimer un montant retire une pièce de la liste de découpe', () => {
    const plan = ok(removePieces(frameless(), ['vertical-right-shelf-2'])).plan
    expect(computePieces(plan).some((p) => p.id === 'vertical-right-shelf-2')).toBe(false)
    expect(computePieces(plan).filter((p) => p.kind === 'upright')).toHaveLength(5)
    expect(computeCutList(plan).totalPieces).toBe(9)
  })

  it('un étage peut se terminer uniquement par une tablette : plus aucun montant à droite', () => {
    let plan = frameless()
    for (const id of ['shelf-1', 'shelf-2', 'shelf-3']) plan = ok(setVertical(plan, id, 'right', false)).plan
    expect(stageVerticals(plan).every((v) => v.side === 'left')).toBe(true)
    expect(checkPlan(plan)).toEqual([])
  })

  it('on peut remettre un montant', () => {
    const removed = ok(setVertical(frameless(), 'shelf-1', 'left', false)).plan
    const back = ok(setVertical(removed, 'shelf-1', 'left', true)).plan
    expect(stageVerticals(back)).toHaveLength(6)
  })

  it('refuse sur la tablette du haut (pas d’étage au-dessus) et sur un plan avec cadre', () => {
    expect(setVertical(frameless(), 'shelf-4', 'left', false).ok).toBe(false)
    expect(setVertical(createPlan({ ...base, model: 'frame', overhang: 0 }), 'shelf-1', 'left', false).ok).toBe(false)
  })

  it('refuse de supprimer un montant inconnu ou déjà supprimé', () => {
    expect(removePieces(frameless(), ['vertical-left-shelf-9']).ok).toBe(false)
    const once = ok(removePieces(frameless(), ['vertical-left-shelf-1'])).plan
    expect(removePieces(once, ['vertical-left-shelf-1']).ok).toBe(false)
  })

  it('les identifiants de pièces suivent les montants présents', () => {
    const plan = ok(removePieces(frameless(), ['vertical-left-shelf-1'])).plan
    expect(pieceIds(plan)).not.toContain('vertical-left-shelf-1')
    expect(pieceIds(plan)).toContain('vertical-right-shelf-1')
  })
})

describe('outils', () => {
  it('ajouter une tablette reprend les débords et les montants de celle du dessous', () => {
    const start = ok(setVertical(frameless(), 'shelf-1', 'left', false)).plan
    start.shelves[0].overhangRight = 20
    const { plan, id } = ok(addShelf(start, 'shelf-1'))
    expect(plan.shelves.find((s) => s.id === id)).toMatchObject({ overhangLeft: 20, overhangRight: 20, verticalLeft: false, verticalRight: true })
  })

  it('espacer également garde un plan cohérent', () => {
    const plan = frameless()
    plan.shelves[1].y = 500
    expect(checkPlan(ok(distributeShelves(plan)).plan)).toEqual([])
  })

  it('supprimer une tablette fusionne les étages : les montants de dessous couvrent tout', () => {
    const plan = ok(removePieces(frameless(), ['shelf-2'])).plan
    const first = stageVerticals(plan)[0]
    expect(first.height).toBe(310 + 18 + 309)
  })
})

describe('libellés', () => {
  it('nomme chaque montant avec son côté et son étage', () => {
    const plan = frameless()
    expect(pieceLabel(plan, 'vertical-left-shelf-1')).toBe('Montant gauche, étage 1')
    expect(pieceLabel(plan, 'vertical-right-shelf-3')).toBe('Montant droit, étage 3')
    expect(parseVerticalId('vertical-right-shelf-3')).toEqual({ side: 'right', shelfBelowId: 'shelf-3' })
    expect(parseVerticalId('shelf-1')).toBeNull()
  })
})

describe('sauvegarde', () => {
  function roundTrip(plan: Plan) {
    const result = parsePlanFile(serializePlan(plan))
    if (!result.ok) throw new Error(result.error)
    return result.plan
  }

  it('un plan sans cadre revient à l’identique, débords et montants supprimés compris', () => {
    let plan = ok(setVertical(frameless(), 'shelf-2', 'right', false)).plan
    plan = ok(setPieceProperty(plan, ['shelf-3'], 'overhangLeft', 45)).plan
    expect(roundTrip(plan)).toEqual(plan)
  })

  it('un ancien fichier (sans modèle ni débords) est lu comme un plan avec cadre', () => {
    const old = JSON.parse(JSON.stringify(createPlan({ ...base, model: 'frame', overhang: 0 })))
    delete old.model
    for (const s of old.shelves) {
      delete s.overhangLeft
      delete s.overhangRight
      delete s.verticalLeft
      delete s.verticalRight
    }
    const result = parsePlan(old)
    if (!result.ok) throw new Error(result.error)
    expect(result.plan.model).toBe('frame')
    expect(result.plan.shelves[0]).toMatchObject({ overhangLeft: 0, overhangRight: 0, verticalLeft: true, verticalRight: true })
  })

  it('refuse un modèle inconnu et des débords invalides', () => {
    const raw = JSON.parse(JSON.stringify(frameless()))
    expect(parsePlan({ ...raw, model: 'cube' }).ok).toBe(false)
    const bad = JSON.parse(JSON.stringify(frameless()))
    bad.shelves[0].overhangLeft = -3
    expect(parsePlan(bad).ok).toBe(false)
    const text = JSON.parse(JSON.stringify(frameless()))
    text.shelves[0].verticalLeft = 'oui'
    expect(parsePlan(text).ok).toBe(false)
  })

  it('refuse un plan sans cadre incohérent (débord trop grand)', () => {
    const raw = JSON.parse(JSON.stringify(frameless()))
    raw.shelves[1].overhangLeft = 5000
    expect(parsePlan(raw).ok).toBe(false)
  })
})

describe('assistant', () => {
  const values = {
    name: 'Planches apparentes',
    model: 'frameless' as const,
    overhang: '2',
    width: '90',
    height: '100',
    depth: '25',
    stages: '3',
    uprightThickness: '1,8',
    shelfThickness: '1,8',
    wedgeThickness: '1,8',
    framePlacement: 'between' as const,
  }

  it('crée un plan sans cadre avec le débord en cm', () => {
    const result = resolveWizard(values)
    if (!result.ok) throw new Error(JSON.stringify(result))
    expect(result.plan.model).toBe('frameless')
    expect(result.plan.shelves[0]).toMatchObject({ overhangLeft: 20, overhangRight: 20 })
    expect(result.plan.width).toBe(900)
  })

  it('accepte un débord de 0', () => {
    const result = resolveWizard({ ...values, overhang: '0' })
    expect(result.ok).toBe(true)
  })

  it('signale un débord illisible, seulement pour le modèle sans cadre', () => {
    const bad = resolveWizard({ ...values, overhang: 'beaucoup' })
    if (bad.ok) throw new Error('doit être refusé')
    expect(bad.fieldErrors.overhang).toBeDefined()
    expect(resolveWizard({ ...values, model: 'frame', overhang: 'beaucoup' }).ok).toBe(true)
  })

  it('explique un débord qui ne laisse pas de place', () => {
    const result = resolveWizard({ ...values, width: '8', overhang: '3' })
    if (result.ok) throw new Error('doit être refusé')
    expect(result.formError).toMatch(/largeur/i)
  })
})
