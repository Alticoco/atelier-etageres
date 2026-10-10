import type { EndStyle, Joint, Notch, PieceEnd, Plan, Shelf } from './types'

/**
 * Assemblages du modèle `frame` : montant vissé ou à encoches, forme du bout de tablette qui dépasse.
 * Fonctions pures, sans dépendance au reste du modèle (la géométrie les utilise).
 */
export type Side = 'left' | 'right'

export const SCREWED: Joint = { type: 'screwed', overhang: 0, endStyle: 'straight', endSize: 0 }
/** Valeurs proposées quand on passe un côté à encoches : 10 cm qui dépassent, bout droit. */
export const DEFAULT_NOTCHED: Joint = { type: 'notched', overhang: 100, endStyle: 'straight', endSize: 0 }
export const MAX_OVERHANG = 1000
export const MAX_BEVEL_ANGLE = 80

/** Assemblage effectif d'un côté : toujours « vissé » hors du modèle avec cadre. */
export function jointOf(plan: Plan, side: Side): Joint {
  if (plan.model !== 'frame') return SCREWED
  return plan.joints?.[side] ?? SCREWED
}

export function isNotched(plan: Plan, side: Side): boolean {
  return jointOf(plan, side).type === 'notched'
}

/** Profondeur d'une encoche : la moitié de la plus petite des deux profondeurs (assemblage à mi-bois). */
export function notchDepth(uprightDepth: number, shelfDepth: number): number {
  return Math.floor(Math.min(uprightDepth, shelfDepth) / 2)
}

/** Raccourcissement du côté avant d'un bout coupé en biais : profondeur × tan(angle). */
export function bevelCut(depth: number, angleDeg: number): number {
  return Math.round(depth * Math.tan((angleDeg * Math.PI) / 180))
}

/** Une tablette traverse-t-elle les montants à encoches ? Non si elle est posée sur / sous les montants. */
function passesThrough(plan: Plan, isOuter: boolean): boolean {
  return !(isOuter && plan.options.framePlacement === 'onTop')
}

function addNotch(list: Notch[], width: number, depth: number, count = 1) {
  const found = list.find((n) => n.width === width && n.depth === depth)
  if (found) found.count += count
  else list.push({ width, depth, count })
}

/** Encoches d'un montant du modèle `frame` : une par tablette qui le traverse. Undefined s'il n'en a pas. */
export function uprightNotches(plan: Plan, side: Side, shelvesBottomToTop: Shelf[]): Notch[] | undefined {
  if (!isNotched(plan, side)) return undefined
  const upright = side === 'left' ? plan.leftUpright : plan.rightUpright
  const list: Notch[] = []
  shelvesBottomToTop.forEach((shelf, i) => {
    const isOuter = i === 0 || i === shelvesBottomToTop.length - 1
    if (passesThrough(plan, isOuter)) addNotch(list, shelf.thickness, notchDepth(upright.depth, shelf.depth))
  })
  return list.length > 0 ? list.sort((a, b) => a.width - b.width || a.depth - b.depth) : undefined
}

/** Encoches d'une tablette : une par côté à encoches (si elle traverse le montant). */
export function shelfNotches(plan: Plan, shelf: Shelf, isOuter: boolean): Notch[] | undefined {
  if (!passesThrough(plan, isOuter)) return undefined
  const list: Notch[] = []
  for (const side of ['left', 'right'] as const) {
    if (!isNotched(plan, side)) continue
    const upright = side === 'left' ? plan.leftUpright : plan.rightUpright
    addNotch(list, upright.thickness, notchDepth(upright.depth, shelf.depth))
  }
  return list.length > 0 ? list : undefined
}

/** Forme du bout d'une tablette du côté demandé, ou undefined si le bout est droit (ou le côté vissé). */
export function shelfEnd(plan: Plan, side: Side): PieceEnd | undefined {
  const joint = jointOf(plan, side)
  if (joint.type !== 'notched' || joint.endStyle === 'straight') return undefined
  return { style: joint.endStyle, size: joint.endSize }
}

