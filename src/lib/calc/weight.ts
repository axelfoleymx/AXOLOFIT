import type { ISODate } from '../types'

export const DAY_MS = 86_400_000
export const dayNum = (d: ISODate) => Math.round(Date.parse(d + 'T00:00:00Z') / DAY_MS)
export const fromDayNum = (n: number): ISODate => new Date(n * DAY_MS).toISOString().slice(0, 10)
export const addDays = (d: ISODate, n: number) => fromDayNum(dayNum(d) + n)

export interface WeightPoint { date: ISODate; kg: number }

/** Si hay varias mediciones el mismo día se usa su promedio. */
export function dailyWeights(logs: WeightPoint[]): WeightPoint[] {
  const by = new Map<ISODate, number[]>()
  for (const l of logs) by.set(l.date, [...(by.get(l.date) ?? []), l.kg])
  return [...by.entries()]
    .map(([date, v]) => ({ date, kg: v.reduce((a, b) => a + b, 0) / v.length }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Promedio móvil de 7 días naturales: para cada día con registro, promedia los registros
 * en [día-6, día]. Requiere `minPoints` registros en la ventana para considerarse fiable.
 */
export function movingAverage7(logs: WeightPoint[], minPoints = 3) {
  const d = dailyWeights(logs)
  return d.map((p) => {
    const n = dayNum(p.date)
    const win = d.filter((q) => dayNum(q.date) > n - 7 && dayNum(q.date) <= n)
    const avg = win.reduce((s, q) => s + q.kg, 0) / win.length
    return { date: p.date, kg: p.kg, avg7: avg, points: win.length, reliable: win.length >= minPoints }
  })
}

/** Pendiente por mínimos cuadrados (kg/día) sobre los últimos `days` días. */
export function trendSlope(logs: WeightPoint[], days = 21, endDate?: ISODate) {
  const d = dailyWeights(logs)
  if (!d.length) return null
  const end = endDate ? dayNum(endDate) : dayNum(d[d.length - 1].date)
  const pts = d.filter((p) => dayNum(p.date) > end - days && dayNum(p.date) <= end)
  if (pts.length < 4) return null
  const xs = pts.map((p) => dayNum(p.date))
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length
  const my = pts.reduce((a, p) => a + p.kg, 0) / pts.length
  let num = 0
  let den = 0
  pts.forEach((p, i) => {
    num += (xs[i] - mx) * (p.kg - my)
    den += (xs[i] - mx) ** 2
  })
  if (den === 0) return null
  const slope = num / den
  // Error estándar para la confianza
  const resid = pts.map((p, i) => p.kg - (my + slope * (xs[i] - mx)))
  const se = pts.length > 2 ? Math.sqrt(resid.reduce((s, r) => s + r * r, 0) / (pts.length - 2) / den) : Infinity
  return { kgPerDay: slope, kgPerWeek: slope * 7, points: pts.length, spanDays: xs[xs.length - 1] - xs[0], stdErrPerWeek: se * 7 }
}

/** Cambio entre el promedio de 7 días al final del periodo y el del inicio. */
export function periodChange(logs: WeightPoint[], startDate: ISODate, endDate: ISODate) {
  const ma = movingAverage7(logs, 1)
  const at = (target: ISODate) => {
    const n = dayNum(target)
    const cands = ma.filter((p) => Math.abs(dayNum(p.date) - n) <= 3)
    if (!cands.length) return null
    return cands.sort((a, b) => Math.abs(dayNum(a.date) - n) - Math.abs(dayNum(b.date) - n))[0].avg7
  }
  const a = at(startDate)
  const b = at(endDate)
  return a == null || b == null ? null : b - a
}

export type TrendLabel = 'bajando' | 'estable' | 'subiendo' | 'insuficiente'

/** Clasifica una tendencia distinguiendo fluctuación de cambio persistente. */
export function classifyTrend(slope: ReturnType<typeof trendSlope>): TrendLabel {
  if (!slope || slope.spanDays < 10) return 'insuficiente'
  const w = slope.kgPerWeek
  // Si el intervalo ±2·SE incluye cero o el cambio es < 0.1 kg/sem, se considera estable
  if (Math.abs(w) < 0.1 || Math.abs(w) < 2 * slope.stdErrPerWeek) return 'estable'
  return w < 0 ? 'bajando' : 'subiendo'
}
