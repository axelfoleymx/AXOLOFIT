import { repo } from '../db/db'
import { addDays } from '../calc/weight'
import { dayTotals, itemNutrients, MEAL_LABEL } from '../calc/nutrition'
import { classifyTrend, movingAverage7, periodChange, trendSlope } from '../calc/weight'
import { recommendNext, workingSets } from '../calc/progression'
import { analyzePerformance, exerciseHistory, sessionSummary, weeklyVolume } from '../calc/training'
import { generateRoutine } from '../calc/routine'
import { suggestForRemaining } from '../calc/menu'
import { EXERCISES, getExercise, MUSCLE_LABEL, substitutesFor } from '../exercises'
import { exclusionTerms, foodLookup, loadRecipes } from '../../features/nutrition/catalog'
import { nextDay, isBodyweight, daysSince } from '../../features/training/logic'
import type { MealType } from '../types'
import type { CoachToolName } from './toolDefs'

// Ejecutores de las herramientas del coach. Todo es código determinista sobre los datos reales del usuario;
// la IA (si está conectada) solo explica estos resultados.

const r1 = (n: number | null | undefined, d = 1) => (n == null ? null : Math.round(n * 10 ** d) / 10 ** d)
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')

export function findExercise(q: string, candidates?: string[]) {
  const nq = norm(q)
  const pool = candidates?.length ? EXERCISES.filter((e) => candidates.includes(e.id)) : EXERCISES
  return pool.find((e) => e.id === q) ?? pool.find((e) => norm(e.name) === nq) ?? pool.find((e) => norm(e.name).includes(nq)) ?? pool.find((e) => nq.split(/\s+/).filter((w) => w.length > 3).every((w) => norm(e.name).includes(w)))
}

