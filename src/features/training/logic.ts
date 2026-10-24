import { repo, uid } from '../../lib/db/db'
import { getExercise } from '../../lib/exercises'
import { exerciseHistory } from '../../lib/calc/training'
import { recommendNext } from '../../lib/calc/progression'
import type { PlanExercise, ProgressionConfig, WorkoutDay, WorkoutExerciseLog, WorkoutPlan, WorkoutSession, WorkoutSet } from '../../lib/types'

/** Día siguiente de la rutina: el posterior al último día completado (rotación). */
export function nextDay(plan: WorkoutPlan | undefined, sessions: WorkoutSession[]): WorkoutDay | undefined {
  if (!plan?.days.length) return undefined
  const last = sessions.filter((s) => s.status === 'completed' && s.planId === plan.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
  if (!last) return plan.days[0]
  const i = plan.days.findIndex((d) => d.id === last.dayId)
  return plan.days[(i + 1) % plan.days.length]
}

export const isBodyweight = (exerciseId: string) => getExercise(exerciseId)?.equipment === 'bodyweight'

/** Construye las series de un ejercicio a partir de la recomendación calculada (sin aplicarla: el usuario edita). */
export function buildExerciseLog(exerciseId: string, config: ProgressionConfig, warmupSets: number, sessions: WorkoutSession[]): WorkoutExerciseLog {
  const ex = getExercise(exerciseId)
  const rec = recommendNext(config, exerciseHistory(sessions, exerciseId), isBodyweight(exerciseId))
  const sets: WorkoutSet[] = []
  const w = rec.weightKg
  for (let i = 0; i < warmupSets; i++) {
    const pct = warmupSets === 1 ? 0.6 : i === 0 ? 0.5 : 0.75
    sets.push({ id: uid(), kind: 'warmup', weightKg: w ? Math.round((w * pct) / 2.5) * 2.5 : null, reps: i === 0 ? 8 : 5, rir: null, done: false })
  }
  for (let i = 0; i < config.sets; i++) sets.push({ id: uid(), kind: 'working', weightKg: w, reps: null, rir: null, done: false })
  return { exerciseId, exerciseName: ex?.name ?? exerciseId, config, sets }
}

export async function startSession(userId: string, today: string, sessions: WorkoutSession[], plan?: WorkoutPlan, day?: WorkoutDay) {
  const exercises = (day?.exercises ?? []).sort((a, b) => a.order - b.order).map((pe: PlanExercise) => buildExerciseLog(pe.exerciseId, pe.config, pe.warmupSets, sessions))
  const s = await repo.put('sessions', userId, {
    planId: plan?.id ?? null, dayId: day?.id ?? null, name: day?.name ?? 'Entrenamiento libre', date: today, startedAt: new Date().toISOString(),
    endedAt: null, status: 'active', exercises, fatigue: null, note: null, origin: 'user',
  })
  return s
}

export const defaultConfig = (exerciseId: string): ProgressionConfig => {
  const e = getExercise(exerciseId)
  return { repMin: e?.repRange[0] ?? 8, repMax: e?.repRange[1] ?? 12, sets: 3, rirMin: 1, rirMax: 3, increment: e?.increment ?? 2.5, restSec: e?.mechanic === 'compound' ? 150 : 90 }
}

export function daysSince(iso: string | undefined, today: string) {
  if (!iso) return null
  return Math.round((Date.parse(today) - Date.parse(iso.slice(0, 10))) / 86400000)
}
