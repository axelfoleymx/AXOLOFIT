import type { Exercise, ISODate, WorkoutSession } from '../types'
import { dayNum } from './weight'
import { bestE1RM, estimate1RM, sessionLoad, workingSets, type ExerciseSessionHistory } from './progression'

/** Historial de un ejercicio a partir de sesiones completadas, más reciente primero. */
export function exerciseHistory(sessions: WorkoutSession[], exerciseId: string): ExerciseSessionHistory[] {
  return sessions
    .filter((s) => s.status === 'completed' && !s.deletedAt)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .flatMap((s) =>
      s.exercises
        .filter((e) => e.exerciseId === exerciseId)
        .map((e) => ({ date: s.date, sets: e.sets, techniqueOk: e.techniqueOk, painNote: e.painNote, fatigue: s.fatigue })),
    )
}

export type PerformanceStatus = 'insufficient' | 'progressing' | 'slow' | 'normal_variation' | 'plateau' | 'decline' | 'fatigue'

export interface PerformanceAnalysis {
  status: PerformanceStatus
  label: string
  detail: string
  hypotheses: string[]
  series: { date: ISODate; e1rm: number; load: number | null }[]
}

export interface RecoveryContext {
  avgSleepH?: number | null
  avgProteinG?: number | null
  proteinTargetG?: number | null
  avgKcal?: number | null
  kcalTarget?: number | null
  avgFatigue?: number | null
  daysSinceLast?: number | null
}

const STATUS_LABEL: Record<PerformanceStatus, string> = {
  insufficient: 'Datos insuficientes', progressing: 'Progresando', slow: 'Progreso lento', normal_variation: 'Variación normal',
  plateau: 'Posible estancamiento', decline: 'Caída de rendimiento', fatigue: 'Posibles señales de fatiga acumulada',
}

/**
 * Análisis prudente de rendimiento. Usa el mejor e1RM de cada sesión (reps + RIR).
 * Nunca declara estancamiento con menos de 4 sesiones ni por una sola sesión mala.
 */
export function analyzePerformance(history: ExerciseSessionHistory[], ctx: RecoveryContext = {}): PerformanceAnalysis {
  const series = history
    .map((h) => ({ date: h.date, e1rm: bestE1RM(h.sets), load: sessionLoad(h.sets) }))
    .filter((p) => p.e1rm > 0)
    .reverse() // cronológico
  const hyp: string[] = []
  if (ctx.avgSleepH != null && ctx.avgSleepH < 7) hyp.push(`Sueño promedio de ${ctx.avgSleepH.toFixed(1)} h (< 7 h) puede limitar la recuperación.`)
  if (ctx.avgProteinG != null && ctx.proteinTargetG && ctx.avgProteinG < ctx.proteinTargetG * 0.8)
    hyp.push(`Proteína media ${Math.round(ctx.avgProteinG)} g vs. objetivo ${ctx.proteinTargetG} g.`)
  if (ctx.avgKcal != null && ctx.kcalTarget && ctx.avgKcal < ctx.kcalTarget * 0.85) hyp.push('Ingesta energética notablemente por debajo del objetivo.')
  if (ctx.avgFatigue != null && ctx.avgFatigue >= 4) hyp.push('Fatiga percibida alta en sesiones recientes.')
  if (ctx.daysSinceLast != null && ctx.daysSinceLast > 10) hyp.push(`Han pasado ${ctx.daysSinceLast} días desde la última sesión de este ejercicio; la frecuencia baja puede frenar el progreso.`)

  if (series.length < 3) return { status: 'insufficient', label: STATUS_LABEL.insufficient, detail: 'Se necesitan al menos 3 sesiones con datos completos.', hypotheses: [], series }

  const last = series[series.length - 1].e1rm
  const recent = series.slice(-6)
  const changes = recent.slice(1).map((p, i) => (p.e1rm - recent[i].e1rm) / recent[i].e1rm)
  const avgChange = changes.reduce((a, b) => a + b, 0) / changes.length
  const lastThree = series.slice(-3).map((p) => p.e1rm)
  const consecutiveDrops = lastThree[0] > lastThree[1] && lastThree[1] > lastThree[2]
  const peak = Math.max(...series.slice(0, -1).map((p) => p.e1rm))
  const dropFromPeak = (peak - last) / peak

  let status: PerformanceStatus
  if (consecutiveDrops && dropFromPeak > 0.05) status = hyp.length ? 'fatigue' : 'decline'
  else if (avgChange > 0.01) status = 'progressing'
  else if (series.length >= 4) {
    const best3 = Math.max(...series.slice(-3).map((p) => p.e1rm))
    const before = Math.max(...series.slice(0, -3).map((p) => p.e1rm))
    if (best3 <= before * 1.005) status = 'plateau'
    else status = avgChange > 0 ? 'slow' : 'normal_variation'
  } else status = last < series[series.length - 2].e1rm ? 'normal_variation' : 'slow'

  const detailMap: Record<PerformanceStatus, string> = {
    insufficient: '',
    progressing: `El e1RM aumenta ~${(avgChange * 100).toFixed(1)} % por sesión.`,
    slow: 'Hay mejora, pero pequeña. Es habitual en personas con más experiencia.',
    normal_variation: 'Las diferencias entre sesiones están dentro de la variación esperable (sueño, hora, nutrición).',
    plateau: 'Sin mejoras en las últimas 3 sesiones respecto a tu mejor marca previa. Es una hipótesis, no un diagnóstico.',
    decline: `Tres sesiones seguidas a la baja (−${(dropFromPeak * 100).toFixed(1)} % desde tu mejor marca).`,
    fatigue: `Rendimiento a la baja (−${(dropFromPeak * 100).toFixed(1)} %) junto con factores de recuperación desfavorables.`,
  }
  const suggestions: Partial<Record<PerformanceStatus, string[]>> = {
    plateau: ['Revisa técnica y rango de movimiento.', 'Prueba otro rango de repeticiones o una variante del ejercicio.', 'Cambia una sola variable a la vez durante 2–3 semanas.'],
    decline: ['Revisa descanso, sueño y alimentación antes de modificar el programa.', 'Si persiste, considera reducir volumen ~30–50 % durante una semana (descarga).'],
    fatigue: ['Considera una semana de descarga: mismas cargas o −10 %, con la mitad de series.', 'Prioriza el sueño y llegar a tu objetivo de proteína.'],
  }
  return { status, label: STATUS_LABEL[status], detail: detailMap[status], hypotheses: [...hyp, ...(suggestions[status] ?? [])], series }
}

