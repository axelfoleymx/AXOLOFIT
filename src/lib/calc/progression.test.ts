import { describe, expect, it } from 'vitest'
import { estimate1RM, nextRepTargets, predictReps, recommendNext, roundToIncrement, type ExerciseSessionHistory } from './progression'
import type { ProgressionConfig, WorkoutSet } from '../types'

const cfg: ProgressionConfig = { repMin: 8, repMax: 12, sets: 3, rirMin: 1, rirMax: 3, increment: 2.5, restSec: 120 }
let n = 0
const S = (weightKg: number | null, reps: number | null, rir: number | null = 2, extra: Partial<WorkoutSet> = {}): WorkoutSet => ({ id: String(n++), kind: 'working', weightKg, reps, rir, done: true, ...extra })
const H = (date: string, sets: WorkoutSet[], extra: Partial<ExerciseSessionHistory> = {}): ExerciseSessionHistory => ({ date, sets, ...extra })

describe('utilidades', () => {
  it('e1RM Epley con RIR', () => {
    expect(estimate1RM(100, 5)).toBeCloseTo(116.67, 1)
    expect(estimate1RM(100, 3, 2)).toBeCloseTo(116.67, 1)
    expect(estimate1RM(100, 1)).toBe(100)
  })
  it('predicción inversa', () => expect(predictReps(116.67, 100)).toBe(5))
  it('redondeo a incremento', () => {
    expect(roundToIncrement(41.3, 2.5)).toBe(42.5)
    expect(roundToIncrement(41.3, 2.5, 'down')).toBe(40)
    expect(roundToIncrement(23, 2)).toBe(24)
  })
  it('objetivos de repeticiones: 10,9,8 → 10,10,9', () => {
    expect(nextRepTargets([10, 9, 8], 12)).toEqual([10, 10, 9])
    expect(nextRepTargets([10, 10, 10], 12)).toEqual([11, 11, 11])
    expect(nextRepTargets([12, 12, 11], 12)).toEqual([12, 12, 12])
  })
})

describe('progresión doble', () => {
  it('sin historial → sesión de referencia', () => {
    const r = recommendNext(cfg, [])
    expect(r.action).toBe('establish')
    expect(r.confidence).toBe('low')
    expect(r.requiresReview).toBe(true)
  })
  it('10/9/8 dentro del rango → mantener 40 kg y sumar reps (ejemplo del brief)', () => {
    const r = recommendNext(cfg, [H('2026-10-20', [S(40, 10), S(40, 9), S(40, 8)])])
    expect(r.action).toBe('add_reps')
    expect(r.weightKg).toBe(40)
    expect(r.repTargets).toEqual([10, 10, 9])
    expect(r.message).toContain('10, 9, 8')
  })
  it('12/12/12 con RIR objetivo → subir el incremento mínimo y volver a la zona baja', () => {
    const r = recommendNext(cfg, [H('2026-10-22', [S(40, 12, 1), S(40, 12, 1), S(40, 12, 2)]), H('2026-10-18', [S(40, 11), S(40, 10), S(40, 10)])])
    expect(r.action).toBe('increase_load')
    expect(r.weightKg).toBe(42.5)
    expect(r.repTargets!.every((x) => x >= cfg.repMin && x <= cfg.repMin + 2)).toBe(true)
    expect(r.confidence).toBe('high')
  })
  it('incremento demasiado grande (> 10 %) → consolidar', () => {
    const r = recommendNext({ ...cfg, increment: 5 }, [H('2026-10-22', [S(12, 12), S(12, 12), S(12, 12)])])
    expect(r.action).toBe('consolidate')
    expect(r.weightKg).toBe(12)
  })
  it('RIR 0 cuando el objetivo es 1–3 → no forzar progresión', () => {
    const r = recommendNext(cfg, [H('2026-10-22', [S(40, 12, 0), S(40, 12, 0), S(40, 12, 0)])])
    expect(r.action).toBe('keep')
    expect(r.weightKg).toBe(40)
  })
  it('dolor → no progresar', () => {
    const r = recommendNext(cfg, [H('2026-10-22', [S(40, 12), S(40, 12, 2, { pain: true }), S(40, 12)])])
    expect(r.action).toBe('pain_stop')
    expect(r.message).toMatch(/profesional/)
  })
  it('técnica deficiente → priorizar técnica', () => {
    expect(recommendNext(cfg, [H('2026-10-22', [S(40, 12), S(40, 12), S(40, 12)], { techniqueOk: false })]).action).toBe('technique')
  })
  it('series incompletas → pide datos', () => {
    expect(recommendNext(cfg, [H('2026-10-22', [S(40, 10), S(40, null), S(null, 8)])]).action).toBe('complete_data')
    expect(recommendNext(cfg, [H('2026-10-22', [S(40, 10, 2, { done: false })])]).action).toBe('complete_data')
  })
  it('una caída aislada no reduce la carga', () => {
    const r = recommendNext(cfg, [H('2026-10-22', [S(40, 8), S(40, 7), S(40, 7)]), H('2026-10-18', [S(40, 10), S(40, 9), S(40, 9)])])
    expect(r.action).toBe('keep')
    expect(r.weightKg).toBe(40)
  })
  it('primera sesión tras subir carga por debajo del rango → consolidar nueva carga', () => {
    const r = recommendNext(cfg, [H('2026-10-22', [S(42.5, 8), S(42.5, 7), S(42.5, 6)]), H('2026-10-18', [S(40, 12), S(40, 12), S(40, 12)])])
    expect(r.action).toBe('retry_new_load')
  })
  it('dos sesiones seguidas por debajo del rango con la misma carga → bajar', () => {
    const r = recommendNext(cfg, [H('2026-10-25', [S(42.5, 7), S(42.5, 7), S(42.5, 7)]), H('2026-10-22', [S(42.5, 7), S(42.5, 8), S(42.5, 7)]), H('2026-10-18', [S(40, 12), S(40, 12), S(40, 12)])])
    expect(r.action).toBe('reduce_load')
    expect(r.weightKg).toBe(40)
  })
  it('tres caídas seguidas → considerar descarga', () => {
    const r = recommendNext(cfg, [H('d4', [S(40, 6), S(40, 6), S(40, 5)]), H('d3', [S(40, 8), S(40, 8), S(40, 7)]), H('d2', [S(40, 10), S(40, 10), S(40, 9)])])
    expect(r.action).toBe('consider_deload')
  })
  it('peso corporal en rango superior → variante más difícil', () => {
    const r = recommendNext({ ...cfg, increment: 0 }, [H('d', [S(null, 12), S(null, 12), S(null, 12)])], true)
    expect(r.action).toBe('consolidate')
  })
  it('las recomendaciones usan los datos reales (no texto fijo)', () => {
    const a = recommendNext(cfg, [H('d', [S(55, 9), S(55, 9), S(55, 8)])])
    expect(a.message).toContain('9, 9, 8')
    expect(a.weightKg).toBe(55)
  })
})
