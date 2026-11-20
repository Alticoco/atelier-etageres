import { parsePlanFile, type ParseResult } from './model/serialize'
import { isPdf } from './pdf/detect'

/** Un plan d'étagère fait quelques ko : au-delà, ce n'est pas un de nos fichiers (un PDF exporté pèse quelques dizaines de ko). */
const MAX_IMPORT_BYTES = 5_000_000
const MAX_IMPORT_PDF_BYTES = 20_000_000

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Une erreur est survenue.'
}

/** Lit un fichier importé (JSON ou PDF exporté). En cas d'échec, `error` est le message complet à afficher. */
export async function readImportedPlan(file: File): Promise<ParseResult> {
  if (file.size > MAX_IMPORT_PDF_BYTES) return { ok: false, error: 'Ce fichier est trop volumineux pour être un plan d’étagère.' }
  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await file.arrayBuffer())
  } catch {
    return { ok: false, error: 'Impossible de lire ce fichier.' }
  }

  let result: ParseResult
  if (isPdf(bytes)) {
    try {
      const { readPlanFromPdf } = await import('./pdf/pdf')
      result = await readPlanFromPdf(bytes)
    } catch (error) {
      return { ok: false, error: `Import impossible : ${messageOf(error)}` }
    }
  } else if (bytes.length > MAX_IMPORT_BYTES) {
    return { ok: false, error: 'Ce fichier est trop volumineux pour être un plan d’étagère.' }
  } else {
    result = parsePlanFile(new TextDecoder().decode(bytes))
  }
  if (!result.ok) return { ok: false, error: `Import impossible : ${result.error}` }
  return result
}
