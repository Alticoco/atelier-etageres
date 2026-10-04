/**
 * Critères de « terminé » du MVP (docs/SPEC.md §7), vérifiés par des tests :
 *
 *   1. Recréer une mangathèque en moins de 10 minutes     → à valider par l'utilisateur (voir ROADMAP) ; ici : le parcours existe.
 *   2. La liste de découpe correspond à un calcul à la main → tests « critère 2 » (calculs écrits dans les commentaires).
 *   3. Le PDF s'imprime lisiblement en A4 paysage           → tests « critère 3 » (page, marges, tailles de texte et de trait).
 *   4. Un PDF exporté puis ré-importé redonne le même plan  → tests « critère 4 ».
 *   5. Le site est en ligne sur GitHub Pages                → vérifié après chaque déploiement (voir ROADMAP).
 */
import { describe, expect, it } from 'vitest'
import { computeCutList } from './model/cutlist'
import { setPlanProperty } from './model/edit'
import { addWedge } from './model/tools'
import type { Plan } from './model/types'
import { resolveWizard } from './model/wizard'
import { buildPlanPdf, readPlanFromPdf } from './pdf/pdf'
import { buildScene, PAGE, type Primitive, type TextPrim } from './pdf/scene'

/** Une mangathèque comme l'utilisateur la décrit dans l'assistant (cm), puis une cale dans chaque étage. */
function mangatheque(overrides: Partial<Parameters<typeof resolveWizard>[0]> = {}, kerf = false): Plan {
  const result = resolveWizard({
    name: 'Mangathèque',
    width: '90',
    height: '180',
    depth: '22',
    stages: '5',
    uprightThickness: '1,8',
    shelfThickness: '1,8',
    wedgeThickness: '1,8',
    framePlacement: 'between',
    ...overrides,
  })
  if (!result.ok) throw new Error(JSON.stringify(result))
  let plan = result.plan
  if (kerf) {
    const on = setPlanProperty(plan, { property: 'sawKerfEnabled', value: true })
    if (!on.ok) throw new Error(on.error)
    plan = on.plan
  }
  const stages = Number(overrides.stages ?? 5)
  for (let i = 1; i <= stages; i++) {
    const added = addWedge(plan, `shelf-${i}`)
    if (!added.ok) throw new Error(added.error)
    plan = added.plan
  }
  return plan
}

describe('critère 1 — recréer une mangathèque depuis l’assistant', () => {
  it('un formulaire rempli suffit à obtenir une étagère complète et cotée', () => {
    const plan = mangatheque()
    expect(plan.width).toBe(900)
    expect(plan.height).toBe(1800)
    expect(plan.shelves).toHaveLength(6)
    expect(plan.wedges).toHaveLength(5)
  })
})

describe('critère 2 — la liste de découpe égale le calcul à la main', () => {
  /*
   * Mangathèque 90 × 180 × 22 cm, 5 étages, bois de 18 mm partout, cadre « entre les montants ».
   *
   *   Montants : 2 pièces de 1800 × 220 × 18.
   *   Tablettes : 6 pièces (5 étages + 1), longueur = 900 − 18 − 18 = 864  →  864 × 220 × 18.
   *   Hauteur libre : 1800 − 6 × 18 = 1692 mm, répartis sur 5 étages : 1692 = 5 × 338 + 2
   *       → étages de 339, 339, 338, 338, 338 (les 2 mm restants vont aux deux étages du bas).
   *   Cales : hauteur de l'étage − 1 mm de jeu → 338, 338, 337, 337, 337 :
   *       2 cales de 338 × 220 × 18 et 3 cales de 337 × 220 × 18.
   *   Total : 2 + 6 + 2 + 3 = 13 pièces.
   */
  it('mangathèque 90 × 180 × 22, cadre entre les montants', () => {
    const { groups, totalPieces } = computeCutList(mangatheque())
    expect(groups.map(({ mark, length, width, thickness, quantity }) => ({ mark, length, width, thickness, quantity }))).toEqual([
      { mark: 'A', length: 1800, width: 220, thickness: 18, quantity: 2 },
      { mark: 'B', length: 864, width: 220, thickness: 18, quantity: 6 },
      { mark: 'C', length: 338, width: 220, thickness: 18, quantity: 2 },
      { mark: 'D', length: 337, width: 220, thickness: 18, quantity: 3 },
    ])
    expect(totalPieces).toBe(13)
  })

  /*
   * Même étagère, tablettes du haut et du bas POSÉES sur / sous les montants :
   *   Montants : 1800 − 18 − 18 = 1764.
   *   Tablettes du haut et du bas : toute la largeur, 900 (2 pièces) ; tablettes intermédiaires : 864 (4 pièces).
   *   Cales : inchangées (la hauteur libre des étages ne dépend pas de ce choix).
   */
  it('même étagère, tablettes du haut et du bas posées sur les montants', () => {
    const { groups } = computeCutList(mangatheque({ framePlacement: 'onTop' }))
    const dims = groups.map((g) => [g.length, g.quantity])
    expect(dims).toEqual([
      [1764, 2],
      [900, 2],
      [864, 4],
      [338, 2],
      [337, 3],
    ])
  })

  /*
   * Montants plus épais (2,5 cm) que les tablettes (1,8 cm), étagère 80 × 100 × 30, 3 étages :
   *   Tablettes : 800 − 25 − 25 = 750 (4 pièces, 750 × 300 × 18) ; montants : 2 × 1000 × 300 × 25.
   *   Hauteur libre : 1000 − 4 × 18 = 928 = 3 × 309 + 1  →  étages de 310, 309, 309 ; cales 309, 308, 308.
   */
  it('montants et tablettes d’épaisseurs différentes', () => {
    const { groups } = computeCutList(
      mangatheque({ width: '80', height: '100', depth: '30', stages: '3', uprightThickness: '2,5' }),
    )
    expect(groups.map((g) => [g.length, g.width, g.thickness, g.quantity])).toEqual([
      [1000, 300, 25, 2],
      [750, 300, 18, 4],
      [309, 300, 18, 1],
      [308, 300, 18, 2],
    ])
  })

  /*
   * Trait de scie de 3 mm : une coupe par pièce → 13 coupes × 3 mm = 39 mm de bois perdu.
   */
  it('trait de scie : 13 pièces × 3 mm = 39 mm', () => {
    expect(computeCutList(mangatheque({}, true)).sawKerf).toEqual({ cuts: 13, kerf: 3, loss: 39 })
  })

  it('après un changement de largeur, la liste suit sans recalcul manuel (864 → 964)', () => {
    const wider = setPlanProperty(mangatheque(), { property: 'width', mm: 1000 })
    if (!wider.ok) throw new Error(wider.error)
    expect(computeCutList(wider.plan).groups.find((g) => g.quantity === 6)?.length).toBe(964)
  })
})

