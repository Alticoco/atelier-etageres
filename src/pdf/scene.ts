import { computeCutList, roundingCode } from '../model/cutlist'
import { computeFrontRects } from '../model/layout'
import { getStages, sortedShelves } from '../model/pieces'
import { computeProfileRects, profileSize } from '../model/profile'
import type { Plan } from '../model/types'
import { formatLength, formatNumber, type LengthUnit } from '../model/units'

/**
 * Plan PDF décrit comme une liste de primitives (traits, rectangles, cercles, textes), toutes en millimètres
 * sur la page, origine en haut à gauche, y vers le bas. Aucune dépendance au PDF : on peut tout tester ici.
 * Les gris vont de 0 (noir) à 1 (blanc) : le plan s'imprime bien en noir et blanc.
 */
export interface LinePrim {
  kind: 'line'
  x1: number
  y1: number
  x2: number
  y2: number
  width: number
  gray: number
  dash?: [number, number]
}

export interface RectPrim {
  kind: 'rect'
  x: number
  y: number
  width: number
  height: number
  strokeWidth: number
  stroke?: number
  fill?: number
  dash?: [number, number]
  /** Rayon des coins (mm sur la page). Absent ou 0 = angles droits. */
  radius?: number
}

export interface CirclePrim {
  kind: 'circle'
  x: number
  y: number
  r: number
  strokeWidth: number
  stroke?: number
  fill?: number
}

export interface TextPrim {
  kind: 'text'
  x: number
  /** Ligne de base du texte. */
  y: number
  text: string
  /** Taille en points. */
  size: number
  bold: boolean
  align: 'left' | 'center' | 'right'
  /** Rotation en degrés, sens inverse des aiguilles d'une montre (90 = texte qui monte). */
  rotate: number
  gray: number
}

export type Primitive = LinePrim | RectPrim | CirclePrim | TextPrim

export interface Scene {
  width: number
  height: number
  /** Dénominateur de l'échelle : 10 pour du 1:10. */
  scaleDenominator: number
  primitives: Primitive[]
}

export interface SceneOptions {
  unit?: LengthUnit
  /** Date affichée dans le cartouche. */
  date?: Date
}

export const PAGE = { width: 297, height: 210 }
const MARGIN = 8
const CARTOUCHE_H = 28
const ZONE_TOP = MARGIN
const ZONE_BOTTOM = PAGE.height - MARGIN - CARTOUCHE_H
const TITLE_H = 12
const FRONT_ZONE = { x1: MARGIN, x2: 128 }
const PROFILE_ZONE = { x1: 128, x2: 188 }
const LIST_ZONE = { x1: 188, x2: PAGE.width - MARGIN }

/** Échelles courantes en dessin technique, de la plus grande à la plus petite. */
const SCALES = [1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200]

/** Place à réserver autour d'un dessin pour ses cotes (mm sur la page). */
const FRONT_MARGINS = { left: 16, right: 14, top: 4, bottom: 12 }
const PROFILE_MARGINS = { left: 10, right: 14, top: 4, bottom: 12 }

const BLACK = 0
const CUT_GRAY = 0.25
const PIECE_FILL = 0.82
const HIDDEN_GRAY = 0.35
const MM_PER_PT = 25.4 / 72

const WALL_NOTE =
  'Fixation murale : fixer l’étagère au mur (équerres ou tasseau) avant de la charger. Choisir chevilles et vis adaptées à la nature du mur.'

export function formatDate(date: Date): string {
  const two = (n: number) => String(n).padStart(2, '0')
  return `${two(date.getDate())}/${two(date.getMonth() + 1)}/${date.getFullYear()}`
}

/** Retour à la ligne approximatif (largeur moyenne d'un caractère ≈ 0,5 em en Helvetica). */
export function wrapText(text: string, widthMm: number, sizePt: number): string[] {
  const maxChars = Math.max(1, Math.floor(widthMm / (sizePt * MM_PER_PT * 0.52)))
  const lines: string[] = []
  let current = ''
  for (const word of text.split(/\s+/)) {
    if (current !== '' && (current + ' ' + word).length > maxChars) {
      lines.push(current)
      current = word
    } else {
      current = current === '' ? word : current + ' ' + word
    }
  }
  if (current !== '') lines.push(current)
  return lines
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1).trimEnd() + '…'
}