export async function runTool(userId: string, today: string, name: CoachToolName, input: Record<string, unknown>): Promise<unknown> {
  const [profile] = await repo.list('profiles', userId)
  const [prefs] = await repo.list('preferences', userId)
  const targets = (await repo.list('targets', userId)).sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0]
  switch (name) {
    case 'get_profile':
      if (!profile) return { error: 'Sin perfil' }
      return {
        nombre: profile.displayName, edad: profile.age, sexo: profile.sex, estatura_cm: profile.heightCm, peso_kg: profile.weightKg,
        objetivo: prefs?.goal, ritmo: prefs?.pace, experiencia: prefs?.experience, dias_entreno: prefs?.trainingDays, minutos_sesion: prefs?.sessionMinutes,
        equipamiento: prefs?.equipment, dieta: prefs?.diet, alergias: prefs?.allergies, no_le_gusta: prefs?.dislikedFoods, lesiones: prefs?.injuries || null,
        objetivos_nutricionales: targets ? { modo: targets.mode, kcal: targets.kcal, proteina_g: targets.proteinG, carbos_g: targets.carbsG, grasa_g: targets.fatG, desde: targets.validFrom } : null,
      }
    case 'get_day_nutrition': {
      const date = (input.date as string) || today
      const items = await repo.byDate('foodLogs', userId, date, date)
      const t = dayTotals(items).total
      return {
        fecha: date, registros: items.length,
        consumido: { kcal: r1(t.kcal, 0), proteina_g: r1(t.protein), carbos_g: r1(t.carbs), grasa_g: r1(t.fat), fibra_g: r1(t.fiber) },
        objetivo: targets ? { kcal: targets.kcal, proteina_g: targets.proteinG, carbos_g: targets.carbsG, grasa_g: targets.fatG } : null,
        restante: targets ? { kcal: r1(targets.kcal - t.kcal, 0), proteina_g: r1(targets.proteinG - t.protein), carbos_g: r1(targets.carbsG - t.carbs), grasa_g: r1(targets.fatG - t.fat) } : null,
        alimentos: items.map((i) => ({ comida: MEAL_LABEL[i.meal], nombre: i.foodName, gramos: i.grams, kcal: r1(itemNutrients(i).kcal, 0) })),
        nota_datos: t.incomplete.includes('protein') ? 'Algunos alimentos no tienen proteína registrada' : null,
      }
    }
    case 'get_nutrition_summary': {
      const days = Math.min(90, Math.max(1, Number(input.days) || 7))
      const items = await repo.byDate('foodLogs', userId, addDays(today, -(days - 1)), today)
      const by = new Map<string, typeof items>()
      for (const i of items) by.set(i.date, [...(by.get(i.date) ?? []), i])
      const totals = [...by.values()].map((d) => dayTotals(d).total)
      const avg = (k: 'kcal' | 'protein') => (totals.length ? totals.reduce((s, t) => s + t[k], 0) / totals.length : null)
      return { dias: days, dias_con_registro: totals.length, kcal_promedio: r1(avg('kcal'), 0), proteina_promedio_g: r1(avg('protein')), objetivo_kcal: targets?.kcal, objetivo_proteina_g: targets?.proteinG }
    }
    case 'get_weight_trend': {
      const days = Math.min(365, Math.max(7, Number(input.days) || 30))
      const w = await repo.byDate('weights', userId, addDays(today, -(days - 1)), today)
      const ma = movingAverage7(w)
      const s = trendSlope(w, 21, today)
      return {
        pesajes: w.length, ultimo: ma.length ? { fecha: ma[ma.length - 1].date, kg: r1(ma[ma.length - 1].kg), promedio_7d: r1(ma[ma.length - 1].avg7, 2) } : null,
        tendencia: classifyTrend(s), kg_por_semana: r1(s?.kgPerWeek, 2), cambio_7d: r1(periodChange(w, addDays(today, -7), today), 2), cambio_30d: r1(periodChange(w, addDays(today, -30), today), 2),
        nota: 'El cambio de peso no equivale a cambio de grasa; fluctuaciones de 1–2 kg son normales.',
      }
    }
    case 'get_training_overview': {
      const sessions = await repo.list('sessions', userId)
      const plans = await repo.list('plans', userId)
      const plan = plans.find((p) => p.active)
      const done = sessions.filter((s) => s.status === 'completed').sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      const nd = nextDay(plan, sessions)
      return {
        rutina_activa: plan ? { nombre: plan.name, division: plan.split, dias: plan.days.map((d) => d.name) } : null,
        siguiente_dia: nd ? { nombre: nd.name, ejercicios: nd.exercises.map((e) => { const r = recommendNext(e.config, exerciseHistory(sessions, e.exerciseId), isBodyweight(e.exerciseId)); return { ejercicio: getExercise(e.exerciseId)?.name, accion: r.action, peso_kg: r.weightKg, series: r.sets, reps_objetivo: r.repTargets, rango: r.repRange, rir: r.rirTarget } }) } : null,
        dias_desde_ultimo: daysSince(done[0]?.date, today),
        sesiones_ultimos_7: done.filter((s) => s.date >= addDays(today, -6)).length,
        sesiones_recientes: done.slice(0, 5).map((s) => ({ fecha: s.date, nombre: s.name, ...sessionSummary(s) })),
        volumen_7d_series: Object.fromEntries(Object.entries(weeklyVolume(sessions, getExercise, addDays(today, -6), today).sets).map(([m, v]) => [MUSCLE_LABEL[m], v])),
      }
    }
    case 'get_exercise_recommendation': {
      const sessions = await repo.list('sessions', userId)
      const usedIds = [...new Set(sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId)))]
      const ex = findExercise(String(input.exercise ?? ''), usedIds) ?? findExercise(String(input.exercise ?? ''))
      if (!ex) return { error: `No encontré el ejercicio «${input.exercise}» en la biblioteca` }
      const plans = await repo.list('plans', userId)
      const cfg = plans.flatMap((p) => p.days.flatMap((d) => d.exercises)).find((e) => e.exerciseId === ex.id)?.config ?? { repMin: ex.repRange[0], repMax: ex.repRange[1], sets: 3, rirMin: 1, rirMax: 3, increment: ex.increment, restSec: 120 }
      const hist = exerciseHistory(sessions, ex.id)
      const rec = recommendNext(cfg, hist, isBodyweight(ex.id))
      const recovery = await repo.byDate('recovery', userId, addDays(today, -13), today)
      const sleeps = recovery.map((r) => r.sleepHours).filter((x): x is number => x != null)
      const a = analyzePerformance(hist, { avgSleepH: sleeps.length ? sleeps.reduce((s, x) => s + x, 0) / sleeps.length : null, daysSinceLast: daysSince(hist[0]?.date, today) })
      return {
        ejercicio: ex.name, configuracion: cfg,
        historial: hist.slice(0, 5).map((h) => ({ fecha: h.date, series: workingSets(h.sets).map((s) => ({ kg: s.weightKg, reps: s.reps, rir: s.rir })) })),
        recomendacion: { accion: rec.action, titulo: rec.headline, mensaje: rec.message, peso_kg: rec.weightKg, reps_objetivo: rec.repTargets, condicion_progreso: rec.progressCondition, evidencia: rec.evidence, confianza: rec.confidence, requiere_revision_usuario: true },
        analisis: { estado: a.label, detalle: a.detail, hipotesis: a.hypotheses },
      }
    }
    case 'get_substitutes': {
      const ex = findExercise(String(input.exercise ?? ''))
      if (!ex) return { error: `No encontré «${input.exercise}»` }
      return { ejercicio: ex.name, alternativas: substitutesFor(ex.id, prefs?.equipment, 6).map((s) => ({ nombre: s.name, equipo: s.equipment, musculos: s.primary.map((m) => MUSCLE_LABEL[m]) })) }
    }
    case 'get_recovery': {
      const days = Math.min(60, Math.max(1, Number(input.days) || 14))
      const r = await repo.byDate('recovery', userId, addDays(today, -(days - 1)), today)
      const sessions = (await repo.list('sessions', userId)).filter((s) => s.status === 'completed' && s.date >= addDays(today, -(days - 1)))
      const avg = (k: 'sleepHours' | 'fatigue' | 'soreness' | 'hunger') => { const v = r.map((x) => x[k]).filter((x): x is number => x != null); return v.length ? r1(v.reduce((a, b) => a + b, 0) / v.length) : null }
      return { dias: days, registros: r.length, sueno_promedio_h: avg('sleepHours'), fatiga_promedio_1a5: avg('fatigue'), dolor_muscular_1a5: avg('soreness'), hambre_1a5: avg('hunger'), molestias_en_series: sessions.flatMap((s) => s.exercises.filter((e) => e.painNote || e.sets.some((x) => x.pain)).map((e) => ({ fecha: s.date, ejercicio: e.exerciseName, nota: e.painNote ?? null }))) }
    }
    case 'suggest_meals': {
      const meal = (input.meal as MealType) || 'cena'
      const items = await repo.byDate('foodLogs', userId, today, today)
      const t = dayTotals(items).total
      if (!targets) return { error: 'Sin objetivos definidos' }
      const recipes = await loadRecipes()
      const s = suggestForRemaining(recipes, foodLookup, targets.kcal - t.kcal, targets.proteinG - t.protein, { excludeTerms: exclusionTerms(prefs), vegetarian: prefs?.diet.some((d) => d === 'vegetariano' || d === 'vegano') }, meal, 3, targets.kcal * (meal.startsWith('colacion') ? 0.15 : 0.4))
      return { restante_kcal: r1(targets.kcal - t.kcal, 0), restante_proteina_g: r1(targets.proteinG - t.protein), opciones: s.map((o) => ({ receta: o.recipe.name, escala: o.scale, kcal: r1(o.kcal, 0), proteina_g: r1(o.protein), ingredientes: o.ingredients.map((i) => `${i.foodName} ${i.grams} g`) })), nota: 'Valores calculados con el catálogo; se suman al diario solo si la persona confirma que lo comió.' }
    }
    case 'compare_periods': {
      const n = input.period === 'month' ? 30 : 7
      const range = (off: number) => [addDays(today, -(n * (off + 1) - 1)), addDays(today, -n * off)] as const
      const summary = async ([f, t]: readonly [string, string]) => {
        const items = await repo.byDate('foodLogs', userId, f, t)
        const by = new Map<string, typeof items>()
        for (const i of items) by.set(i.date, [...(by.get(i.date) ?? []), i])
        const totals = [...by.values()].map((d) => dayTotals(d).total)
        const w = await repo.byDate('weights', userId, f, t)
        const s = (await repo.list('sessions', userId)).filter((x) => x.status === 'completed' && x.date >= f && x.date <= t)
        return { desde: f, hasta: t, dias_registrados: totals.length, kcal_media: r1(totals.length ? totals.reduce((a, b) => a + b.kcal, 0) / totals.length : null, 0), proteina_media: r1(totals.length ? totals.reduce((a, b) => a + b.protein, 0) / totals.length : null), peso_medio: r1(w.length ? w.reduce((a, b) => a + b.kg, 0) / w.length : null, 2), sesiones: s.length, volumen_kg: Math.round(s.reduce((a, x) => a + sessionSummary(x).volumeKg, 0)) }
      }
      return { actual: await summary(range(0)), anterior: await summary(range(1)), nota: 'Asociaciones, no causalidad.' }
    }
    case 'preview_routine': {
      const days = Math.min(6, Math.max(1, Number(input.days) || 3))
      const r = generateRoutine({ days, minutes: prefs?.sessionMinutes ?? 60, experience: prefs?.experience ?? 'beginner', goal: prefs?.goal ?? 'maintenance', equipment: prefs?.equipment ?? ['bodyweight'], avoid: prefs?.avoidExercises ?? [], favorites: prefs?.favoriteExercises ?? [] }, EXERCISES)
      return { division: r.split, dias: r.days.map((d) => ({ nombre: d.name, ejercicios: d.exercises.map((e) => `${getExercise(e.exerciseId)?.name} ${e.config.sets}×${e.config.repMin}-${e.config.repMax} RIR ${e.config.rirMin}-${e.config.rirMax}`) })), notas: r.notes, guardado: false }
    }
  }
}
