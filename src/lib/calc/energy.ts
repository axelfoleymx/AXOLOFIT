import type { ActivityLevel, Goal, Pace, Sex } from '../types'

/**
 * Mifflin-St Jeor (1990). Estimación poblacional del gasto en reposo, no una medición.
 * Error típico individual ≈ ±10 %.
 */
export function mifflinStJeor(sex: 'male' | 'female', kg: number, cm: number, age: number) {
  const base = 10 * kg + 6.25 * cm - 5 * age
  return sex === 'male' ? base + 5 : base - 161
}

/** Katch-McArdle: requiere % de grasa MEDIDO (DEXA, BIA validada…); no se usa con estimaciones visuales. */
export const katchMcArdle = (kg: number, bodyFatPct: number) => 370 + 21.6 * kg * (1 - bodyFatPct / 100)

export interface BmrResult {
  kcal: number
  method: 'mifflin' | 'mifflin_avg' | 'katch'
  range?: [number, number]
  note: string
}

export function estimateBmr(p: {
  sex: Sex
  kg: number
  cm: number
  age: number
  bodyFatPct?: number | null
  bodyFatMeasured?: boolean
}): BmrResult {
  if (p.bodyFatPct != null && p.bodyFatMeasured && p.bodyFatPct > 3 && p.bodyFatPct < 60) {
    return { kcal: katchMcArdle(p.kg, p.bodyFatPct), method: 'katch', note: 'Katch-McArdle con % de grasa medido.' }
  }
  if (p.sex === 'unspecified') {
    const m = mifflinStJeor('male', p.kg, p.cm, p.age)
    const f = mifflinStJeor('female', p.kg, p.cm, p.age)
    return {
      kcal: (m + f) / 2,
      method: 'mifflin_avg',
      range: [f, m],
      note: 'Sin sexo fisiológico indicado se usa el punto medio de ambas ecuaciones Mifflin-St Jeor (diferencia de 166 kcal). El ajuste por tendencia de peso corregirá la estimación.',
    }
  }
  return { kcal: mifflinStJeor(p.sex, p.kg, p.cm, p.age), method: 'mifflin', note: 'Mifflin-St Jeor: estimación poblacional (±10 % individual).' }
}

/**
 * Factor de actividad COTIDIANA (trabajo, pasos, tareas) SIN el ejercicio planificado.
 * El entrenamiento se suma aparte para no contarlo dos veces.
 */
export const NEAT_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2, // < 5 000 pasos, trabajo sentado
  light: 1.3, // 5 000–7 500
  moderate: 1.4, // 7 500–10 000 o trabajo de pie
  high: 1.5, // 10 000–12 500 o trabajo físico
  very_high: 1.6, // > 12 500 o trabajo físico intenso
}

export const ACTIVITY_LABEL: Record<ActivityLevel, string> = {
  sedentary: 'Sedentaria', light: 'Ligera', moderate: 'Moderada', high: 'Alta', very_high: 'Muy alta',
}

/** Sugerencia del nivel cotidiano a partir de pasos promedio (si existen). */
export function activityFromSteps(steps: number): ActivityLevel {
  if (steps < 5000) return 'sedentary'
  if (steps < 7500) return 'light'
  if (steps < 10000) return 'moderate'
  if (steps < 12500) return 'high'
  return 'very_high'
}

/**
 * Gasto NETO del ejercicio (MET − 1, porque el reposo ya está en la TMB).
 * Fuerza: MET ≈ 3.5–6 según densidad (Compendium of Physical Activities 2011/2024). Se usa 5.0.
 */
export function exerciseKcalPerDay(kg: number, sessionsPerWeek: number, minutesPerSession: number, met = 5.0, extraMinPerWeek = 0, extraMet = 6) {
  const lifting = sessionsPerWeek * minutesPerSession * ((met - 1) * kg) / 60
  const extra = extraMinPerWeek * ((extraMet - 1) * kg) / 60
  return (lifting + extra) / 7
}

export interface TdeeBreakdown { bmr: number; neat: number; exercise: number; tdee: number }

export function estimateTdee(bmr: number, activity: ActivityLevel, exercisePerDay: number): TdeeBreakdown {
  const withNeat = bmr * NEAT_FACTOR[activity]
  return { bmr, neat: withNeat - bmr, exercise: exercisePerDay, tdee: withNeat + exercisePerDay }
}

/** Ritmo semanal objetivo como % del peso corporal. */
export const LOSS_RATE: Record<Pace, number> = { slow: 0.0025, moderate: 0.005, fast: 0.0075 }
export const GAIN_SURPLUS: Record<Pace, number> = { slow: 0.05, moderate: 0.1, fast: 0.15 }
const KCAL_PER_KG = 7700 // aproximación clásica; el tejido perdido no es 100 % grasa

export interface TargetInput {
  sex: Sex
  age: number
  kg: number
  cm: number
  goal: Goal
  pace: Pace
  experience: 'none' | 'beginner' | 'intermediate' | 'advanced'
  tdee: number
  bmr: number
  proteinPerKg?: number // override dentro de 1.2–2.4
  fatPct?: number // 0.2–0.4
}

export interface Targets {
  kcal: number
  proteinG: number
  fatG: number
  carbsG: number
  fiberG: number
  waterMl: number
  rationale: string[]
  warnings: string[]
  proteinRangeG: [number, number]
}

const roundTo = (v: number, step: number) => Math.round(v / step) * step

export function bmi(kg: number, cm: number) {
  const m = cm / 100
  return kg / (m * m)
}

