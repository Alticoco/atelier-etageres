import { describe, expect, it } from 'vitest'
import { checkPlan } from './edit'
import { computePieces, getStages } from './pieces'
import { createPlan } from './plan'
import { addShelf, addWedge, copyStageWedges, distributeShelves, moveWedge, removePieces, setStageCount, setStageHeight } from './tools'
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

function ok<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  if (!result.ok) throw new Error(`échec inattendu : ${(result as unknown as { error: string }).error}`)
  return result as Extract<T, { ok: true }>
}

describe('addShelf', () => {
  it('coupe un étage en deux, au milieu', () => {
    // étage 1 : 310 libres ; on retire 18 de tablette -> 292 -> 146 de chaque côté
    const { plan, id } = ok(addShelf(createPlan(base), 'shelf-1'))
    expect(id).toBe('shelf-5')
    expect(getStages(plan).map((s) => s.clearHeight)).toEqual([146, 146, 309, 309])
    expect(checkPlan(plan)).toEqual([])
  })

  it("la nouvelle tablette reprend l'épaisseur et la profondeur de celle du dessous", () => {
    const start = createPlan(base)
    start.shelves[0].thickness = 25
    start.shelves[0].depth = 200
    const { plan, id } = ok(addShelf(start, 'shelf-1'))
    expect(plan.shelves.find((s) => s.id === id)).toMatchObject({ thickness: 25, depth: 200 })
  })

  it('numérote sans réutiliser un identifiant existant', () => {
    const first = ok(addShelf(createPlan(base), 'shelf-1'))
    const second = ok(addShelf(first.plan, 'shelf-1'))
    expect(new Set(second.plan.shelves.map((s) => s.id)).size).toBe(6)
  })

  it('refuse un étage trop bas', () => {
    const plan = createPlan({ ...base, height: 4 * 18 + 3 * 10 })
    expect(addShelf(plan, 'shelf-1').ok).toBe(false)
  })

  it("refuse un étage inconnu, ou le dessus de la dernière tablette", () => {
    expect(addShelf(createPlan(base), 'nope').ok).toBe(false)
    expect(addShelf(createPlan(base), 'shelf-4').ok).toBe(false)
  })

  it("ne modifie pas le plan d'origine", () => {
    const plan = createPlan(base)
    addShelf(plan, 'shelf-1')
    expect(plan.shelves).toHaveLength(4)
  })
})

describe('addWedge', () => {
  it("place la cale au milieu d'un étage vide", () => {
    // espace libre 18..782 = 764 ; cale de 18 -> x = 18 + 373 = 391
    const { plan, id } = ok(addWedge(createPlan(base), 'shelf-2'))
    expect(plan.wedges).toEqual([{ id, shelfBelowId: 'shelf-2', x: 391, thickness: 18, depth: 250, cornerRadius: 0, edgeRadius: 0 }])
    expect(checkPlan(plan)).toEqual([])
  })

  it("reprend l'épaisseur par défaut des cales du plan", () => {
    const start = createPlan({ ...base, wedgeThickness: 12 })
    expect(ok(addWedge(start, 'shelf-1')).plan.wedges[0].thickness).toBe(12)
  })

  it("se place dans une place libre à côté d'une cale existante, sans chevauchement", () => {
    const first = ok(addWedge(createPlan(base), 'shelf-1')).plan // x = 391
    const second = ok(addWedge(first, 'shelf-1'))
    // places libres : 18..391 (373) et 409..782 (373) ; la première est choisie (égalité)
    expect(second.plan.wedges[1].x).toBe(18 + Math.floor((373 - 18) / 2))
    expect(checkPlan(second.plan)).toEqual([])
  })

  it("finit par refuser quand il n'y a plus de place, sans jamais chevaucher", () => {
    let plan = createPlan({ ...base, width: 120, wedgeThickness: 18 }) // espace libre = 84 mm
    let added = 0
    for (let i = 0; i < 10; i++) {
      const result = addWedge(plan, 'shelf-1')
      if (!result.ok) break
      plan = result.plan
      added++
      expect(checkPlan(plan)).toEqual([])
    }
    expect(added).toBeGreaterThanOrEqual(2)
    expect(added).toBeLessThanOrEqual(4)
    expect(addWedge(plan, 'shelf-1').ok).toBe(false)
  })

  it('refuse un étage trop bas pour une cale avec ce jeu', () => {
    const plan = createPlan({ ...base, height: 4 * 18 + 3 * 1, wedgeClearance: 1 }) // étages de 1 mm
    expect(addWedge(plan, 'shelf-1').ok).toBe(false)
  })

  it("la cale créée a bien la hauteur de l'étage moins le jeu", () => {
    const { plan } = ok(addWedge(createPlan(base), 'shelf-1'))
    expect(computePieces(plan).find((p) => p.kind === 'wedge')?.length).toBe(309)
  })
})