/** Series efectivas semanales por grupo muscular (principal = 1, secundario = 0.5). */
export function weeklyVolume(sessions: WorkoutSession[], getEx: (id: string) => Exercise | undefined, from: ISODate, to: ISODate) {
  const vol: Record<string, number> = {}
  const freq: Record<string, Set<string>> = {}
  let tonnage = 0
  for (const s of sessions) {
    if (s.status !== 'completed' || s.deletedAt || dayNum(s.date) < dayNum(from) || dayNum(s.date) > dayNum(to)) continue
    for (const e of s.exercises) {
      const ex = getEx(e.exerciseId)
      const ws = workingSets(e.sets)
      tonnage += ws.reduce((t, x) => t + (x.weightKg ?? 0) * (x.reps ?? 0), 0)
      if (!ex || !ws.length) continue
      for (const m of ex.primary) {
        vol[m] = (vol[m] ?? 0) + ws.length
        ;(freq[m] ??= new Set()).add(s.date)
      }
      for (const m of ex.secondary) vol[m] = (vol[m] ?? 0) + ws.length * 0.5
    }
  }
  return { sets: vol, frequency: Object.fromEntries(Object.entries(freq).map(([k, v]) => [k, v.size])), tonnage }
}

export interface PRCandidate { exerciseId: string; kind: 'e1rm' | 'weight' | 'reps_at_weight'; value: number; weightKg?: number; reps?: number }

/** Récords nuevos de una sesión frente al historial previo (solo series efectivas completadas). */
export function detectPRs(session: WorkoutSession, previous: WorkoutSession[]): PRCandidate[] {
  const out: PRCandidate[] = []
  for (const e of session.exercises) {
    const ws = workingSets(e.sets).filter((s) => s.weightKg && s.reps)
    if (!ws.length) continue
    const prevSets = previous
      .filter((p) => p.id !== session.id && p.status === 'completed' && !p.deletedAt)
      .flatMap((p) => p.exercises.filter((x) => x.exerciseId === e.exerciseId).flatMap((x) => workingSets(x.sets)))
      .filter((s) => s.weightKg && s.reps)
    if (!prevSets.length) continue // la primera sesión no cuenta como récord
    const e1 = Math.max(...ws.map((s) => estimate1RM(s.weightKg!, s.reps!)))
    const prevE1 = Math.max(...prevSets.map((s) => estimate1RM(s.weightKg!, s.reps!)))
    if (e1 > prevE1 + 0.01) out.push({ exerciseId: e.exerciseId, kind: 'e1rm', value: Math.round(e1 * 10) / 10 })
    const maxW = Math.max(...ws.map((s) => s.weightKg!))
    if (maxW > Math.max(...prevSets.map((s) => s.weightKg!))) out.push({ exerciseId: e.exerciseId, kind: 'weight', value: maxW })
    for (const s of ws) {
      const best = Math.max(0, ...prevSets.filter((p) => p.weightKg === s.weightKg).map((p) => p.reps!))
      if (best > 0 && s.reps! > best && !out.some((o) => o.kind === 'reps_at_weight' && o.weightKg === s.weightKg))
        out.push({ exerciseId: e.exerciseId, kind: 'reps_at_weight', value: s.reps!, weightKg: s.weightKg!, reps: s.reps! })
    }
  }
  return out
}

/** Resumen de una sesión terminada. */
export function sessionSummary(s: WorkoutSession) {
  const ws = s.exercises.flatMap((e) => workingSets(e.sets))
  const volume = ws.reduce((t, x) => t + (x.weightKg ?? 0) * (x.reps ?? 0), 0)
  const durationMin = s.endedAt ? Math.round((Date.parse(s.endedAt) - Date.parse(s.startedAt)) / 60000) : null
  const planned = s.exercises.reduce((t, e) => t + e.sets.filter((x) => x.kind === 'working').length, 0)
  return { workingSets: ws.length, plannedSets: planned, volumeKg: Math.round(volume), durationMin, reps: ws.reduce((t, x) => t + (x.reps ?? 0), 0) }
}
