import { describe, expect, it } from 'vitest'
import { createPlan } from '../model/plan'
import { addWedge } from '../model/tools'
import type { Plan } from '../model/types'
import { buildScene, formatDate, PAGE, wrapText, type Primitive, type RectPrim, type TextPrim } from './scene'

const DATE = new Date(2026, 9, 4) // 4 octobre 2026

const base = {
  name: 'Mangathèque',
  width: 800,
  height: 1000,
  depth: 250,
  stages: 3,
  uprightThickness: 18,
  shelfThickness: 18,
}

function plan(overrides: Partial<Parameters<typeof createPlan>[0]> = {}, wedges = 0): Plan {
  let p = createPlan({ ...base, ...overrides })
  for (let i = 0; i < wedges; i++) {
    const result = addWedge(p, 'shelf-1')
    if (!result.ok) throw new Error(result.error)
    p = result.plan
  }
  return p
}

const texts = (primitives: Primitive[]) => primitives.filter((p): p is TextPrim => p.kind === 'text')
const rects = (primitives: Primitive[]) => primitives.filter((p): p is RectPrim => p.kind === 'rect')
const allText = (primitives: Primitive[]) => texts(primitives).map((t) => t.text)

describe('page', () => {
  it('est un A4 paysage (297 × 210 mm)', () => {
    const scene = buildScene(plan(), { date: DATE })
    expect(scene.width).toBe(297)
    expect(scene.height).toBe(210)
    expect(PAGE).toEqual({ width: 297, height: 210 })
  })

  it('garde tous les dessins à l’intérieur du cadre de la page', () => {
    for (const p of [plan(), plan({ width: 2000, height: 2400, depth: 600 }), plan({ width: 300, height: 400, depth: 100, stages: 1 })]) {
      const { primitives } = buildScene(p, { date: DATE })
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
          expect(x).toBeGreaterThanOrEqual(-0.001)
          expect(x).toBeLessThanOrEqual(PAGE.width + 0.001)
          expect(y).toBeGreaterThanOrEqual(-0.001)
          expect(y).toBeLessThanOrEqual(PAGE.height + 0.001)
        }
      }
    }
  })
})

describe('échelle', () => {
  it('choisit la plus grande échelle qui tient : 1:10 pour 80 × 100 cm', () => {
    expect(buildScene(plan(), { date: DATE }).scaleDenominator).toBe(10)
  })

  it('passe à une échelle plus petite pour une grande étagère', () => {
    expect(buildScene(plan({ width: 2000, height: 2400, depth: 600, stages: 5 }), { date: DATE }).scaleDenominator).toBeGreaterThan(10)
  })

  it('passe à une échelle plus grande pour une petite étagère', () => {
    expect(buildScene(plan({ width: 300, height: 400, depth: 100, stages: 1 }), { date: DATE }).scaleDenominator).toBeLessThan(10)
  })

  it('dessine les pièces à l’échelle indiquée : une tablette de 764 mm fait 76,4 mm sur le papier', () => {
    const { primitives } = buildScene(plan(), { date: DATE })
    const widths = rects(primitives).map((r) => Math.round(r.width * 100) / 100)
    expect(widths).toContain(76.4)
    // montant : 1000 mm de haut -> 100 mm
    expect(rects(primitives).some((r) => Math.abs(r.height - 100) < 0.01 && Math.abs(r.width - 1.8) < 0.01)).toBe(true)
  })

  it('affiche l’échelle dans le cartouche, avec une virgule pour 1:2,5', () => {
    expect(allText(buildScene(plan(), { date: DATE }).primitives)).toContain('1:10')
    const scene = buildScene(plan({ width: 1000, height: 600, depth: 250, stages: 2 }), { date: DATE })
    if (scene.scaleDenominator === 2.5) expect(allText(scene.primitives)).toContain('1:2,5')
  })
})

describe('cartouche', () => {
  const t = allText(buildScene(plan(), { date: DATE }).primitives)

  it('contient le nom, la date, les dimensions hors-tout et l’échelle', () => {
    expect(t).toContain('Mangathèque')
    expect(t).toContain('04/10/2026')
    expect(t).toContain('80 × 100 × 25 cm')
    expect(t).toContain('1:10')
  })

  it('donne les dimensions dans l’unité choisie', () => {
    expect(allText(buildScene(plan(), { date: DATE, unit: 'mm' }).primitives)).toContain('800 × 1000 × 250 mm')
  })

  it('raccourcit un nom trop long', () => {
    const long = allText(buildScene(plan({ name: 'x'.repeat(100) }), { date: DATE }).primitives)
    expect(long.some((s) => s.endsWith('…') && s.length <= 32)).toBe(true)
  })

  it('utilise la profondeur de la pièce la plus profonde', () => {
    const p = plan()
    p.shelves[1].depth = 320
    expect(allText(buildScene(p, { date: DATE }).primitives)).toContain('80 × 100 × 32 cm')
  })
})

