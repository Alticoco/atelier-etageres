import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRawStream,
  PDFStream,
  PDFString,
  StandardFonts,
  decodePDFRawStream,
  degrees,
  rgb,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib'
import { parsePlanFile, serializePlan, type ParseResult } from '../model/serialize'
import type { Plan } from '../model/types'
import type { LengthUnit } from '../model/units'
import { buildScene, type Primitive } from './scene'

/** Nom du fichier joint au PDF : il porte le plan éditable. */
export const ATTACHMENT_NAME = 'plan.etagere.json'

const MM = 72 / 25.4
/** Limites de lecture d'un PDF importé (il vient de l'extérieur). */
const MAX_PDF_BYTES = 20_000_000
const MAX_ATTACHMENT_BYTES = 2_000_000
const MAX_TREE_DEPTH = 8
const MAX_ATTACHMENTS = 100

const gray = (g: number) => rgb(g, g, g)

export interface PdfOptions {
  unit?: LengthUnit
  /** Date affichée dans le cartouche et enregistrée dans le PDF. */
  date?: Date
}

/** Remplace par « ? » les caractères que la police standard ne sait pas écrire (émojis, idéogrammes…). */
function encodable(text: string, font: PDFFont): string {
  const supported = new Set(font.getCharacterSet())
  return Array.from(text, (char) => (supported.has(char.codePointAt(0)!) ? char : '?')).join('')
}

function draw(page: PDFPage, primitive: Primitive, height: number, fonts: { regular: PDFFont; bold: PDFFont }): void {
  const Y = (y: number) => height - y

  if (primitive.kind === 'line') {
    page.drawLine({
      start: { x: primitive.x1 * MM, y: Y(primitive.y1) * MM },
      end: { x: primitive.x2 * MM, y: Y(primitive.y2) * MM },
      thickness: primitive.width * MM,
      color: gray(primitive.gray),
      dashArray: primitive.dash?.map((d) => d * MM),
    })
    return
  }

  if (primitive.kind === 'rect') {
    const { x, y, width, height: h, fill, stroke, strokeWidth, dash } = primitive
    if (fill !== undefined) {
      page.drawRectangle({
        x: x * MM,
        y: Y(y + h) * MM,
        width: width * MM,
        height: h * MM,
        color: gray(fill),
        borderColor: stroke === undefined ? undefined : gray(stroke),
        borderWidth: stroke === undefined ? 0 : strokeWidth * MM,
        borderDashArray: dash?.map((d) => d * MM),
      })
    } else if (stroke !== undefined) {
      // Sans remplissage : quatre traits, pour ne dépendre d'aucune valeur par défaut de la bibliothèque.
      const corners = [
        [x, y, x + width, y],
        [x + width, y, x + width, y + h],
        [x + width, y + h, x, y + h],
        [x, y + h, x, y],
      ]
      for (const [x1, y1, x2, y2] of corners) {
        page.drawLine({
          start: { x: x1 * MM, y: Y(y1) * MM },
          end: { x: x2 * MM, y: Y(y2) * MM },
          thickness: strokeWidth * MM,
          color: gray(stroke),
          dashArray: dash?.map((d) => d * MM),
        })
      }
    }
    return
  }

  if (primitive.kind === 'circle') {
    page.drawCircle({
      x: primitive.x * MM,
      y: Y(primitive.y) * MM,
      size: primitive.r * MM,
      color: primitive.fill === undefined ? undefined : gray(primitive.fill),
      borderColor: primitive.stroke === undefined ? undefined : gray(primitive.stroke),
      borderWidth: primitive.stroke === undefined ? 0 : primitive.strokeWidth * MM,
    })
    return
  }

  const font = primitive.bold ? fonts.bold : fonts.regular
  const value = encodable(primitive.text, font)
  const width = font.widthOfTextAtSize(value, primitive.size)
  // Le texte est ancré par son milieu / sa fin : on recule le long de sa direction (rotation comprise).
  const back = primitive.align === 'center' ? width / 2 : primitive.align === 'right' ? width : 0
  const angle = (primitive.rotate * Math.PI) / 180
  page.drawText(value, {
    x: primitive.x * MM - Math.cos(angle) * back,
    y: Y(primitive.y) * MM - Math.sin(angle) * back,
    size: primitive.size,
    font,
    color: gray(primitive.gray),
    rotate: degrees(primitive.rotate),
  })
}

