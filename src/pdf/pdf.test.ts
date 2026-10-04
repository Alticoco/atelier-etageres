import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { createPlan } from '../model/plan'
import { FILE_FORMAT, serializePlan } from '../model/serialize'
import { addShelf, addWedge } from '../model/tools'
import type { Plan } from '../model/types'
import { isPdf } from './detect'
import { ATTACHMENT_NAME, buildPlanPdf, readPlanFromPdf } from './pdf'

const DATE = new Date(2026, 9, 4, 12, 0, 0)

const base = {
  name: 'Mangathèque',
  width: 800,
  height: 1000,
  depth: 250,
  stages: 3,
  uprightThickness: 18,
  shelfThickness: 18,
}

function plan(overrides: Partial<Parameters<typeof createPlan>[0]> = {}): Plan {
  return createPlan({ ...base, ...overrides })
}

function richPlan(): Plan {
  let p = plan({ name: 'Étagère à épices', sawKerfEnabled: true, wallMount: true, framePlacement: 'onTop', propagation: false })
  for (const id of ['shelf-1', 'shelf-1', 'shelf-2']) {
    const result = addWedge(p, id)
    if (!result.ok) throw new Error(result.error)
    p = result.plan
  }
  const split = addShelf(p, 'shelf-3')
  if (!split.ok) throw new Error(split.error)
  return split.plan
}

/** Contenu (décompressé) de la première page, pour vérifier ce qui est réellement dessiné. */
async function pageContent(bytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(bytes)
  const contents = doc.getPage(0).node.lookup(PDFName.of('Contents'))
  const streams = contents instanceof PDFArray ? contents.asArray().map((ref) => doc.context.lookup(ref)) : [contents]
  return streams
    .map((stream) => new TextDecoder('latin1').decode(decodePDFRawStream(stream as PDFRawStream).decode()))
    .join('\n')
}

describe('aller-retour PDF', () => {
  it('ré-importer un PDF exporté redonne exactement le même plan', async () => {
    const original = richPlan()
    const bytes = await buildPlanPdf(original, { date: DATE })
    expect(await readPlanFromPdf(bytes)).toEqual({ ok: true, plan: original })
  })

  it('fonctionne pour des plans variés', async () => {
    for (const p of [plan(), plan({ framePlacement: 'onTop', stages: 1 }), plan({ width: 2000, height: 2400, depth: 600, stages: 6 })]) {
      const result = await readPlanFromPdf(await buildPlanPdf(p, { date: DATE }))
      expect(result).toEqual({ ok: true, plan: p })
    }
  })

  it('l’unité d’affichage du PDF ne change pas le plan joint (toujours en mm)', async () => {
    const original = richPlan()
    const inMm = await readPlanFromPdf(await buildPlanPdf(original, { unit: 'mm', date: DATE }))
    const inCm = await readPlanFromPdf(await buildPlanPdf(original, { unit: 'cm', date: DATE }))
    expect(inMm).toEqual({ ok: true, plan: original })
    expect(inCm).toEqual({ ok: true, plan: original })
  })

  it('un nom avec émojis et idéogrammes ne fait pas échouer l’export et revient intact', async () => {
    const original = plan({ name: 'Étagère 日本語 😀 café' })
    const bytes = await buildPlanPdf(original, { date: DATE })
    const result = await readPlanFromPdf(bytes)
    expect(result).toEqual({ ok: true, plan: original })
  })

  it('un PDF ré-exporté après ré-import reste identique', async () => {
    const first = await readPlanFromPdf(await buildPlanPdf(richPlan(), { date: DATE }))
    if (!first.ok) throw new Error(first.error)
    const second = await readPlanFromPdf(await buildPlanPdf(first.plan, { date: DATE }))
    expect(second).toEqual(first)
  })
})

