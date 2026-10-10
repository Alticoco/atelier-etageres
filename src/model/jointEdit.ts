import { fail, finish, type EditResult } from './edit'
import { DEFAULT_NOTCHED, SCREWED, type Side } from './joints'
import { propagateWidth } from './propagation'
import type { Joint, Plan } from './types'

/**
 * Change l'assemblage d'un côté (modèle avec cadre seulement). Passer un côté à encoches propose 10 cm qui dépassent ;
 * repasser en « vissé » remet les valeurs d'origine. Un changement de longueur qui dépasse déplace le corps de
 * l'étagère : avec la propagation, les cales gardent leur position proportionnelle.
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

  if (plan.options.propagation) propagateWidth(plan, next)
  return finish(next)
}