describe('removePieces', () => {
  function planWithTwoWedges(): Plan {
    let plan = createPlan(base)
    plan = ok(addWedge(plan, 'shelf-1')).plan // wedge-1 centré
    plan = ok(addWedge(plan, 'shelf-2')).plan // wedge-2 centré
    return plan
  }

  it('supprime une cale', () => {
    const plan = ok(removePieces(planWithTwoWedges(), ['wedge-1'])).plan
    expect(plan.wedges.map((w) => w.id)).toEqual(['wedge-2'])
  })

  it('supprime plusieurs pièces à la fois', () => {
    const plan = ok(removePieces(planWithTwoWedges(), ['wedge-1', 'wedge-2', 'shelf-3'])).plan
    expect(plan.wedges).toEqual([])
    expect(plan.shelves.map((s) => s.id)).toEqual(['shelf-1', 'shelf-2', 'shelf-4'])
  })

  it("fusionne les étages et fait passer les cales dans l'étage fusionné", () => {
    const start = planWithTwoWedges()
    start.wedges[1].x = 600 // pour ne pas chevaucher wedge-1 (391)
    const plan = ok(removePieces(start, ['shelf-2'])).plan
    expect(plan.wedges.find((w) => w.id === 'wedge-2')?.shelfBelowId).toBe('shelf-1')
    expect(getStages(plan)[0].clearHeight).toBe(310 + 18 + 309)
  })

  it('refuse de supprimer un montant ou une tablette du haut / du bas', () => {
    const plan = createPlan(base)
    expect(removePieces(plan, ['upright-left']).ok).toBe(false)
    expect(removePieces(plan, ['shelf-1']).ok).toBe(false)
    expect(removePieces(plan, ['shelf-4']).ok).toBe(false)
  })

  it('refuse si des cales fusionnées se chevaucheraient', () => {
    const start = planWithTwoWedges() // les deux cales sont centrées : même x
    expect(removePieces(start, ['shelf-2'])).toEqual({ ok: false, error: 'Deux cales se chevauchent.' })
  })

  it('refuse une pièce inconnue ou une liste vide', () => {
    expect(removePieces(createPlan(base), ['nope']).ok).toBe(false)
    expect(removePieces(createPlan(base), []).ok).toBe(false)
  })
})

describe('distributeShelves', () => {
  it('ne change rien à un plan déjà réparti', () => {
    const plan = createPlan(base)
    expect(ok(distributeShelves(plan)).plan.shelves).toEqual(plan.shelves)
  })

  it('égalise les étages après un déplacement', () => {
    const plan = createPlan(base)
    plan.shelves[1].y = 500
    const result = ok(distributeShelves(plan)).plan
    expect(getStages(result).map((s) => s.clearHeight)).toEqual([310, 309, 309])
  })

  it("gère des tablettes d'épaisseurs différentes", () => {
    const plan = createPlan(base)
    plan.shelves[1].thickness = 30
    plan.shelves[1].y = 200
    const result = ok(distributeShelves(plan)).plan
    const heights = getStages(result).map((s) => s.clearHeight)
    expect(heights.reduce((a, b) => a + b, 0) + 18 + 30 + 18 + 18).toBe(1000)
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1)
  })

  it('les tablettes du haut et du bas ne bougent pas', () => {
    const plan = createPlan(base)
    plan.shelves[2].y = 400
    const result = ok(distributeShelves(plan)).plan
    expect(result.shelves[0].y).toBe(0)
    expect(result.shelves[3].y).toBe(982)
  })

  it("les cales suivent la hauteur de leur étage", () => {
    let plan = ok(addWedge(createPlan(base), 'shelf-2')).plan
    plan.shelves[1].y = 500
    plan = ok(distributeShelves(plan)).plan
    expect(computePieces(plan).find((p) => p.kind === 'wedge')?.length).toBe(308)
  })

  it('un plan à deux tablettes est laissé tel quel', () => {
    const plan = createPlan({ ...base, stages: 1 })
    expect(ok(distributeShelves(plan)).plan.shelves).toEqual(plan.shelves)
  })
})