function scaleLabel(denominator: number): string {
  return `1:${String(denominator).replace('.', ',')}`
}

/** La plus grande échelle pour laquelle la vue de face et la vue de profil tiennent dans leur zone. */
function chooseScale(plan: Plan): number {
  const depth = profileSize(plan).width
  const drawH = ZONE_BOTTOM - ZONE_TOP - TITLE_H
  const frontW = FRONT_ZONE.x2 - FRONT_ZONE.x1
  const profileW = PROFILE_ZONE.x2 - PROFILE_ZONE.x1
  const fits = (d: number) =>
    plan.width / d + FRONT_MARGINS.left + FRONT_MARGINS.right <= frontW &&
    plan.height / d + FRONT_MARGINS.top + FRONT_MARGINS.bottom <= drawH &&
    depth / d + PROFILE_MARGINS.left + PROFILE_MARGINS.right <= profileW &&
    plan.height / d + PROFILE_MARGINS.top + PROFILE_MARGINS.bottom <= drawH
  return SCALES.find(fits) ?? SCALES[SCALES.length - 1]
}

export function buildScene(plan: Plan, { unit = 'cm', date = new Date() }: SceneOptions = {}): Scene {
  const primitives: Primitive[] = []
  const d = chooseScale(plan)
  const depth = profileSize(plan).width

  // --- Outils de dessin -------------------------------------------------------------------------------------

  const line = (x1: number, y1: number, x2: number, y2: number, width = 0.25, gray = BLACK, dash?: [number, number]) =>
    primitives.push({ kind: 'line', x1, y1, x2, y2, width, gray, dash })

  const rect = (x: number, y: number, width: number, height: number, style: Partial<RectPrim> = {}) =>
    primitives.push({ kind: 'rect', x, y, width, height, strokeWidth: 0.3, stroke: BLACK, ...style })

  const text = (
    x: number,
    y: number,
    value: string,
    size = 7,
    options: Partial<Pick<TextPrim, 'bold' | 'align' | 'rotate' | 'gray'>> = {},
  ) => primitives.push({ kind: 'text', x, y, text: value, size, bold: false, align: 'left', rotate: 0, gray: BLACK, ...options })

  /** Cote horizontale : trait, repères aux extrémités, texte centré sous le trait. */
  const hDim = (x1: number, x2: number, y: number, label: string) => {
    line(x1, y, x2, y, 0.2, CUT_GRAY)
    line(x1, y - 1.2, x1, y + 1.2, 0.2, CUT_GRAY)
    line(x2, y - 1.2, x2, y + 1.2, 0.2, CUT_GRAY)
    text((x1 + x2) / 2, y + 3.4, label, 7, { align: 'center', gray: CUT_GRAY })
  }

  /** Cote verticale : texte tourné, à droite ou à gauche du trait. */
  const vDim = (x: number, y1: number, y2: number, label: string, side: 'left' | 'right') => {
    line(x, y1, x, y2, 0.2, CUT_GRAY)
    line(x - 1.2, y1, x + 1.2, y1, 0.2, CUT_GRAY)
    line(x - 1.2, y2, x + 1.2, y2, 0.2, CUT_GRAY)
    text(side === 'right' ? x + 3.2 : x - 0.8, (y1 + y2) / 2, label, 7, { align: 'center', rotate: 90, gray: CUT_GRAY })
  }

  /** Trait d'attache fin entre un dessin et sa ligne de cote. */
  const extension = (x1: number, y1: number, x2: number, y2: number) => line(x1, y1, x2, y2, 0.12, CUT_GRAY)

  /** Repère : lettre dans une pastille blanche, lisible même sur une pièce de 2 mm. */
  const bubble = (cx: number, cy: number, letter: string) => {
    primitives.push({ kind: 'circle', x: cx, y: cy, r: 1.9, strokeWidth: 0.2, stroke: BLACK, fill: 1 })
    text(cx, cy + 0.75, letter, 6, { bold: true, align: 'center' })
  }

  // --- Cadre de la page et zones ----------------------------------------------------------------------------

  rect(MARGIN, MARGIN, PAGE.width - 2 * MARGIN, PAGE.height - 2 * MARGIN, { strokeWidth: 0.6 })
  line(MARGIN, ZONE_BOTTOM, PAGE.width - MARGIN, ZONE_BOTTOM, 0.4)
  line(PROFILE_ZONE.x1, ZONE_TOP, PROFILE_ZONE.x1, ZONE_BOTTOM, 0.2, 0.5)
  line(LIST_ZONE.x1, ZONE_TOP, LIST_ZONE.x1, ZONE_BOTTOM, 0.2, 0.5)

  const zoneTitle = (x: number, title: string, subtitle?: string) => {
    text(x + 4, ZONE_TOP + 6, title, 8, { bold: true })
    if (subtitle) text(x + 4, ZONE_TOP + 10, subtitle, 6, { gray: 0.4 })
  }
  zoneTitle(FRONT_ZONE.x1, 'VUE DE FACE')
  zoneTitle(PROFILE_ZONE.x1, 'VUE DE PROFIL', 'vue depuis le côté gauche')
  zoneTitle(LIST_ZONE.x1, 'LISTE DE DÉCOUPE', `dimensions en ${unit}`)

  const drawTop = ZONE_TOP + TITLE_H
  const drawH = ZONE_BOTTOM - drawTop

  /** Coin bas-gauche du dessin (mm) pour centrer un dessin de dw × dh dans une zone, cotes comprises. */
  const place = (
    zone: { x1: number; x2: number },
    margins: typeof FRONT_MARGINS,
    dw: number,
    dh: number,
  ): { x0: number; yBottom: number } => {
    const totalW = dw + margins.left + margins.right
    const totalH = dh + margins.top + margins.bottom
    const x0 = zone.x1 + (zone.x2 - zone.x1 - totalW) / 2 + margins.left
    const yBottom = drawTop + (drawH - totalH) / 2 + margins.top + dh
    return { x0, yBottom }
  }

  // --- Vue de face ------------------------------------------------------------------------------------------

  const frontW = plan.width / d
  const frontH = plan.height / d
  const front = place(FRONT_ZONE, FRONT_MARGINS, frontW, frontH)
  const fx = (x: number) => front.x0 + x / d
  const fy = (y: number) => front.yBottom - y / d

  const cutList = computeCutList(plan)

  for (const r of computeFrontRects(plan)) {
    rect(fx(r.x), fy(r.y + r.height), r.width / d, r.height / d, {
      fill: r.kind === 'wedge' ? 1 : PIECE_FILL,
      dash: r.kind === 'wedge' ? [1.2, 0.8] : undefined,
      radius: r.cornerRadius > 0 ? r.cornerRadius / d : undefined,
    })
  }
  for (const r of computeFrontRects(plan)) bubble(fx(r.x + r.width / 2), fy(r.y + r.height / 2), cutList.marks[r.id])

  // Largeur hors-tout, sous le dessin.
  const widthLine = front.yBottom + 8
  extension(fx(0), front.yBottom + 0.8, fx(0), widthLine + 1.5)
  extension(fx(plan.width), front.yBottom + 0.8, fx(plan.width), widthLine + 1.5)
  hDim(fx(0), fx(plan.width), widthLine, formatLength(plan.width, unit))

  // Hauteur hors-tout, à droite.
  const heightLine = fx(plan.width) + 8
  extension(fx(plan.width) + 0.8, fy(0), heightLine + 1.5, fy(0))
  extension(fx(plan.width) + 0.8, fy(plan.height), heightLine + 1.5, fy(plan.height))
  vDim(heightLine, fy(plan.height), fy(0), formatLength(plan.height, unit), 'right')

  // Hauteur libre de chaque étage, à gauche.
  const stageLine = fx(0) - 8
  for (const stage of getStages(plan)) {
    const top = fy(stage.y + stage.clearHeight)
    const bottom = fy(stage.y)
    extension(fx(0) - 0.8, top, stageLine - 1.5, top)
    extension(fx(0) - 0.8, bottom, stageLine - 1.5, bottom)
    vDim(stageLine, top, bottom, formatLength(stage.clearHeight, unit), 'left')
  }

  // --- Vue de profil ----------------------------------------------------------------------------------------

  const profile = place(PROFILE_ZONE, PROFILE_MARGINS, depth / d, frontH)
  const px = (x: number) => profile.x0 + x / d
  const py = (y: number) => profile.yBottom - y / d

  // Mur : bande hachurée à gauche du dessin.
  const wallW = 3
  const wallTop = py(plan.height)
  rect(px(0) - wallW, wallTop, wallW, frontH, { fill: 0.92, strokeWidth: 0.2 })
  for (let t = 3; t <= frontH; t += 3) line(px(0) - wallW, wallTop + t, px(0), wallTop + t - 3, 0.1, 0.5)
  text(px(0) - wallW - 1, (wallTop + py(0)) / 2, 'MUR', 6, { align: 'center', rotate: 90, gray: 0.4 })

  const profileRects = computeProfileRects(plan)
  for (const r of profileRects.filter((p) => !p.hidden)) {
    rect(px(r.x), py(r.y + r.height), r.width / d, r.height / d, { fill: PIECE_FILL, radius: r.radius > 0 ? r.radius / d : undefined })
  }
  for (const r of profileRects.filter((p) => p.hidden)) {
    rect(px(r.x), py(r.y + r.height), r.width / d, r.height / d, {
      stroke: HIDDEN_GRAY,
      strokeWidth: 0.2,
      dash: [1.2, 0.8],
      radius: r.radius > 0 ? r.radius / d : undefined,
    })
  }

  const depthLine = profile.yBottom + 8
  extension(px(0), profile.yBottom + 0.8, px(0), depthLine + 1.5)
  extension(px(depth), profile.yBottom + 0.8, px(depth), depthLine + 1.5)
  hDim(px(0), px(depth), depthLine, formatLength(depth, unit))

  const profileHeightLine = px(depth) + 8
  extension(px(depth) + 0.8, py(0), profileHeightLine + 1.5, py(0))
  extension(px(depth) + 0.8, py(plan.height), profileHeightLine + 1.5, py(plan.height))
  vDim(profileHeightLine, py(plan.height), py(0), formatLength(plan.height, unit), 'right')

  // Repère de fixation murale : pastille « F » sur le mur, à hauteur de la tablette du haut.
  if (plan.options.wallMount) {
    const top = sortedShelves(plan).at(-1)
    const fyPos = top ? py(top.y + top.thickness / 2) : py(plan.height)
    const cx = px(0) - wallW - 3.4
    line(cx + 1.9, fyPos, px(0) - wallW, fyPos, 0.2)
    bubble(cx, fyPos, 'F')
  }

  // --- Liste de découpe et notes ----------------------------------------------------------------------------

  const listX = LIST_ZONE.x1 + 3
  const listW = LIST_ZONE.x2 - LIST_ZONE.x1 - 6
  const columns = [9, 8, 18, 16, 12, 14, 18]
  const columnEdges = columns.reduce<number[]>((acc, w) => [...acc, acc[acc.length - 1] + w], [listX])
  const headers = ['Rep.', 'Qté', 'Long.', 'Larg.', 'Ép.', 'Arrondi', 'Pièces']
  const kindNames: Record<string, string> = { upright: 'Montants', shelf: 'Tablettes', wedge: 'Cales' }
  const kindOf = (id: string) => (id.startsWith('shelf') ? 'shelf' : id.startsWith('wedge') ? 'wedge' : 'upright')
  const designation = (ids: string[]) => {
    const kinds = new Set(ids.map(kindOf))
    return kinds.size === 1 ? (kindNames[[...kinds][0]] ?? '') : 'Mixte'
  }

  const tableTop = drawTop + 2
  let y = tableTop
  const headerH = 6.5
  const notesReserve = 62
  const maxRows = Math.max(1, Math.floor((ZONE_BOTTOM - 4 - notesReserve - (y + headerH)) / 3.8))
  const groups = cutList.groups
  const shown = groups.length > maxRows ? groups.slice(0, maxRows - 1) : groups
  const rowH = Math.min(6, (ZONE_BOTTOM - 4 - notesReserve - (y + headerH)) / (shown.length + (groups.length > maxRows ? 1 : 0)))

  rect(listX, y, listW, headerH, { fill: 0.9, strokeWidth: 0.25 })
  headers.forEach((h, i) => {
    const right = i >= 1 && i <= 4
    text(right ? columnEdges[i + 1] - 1.5 : columnEdges[i] + 1.5, y + 4.4, h, 7, { bold: true, align: right ? 'right' : 'left' })
  })
  y += headerH

  const row = (cells: string[], bold = false) => {
    cells.forEach((cell, i) => {
      const right = i >= 1 && i <= 4
      text(right ? columnEdges[i + 1] - 1.5 : columnEdges[i] + 1.5, y + rowH * 0.7, cell, 7, { bold: bold || i === 0, align: right ? 'right' : 'left' })
    })
    line(listX, y + rowH, listX + listW, y + rowH, 0.15, 0.6)
    y += rowH
  }
  for (const group of shown) {
    row([
      group.mark,
      String(group.quantity),
      formatNumber(group.length, unit),
      formatNumber(group.width, unit),
      formatNumber(group.thickness, unit),
      roundingCode(group.cornerRadius, group.edgeRadius, unit),
      designation(group.pieceIds),
    ])
  }
  if (groups.length > shown.length) row(['', '', `+ ${groups.length - shown.length} autres lots`, '', '', '', ''])
  for (const x of columnEdges.slice(1, -1)) line(x, tableTop, x, y, 0.15, 0.6)
  rect(listX, tableTop, listW, y - tableTop, { strokeWidth: 0.3 })

  y += 5
  text(listX, y, `Total : ${cutList.totalPieces} pièces à découper`, 7.5, { bold: true })
  y += 4.5
  const writeLines = (lines: string[], x = listX, size = 7) => {
    for (const l of lines) {
      if (y > ZONE_BOTTOM - 2) return
      text(x, y, l, size)
      y += size * MM_PER_PT * 1.35
    }
  }
  if (cutList.sawKerf) {
    const { cuts, kerf, loss } = cutList.sawKerf
    writeLines(
      wrapText(`Trait de scie (estimation) : ${cuts} coupes × ${formatLength(kerf, unit)} = ${formatLength(loss, unit)} de bois perdu.`, listW, 7),
    )
  }

  y += 2.5
  text(listX, y, 'NOTES', 7, { bold: true })
  y += 4
  writeLines(wrapText(`Bois massif. Cotes en ${unit}. Les repères A, B… renvoient à la liste ci-dessus.`, listW, 7))
  if (groups.some((g) => g.cornerRadius > 0 || g.edgeRadius > 0)) {
    writeLines(wrapText(`Arrondis : C = rayon des coins (vue de face), A = rayon des arêtes (vue de profil), en ${unit}.`, listW, 7))
  }
  writeLines(
    wrapText(
      plan.model === 'frameless'
        ? 'Sans cadre : tablettes continues avec débords, montants coupés à la hauteur de chaque étage et fixés entre les tablettes.'
        : plan.options.framePlacement === 'between'
          ? 'Tablettes du haut et du bas placées entre les montants.'
          : 'Tablettes du haut et du bas posées sur et sous les montants.',
      listW,
      7,
    ),
  )
  if (plan.wedges.length > 0) {
    writeLines(
      wrapText(`Cales non fixées : hauteur de l’étage moins ${formatLength(plan.options.wedgeClearance, unit)} de jeu.`, listW, 7),
    )
  }
  if (plan.options.wallMount) {
    y += 1
    const noteLines = wrapText(WALL_NOTE, listW - 6, 7)
    bubble(listX + 1.9, y - 0.9, 'F')
    writeLines(noteLines, listX + 5)
  }

  // --- Cartouche --------------------------------------------------------------------------------------------

  const cells = [
    { w: 105, label: 'ÉTAGÈRE', value: truncate(plan.name, 32), size: 14 },
    {
      w: 78,
      label: 'DIMENSIONS HORS-TOUT (LARGEUR × HAUTEUR × PROFONDEUR)',
      value: `${formatNumber(plan.width, unit)} × ${formatNumber(plan.height, unit)} × ${formatNumber(depth, unit)} ${unit}`,
      size: 10,
    },
    { w: 32, label: 'ÉCHELLE', value: scaleLabel(d), size: 12 },
    { w: 30, label: 'DATE', value: formatDate(date), size: 9 },
    { w: 36, label: 'PLAN', value: 'Atelier Étagères', size: 8 },
  ]
  let cx = MARGIN
  for (const cell of cells) {
    if (cx > MARGIN) line(cx, ZONE_BOTTOM, cx, PAGE.height - MARGIN, 0.25)
    text(cx + 2, ZONE_BOTTOM + 4, truncate(cell.label, Math.floor(cell.w / 1.35)), 6, { gray: 0.4 })
    text(cx + 2, ZONE_BOTTOM + 17, cell.value, cell.size, { bold: cell.size >= 12 })
    cx += cell.w
  }

  return { width: PAGE.width, height: PAGE.height, scaleDenominator: d, primitives }
}
