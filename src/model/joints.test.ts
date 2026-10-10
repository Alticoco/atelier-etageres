import { describe, expect, it } from 'vitest'
import { computeCutList, describeJoinery } from './cutlist'
import { checkPlan } from './edit'
import { setJoint } from './jointEdit'
import { bevelCut, shelfFootprintPath } from './joints'
import { computeFrontRects } from './layout'
import { computePieces } from './pieces'
import { createPlan } from './plan'
import { parsePlan } from './serialize'
import type { Plan } from './types'

// 800 × 1000 × 250, 3 étages (4 tablettes), bois de 18 : le cas courant, assemblage vissé.
const params = { width: 800, height: 1000, depth: 250, stages: 3, uprightThickness: 18, shelfThickness: 18 }
const base = (): Plan => createPlan(params)

function notchedLeft(patch: Parameters<typeof setJoint>[2] = {}): Plan {
  const r = setJoint(base(), 'left', { type: 'notched', ...patch })
  if (!r.ok) throw new Error(r.error)
  return r.plan
}

const rect = (plan: Plan, id: string) => computeFrontRects(plan).find((r) => r.id === id)!

describe('assemblage à encoches (modèle avec cadre)', () => {
  it('par défaut tout est vissé : rien ne change', () => {
    const plan = base()
    expect(plan.joints).toBeUndefined()
    expect(rect(plan, 'upright-left')).toMatchObject({ x: 0, width: 18 })
    expect(rect(plan, 'shelf-2')).toMatchObject({ x: 18, width: 764 })
  })

  it('côté gauche à encoches : le montant recule de 10 cm, les tablettes traversent jusqu’au bout', () => {
    const plan = notchedLeft()
    expect(plan.joints!.left).toEqual({ type: 'notched', overhang: 100, endStyle: 'straight', endSize: 0 })
    expect(rect(plan, 'upright-left').x).toBe(100)
    // La tablette part du bout qui dépasse (x = 0) et va jusqu'au montant droit (vissé, face intérieure à 782).
    expect(rect(plan, 'shelf-2')).toMatchObject({ x: 0, width: 782 })
    // Le montant droit ne bouge pas.
    expect(rect(plan, 'upright-right').x).toBe(782)
    expect(checkPlan(plan)).toEqual([])
  })

  it('les deux côtés à encoches : tablettes sur toute la largeur hors-tout', () => {
    const left = setJoint(base(), 'left', { type: 'notched', overhang: 50 })
    if (!left.ok) throw new Error(left.error)
    const both = setJoint(left.plan, 'right', { type: 'notched', overhang: 70 })
    if (!both.ok) throw new Error(both.error)
    expect(rect(both.plan, 'shelf-2')).toMatchObject({ x: 0, width: 800 })
    expect(rect(both.plan, 'upright-left').x).toBe(50)
    expect(rect(both.plan, 'upright-right').x).toBe(800 - 70 - 18)
  })

  it('encoches à mi-bois dans la liste des pièces : une par tablette dans le montant, une par côté dans chaque tablette', () => {
    const pieces = computePieces(notchedLeft())
    const upright = pieces.find((p) => p.id === 'upright-left')!
    expect(upright.notches).toEqual([{ width: 18, depth: 125, count: 4 }])
    expect(pieces.find((p) => p.id === 'upright-right')!.notches).toBeUndefined()
    expect(pieces.find((p) => p.id === 'shelf-2')!.notches).toEqual([{ width: 18, depth: 125, count: 1 }])
  })

  it('tablettes du haut et du bas posées sur / sous les montants : pas d’encoche pour elles', () => {
    const plan = notchedLeft()
    plan.options.framePlacement = 'onTop'
    const pieces = computePieces(plan)
    expect(pieces.find((p) => p.id === 'upright-left')!.notches).toEqual([{ width: 18, depth: 125, count: 2 }])
    expect(pieces.find((p) => p.id === 'shelf-1')!.notches).toBeUndefined()
    expect(pieces.find((p) => p.id === 'shelf-2')!.notches).toBeDefined()
  })

  it('bout arrondi : le rayon est limité par la longueur qui dépasse et la profondeur', () => {
    expect(setJoint(notchedLeft(), 'left', { endStyle: 'round', endSize: 30 }).ok).toBe(true)
    const tooBig = setJoint(notchedLeft(), 'left', { endStyle: 'round', endSize: 101 })
    expect(tooBig.ok).toBe(false)
    expect(!tooBig.ok && tooBig.error).toContain('rayon')
    expect(setJoint(notchedLeft(), 'left', { endStyle: 'round', endSize: 0 }).ok).toBe(false)
  })

  it('bout en biais : l’angle ne doit pas entamer le montant', () => {
    expect(bevelCut(250, 45)).toBe(250)
    expect(setJoint(notchedLeft(), 'left', { endStyle: 'bevel', endSize: 20 }).ok).toBe(true)
    const tooSharp = setJoint(notchedLeft(), 'left', { endStyle: 'bevel', endSize: 45 })
    expect(tooSharp.ok).toBe(false)
    expect(!tooSharp.ok && tooSharp.error).toContain('biais')
    expect(setJoint(notchedLeft({ overhang: 300 }), 'left', { endStyle: 'bevel', endSize: 45 }).ok).toBe(true)
    expect(setJoint(notchedLeft(), 'left', { endStyle: 'bevel', endSize: 85 }).ok).toBe(false)
  })

  it('choisir « en biais » propose l’angle le plus grand qui tient (jusqu’à 45°)', () => {
    const r = setJoint(notchedLeft(), 'left', { endStyle: 'bevel' })
    expect(r.ok && r.plan.joints!.left.endSize).toBe(21)
    const wide = setJoint(notchedLeft({ overhang: 300 }), 'left', { endStyle: 'bevel' })
    expect(wide.ok && wide.plan.joints!.left.endSize).toBe(45)
  })

  it('les bouts figurent dans les pièces et dans la liste de découpe', () => {
    const r = setJoint(notchedLeft(), 'left', { endStyle: 'round', endSize: 30 })
    if (!r.ok) throw new Error(r.error)
    const shelf = computePieces(r.plan).find((p) => p.id === 'shelf-2')!
    expect(shelf.endLeft).toEqual({ style: 'round', size: 30 })
    expect(shelf.endRight).toBeUndefined()
    const { groups } = computeCutList(r.plan)
    const shelves = groups.filter((g) => g.pieceIds.some((id) => id.startsWith('shelf')))
    expect(shelves).toHaveLength(1)
    expect(describeJoinery(shelves[0], 'cm')).toBe('1 enc. 1,8 × 12,5 cm · bout gauche arrondi R 3 cm')
  })

  it('un plan vissé n’a ni encoche ni bout dans sa liste de découpe', () => {
    for (const g of computeCutList(base()).groups) {
      expect(g.notches).toBeUndefined()
      expect(describeJoinery(g)).toBe('—')
    }
  })

  it('les cales gardent leur place relative quand le corps de l’étagère rétrécit', () => {
    const plan = base()
    plan.wedges.push({ id: 'wedge-1', shelfBelowId: 'shelf-1', x: 400, thickness: 18, depth: 250, cornerRadius: 0, edgeRadius: 0 })
    const r = setJoint(plan, 'left', { type: 'notched', overhang: 100 })
    if (!r.ok) throw new Error(r.error)
    const w = r.plan.wedges[0]
    expect(w.x).toBeGreaterThanOrEqual(118)
    expect(w.x + w.thickness).toBeLessThanOrEqual(782)
  })

  it('repasser en vissé efface les réglages ; sans cadre, la fonction est refusée', () => {
    const back = setJoint(notchedLeft(), 'left', { type: 'screwed' })
    expect(back.ok && back.plan.joints).toBeUndefined()
    const frameless = createPlan({ ...params, model: 'frameless' })
    expect(setJoint(frameless, 'left', { type: 'notched' }).ok).toBe(false)
  })

  it('contour de la tablette vue de dessous : rectangle, biseau ou arrondi', () => {
    expect(shelfFootprintPath(0, 800, 250, undefined, undefined)).toBe('M 0 0L 800 0L 800 250L 0 250L 0 0Z')
    const bevel = shelfFootprintPath(0, 800, 250, { style: 'bevel', size: 20 }, undefined)
    expect(bevel).toContain('L 91 250')
    const round = shelfFootprintPath(0, 800, 250, { style: 'round', size: 30 }, undefined)
    expect(round).toContain('A 30 30 0 0 1')
  })

  it('survit à l’enregistrement et refuse un assemblage inconnu', () => {
    const plan = notchedLeft({ endStyle: 'bevel', endSize: 20 })
    const parsed = parsePlan(JSON.parse(JSON.stringify(plan)))
    expect(parsed.ok && parsed.plan.joints).toEqual(plan.joints)
    const bad = JSON.parse(JSON.stringify(plan))
    bad.joints.left.type = 'collé'
    expect(parsePlan(bad).ok).toBe(false)
    const incoherent = JSON.parse(JSON.stringify(plan))
    incoherent.joints.left.endSize = 80
    expect(parsePlan(incoherent).ok).toBe(false)
  })
})
