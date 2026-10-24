import { describe, expect, it } from 'vitest'
import { analyzePerformance, detectPRs, exerciseHistory, sessionSummary, weeklyVolume } from './training'
import { generateRoutine, chooseSplit, WEEKLY_SET_CAP } from './routine'
import { EXERCISES, getExercise, substitutesFor } from '../exercises'
import { loggingStreak, weeklyConsistency, earnedAchievements } from './habits'
import type { WorkoutSession, WorkoutSet } from '../types'

let k = 0
const set = (w: number, r: number, rir = 2): WorkoutSet => ({ id: String(k++), kind: 'working', weightKg: w, reps: r, rir, done: true })
const cfg = { repMin: 8, repMax: 12, sets: 3, rirMin: 1, rirMax: 3, increment: 2.5, restSec: 120 }
const session = (date: string, sets: WorkoutSet[], ex = 'mw-barbell-bench-press', id = date): WorkoutSession => ({
  id, userId: 'u1', createdAt: date, updatedAt: date, planId: null, dayId: null, name: 'Torso', date, startedAt: date + 'T10:00:00Z', endedAt: date + 'T11:00:00Z',
  status: 'completed', exercises: [{ exerciseId: ex, exerciseName: 'Press', config: cfg, sets }], origin: 'user',
})

describe('biblioteca de ejercicios', () => {
  it('importa el catálogo de MuscleWiki con enlace a la fuente', () => {
    expect(EXERCISES.length).toBeGreaterThan(300)
    const b = getExercise('mw-barbell-bench-press')!
    expect(b.primary).toContain('pe')
    expect(b.pattern).toBe('horizontal_push')
    expect(b.sourceUrl).toBe('https://musclewiki.com/es-es/exercise/barbell-bench-press')
  })
  it('patrones clave inferidos', () => {
    expect(getExercise('mw-barbell-squat')!.pattern).toBe('squat')
    expect(getExercise('mw-barbell-romanian-deadlift')!.pattern).toBe('hinge')
    expect(getExercise('mw-machine-hamstring-curl')!.pattern).toBe('knee_flexion')
    expect(getExercise('mw-dumbbell-curl')!.pattern).toBe('elbow_flexion')
    expect(getExercise('mw-pull-ups')!.pattern).toBe('vertical_pull')
    expect(getExercise('mw-dumbbell-lateral-raise')!.pattern).toBe('lateral_raise')
  })
  it('sustituciones por equipamiento', () => {
    const subs = substitutesFor('mw-barbell-bench-press', ['dumbbells'])
    expect(subs.length).toBeGreaterThan(0)
    expect(subs.every((s) => ['dumbbells', 'bodyweight'].includes(s.equipment))).toBe(true)
  })
})

describe('análisis de rendimiento', () => {
  it('no declara estancamiento con pocas sesiones', () => {
    const h = exerciseHistory([session('2026-10-01', [set(40, 10)]), session('2026-10-04', [set(40, 9)])], 'mw-barbell-bench-press')
    expect(analyzePerformance(h).status).toBe('insufficient')
  })
  it('progreso', () => {
    const h = exerciseHistory(['01', '04', '08', '11'].map((d, i) => session(`2026-10-${d}`, [set(40 + i * 2.5, 10)])), 'mw-barbell-bench-press')
    expect(analyzePerformance(h).status).toBe('progressing')
  })
  it('estancamiento solo tras varias sesiones sin mejora', () => {
    const h = exerciseHistory(['01', '04', '08', '11', '15'].map((d, i) => session(`2026-10-${d}`, [set(60, i === 0 ? 10 : 9 + (i % 2))])), 'mw-barbell-bench-press')
    expect(analyzePerformance(h).status).toBe('plateau')
  })
  it('caída con mal sueño = posible fatiga, con hipótesis', () => {
    const h = exerciseHistory([['01', 10], ['04', 10], ['08', 8], ['11', 7], ['15', 6]].map(([d, r]) => session(`2026-10-${d}`, [set(60, r as number)])), 'mw-barbell-bench-press')
    const a = analyzePerformance(h, { avgSleepH: 5.5 })
    expect(a.status).toBe('fatigue')
    expect(a.hypotheses.join(' ')).toMatch(/Sueño/)
  })
})

describe('volumen, récords y resumen', () => {
  const s1 = session('2026-10-20', [set(60, 10), set(60, 9), set(60, 8)])
  const s2 = session('2026-10-23', [set(62.5, 9), set(60, 11), set(60, 9)], 'mw-barbell-bench-press', 's2')
  it('series semanales por músculo (principal 1, secundario 0.5)', () => {
    const v = weeklyVolume([s1, s2], getExercise, '2026-10-19', '2026-10-25')
    expect(v.sets.pe).toBe(6)
    expect(v.sets.tr).toBe(3)
    expect(v.frequency.pe).toBe(2)
  })
  it('detecta récords y no cuenta la primera sesión', () => {
    expect(detectPRs(s1, [])).toEqual([])
    const prs = detectPRs(s2, [s1])
    expect(prs.map((p) => p.kind)).toEqual(expect.arrayContaining(['weight', 'reps_at_weight']))
  })
  it('resumen de sesión', () => {
    const r = sessionSummary(s1)
    expect(r.volumeKg).toBe(60 * 27)
    expect(r.durationMin).toBe(60)
  })
})

describe('generador de rutinas', () => {
  it('elige división por días', () => {
    expect(chooseSplit(3).days).toHaveLength(3)
    expect(chooseSplit(4).split).toMatch(/Torso/)
  })
  it('respeta equipamiento, evitados y techo de volumen', () => {
    const r = generateRoutine({ days: 4, minutes: 60, experience: 'beginner', goal: 'muscle_gain', equipment: ['dumbbells'], avoid: ['mw-dumbbell-bench-press'], favorites: [] }, EXERCISES)
    const ids = r.days.flatMap((d) => d.exercises.map((e) => e.exerciseId))
    expect(ids).not.toContain('mw-dumbbell-bench-press')
    for (const id of ids) expect(['dumbbells', 'bodyweight']).toContain(getExercise(id)!.equipment)
    for (const v of Object.values(r.weeklySets)) expect(v).toBeLessThanOrEqual(WEEKLY_SET_CAP.beginner)
    for (const d of r.days) for (const e of d.exercises) expect(e.config.repMin).toBeLessThan(e.config.repMax)
  })
})

describe('hábitos', () => {
  it('racha que no se rompe a media mañana', () => {
    expect(loggingStreak(['2026-10-21', '2026-10-22'], '2026-10-23')).toBe(2)
    expect(loggingStreak(['2026-10-21', '2026-10-22', '2026-10-23'], '2026-10-23')).toBe(3)
    expect(loggingStreak(['2026-10-20'], '2026-10-23')).toBe(0)
  })
  it('consistencia semanal y logros', () => {
    expect(weeklyConsistency(['2026-10-23', '2026-10-17', '2026-10-16'], '2026-10-23')).toBe(2)
    expect(earnedAchievements({ sessions: 1, prs: 0, foodLogDays: 7, streak: 0, weighIns: 0, plannedWeekDone: false, proteinDaysLast7: 0 })).toEqual(['first_session', 'log_7'])
  })
})