describe('le PDF produit', () => {
  it('est un A4 paysage d’une seule page', async () => {
    const doc = await PDFDocument.load(await buildPlanPdf(plan(), { date: DATE }))
    expect(doc.getPageCount()).toBe(1)
    const { width, height } = doc.getPage(0).getSize()
    expect(width).toBeCloseTo(841.89, 1)
    expect(height).toBeCloseTo(595.28, 1)
    expect(width).toBeGreaterThan(height)
  })

  it('est reconnu comme un PDF', async () => {
    const bytes = await buildPlanPdf(plan(), { date: DATE })
    expect(isPdf(bytes)).toBe(true)
    expect(isPdf(new TextEncoder().encode('{"a":1}'))).toBe(false)
    expect(isPdf(new Uint8Array())).toBe(false)
  })

  it('porte le titre, le logiciel et la date', async () => {
    const doc = await PDFDocument.load(await buildPlanPdf(plan(), { date: DATE }), { updateMetadata: false })
    expect(doc.getTitle()).toBe('Mangathèque — plan d’étagère')
    expect(doc.getCreator()).toBe('Atelier Étagères')
    expect(doc.getCreationDate()?.getTime()).toBe(DATE.getTime())
  })

  it('est un dessin vectoriel : des traits et des textes, aucune image', async () => {
    const bytes = await buildPlanPdf(plan(), { date: DATE })
    const content = await pageContent(bytes)
    expect(content.length).toBeGreaterThan(3000)
    expect(content).toMatch(/\bS\b/) // traits
    expect(content).toMatch(/\bTj\b/) // textes
    const doc = await PDFDocument.load(bytes)
    const resources = doc.getPage(0).node.Resources()
    expect(resources?.lookupMaybe(PDFName.of('XObject'), PDFDict)?.keys() ?? []).toEqual([])
  })

  it('reste léger (dessin vectoriel + petit fichier joint)', async () => {
    expect((await buildPlanPdf(richPlan(), { date: DATE })).length).toBeLessThan(60_000)
  })

})

describe('lecture d’un PDF qui n’est pas le nôtre', () => {
  async function pdfWith(attachment?: { name: string; content: string }): Promise<Uint8Array> {
    const doc = await PDFDocument.create()
    doc.addPage()
    if (attachment) await doc.attach(new TextEncoder().encode(attachment.content), attachment.name, { mimeType: 'application/json' })
    return doc.save()
  }

  it('refuse des octets quelconques', async () => {
    const result = await readPlanFromPdf(new Uint8Array([1, 2, 3, 4, 5, 6]))
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('illisible') })
  })

  it('refuse un fichier vide', async () => {
    expect((await readPlanFromPdf(new Uint8Array())).ok).toBe(false)
  })

  it('refuse un PDF tronqué', async () => {
    const bytes = await buildPlanPdf(plan(), { date: DATE })
    const result = await readPlanFromPdf(bytes.slice(0, Math.floor(bytes.length / 3)))
    expect(result.ok).toBe(false)
  })

  it('explique qu’un PDF ordinaire ne contient pas de plan', async () => {
    const result = await readPlanFromPdf(await pdfWith())
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('ne contient pas de plan') })
  })

  it('ignore un fichier joint qui n’a pas le bon nom', async () => {
    const result = await readPlanFromPdf(await pdfWith({ name: 'notes.txt', content: serializePlan(plan()) }))
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('ne contient pas de plan') })
  })

  it('refuse un fichier joint qui n’est pas du JSON', async () => {
    const result = await readPlanFromPdf(await pdfWith({ name: ATTACHMENT_NAME, content: 'pas du json' }))
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('JSON invalide') })
  })

  it('refuse un fichier joint qui n’est pas un plan d’étagère', async () => {
    const result = await readPlanFromPdf(await pdfWith({ name: ATTACHMENT_NAME, content: '{"format":"autre"}' }))
    expect(result.ok).toBe(false)
  })

  it('valide le plan joint comme n’importe quel fichier importé (plan incohérent refusé)', async () => {
    const broken = JSON.parse(serializePlan(plan()))
    broken.plan.shelves[1].y = broken.plan.shelves[2].y
    const result = await readPlanFromPdf(await pdfWith({ name: ATTACHMENT_NAME, content: JSON.stringify(broken) }))
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('incohérent') })
  })

  it('refuse un plan joint d’une version plus récente', async () => {
    const future = JSON.stringify({ format: FILE_FORMAT, version: 99, plan: plan() })
    const result = await readPlanFromPdf(await pdfWith({ name: ATTACHMENT_NAME, content: future }))
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('plus récente') })
  })

  it('refuse un PDF démesuré sans le lire', async () => {
    const huge = new Uint8Array(20_000_001)
    expect(await readPlanFromPdf(huge)).toMatchObject({ ok: false, error: expect.stringContaining('volumineux') })
  })

  it('reconnaît le fichier joint par son nom en ignorant la casse, parmi d’autres fichiers joints', async () => {
    const doc = await PDFDocument.create()
    doc.addPage()
    await doc.attach(new TextEncoder().encode('autre'), 'autre.txt', { mimeType: 'text/plain' })
    await doc.attach(new TextEncoder().encode(serializePlan(plan())), 'MON-PLAN.ETAGERE.JSON', { mimeType: 'application/json' })
    expect(await readPlanFromPdf(await doc.save())).toEqual({ ok: true, plan: plan() })
  })
})