describe('moveWedge — passer une cale d’un étage à l’autre', () => {
  const plan = () => {
    const p = createPlan({ width: 800, height: 1000, depth: 250, stages: 3, uprightThickness: 18, shelfThickness: 18 })
    p.wedges.push({ id: 'wedge-1', shelfBelowId: 'shelf-1', x: 300, thickness: 18, depth: 250, cornerRadius: 0, edgeRadius: 0 })
    return p
  }

  it('rattache la cale à l’étage visé et garde sa position', () => {
    const result = moveWedge(plan(), 'wedge-1', 'shelf-2', 300, null)
    expect(result.ok && result.plan.wedges[0]).toMatchObject({ shelfBelowId: 'shelf-2', x: 300 })
  })

  it('s’aimante contre le montant à moins de 1 cm', () => {
    const result = moveWedge(plan(), 'wedge-1', 'shelf-2', 22, 10)
    expect(result.ok && result.plan.wedges[0].x).toBe(18)
  })

  it('ne chevauche jamais une cale de l’étage visé : elle se range à côté', () => {
    const p = plan()
    p.wedges.push({ id: 'wedge-2', shelfBelowId: 'shelf-2', x: 300, thickness: 18, depth: 250, cornerRadius: 0, edgeRadius: 0 })
    const result = moveWedge(p, 'wedge-1', 'shelf-2', 305, null)
    expect(result.ok && [result.plan.wedges[0].x]).toSatisfy((x: number[]) => x[0] <= 282 || x[0] >= 318)
  })

  it('s’aimante contre une cale voisine', () => {
    const p = plan()
    p.wedges.push({ id: 'wedge-2', shelfBelowId: 'shelf-2', x: 300, thickness: 18, depth: 250, cornerRadius: 0, edgeRadius: 0 })
    const result = moveWedge(p, 'wedge-1', 'shelf-2', 322, 10)
    expect(result.ok && result.plan.wedges[0].x).toBe(318)
  })
})

describe('copyStageWedges — copier la disposition d’un étage', () => {
  const plan = () => {
    const p = createPlan({ width: 800, height: 1000, depth: 250, stages: 3, uprightThickness: 18, shelfThickness: 18 })
    p.wedges.push(
      { id: 'wedge-1', shelfBelowId: 'shelf-1', x: 200, thickness: 18, depth: 250, cornerRadius: 0, edgeRadius: 0 },
      { id: 'wedge-2', shelfBelowId: 'shelf-1', x: 500, thickness: 20, depth: 240, cornerRadius: 0, edgeRadius: 0 },
      { id: 'wedge-3', shelfBelowId: 'shelf-3', x: 100, thickness: 18, depth: 250, cornerRadius: 0, edgeRadius: 0 },
    )
    return p
  }

  it('reprend les positions et remplace les cales de l’étage visé', () => {
    const result = copyStageWedges(plan(), 'shelf-1', ['shelf-2', 'shelf-3'])
    if (!result.ok) throw new Error(result.error)
    const at = (id: string) => result.plan.wedges.filter((w) => w.shelfBelowId === id).map((w) => [w.x, w.thickness, w.depth])
    expect(at('shelf-2')).toEqual([[200, 18, 250], [500, 20, 240]])
    expect(at('shelf-3')).toEqual([[200, 18, 250], [500, 20, 240]])
    expect(at('shelf-1')).toHaveLength(2)
    expect(new Set(result.plan.wedges.map((w) => w.id)).size).toBe(result.plan.wedges.length)
  })

  it('refuse sans destination ou vers l’étage source', () => {
    expect(copyStageWedges(plan(), 'shelf-1', []).ok).toBe(false)
    expect(copyStageWedges(plan(), 'shelf-1', ['shelf-1']).ok).toBe(false)
    expect(copyStageWedges(plan(), 'shelf-9', ['shelf-2']).ok).toBe(false)
  })

  it('un étage source sans cale vide les étages visés', () => {
    const result = copyStageWedges(plan(), 'shelf-2', ['shelf-1'])
    expect(result.ok && result.plan.wedges.filter((w) => w.shelfBelowId === 'shelf-1')).toHaveLength(0)
  })
})