/** Problèmes de cohérence des assemblages (liste vide = tout va bien). */
export function jointProblems(plan: Plan): string[] {
  if (plan.model !== 'frame' || !plan.joints) return []
  const maxDepth = Math.max(0, ...plan.shelves.map((s) => s.depth))
  const minDepth = Math.min(...plan.shelves.map((s) => s.depth))
  for (const side of ['left', 'right'] as const) {
    const j = plan.joints[side]
    const name = side === 'left' ? 'gauche' : 'droit'
    if (j.type !== 'screwed' && j.type !== 'notched') return ['Type d’assemblage inconnu.']
    if (j.type === 'screwed') continue
    if (!Number.isInteger(j.overhang) || j.overhang < 0 || j.overhang > MAX_OVERHANG) {
      return [`Côté ${name} : la longueur qui dépasse va de 0 à ${MAX_OVERHANG / 10} cm.`]
    }
    if (j.endStyle !== 'straight' && j.endStyle !== 'round' && j.endStyle !== 'bevel') return ['Forme de bout inconnue.']
    if (j.endStyle === 'round') {
      const limit = Math.min(j.overhang, Math.floor(minDepth / 2))
      if (!Number.isInteger(j.endSize) || j.endSize < 1) return [`Côté ${name} : le rayon doit être d’au moins 1 mm.`]
      if (j.endSize > limit) {
        return [`Côté ${name} : le rayon ne peut pas dépasser ${limit / 10} cm (la longueur qui dépasse, et la moitié de la profondeur de la plus fine tablette).`]
      }
    }
    if (j.endStyle === 'bevel') {
      if (!Number.isInteger(j.endSize) || j.endSize < 1 || j.endSize > MAX_BEVEL_ANGLE) {
        return [`Côté ${name} : l’angle de coupe va de 1° à ${MAX_BEVEL_ANGLE}°.`]
      }
      if (bevelCut(maxDepth, j.endSize) > j.overhang) {
        return [`Côté ${name} : la coupe en biais à ${j.endSize}° entamerait le montant ; augmentez la longueur qui dépasse ou réduisez l’angle.`]
      }
    }
  }
  return []
}

/**
 * Contour d'un bout de tablette vue de dessous, en chemin SVG (x vers la droite, z = recul depuis le mur vers le bas).
 * `x`, `width`, `depth` : emprise de la tablette. Un bout en biais est raccourci côté avant ; un bout arrondi a ses
 * deux coins arrondis.
 */
export function shelfFootprintPath(
  x: number,
  width: number,
  depth: number,
  left: PieceEnd | undefined,
  right: PieceEnd | undefined,
): string {
  const r = (end: PieceEnd | undefined) => (end?.style === 'round' ? end.size : 0)
  const cut = (end: PieceEnd | undefined) => (end?.style === 'bevel' ? bevelCut(depth, end.size) : 0)
  const rl = r(left)
  const rr = r(right)
  const xl = x
  const xr = x + width
  const flx = xl + cut(left)
  const frx = xr - cut(right)
  const f = (n: number) => Math.round(n * 100) / 100
  const arc = (rad: number, px: number, pz: number) => (rad > 0 ? ` A ${f(rad)} ${f(rad)} 0 0 1 ${f(px)} ${f(pz)}` : '')
  return [
    `M ${f(xl + rl)} 0`,
    `L ${f(xr - rr)} 0`,
    arc(rr, xr, rr),
    `L ${f(frx)} ${f(depth - rr)}`,
    arc(rr, frx - rr, depth),
    `L ${f(flx + rl)} ${f(depth)}`,
    arc(rl, flx, depth - rl),
    `L ${f(xl)} ${f(rl)}`,
    arc(rl, xl + rl, 0),
    'Z',
  ].join('')
}

export function endLabel(style: EndStyle): string {
  return style === 'round' ? 'arrondi' : style === 'bevel' ? 'coupé en biais' : 'droit'
}
