/**
 * Lecture et écriture de fichiers CSV compatibles Excel (français) et Google Sheets.
 * - Écriture : séparateur « ; », encodage UTF-8 avec marque BOM (accents corrects dans Excel).
 * - Lecture : séparateur deviné (; , ou tabulation), guillemets gérés, et fichiers
 *   enregistrés par Excel en « Windows-1252 » relus correctement.
 */

const BOM = '﻿'

const cell = (v: unknown): string => {
  const s = v === null || v === undefined ? '' : String(v)
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const toCsv = (header: string[], rows: unknown[][]): string =>
  BOM + [header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n'

/** Octets → texte : UTF-8 si possible, sinon Windows-1252 (CSV enregistré par Excel). */
export const decodeCsv = (bytes: ArrayBuffer | Uint8Array): string => {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    return new TextDecoder('windows-1252').decode(buf)
  }
}

export const parseCsv = (input: string): string[][] => {
  const text = input.replace(/^﻿/, '')
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const sep = ([';', ',', '\t'] as const)
    .map((s) => [s, firstLine.split(s).length] as const)
    .sort((a, b) => b[1] - a[1])[0][0]

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += c
    } else if (c === '"' && field === '') quoted = true
    else if (c === sep) {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ''))
}