describe('vues', () => {
  const t = allText(buildScene(plan(), { date: DATE }).primitives)

  it('titre les trois zones', () => {
    expect(t).toContain('VUE DE FACE')
    expect(t).toContain('VUE DE PROFIL')
    expect(t).toContain('LISTE DE DÉCOUPE')
  })

  it('cote la vue de face : largeur, hauteur et chaque étage', () => {
    expect(t).toContain('80 cm')
    expect(t.filter((s) => s === '100 cm').length).toBeGreaterThanOrEqual(2) // face + profil
    expect(t).toContain('31 cm')
    expect(t.filter((s) => s === '30,9 cm')).toHaveLength(2)
  })

  it('cote la vue de profil : profondeur et hauteur', () => {
    expect(t).toContain('25 cm')
  })

  it('porte les repères A et B sur la vue de face (une pastille par pièce)', () => {
    const marks = texts(buildScene(plan(), { date: DATE }).primitives).filter((p) => p.bold && p.size === 6 && /^[A-Z]$/.test(p.text))
    expect(marks.map((m) => m.text).sort().join('')).toBe('AABBBB')
  })

  it('dessine les pièces cachées du profil en pointillés', () => {
    const { primitives } = buildScene(plan(), { date: DATE })
    expect(rects(primitives).filter((r) => r.dash && r.fill === undefined).length).toBeGreaterThan(0)
  })

  it('dessine les cales en pointillés dans la vue de face', () => {
    const { primitives } = buildScene(plan({}, 2), { date: DATE })
    expect(rects(primitives).filter((r) => r.dash && r.fill === 1)).toHaveLength(2)
  })

  it('met le texte des cotes verticales à la verticale', () => {
    const rotated = texts(buildScene(plan(), { date: DATE }).primitives).filter((p) => p.rotate === 90)
    expect(rotated.length).toBeGreaterThanOrEqual(5)
  })
})

describe('liste de découpe', () => {
  it('reprend les lots, quantités et dimensions de l’application', () => {
    const t = allText(buildScene(plan({}, 2), { date: DATE }).primitives)
    expect(t).toContain('Total : 8 pièces à découper')
    for (const expected of ['A', 'B', 'C', '100', '76,4', '30,9', '1,8', 'Montants', 'Tablettes', 'Cales']) {
      expect(t).toContain(expected)
    }
  })

  it('suit l’unité choisie', () => {
    const t = allText(buildScene(plan(), { date: DATE, unit: 'mm' }).primitives)
    expect(t).toContain('764')
    expect(t).toContain('1000')
  })

  it('n’affiche la perte due au trait de scie que si l’option est active', () => {
    expect(allText(buildScene(plan(), { date: DATE }).primitives).join(' ')).not.toContain('Trait de scie')
    const on = allText(buildScene(plan({ sawKerfEnabled: true, sawKerf: 3 }), { date: DATE }).primitives).join(' ')
    expect(on).toContain('Trait de scie')
    expect(on).toContain('6 coupes')
    expect(on).toContain('1,8 cm de bois perdu')
  })

  it('reste dans la page même avec beaucoup de lots, en le signalant', () => {
    const p = plan({ height: 4000, stages: 30 })
    p.shelves.forEach((s, i) => (s.depth = 100 + i))
    const { primitives } = buildScene(p, { date: DATE })
    expect(allText(primitives).some((s) => s.includes('autres lots'))).toBe(true)
    for (const prim of texts(primitives)) expect(prim.y).toBeLessThanOrEqual(PAGE.height - 8)
  })
})

describe('fixation murale', () => {
  it('ajoute la note et le repère F seulement si l’option est active', () => {
    const off = allText(buildScene(plan(), { date: DATE }).primitives)
    expect(off.join(' ')).not.toContain('Fixation murale')
    expect(off).not.toContain('F')

    const on = allText(buildScene(plan({ wallMount: true }), { date: DATE }).primitives)
    expect(on.join(' ')).toContain('Fixation murale')
    expect(on.filter((s) => s === 'F')).toHaveLength(2) // sur le mur et dans la légende
  })

  it('indique le mur dans la vue de profil', () => {
    expect(allText(buildScene(plan(), { date: DATE }).primitives)).toContain('MUR')
  })
})

describe('notes', () => {
  it('décrit la position des tablettes du haut et du bas', () => {
    expect(allText(buildScene(plan(), { date: DATE }).primitives).join(' ')).toContain('entre les montants')
    expect(allText(buildScene(plan({ framePlacement: 'onTop' }), { date: DATE }).primitives).join(' ')).toContain('posées sur et sous')
  })

  it('mentionne le jeu des cales quand il y en a', () => {
    expect(allText(buildScene(plan({}, 1), { date: DATE }).primitives).join(' ')).toContain('0,1 cm de jeu')
    expect(allText(buildScene(plan(), { date: DATE }).primitives).join(' ')).not.toContain('de jeu')
  })
})

describe('outils de texte', () => {
  it('formate la date en jj/mm/aaaa', () => {
    expect(formatDate(new Date(2026, 0, 5))).toBe('05/01/2026')
    expect(formatDate(new Date(2026, 11, 31))).toBe('31/12/2026')
  })

  it('coupe un texte long en lignes qui tiennent dans la largeur', () => {
    const lines = wrapText('un deux trois quatre cinq six sept huit neuf dix', 30, 7)
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.join(' ')).toBe('un deux trois quatre cinq six sept huit neuf dix')
  })

  it('ne coupe pas un texte court', () => {
    expect(wrapText('court', 90, 7)).toEqual(['court'])
  })
})
