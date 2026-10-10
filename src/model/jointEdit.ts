import { fail, finish, type EditResult } from './edit'
import { DEFAULT_NOTCHED, MAX_OVERHANG, SCREWED, jointOf, type Side } from './joints'
import { propagateWidth } from './propagation'
import type { Joint, Plan } from './types'

/**
 * Change l'assemblage d'un côté (modèle avec cadre seulement). Passer un côté à encoches propose 10 cm qui dépassent ;
 * repasser en « vissé » remet les valeurs d'origine. Le montant ne bouge pas : ce sont les tablettes qui s'allongent
 * (ou raccourcissent) à l'extérieur, donc la largeur hors-tout change. Les cales et les supports du côté gauche suivent
 * le décalage de l'origine pour rester à la même place par rapport au montant.
 */
export function setJoint(plan: Plan, side: Side, patch: Partial<Joint>): EditResult {
  if (plan.model !== 'frame') return fail('Les encoches concernent seulement le modèle avec cadre.')
  const next = structuredClone(plan)
  const current = next.joints ?? { left: { ...SCREWED }, right: { ...SCREWED } }
  let joint: Joint = { ...current[side], ...patch }

  if (patch.type === 'screwed') joint = { ...SCREWED }
  if (patch.type === 'notched' && current[side].type === 'screwed') joint = { ...DEFAULT_NOTCHED, ...patch }
  // Un bout droit n'a pas de taille ; un bout arrondi ou en biais en propose une par défaut.
  if (patch.endStyle === 'straight') joint.endSize = 0
  if (patch.endStyle === 'round' && patch.endSize === undefined) joint.endSize = Math.min(20, joint.overhang || 20)
  if (patch.endStyle === 'bevel' && patch.endSize === undefined) {
    // 45° si ça tient ; sinon le plus grand angle qui n'entame pas le montant avec la longueur qui dépasse.
    const maxDepth = Math.max(1, ...plan.shelves.map((s) => s.depth))
    const fits = Math.floor((Math.atan(joint.overhang / maxDepth) * 180) / Math.PI)
    joint.endSize = Math.max(1, Math.min(45, fits))
  }

  current[side] = joint
  if (current.left.type === 'screwed' && current.right.type === 'screwed') delete next.joints
  else next.joints = current

  const before = { left: jointOf(plan, 'left').overhang, right: jointOf(plan, 'right').overhang }
  const after = { left: jointOf(next, 'left').overhang, right: jointOf(next, 'right').overhang }
  const shiftLeft = after.left - before.left
  next.width += shiftLeft + (after.right - before.right)
  if (shiftLeft !== 0) {
    for (const wedge of next.wedges) wedge.x += shiftLeft
    for (const support of next.supports ?? []) support.x += shiftLeft
  }
  return finish(next)
}

/**
 * Glisse le montant d'un côté à encoches : la largeur hors-tout ne change pas, c'est la longueur de tablette qui dépasse
 * (`overhang`) qui devient la distance entre le bord et le montant. Avec la propagation, les cales gardent leur
 * position proportionnelle entre les montants.
 */
export function moveUpright(plan: Plan, side: Side, overhang: number): EditResult {
  if (plan.model !== 'frame' || jointOf(plan, side).type !== 'notched') {
    return fail('Seul un montant à encoches peut glisser.')
  }
  if (!Number.isInteger(overhang) || overhang < 0 || overhang > MAX_OVERHANG) {
    return fail(`La longueur qui dépasse va de 0 à ${MAX_OVERHANG / 10} cm.`)
  }
  const next = structuredClone(plan)
  next.joints![side].overhang = overhang
  if (plan.options.propagation) propagateWidth(plan, next)
  return finish(next)
}
