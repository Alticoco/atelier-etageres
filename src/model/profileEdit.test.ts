/**
 * Vue de profil éditable : choisir une pièce au clic, changer la profondeur en tirant son bord avant.
 *
 * Étagère de référence : 800 × 1000 mm, profondeur 250, 3 étages, bois de 18 mm, cadre entre les montants.
 *   Vue de profil : montants 250 × 1000 ; tablettes 250 × 18 aux hauteurs 0, 328, 655, 982 ;
 *   cale du 1er étage 250 × 309 (de y = 18 à y = 327).
 */
import { describe, expect, it } from 'vitest'
import { computeCutList } from './cutlist'
import { checkPlan, readPiece, setPieceProperty } from './edit'
import { dragDepth } from './drag'
import { createPlan } from './plan'
import { computeProfileRects, profileSize } from './profile'
import { pickProfilePiece } from './profilePick'
import { addWedge } from './tools'

const base = {
  width: 800,
  height: 1000,
  depth: 250,
  stages: 3,
  uprightThickness: 18,
  shelfThickness: 18,
}

const frameless = () => createPlan({ ...base, model: 'frameless', overhang: 20, width: 900 })

function ok<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  if (!result.ok) throw new Error(`échec inattendu : ${(result as unknown as { error: string }).error}`)
  return result as Extract<T, { ok: true }>
}

describe('pickProfilePiece — la plus petite pièce sous le curseur', () => {
  it('une tablette passe avant le montant qui la recouvre', () => {
    const plan = createPlan(base)
    expect(pickProfilePiece(plan, 100, 9)).toBe('shelf-1') // dans l'épaisseur de la tablette du bas
    expect(pickProfilePiece(plan, 100, 337)).toBe('shelf-2') // 328..346
    expect(pickProfilePiece(plan, 100, 990)).toBe('shelf-4')
  })

  it('entre deux tablettes, on obtient un montant (celui de gauche à surface égale)', () => {
    expect(pickProfilePiece(createPlan(base), 100, 200)).toBe('upright-left')
  })

  it('une cale, plus petite qu’un montant, passe avant lui', () => {
    const plan = ok(addWedge(createPlan(base), 'shelf-1')).plan
    expect(pickProfilePiece(plan, 100, 200)).toBe('wedge-1')
    expect(pickProfilePiece(plan, 100, 600)).toBe('upright-left') // étage sans cale
  })

  it('renvoie null hors du dessin', () => {
    const plan = createPlan(base)
    expect(pickProfilePiece(plan, 300, 100)).toBeNull() // plus profond que 250
    expect(pickProfilePiece(plan, -5, 100)).toBeNull() // dans le mur
    expect(pickProfilePiece(plan, 100, 1200)).toBeNull()
    expect(pickProfilePiece(plan, 100, -20)).toBeNull()
  })

  it('une tolérance agrandit la zone de chaque pièce', () => {
    const plan = createPlan(base)
    expect(pickProfilePiece(plan, 255, 9)).toBeNull()
    expect(pickProfilePiece(plan, 255, 9, 6)).toBe('shelf-1')
    // juste au-dessus de la tablette du bas (y = 18) : avec tolérance, la tablette est préférée
    expect(pickProfilePiece(plan, 100, 21, 4)).toBe('shelf-1')
    expect(pickProfilePiece(plan, 100, 21)).toBe('upright-left')
  })

  it('une profondeur propre à chaque pièce : on ne clique pas dans le vide d’une tablette moins profonde', () => {
    const plan = ok(setPieceProperty(createPlan(base), ['shelf-2'], 'depth', 150)).plan
    expect(pickProfilePiece(plan, 100, 337)).toBe('shelf-2')
    expect(pickProfilePiece(plan, 200, 337)).toBe('upright-left') // au-delà de la tablette, le montant est derrière
  })

  it('modèle sans cadre : un montant d’étage, de la hauteur de l’étage', () => {
    // montant gauche de l'étage 1 : 250 × 310, de y = 18 à 328
    expect(pickProfilePiece(frameless(), 100, 150)).toBe('vertical-left-shelf-1')
    expect(pickProfilePiece(frameless(), 100, 9)).toBe('shelf-1')
  })

  it('choisit aussi les pièces cachées (dessinées en pointillés)', () => {
    const plan = createPlan(base)
    const hidden = computeProfileRects(plan).find((r) => r.id === 'shelf-2')
    expect(hidden?.hidden).toBe(true)
    expect(pickProfilePiece(plan, 100, 337)).toBe('shelf-2')
  })
})

