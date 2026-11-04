/**
 * Garde-fou d'indépendance des fournisseurs : aucun SDK Supabase dans le code,
 * et aucun secret exposé au navigateur via NEXT_PUBLIC_.
 */
import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const srcDir = path.resolve(__dirname, '../src')

const listFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return listFiles(full)
    return /\.(ts|tsx|js|mjs)$/.test(entry.name) ? [full] : []
  })

describe('Indépendance et secrets', () => {
  const files = listFiles(srcDir)

  it("aucun fichier n'importe le SDK Supabase", () => {
    const offenders = files.filter((f) => /from ['"]@supabase\//.test(fs.readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })

  it("aucune variable NEXT_PUBLIC_ n'est utilisée (rien de sensible ne part au navigateur)", () => {
    const offenders = files.filter((f) => /NEXT_PUBLIC_/.test(fs.readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })
})
