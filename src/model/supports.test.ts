import { describe, expect, it } from 'vitest'
import { computeCutList } from './cutlist'
import { createPlan } from './plan'
import { parsePlan } from './serialize'
import { removePieces } from './tools'
import {
  addSupport,
  alignSupportFront,
  duplicateSupport,
  dragSupport,
  frontDepth,
  setSupportProperty,
  supportGroups,
  supportOverflow,
} from './supports'
import type { Plan } from './types'

// 800 × 1000 × 250, montants de 18.
const base = () => createPlan({ width: 800, height: 1000, depth: 250, stages: 3, uprightThickness: 18, shelfThickness: 18 })

function withSupport(placement: 'under' | 'left' | 'right' = 'under'): { plan: Plan; id: string } {
  const r = addSupport(base(), placement)
  if (!r.ok) throw new Error(r.error)
  return { plan: r.plan, id: r.id }
}

describe('supports', () => {
  it('un support « sous » est collé à l’avant, contre le dessous du cadre, avec un petit gap derrière', () => {
    const { plan } = withSupport('under')
    expect(plan.supports).toEqual([{ id: 'support-1', x: 0, y: -40, z: 150, width: 100, height: 40, depth: 100 }])
    expect(frontDepth(plan)).toBe(250)
  })

  it('les supports suivants sous l’étagère se répartissent : bord gauche, bord droit, milieu', () => {
    let plan = base()
    for (let i = 0; i < 3; i++) {
      const r = addSupport(plan, 'under')
      if (!r.ok) throw new Error(r.error)
      plan = r.plan
    }
    expect(plan.supports!.map((s) => s.x)).toEqual([0, 700, 350])
  })

  it('un support latéral est à gauche ou à droite du cadre, contre le mur', () => {
    expect(withSupport('left').plan.supports![0]).toMatchObject({ x: -18, y: 0, z: 0, depth: 250 })
    expect(withSupport('right').plan.supports![0]).toMatchObject({ x: 800 })
  })

  it('refuse les cotes absurdes', () => {
    const { plan, id } = withSupport()
    expect(setSupportProperty(plan, id, 'width', 0).ok).toBe(false)
    expect(setSupportProperty(plan, id, 'z', -1).ok).toBe(false)
    expect(setSupportProperty(plan, id, 'x', 12.5).ok).toBe(false)
    const ok = setSupportProperty(plan, id, 'x', -50)
    expect(ok.ok && ok.plan.supports![0].x).toBe(-50)
  })

  it('« coller à l’avant » ramène la face avant au niveau de la pièce la plus profonde', () => {
    const { plan, id } = withSupport()
    const moved = setSupportProperty(plan, id, 'z', 0)
    if (!moved.ok) throw new Error(moved.error)
    const back = alignSupportFront(moved.plan, id)
    expect(back.ok && back.plan.supports![0].z).toBe(150)
  })

  it('le glisser s’aimante contre le mur, l’avant et le dessous de l’étagère', () => {
    const { plan, id } = withSupport()
    const nearWall = dragSupport(plan, id, { z: 6 }, 10)
    expect(nearWall.supports![0].z).toBe(0)
    const nearFront = dragSupport(plan, id, { z: 144 }, 10)
    expect(nearFront.supports![0].z).toBe(150)
    const nearUnder = dragSupport(plan, id, { y: -46 }, 10)
    expect(nearUnder.supports![0].y).toBe(-40)
    // Sans aimantation (Alt) : le mm entier le plus proche.
    expect(dragSupport(plan, id, { z: 144.4 }, null).supports![0].z).toBe(144)
  })

  it('le glisser ne passe jamais derrière le mur', () => {
    const { plan, id } = withSupport()
    expect(dragSupport(plan, id, { z: -80 }, 10).supports![0].z).toBe(0)
  })

  it('dépassement de l’étagère (pour cadrer les vues)', () => {
    const { plan } = withSupport('left')
    expect(supportOverflow(plan)).toMatchObject({ left: 18, right: 0, below: 0 })
    expect(supportOverflow(withSupport('under').plan)).toMatchObject({ below: 40 })
  })

  it('liste de découpe à part : lots S1, S2 par dimensions, longueur = plus grande cote', () => {
    let plan = base()
    for (const placement of ['under', 'under', 'left'] as const) {
      const r = addSupport(plan, placement)
      if (!r.ok) throw new Error(r.error)
      plan = r.plan
    }
    expect(supportGroups(plan)).toEqual([
      { mark: 'S1', length: 100, width: 100, thickness: 40, quantity: 2, ids: ['support-1', 'support-2'] },
      { mark: 'S2', length: 250, width: 200, thickness: 18, quantity: 1, ids: ['support-3'] },
    ])
    const cut = computeCutList(plan)
    expect(cut.supports).toHaveLength(2)
    // Les supports ne comptent pas dans les pièces de l'étagère.
    expect(cut.totalPieces).toBe(computeCutList(base()).totalPieces)
  })

  it('se supprime comme une pièce, et survit à l’enregistrement', () => {
    const { plan, id } = withSupport()
    const parsed = parsePlan(JSON.parse(JSON.stringify(plan)))
    expect(parsed.ok && parsed.plan.supports).toEqual(plan.supports)
    const removed = removePieces(plan, [id])
    expect(removed.ok && removed.plan.supports).toBeUndefined()
  })

  it('un fichier avec un support invalide est refusé', () => {
    const { plan } = withSupport()
    const bad = JSON.parse(JSON.stringify(plan))
    bad.supports[0].z = -5
    expect(parsePlan(bad).ok).toBe(false)
  })

  it('dupliquer : la copie se place à côté, avec 5 cm d’écart, mêmes dimensions', () => {
    const { plan, id } = withSupport()
    const r = duplicateSupport(plan, id, 'next')
    if (!r.ok) throw new Error(r.error)
    expect(r.plan.supports).toHaveLength(2)
    expect(r.plan.supports![1]).toEqual({ ...plan.supports![0], id: 'support-2', x: 150 })
    expect(r.id).toBe('support-2')
  })

  it('dupliquer le dernier support à droite : la copie passe à sa gauche', () => {
    const { plan, id } = withSupport()
    const moved = setSupportProperty(plan, id, 'x', 700)
    if (!moved.ok) throw new Error(moved.error)
    const r = duplicateSupport(moved.plan, id, 'next')
    expect(r.ok && r.plan.supports![1].x).toBe(550)
  })

  it('copie symétrique : de l’autre côté de l’étagère ; refus si déjà au milieu', () => {
    const { plan, id } = withSupport()
    const r = duplicateSupport(plan, id, 'mirror')
    expect(r.ok && r.plan.supports![1].x).toBe(700)
    const centered = setSupportProperty(plan, id, 'x', 350)
    if (!centered.ok) throw new Error(centered.error)
    expect(duplicateSupport(centered.plan, id, 'mirror').ok).toBe(false)
  })

  it('planche de base sans support : sous toute l’étagère', () => {
    const r = addSupport(base(), 'base')
    if (!r.ok) throw new Error(r.error)
    expect(r.plan.supports![0]).toEqual({ id: 'support-1', x: 0, y: -18, z: 0, width: 800, height: 18, depth: 250 })
  })

  it('planche de base : sous les supports du dessous, de leur plus à gauche à leur plus à droite', () => {
    let plan = base()
    for (let i = 0; i < 2; i++) {
      const r = addSupport(plan, 'under')
      if (!r.ok) throw new Error(r.error)
      plan = r.plan
    }
    const r = addSupport(plan, 'base')
    if (!r.ok) throw new Error(r.error)
    // Supports en x = 0 et 700 (100 de large, 40 de haut, z = 150, profondeur 100).
    expect(r.plan.supports![2]).toEqual({ id: 'support-3', x: 0, y: -58, z: 150, width: 800, height: 18, depth: 100 })
  })
})