describe('setStageHeight — régler la hauteur d’un étage', () => {
  const plan = () => createPlan({ width: 800, height: 1000, depth: 250, stages: 3, uprightThickness: 18, shelfThickness: 18 })
  const clear = (p: ReturnType<typeof plan>) => getStages(p).map((s) => s.clearHeight)

  it('étage du bas : déplace la tablette du dessus, l’étage suivant s’adapte', () => {
    const r = setStageHeight(plan(), 'shelf-1', 250)
    if (!r.ok) throw new Error(r.error)
    expect(clear(r.plan)[0]).toBe(250)
    expect(r.plan.height).toBe(1000)
  })

  it('étage du haut : déplace la tablette du dessous', () => {
    const r = setStageHeight(plan(), 'shelf-3', 200)
    if (!r.ok) throw new Error(r.error)
    expect(clear(r.plan)[2]).toBe(200)
    expect(r.plan.height).toBe(1000)
  })

  it('une étagère d’un seul étage change de hauteur', () => {
    const one = createPlan({ width: 800, height: 400, depth: 250, stages: 1, uprightThickness: 18, shelfThickness: 18 })
    const r = setStageHeight(one, 'shelf-1', 500)
    expect(r.ok && r.plan.height).toBe(536)
  })

  it('refuse ce qui ne tient pas, avec un message', () => {
    const r = setStageHeight(plan(), 'shelf-1', 1100)
    expect(r.ok).toBe(false)
    expect(setStageHeight(plan(), 'shelf-1', 0).ok).toBe(false)
    expect(setStageHeight(plan(), 'shelf-9', 100).ok).toBe(false)
  })
})

describe('setStageCount — préconstruire l’étagère', () => {
  const plan = () => createPlan({ width: 800, height: 1000, depth: 250, stages: 3, uprightThickness: 18, shelfThickness: 18 })
  const stages = (p: Plan) => getStages(p).map((s) => s.clearHeight)

  it('passe de 3 à 5 étages, répartis à égalité, hauteur inchangée', () => {
    const r = setStageCount(plan(), 5)
    if (!r.ok) throw new Error(r.error)
    expect(getStages(r.plan)).toHaveLength(5)
    expect(r.plan.height).toBe(1000)
    const heights = stages(r.plan)
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1)
    expect(checkPlan(r.plan)).toEqual([])
  })

  it('passe de 3 à 1 étage : une seule grande ouverture', () => {
    const r = setStageCount(plan(), 1)
    if (!r.ok) throw new Error(r.error)
    expect(stages(r.plan)).toEqual([964])
    expect(r.plan.shelves).toHaveLength(2)
  })

  it('les cales des étages retirés disparaissent, celles qui restent suivent leur tablette', () => {
    const p = plan()
    p.wedges.push(
      { id: 'wedge-1', shelfBelowId: 'shelf-1', x: 300, thickness: 18, depth: 250, cornerRadius: 0, edgeRadius: 0 },
      { id: 'wedge-2', shelfBelowId: 'shelf-3', x: 300, thickness: 18, depth: 250, cornerRadius: 0, edgeRadius: 0 },
    )
    const r = setStageCount(p, 2)
    if (!r.ok) throw new Error(r.error)
    expect(r.plan.wedges.map((w) => w.id)).toEqual(['wedge-1'])
  })

  it('refuse un nombre absurde, et ne change rien si le nombre est déjà bon', () => {
    expect(setStageCount(plan(), 0).ok).toBe(false)
    expect(setStageCount(plan(), 2.5).ok).toBe(false)
    expect(setStageCount(plan(), 99).ok).toBe(false)
    const same = setStageCount(plan(), 3)
    expect(same.ok && same.plan).toEqual(plan())
  })

  it('refuse quand l’étagère est trop basse pour tant d’étages', () => {
    const low = createPlan({ width: 800, height: 120, depth: 250, stages: 1, uprightThickness: 18, shelfThickness: 18 })
    expect(setStageCount(low, 10).ok).toBe(false)
  })
})
