import { describe, expect, it } from 'vitest'
import { computeTargets, estimateBmr, estimateTdee, exerciseKcalPerDay, macroConsistency, manualTargetWarnings, mifflinStJeor } from './energy'

describe('Mifflin-St Jeor', () => {
  it('hombre 80 kg, 180 cm, 30 años = 1780', () => expect(mifflinStJeor('male', 80, 180, 30)).toBe(1780))
  it('mujer 60 kg, 165 cm, 25 años = 1345.25', () => expect(mifflinStJeor('female', 60, 165, 25)).toBeCloseTo(1345.25))
  it('sin sexo indicado usa punto medio y rango', () => {
    const r = estimateBmr({ sex: 'unspecified', kg: 80, cm: 180, age: 30 })
    expect(r.kcal).toBe(1697)
    expect(r.range).toEqual([1614, 1780])
  })
  it('Katch solo con % de grasa medido', () => {
    expect(estimateBmr({ sex: 'male', kg: 80, cm: 180, age: 30, bodyFatPct: 15, bodyFatMeasured: false }).method).toBe('mifflin')
    expect(estimateBmr({ sex: 'male', kg: 80, cm: 180, age: 30, bodyFatPct: 15, bodyFatMeasured: true }).kcal).toBeCloseTo(370 + 21.6 * 68)
  })
})

describe('gasto energético', () => {
  it('no cuenta el ejercicio dos veces: NEAT × TMB + ejercicio neto', () => {
    const ex = exerciseKcalPerDay(80, 4, 60)
    expect(ex).toBeCloseTo((4 * 60 * 4 * 80) / 60 / 7)
    const t = estimateTdee(1780, 'light', ex)
    expect(t.tdee).toBeCloseTo(1780 * 1.3 + ex)
  })
})

describe('objetivos', () => {
  const base = { sex: 'male' as const, age: 30, kg: 80, cm: 180, experience: 'intermediate' as const, bmr: 1780, tdee: 2600 }
  it('déficit moderado ≈ 0.5 %/sem', () => {
    const t = computeTargets({ ...base, goal: 'fat_loss', pace: 'moderate' })
    expect(t.kcal).toBe(Math.round((2600 - (0.4 * 7700) / 7) / 10) * 10)
    expect(t.proteinG).toBe(145) // 1.8 g/kg redondeado a 5
  })
  it('limita el déficit al 25 % y respeta suelo de TMB', () => {
    const t = computeTargets({ ...base, tdee: 1900, goal: 'fat_loss', pace: 'fast' })
    expect(t.kcal).toBeGreaterThanOrEqual(1780)
    expect(t.warnings.length).toBeGreaterThan(0)
  })
  it('menores: sin déficit automático', () => {
    const t = computeTargets({ ...base, age: 16, goal: 'fat_loss', pace: 'fast' })
    expect(t.kcal).toBe(2600)
  })
  it('macros coherentes con las kcal (±5 %)', () => {
    for (const goal of ['fat_loss', 'maintenance', 'muscle_gain', 'recomposition'] as const) {
      const t = computeTargets({ ...base, goal, pace: 'moderate' })
      expect(macroConsistency(t.kcal, t.proteinG, t.carbsG, t.fatG).ok).toBe(true)
    }
  })
  it('IMC ≥ 30 usa peso de referencia para proteína', () => {
    const t = computeTargets({ ...base, kg: 130, goal: 'fat_loss', pace: 'moderate', tdee: 3200, bmr: 2280 })
    expect(t.proteinG).toBeLessThan(130 * 1.8)
  })
  it('avisos para objetivos manuales', () => {
    expect(manualTargetWarnings(1100, 1500, 100, 70, 30).length).toBe(2)
    expect(manualTargetWarnings(2200, 1500, 140, 70, 30)).toEqual([])
  })
})