/**
 * Plan d'architecte en PDF (A4 paysage, dessin vectoriel) avec le plan éditable joint au fichier
 * (`plan.etagere.json`) : le PDF peut être ré-importé dans l'application.
 */
export async function buildPlanPdf(plan: Plan, { unit = 'cm', date = new Date() }: PdfOptions = {}): Promise<Uint8Array> {
  const scene = buildScene(plan, { unit, date })

  const doc = await PDFDocument.create()
  doc.setTitle(`${plan.name} — plan d’étagère`)
  doc.setCreator('Atelier Étagères')
  doc.setProducer('Atelier Étagères')
  doc.setCreationDate(date)
  doc.setModificationDate(date)

  const page = doc.addPage([scene.width * MM, scene.height * MM])
  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  }
  for (const primitive of scene.primitives) draw(page, primitive, scene.height, fonts)

  await doc.attach(new TextEncoder().encode(serializePlan(plan)), ATTACHMENT_NAME, {
    mimeType: 'application/json',
    description: 'Plan éditable (Atelier Étagères) : ré-importez ce PDF dans l’application pour le modifier.',
    creationDate: date,
    modificationDate: date,
  })

  return doc.save()
}

// --- Lecture ------------------------------------------------------------------------------------------------

interface Attachment {
  name: string
  stream: PDFStream
}

/** Parcourt l'arbre des fichiers joints (arbre de noms du PDF), avec des limites contre les fichiers piégés. */
function collectAttachments(node: PDFDict, found: Attachment[], depth = 0): void {
  if (depth > MAX_TREE_DEPTH || found.length >= MAX_ATTACHMENTS) return

  const names = node.lookupMaybe(PDFName.of('Names'), PDFArray)
  if (names) {
    for (let i = 0; i + 1 < names.size() && found.length < MAX_ATTACHMENTS; i += 2) {
      const spec = names.lookupMaybe(i + 1, PDFDict)
      const stream = spec?.lookupMaybe(PDFName.of('EF'), PDFDict)?.lookupMaybe(PDFName.of('F'), PDFStream)
      if (!spec || !stream) continue
      const label =
        spec.lookupMaybe(PDFName.of('UF'), PDFString, PDFHexString) ?? spec.lookupMaybe(PDFName.of('F'), PDFString, PDFHexString)
      found.push({ name: label?.decodeText() ?? '', stream })
    }
  }

  const kids = node.lookupMaybe(PDFName.of('Kids'), PDFArray)
  if (kids) {
    for (let i = 0; i < kids.size(); i++) {
      const kid = kids.lookupMaybe(i, PDFDict)
      if (kid) collectAttachments(kid, found, depth + 1)
    }
  }
}

function streamBytes(stream: PDFStream): Uint8Array {
  return stream instanceof PDFRawStream ? decodePDFRawStream(stream).decode() : stream.getContents()
}

/** Relit le plan éditable joint à un PDF exporté par l'application. */
export async function readPlanFromPdf(bytes: Uint8Array): Promise<ParseResult> {
  if (bytes.length > MAX_PDF_BYTES) return { ok: false, error: 'Ce PDF est trop volumineux pour être un plan d’étagère.' }

  let doc: PDFDocument
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false })
  } catch {
    return { ok: false, error: 'Ce PDF est illisible (fichier abîmé ou protégé).' }
  }

  const found: Attachment[] = []
  const embedded = doc.catalog.lookupMaybe(PDFName.of('Names'), PDFDict)?.lookupMaybe(PDFName.of('EmbeddedFiles'), PDFDict)
  if (embedded) collectAttachments(embedded, found)

  const attachment = found.find((a) => a.name.toLowerCase().endsWith('.etagere.json'))
  if (!attachment) {
    return { ok: false, error: 'Ce PDF ne contient pas de plan Atelier Étagères : seuls les PDF exportés par l’application peuvent être ré-importés.' }
  }
  if (attachment.stream instanceof PDFRawStream && attachment.stream.getContentsSize() > MAX_ATTACHMENT_BYTES) {
    return { ok: false, error: 'Le plan joint à ce PDF est trop volumineux.' }
  }

  let content: string
  try {
    content = new TextDecoder('utf-8').decode(streamBytes(attachment.stream))
  } catch {
    return { ok: false, error: 'Le plan joint à ce PDF est illisible.' }
  }
  return parsePlanFile(content)
}