describe('dragDepth — tirer le bord avant', () => {
  it('amène la profondeur de la pièce à la valeur aimantée', () => {
    const result = dragDepth(createPlan(base), ['shelf-2'], 250, 203, 10)
    expect(result?.mm).toBe(200)
    expect(result?.plan.shelves[1].depth).toBe(200)
    expect(result?.plan.shelves[0].depth).toBe(250)
  })

  it('sans aimantation (Alt), suit la souris au mm près', () => {
    expect(dragDepth(createPlan(base), ['shelf-2'], 250, 203.4, null)?.mm).toBe(203)
  })

  it('plusieurs pièces prennent toutes la même profondeur', () => {
    const start = ok(setPieceProperty(createPlan(base), ['shelf-3'], 'depth', 200)).plan
    const result = dragDepth(start, ['shelf-1', 'shelf-3'], 250, 180, 10)
    expect(result?.plan.shelves.map((s) => s.depth)).toEqual([180, 250, 180, 250])
  })

  it('ne descend pas sous 1 mm', () => {
    expect(dragDepth(createPlan(base), ['shelf-2'], 250, -50, 10)?.mm).toBe(1)
  })

  it('peut agrandir bien au-delà de la profondeur d’origine', () => {
    expect(dragDepth(createPlan(base), ['shelf-2'], 250, 400, 50)?.mm).toBe(400)
  })

  it('s’arrête à la valeur minimale qu’autorise un arrondi d’arête', () => {
    // arête de 9 mm sur une tablette de 18 mm : il faut min(profondeur, 18) / 2 >= 9, donc profondeur >= 18
    const start = ok(setPieceProperty(createPlan(base), ['shelf-2'], 'edgeRadius', 9)).plan
    expect(dragDepth(start, ['shelf-2'], 250, 10, 10)?.mm).toBe(18)
  })

  it('profondeur de départ invalide pour la sélection : trouve une valeur valide plus grande, ou rien', () => {
    // shelf-1 : arête de 9 mm (profondeur >= 18) ; shelf-2 : profondeur 10, saisie en premier
    let start = ok(setPieceProperty(createPlan(base), ['shelf-1'], 'edgeRadius', 9)).plan
    start = ok(setPieceProperty(start, ['shelf-2'], 'depth', 10)).plan
    const ids = ['shelf-1', 'shelf-2']
    // mettre les deux à 10 est invalide (shelf-1 exige 18) : le départ n'est pas valide
    expect(setPieceProperty(start, ids, 'depth', 10).ok).toBe(false)
    expect(dragDepth(start, ids, 10, 40, 10)?.mm).toBe(40)
    expect(dragDepth(start, ids, 10, 12, null)).toBeNull()
  })

  it('refuse une pièce inconnue ou une sélection vide', () => {
    expect(dragDepth(createPlan(base), ['nope'], 250, 200, 10)).toBeNull()
    expect(dragDepth(createPlan(base), [], 250, 200, 10)).toBeNull()
  })

  it('ne modifie pas le plan d’origine', () => {
    const original = createPlan(base)
    dragDepth(original, ['shelf-2'], 250, 100, 10)
    expect(original.shelves[1].depth).toBe(250)
  })

  it('modèle sans cadre : un montant d’étage change la profondeur de tous les montants de son côté', () => {
    const result = dragDepth(frameless(), ['vertical-left-shelf-2'], 250, 200, 10)
    const plan = result!.plan
    expect(plan.leftUpright.depth).toBe(200)
    expect(plan.rightUpright.depth).toBe(250)
  })
})

describe('étages de profondeurs différentes', () => {
  it('une étagère aux profondeurs mixtes reste cohérente et se découpe en lots distincts', () => {
    // 2 tablettes à 150, 2 à 250 : deux lots de 764 mm de long
    const plan = dragDepth(createPlan(base), ['shelf-2', 'shelf-3'], 250, 150, 10)!.plan
    expect(checkPlan(plan)).toEqual([])
    const shelves = computeCutList(plan).groups.filter((g) => g.length === 764)
    expect(shelves.map((g) => [g.width, g.quantity])).toEqual([
      [250, 2],
      [150, 2],
    ])
  })

  it('la profondeur hors-tout est celle de la pièce la plus profonde', () => {
    const plan = dragDepth(createPlan(base), ['shelf-2', 'shelf-3'], 250, 150, 10)!.plan
    expect(profileSize(plan).width).toBe(250)
    // si on approfondit une seule tablette, c'est elle qui fixe la profondeur du dessin
    const deeper = dragDepth(plan, ['shelf-2'], 150, 320, 10)!.plan
    expect(profileSize(deeper).width).toBe(320)
    expect(readPiece(deeper, 'shelf-2')?.depth).toBe(320)
  })
})