describe('critère 3 — le PDF s’imprime lisiblement en A4 paysage', () => {
  const plans = {
    'mangathèque': mangatheque({}, true),
    'petite étagère à épices': mangatheque({ width: '40', height: '60', depth: '12', stages: '3' }),
    'grande bibliothèque': mangatheque({ width: '240', height: '240', depth: '40', stages: '8' }),
  }

  const texts = (primitives: Primitive[]) => primitives.filter((p): p is TextPrim => p.kind === 'text')

  it.each(Object.entries(plans))('%s : page A4 paysage de 297 × 210 mm', (_name, plan) => {
    const scene = buildScene(plan, { date: new Date(2026, 9, 4) })
    expect([scene.width, scene.height]).toEqual([297, 210])
    expect(PAGE.width).toBeGreaterThan(PAGE.height)
  })

  it.each(Object.entries(plans))('%s : rien ne sort de la zone imprimable (5 mm de marge)', (_name, plan) => {
    const { primitives } = buildScene(plan, { date: new Date(2026, 9, 4) })
    const MARGIN = 5
    for (const prim of primitives) {
      const points =
        prim.kind === 'line'
          ? [[prim.x1, prim.y1], [prim.x2, prim.y2]]
          : prim.kind === 'rect'
            ? [[prim.x, prim.y], [prim.x + prim.width, prim.y + prim.height]]
            : prim.kind === 'circle'
              ? [[prim.x - prim.r, prim.y - prim.r], [prim.x + prim.r, prim.y + prim.r]]
              : [[prim.x, prim.y]]
      for (const [x, y] of points) {
        expect(x).toBeGreaterThanOrEqual(MARGIN)
        expect(x).toBeLessThanOrEqual(PAGE.width - MARGIN)
        expect(y).toBeGreaterThanOrEqual(MARGIN)
        expect(y).toBeLessThanOrEqual(PAGE.height - MARGIN)
      }
    }
  })

  it.each(Object.entries(plans))('%s : aucun texte sous 6 pt, cotes et tableau à 7 pt ou plus', (_name, plan) => {
    const all = texts(buildScene(plan, { date: new Date(2026, 9, 4) }).primitives)
    expect(Math.min(...all.map((t) => t.size))).toBeGreaterThanOrEqual(6)
    // Les cotes (« 90 cm ») et les cellules du tableau sont en 7 pt ou plus.
    for (const t of all.filter((t) => /^\d+(,\d+)? cm$/.test(t.text) || /^\d+(,\d+)?$/.test(t.text))) {
      expect(t.size).toBeGreaterThanOrEqual(7)
    }
  })

  it.each(Object.entries(plans))('%s : traits d’au moins 0,1 mm (les contours à 0,2 mm ou plus)', (_name, plan) => {
    const { primitives } = buildScene(plan, { date: new Date(2026, 9, 4) })
    for (const prim of primitives) {
      if (prim.kind === 'line') expect(prim.width).toBeGreaterThanOrEqual(0.1)
      if (prim.kind === 'rect' && prim.stroke !== undefined) expect(prim.strokeWidth).toBeGreaterThanOrEqual(0.2)
    }
  })

  it('le texte noir est bien contrasté : rien de plus clair que 40 % de gris', () => {
    const all = texts(buildScene(plans['mangathèque'], { date: new Date(2026, 9, 4) }).primitives)
    for (const t of all) expect(t.gray).toBeLessThanOrEqual(0.4)
  })

  it('le fichier PDF réel est un A4 paysage vectoriel et léger', async () => {
    const bytes = await buildPlanPdf(plans['mangathèque'], { date: new Date(2026, 9, 4) })
    const { PDFDocument } = await import('pdf-lib')
    const doc = await PDFDocument.load(bytes)
    const { width, height } = doc.getPage(0).getSize()
    expect(doc.getPageCount()).toBe(1)
    expect(width).toBeCloseTo(841.89, 1)
    expect(height).toBeCloseTo(595.28, 1)
    expect(bytes.length).toBeLessThan(60_000)
  })
})

describe('critère 4 — PDF exporté puis ré-importé = même plan', () => {
  it('la mangathèque complète revient à l’identique, et sa liste de découpe aussi', async () => {
    const original = mangatheque({}, true)
    const bytes = await buildPlanPdf(original, { date: new Date(2026, 9, 4) })
    const result = await readPlanFromPdf(bytes)
    if (!result.ok) throw new Error(result.error)
    expect(result.plan).toEqual(original)
    expect(computeCutList(result.plan)).toEqual(computeCutList(original))
  })
})