export function computeTargets(i: TargetInput): Targets {
  const rationale: string[] = []
  const warnings: string[] = []
  const minor = i.age < 18
  let kcal = i.tdee

  if (minor) {
    warnings.push('Menor de 18 años: no se aplica déficit automático. Las necesidades de crecimiento requieren supervisión profesional.')
    rationale.push('Calorías ≈ mantenimiento por ser menor de edad.')
  } else if (i.goal === 'fat_loss') {
    const weeklyKg = i.kg * LOSS_RATE[i.pace]
    let deficit = (weeklyKg * KCAL_PER_KG) / 7
    const cap = i.tdee * 0.25
    if (deficit > cap) {
      deficit = cap
      rationale.push('Déficit limitado al 25 % del gasto estimado.')
    }
    kcal = i.tdee - deficit
    rationale.push(`Déficit ≈ ${Math.round(deficit)} kcal/día para ~${(LOSS_RATE[i.pace] * 100).toFixed(2)} % del peso por semana (≈${weeklyKg.toFixed(2)} kg).`)
  } else if (i.goal === 'muscle_gain') {
    const s = GAIN_SURPLUS[i.pace] * (i.experience === 'advanced' ? 0.5 : i.experience === 'intermediate' ? 0.75 : 1)
    kcal = i.tdee * (1 + s)
    rationale.push(`Superávit ≈ ${Math.round(s * 100)} % (ajustado a la experiencia: el potencial de ganancia disminuye con los años de entrenamiento).`)
  } else if (i.goal === 'recomposition') {
    const b = bmi(i.kg, i.cm)
    const d = b >= 25 ? 0.1 : 0.05
    kcal = i.tdee * (1 - d)
    rationale.push(`Recomposición: déficit ligero (${d * 100} %) con proteína alta. Funciona mejor en principiantes o personas con más grasa corporal.`)
  } else rationale.push('Mantenimiento: calorías ≈ gasto estimado.')

  // Suelo de seguridad: nunca por debajo de la TMB estimada ni de 1 200 kcal
  const floor = Math.max(i.bmr, 1200)
  if (kcal < floor) {
    kcal = floor
    warnings.push('El objetivo se elevó al mínimo de seguridad (TMB estimada o 1 200 kcal). Para déficits mayores consulta a un profesional.')
  }
  kcal = roundTo(kcal, 10)

  // Proteína: rango orientativo 1.4–2.0 g/kg (ISSN 2017). En déficit se sugiere la parte alta.
  const b = bmi(i.kg, i.cm)
  let refKg = i.kg
  if (b >= 30) {
    refKg = 25 * (i.cm / 100) ** 2 // peso de referencia a IMC 25
    rationale.push(`IMC ≥ 30: la proteína se calcula sobre un peso de referencia (${refKg.toFixed(1)} kg) para no sobrestimarla.`)
  }
  const defaultPerKg = i.goal === 'fat_loss' || i.goal === 'recomposition' ? 1.8 : 1.6
  const perKg = Math.min(2.4, Math.max(1.2, i.proteinPerKg ?? defaultPerKg))
  const proteinG = roundTo(refKg * perKg, 5)
  rationale.push(`Proteína ${perKg.toFixed(1)} g/kg (rango orientativo 1.4–2.0 g/kg para quienes entrenan fuerza; en déficit puede usarse hasta ~2.2 g/kg, con evidencia más limitada).`)

  // Grasa: 25 % por defecto, mínimo 0.6 g/kg
  const fatPct = Math.min(0.4, Math.max(0.2, i.fatPct ?? 0.25))
  let fatG = (kcal * fatPct) / 9
  const fatMin = 0.6 * refKg
  if (fatG < fatMin) {
    fatG = fatMin
    rationale.push('Grasa elevada al mínimo de 0.6 g/kg.')
  }
  fatG = roundTo(fatG, 5)
  let carbsG = (kcal - proteinG * 4 - fatG * 9) / 4
  if (carbsG < 50) {
    warnings.push('Carbohidratos muy bajos con este objetivo; revisa proteína/grasa o el objetivo calórico.')
    carbsG = Math.max(carbsG, 0)
  }
  carbsG = roundTo(carbsG, 5)

  const fiberG = roundTo((kcal / 1000) * 14, 1) // 14 g por 1 000 kcal (IOM)
  const waterMl = roundTo(i.kg * 35, 50)

  return {
    kcal, proteinG, fatG, carbsG, fiberG, waterMl, rationale, warnings,
    proteinRangeG: [roundTo(refKg * 1.4, 5), roundTo(refKg * 2.0, 5)],
  }
}

/** Diferencia entre las kcal objetivo y las derivadas de macros (redondeos/etiquetado). */
export function macroConsistency(kcal: number, p: number, c: number, f: number) {
  const fromMacros = 4 * p + 4 * c + 9 * f
  const diffPct = kcal > 0 ? (fromMacros - kcal) / kcal : 0
  return { fromMacros, diffPct, ok: Math.abs(diffPct) <= 0.05 }
}

/** Advertencias de seguridad para objetivos manuales: se respetan, pero se avisa. */
export function manualTargetWarnings(kcal: number, bmr: number, proteinG: number, kg: number, age: number) {
  const w: string[] = []
  if (kcal < bmr) w.push(`Tu objetivo (${kcal} kcal) está por debajo de tu metabolismo basal estimado (${Math.round(bmr)} kcal).`)
  if (kcal < 1200) w.push('Menos de 1 200 kcal/día suele requerir supervisión profesional.')
  if (proteinG / kg > 3) w.push('Más de 3 g/kg de proteína excede lo estudiado habitualmente.')
  if (age < 18) w.push('En menores de edad no se recomiendan objetivos de déficit sin supervisión.')
  return w
}
