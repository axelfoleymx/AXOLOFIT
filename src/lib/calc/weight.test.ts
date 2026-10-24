import { describe, expect, it } from 'vitest'
import { addDays, classifyTrend, movingAverage7, periodChange, trendSlope } from './weight'
import { adaptiveAdjustment } from './adaptive'

const series = (start: string, n: number, f: (i: number) => number) => Array.from({ length: n }, (_, i) => ({ date: addDays(start, i), kg: f(i) }))

describe('promedio móvil de 7 días', () => {
  it('promedia la ventana natural', () => {
    const ma = movingAverage7(series('2026-10-01', 7, (i) => 80 + i))
    expect(ma[6].avg7).toBeCloseTo(83)
    expect(ma[0].reliable).toBe(false)
  })
  it('promedia varias mediciones del mismo día', () => {
    const ma = movingAverage7([{ date: '2026-10-01', kg: 80 }, { date: '2026-10-01', kg: 81 }])
    expect(ma).toHaveLength(1)
    expect(ma[0].kg).toBe(80.5)
  })
  it('respeta huecos: no cuenta días fuera de la ventana', () => {
    const ma = movingAverage7([{ date: '2026-10-01', kg: 90 }, { date: '2026-10-10', kg: 80 }])
    expect(ma[1].avg7).toBe(80)
  })
})

describe('tendencia', () => {
  it('pendiente lineal', () => {
    const s = trendSlope(series('2026-10-01', 21, (i) => 80 - i * 0.05))!
    expect(s.kgPerWeek).toBeCloseTo(-0.35)
    expect(classifyTrend(s)).toBe('bajando')
  })
  it('ruido sin tendencia = estable', () => {
    const s = trendSlope(series('2026-10-01', 21, (i) => 80 + (i % 2 ? 0.6 : -0.6)))
    expect(classifyTrend(s)).toBe('estable')
  })
  it('datos insuficientes', () => expect(classifyTrend(trendSlope(series('2026-10-01', 3, () => 80)))).toBe('insuficiente'))
  it('cambio de periodo', () => {
    expect(periodChange(series('2026-09-01', 40, (i) => 80 - i * 0.1), '2026-09-10', '2026-10-05')).toBeCloseTo(-2.5, 1)
  })
})

describe('ajuste adaptativo', () => {
  const intake = (n: number, kcal: number) => Array.from({ length: n }, (_, i) => ({ date: addDays('2026-10-03', i), kcal, complete: true }))
  it('pide más datos con poco historial', () => {
    expect(adaptiveAdjustment({ today: '2026-10-23', goal: 'fat_loss', targetKcal: 2200, bodyKg: 80, targetRateKgWeek: -0.4, weights: series('2026-10-20', 4, () => 80), intake: intake(4, 2200) }).action).toBe('insufficient_data')
  })
  it('sin bajar de peso con déficit planeado → reducir ≤ 150 kcal', () => {
    const r = adaptiveAdjustment({ today: '2026-10-23', goal: 'fat_loss', targetKcal: 2200, bodyKg: 80, targetRateKgWeek: -0.4, weights: series('2026-10-03', 21, (i) => 80 + (i % 3 === 0 ? 0.2 : 0)), intake: intake(21, 2200) })
    expect(r.action).toBe('decrease')
    expect(r.deltaKcal).toBeGreaterThanOrEqual(-150)
  })
  it('ritmo en objetivo → mantener', () => {
    const r = adaptiveAdjustment({ today: '2026-10-23', goal: 'fat_loss', targetKcal: 2200, bodyKg: 80, targetRateKgWeek: -0.4, weights: series('2026-10-03', 21, (i) => 80 - (0.4 / 7) * i), intake: intake(21, 2200) })
    expect(r.action).toBe('keep')
    expect(r.confidence).toBe('high')
  })
  it('no ajusta si el último ajuste fue hace < 14 días', () => {
    const r = adaptiveAdjustment({ today: '2026-10-23', goal: 'fat_loss', targetKcal: 2200, bodyKg: 80, targetRateKgWeek: -0.4, weights: [], intake: [], lastAdjustment: '2026-10-15' })
    expect(r.action).toBe('keep')
  })
})
