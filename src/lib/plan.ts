import type { NutritionTargets, Preferences, Profile } from './types'
import { computeTargets, estimateBmr, estimateTdee, exerciseKcalPerDay, LOSS_RATE } from './calc/energy'

export type PlanInput = Pick<Profile, 'sex' | 'age' | 'heightCm' | 'weightKg' | 'bodyFatPct' | 'bodyFatOrigin'> &
  Pick<Preferences, 'goal' | 'pace' | 'experience' | 'activity' | 'trainingDays' | 'sessionMinutes' | 'extraActivityMinPerWeek'>

/** Cálculo completo y transparente de objetivos a partir del perfil (todo determinista). */
export function computePlan(p: PlanInput) {
  const bmr = estimateBmr({ sex: p.sex, kg: p.weightKg, cm: p.heightCm, age: p.age, bodyFatPct: p.bodyFatPct, bodyFatMeasured: p.bodyFatOrigin === 'measured' })
  const ex = exerciseKcalPerDay(p.weightKg, p.trainingDays, p.sessionMinutes, 5, p.extraActivityMinPerWeek)
  const tdee = estimateTdee(bmr.kcal, p.activity, ex)
  const targets = computeTargets({ sex: p.sex, age: p.age, kg: p.weightKg, cm: p.heightCm, goal: p.goal, pace: p.pace, experience: p.experience, tdee: tdee.tdee, bmr: bmr.kcal })
  return { bmr, tdee, targets }
}

/** Ritmo objetivo en kg/semana según objetivo (para el ajuste adaptativo). */
export function targetRate(goal: Preferences['goal'], pace: Preferences['pace'], kg: number) {
  if (goal === 'fat_loss') return -kg * LOSS_RATE[pace]
  if (goal === 'muscle_gain') return kg * ({ slow: 0.001, moderate: 0.0025, fast: 0.004 }[pace])
  if (goal === 'recomposition') return -kg * 0.001
  return 0
}

export function targetsRow(plan: ReturnType<typeof computePlan>, today: string): Omit<NutritionTargets, 'id' | 'userId' | 'createdAt' | 'updatedAt'> {
  const t = plan.targets
  return {
    mode: 'calculated', kcal: t.kcal, proteinG: t.proteinG, carbsG: t.carbsG, fatG: t.fatG, fiberG: t.fiberG, waterMl: t.waterMl, validFrom: today,
    rationale: [plan.bmr.note, `TMB ${Math.round(plan.bmr.kcal)} · actividad cotidiana +${Math.round(plan.tdee.neat)} · ejercicio +${Math.round(plan.tdee.exercise)} = gasto ${Math.round(plan.tdee.tdee)} kcal`, ...t.rationale].join('\n'),
  }
}

export const GOAL_LABEL = { fat_loss: 'Pérdida de grasa', maintenance: 'Mantenimiento', muscle_gain: 'Ganancia muscular', recomposition: 'Recomposición corporal' } as const
export const EXPERIENCE_LABEL = { none: 'Nunca he entrenado', beginner: 'Principiante (< 1 año)', intermediate: 'Intermedio (1–3 años)', advanced: 'Avanzado (> 3 años)' } as const
export const PACE_LABEL = { slow: 'Lento', moderate: 'Moderado', fast: 'Rápido' } as const

export function localToday(tz?: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
