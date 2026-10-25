// Añade a data/base44/Ejercicio.csv las columnas calculadas por src/lib/exercises.ts (patrón, rango de
// repeticiones, incremento, claves técnicas, errores y sustitutos), para que otra app no tenga que reimplementarlas.
// Uso: npx vite-node scripts/export_exercise_meta.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { EXERCISES, PATTERN_LABEL, substitutesFor } from '../src/lib/exercises'

const path = 'data/base44/Ejercicio.csv'
const parse = (line: string) => {
  const out: string[] = []; let cur = ''; let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ } else if (c === '"') q = false; else cur += c }
    else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = '' } else cur += c
  }
  out.push(cur); return out
}
const esc = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
const extra = ['patron', 'patron_nombre', 'rep_min', 'rep_max', 'incremento_kg', 'claves_tecnicas', 'errores_comunes', 'seguridad', 'sustitutos']
const lines = readFileSync(path, 'utf8').trim().split('\n')
const head = parse(lines[0]).filter((c) => !extra.includes(c))
const by = new Map(EXERCISES.map((e) => [e.id.replace('mw-', ''), e]))
const rows = [[...head, ...extra].map(esc).join(',')]
for (const l of lines.slice(1)) {
  const r = parse(l).slice(0, head.length)
  const e = by.get(r[0])!
  rows.push([...r, e.pattern, PATTERN_LABEL[e.pattern], e.repRange[0], e.repRange[1], e.increment, (e.cues ?? []).join(' | '), (e.mistakes ?? []).join(' | '), e.safety ?? '',
    substitutesFor(e.id, undefined, 6).map((s) => s.id.replace('mw-', '')).join(' | ')].map(esc).join(','))
}
writeFileSync(path, rows.join('\n') + '\n')
console.log(`${rows.length - 1} ejercicios con ${extra.length} columnas extra`)
