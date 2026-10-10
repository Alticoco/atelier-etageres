import { describe, expect, it } from 'vitest'
import { colorOf, colorableIds, effectiveColor, isColor, setCategoryColor, setPieceColors } from './colors'
import { computeCutList } from './cutlist'
import { createPlan } from './plan'
import { buildScene3D } from './scene3d'
import { parsePlan } from './serialize'
import { addSupport } from './supports'
import { removePieces } from './tools'
import type { Plan } from './types'

const base = (): Plan => createPlan({ width: 800, height: 1000, depth: 250, stages: 3, uprightThickness: 18, shelfThickness: 18 })
const ok = (r: { ok: boolean; plan?: Plan; error?: string }): Plan => {
  if (!r.ok || !r.plan) throw new Error(r.error)
  return r.plan
}

describe('couleurs d’affichage', () => {
  it('par défaut : aucune couleur choisie, couleurs de la 3D inchangées', () => {
    const plan = base()
    expect(plan.colors).toBeUndefined()
    expect(colorOf(plan, 'shelf-1', 'shelf')).toBeUndefined()
    expect(effectiveColor(plan, 'shelf-1', 'shelf')).toBe('#dcb985')
  })

  it('une couleur par catégorie : toutes les tablettes, mais pas les montants', () => {
    const plan = ok(setCategoryColor(base(), 'shelf', '#7B5434'))
    expect(colorOf(plan, 'shelf-2', 'shelf')).toBe('#7b5434')
    expect(colorOf(plan, 'upright-left', 'upright')).toBeUndefined()
  })

  it('la couleur d’une pièce l’emporte sur celle de sa catégorie ; « par défaut » la rend', () => {
    let plan = ok(setCategoryColor(base(), 'shelf', '#7b5434'))
    plan = ok(setPieceColors(plan, ['shelf-2'], '#4f7cac'))
    expect(colorOf(plan, 'shelf-2', 'shelf')).toBe('#4f7cac')
    expect(colorOf(plan, 'shelf-3', 'shelf')).toBe('#7b5434')
    plan = ok(setPieceColors(plan, ['shelf-2'], null))
    expect(colorOf(plan, 'shelf-2', 'shelf')).toBe('#7b5434')
    plan = ok(setCategoryColor(plan, 'shelf', null))
    expect(plan.colors).toBeUndefined()
  })

  it('les cales, les montants d’étage et les supports sont colorables ; un objet de simulation non', () => {
    let plan = base()
    plan.wedges.push({ id: 'wedge-1', shelfBelowId: 'shelf-1', x: 300, thickness: 18, depth: 250, cornerRadius: 0, edgeRadius: 0 })
    plan = ok(addSupport(plan, 'under'))
    expect(colorableIds(plan, ['wedge-1', 'support-1', 'upright-left', 'vertical-left-shelf-1', 'obj:row-1:0', 'inconnu'])).toEqual([
      'wedge-1',
      'support-1',
      'upright-left',
      'vertical-left-shelf-1',
    ])
    expect(setPieceColors(plan, ['obj:row-1:0'], '#4f7cac').ok).toBe(false)
  })

  it('refuse une couleur qui n’est pas #rrggbb', () => {
    expect(isColor('#12abEF')).toBe(true)
    for (const bad of ['rouge', '#fff', '#12345g', 'url(#x)', '']) {
      expect(isColor(bad)).toBe(false)
      expect(setCategoryColor(base(), 'shelf', bad).ok).toBe(false)
    }
  })

  it('les couleurs n’ont aucun effet sur la liste de découpe', () => {
    const colored = ok(setCategoryColor(base(), 'wedge', '#c8603f'))
    expect(computeCutList(colored)).toEqual(computeCutList(base()))
  })

  it('la couleur d’une pièce supprimée disparaît du plan', () => {
    let plan = base()
    plan.wedges.push({ id: 'wedge-1', shelfBelowId: 'shelf-1', x: 300, thickness: 18, depth: 250, cornerRadius: 0, edgeRadius: 0 })
    plan = ok(setPieceColors(plan, ['wedge-1'], '#c8603f'))
    expect(plan.colors?.pieces).toEqual({ 'wedge-1': '#c8603f' })
    const removed = ok(removePieces(plan, ['wedge-1']))
    // Le nettoyage a lieu à la prochaine modification de couleur.
    const next = ok(setCategoryColor(removed, 'shelf', '#7b5434'))
    expect(next.colors).toEqual({ shelf: '#7b5434' })
  })

  it('la 3D reprend les couleurs : pièce, support et mur', () => {
    let plan = ok(setCategoryColor(base(), 'shelf', '#7b5434'))
    plan = ok(addSupport(plan, 'under'))
    plan = ok(setPieceColors(plan, ['support-1'], '#2b2b2b'))
    plan = ok(setCategoryColor(plan, 'wall', '#efe3c8'))
    const scene = buildScene3D(plan)
    expect(scene.boxes.find((b) => b.id === 'shelf-1')!.color).toBe('#7b5434')
    expect(scene.boxes.find((b) => b.id === 'upright-left')!.color).toBe('#dcb985')
    expect(scene.boxes.find((b) => b.id === 'support-1')!.color).toBe('#2b2b2b')
    expect(scene.wall.color).toBe('#efe3c8')
  })

  it('survit à l’enregistrement et refuse un fichier piégé', () => {
    let plan = ok(setCategoryColor(base(), 'shelf', '#7b5434'))
    plan = ok(setPieceColors(plan, ['shelf-2'], '#4f7cac'))
    const parsed = parsePlan(JSON.parse(JSON.stringify(plan)))
    expect(parsed.ok && parsed.plan.colors).toEqual(plan.colors)
    const bad = JSON.parse(JSON.stringify(plan))
    bad.colors.shelf = 'url(javascript:alert(1))'
    expect(parsePlan(bad).ok).toBe(false)
    const badPiece = JSON.parse(JSON.stringify(plan))
    badPiece.colors.pieces['shelf-2'] = '<script>'
    expect(parsePlan(badPiece).ok).toBe(false)
    // Un identifiant « __proto__ » ne pollue rien.
    const proto = JSON.parse('{"__proto__":"#112233"}')
    const withProto = JSON.parse(JSON.stringify(plan))
    withProto.colors.pieces = proto
    const r = parsePlan(withProto)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(r.ok).toBe(true)
  })
})
