import type { ISODate, ProgressionConfig, WorkoutSet } from '../types'

/** Una sesión pasada de un ejercicio, la más reciente primero en los arreglos de historial. */
export interface ExerciseSessionHistory {
  date: ISODate
  sets: WorkoutSet[]
  techniqueOk?: boolean
  painNote?: string
  fatigue?: number | null // 1–5 de la sesión
}

export type ProgressionAction =
  | 'establish' // sin historial: sesión de referencia
  | 'complete_data' // faltan datos para decidir
  | 'add_reps'
  | 'increase_load'
  | 'consolidate' // incremento disponible demasiado grande
  | 'keep' // mantener carga y repeticiones (variación normal / esfuerzo excesivo)
  | 'retry_new_load' // primera sesión tras subir carga por debajo del rango
  | 'reduce_load'
  | 'technique'
  | 'pain_stop'
  | 'consider_deload'

export interface ProgressionRecommendation {
  action: ProgressionAction
  weightKg: number | null
  sets: number
  repTargets: number[] | null
  repRange: [number, number]
  rirTarget: [number, number]
  headline: string
  message: string
  progressCondition: string
  evidence: string[]
  confidence: 'low' | 'medium' | 'high'
  requiresReview: true // nunca se aplica automáticamente
}

/** e1RM estimado (Epley) usando repeticiones hasta el fallo ≈ reps + RIR. Fiable para ≤ 12 reps. */
export function estimate1RM(weightKg: number, reps: number, rir = 0) {
  const r = reps + Math.max(0, rir)
  if (weightKg <= 0 || reps <= 0) return 0
  if (r === 1) return weightKg
  return weightKg * (1 + r / 30)
}

/** Repeticiones esperadas a una carga dada a partir de un e1RM (inversa de Epley), restando RIR objetivo. */
export function predictReps(e1rm: number, weightKg: number, rir = 0) {
  if (weightKg <= 0) return 0
  return Math.floor(30 * (e1rm / weightKg - 1)) - rir
}

/** Redondea al múltiplo alcanzable con el incremento disponible. */
export function roundToIncrement(kg: number, inc: number, mode: 'nearest' | 'down' | 'up' = 'nearest') {
  if (!inc || inc <= 0) return Math.round(kg * 10) / 10
  const f = mode === 'down' ? Math.floor : mode === 'up' ? Math.ceil : Math.round
  return Math.round(f(kg / inc) * inc * 100) / 100
}

export const workingSets = (s: WorkoutSet[]) => s.filter((x) => x.kind === 'working' && x.done)

const fmt = (kg: number | null) => (kg == null ? '—' : `${Number.isInteger(kg) ? kg : kg.toFixed(1)} kg`)
const repsStr = (r: number[]) => r.join(', ')

/** Carga de referencia de una sesión: la más usada en las series efectivas (la mayor si empatan). */
export function sessionLoad(sets: WorkoutSet[]) {
  const w = workingSets(sets).filter((s) => s.weightKg != null)
  if (!w.length) return null
  const count = new Map<number, number>()
  for (const s of w) count.set(s.weightKg!, (count.get(s.weightKg!) ?? 0) + 1)
  return [...count.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0]
}

export function bestE1RM(sets: WorkoutSet[]) {
  return Math.max(0, ...workingSets(sets).filter((s) => s.weightKg && s.reps).map((s) => estimate1RM(s.weightKg!, s.reps!, s.rir ?? 0)))
}

/** Objetivos de repeticiones para sumar de forma gradual: igualar las series rezagadas a la primera. */
export function nextRepTargets(reps: number[], repMax: number) {
  if (!reps.length) return []
  const allEqual = reps.every((r) => r === reps[0])
  const t: number[] = []
  t[0] = Math.min(repMax, allEqual ? reps[0] + 1 : reps[0])
  for (let i = 1; i < reps.length; i++) t[i] = Math.min(repMax, Math.max(reps[i], Math.min(reps[i] + 1, t[i - 1])))
  return t
}

export function recommendNext(config: ProgressionConfig, history: ExerciseSessionHistory[], bodyweightExercise = false): ProgressionRecommendation {
  const base = {
    sets: config.sets,
    repRange: [config.repMin, config.repMax] as [number, number],
    rirTarget: [config.rirMin, config.rirMax] as [number, number],
    requiresReview: true as const,
  }
  const range = `${config.repMin}–${config.repMax}`
  const rirTxt = config.rirMin === config.rirMax ? `${config.rirMin}` : `${config.rirMin}–${config.rirMax}`

  if (!history.length) {
    return {
      ...base, action: 'establish', weightKg: null, repTargets: null, confidence: 'low',
      headline: 'Sesión de referencia',
      message: `Aún no hay historial de este ejercicio. Elige una carga con la que puedas hacer ${config.sets} series de ${range} repeticiones dejando ${rirTxt} repeticiones en reserva con buena técnica. Esa sesión será la base de las recomendaciones.`,
      progressCondition: 'Registra peso, repeticiones y RIR de cada serie.',
      evidence: ['Sin sesiones previas registradas.'],
    }
  }

  const last = history[0]
  const sets = workingSets(last.sets)
  const evidence: string[] = []
  const weight = sessionLoad(last.sets)

  if (last.painNote || last.sets.some((s) => s.pain)) {
    return {
      ...base, action: 'pain_stop', weightKg: weight, repTargets: null, confidence: 'high',
      headline: 'Molestia registrada: no progresar',
      message: `En tu última sesión (${last.date}) registraste dolor o molestia${last.painNote ? `: “${last.painNote}”` : ''}. No entrenes a través del dolor: prueba una carga menor, un rango sin dolor o una variante que no lo provoque. Si persiste o es intenso, consulta a un profesional de la salud.`,
      progressCondition: 'Retomaremos la progresión cuando completes una sesión sin molestias.',
      evidence: [`Molestia registrada el ${last.date}.`],
    }
  }

  const incomplete = sets.length === 0 || sets.some((s) => s.reps == null || (!bodyweightExercise && s.weightKg == null))
  if (incomplete || weight == null && !bodyweightExercise) {
    return {
      ...base, action: 'complete_data', weightKg: weight, repTargets: null, confidence: 'low',
      headline: 'Faltan datos',
      message: 'La última sesión tiene series sin peso o repeticiones. Completa esos datos (puedes editar la sesión) para calcular una recomendación fiable. Mientras tanto, repite la misma carga.',
      progressCondition: 'Peso y repeticiones en todas las series efectivas.',
      evidence: [`${sets.length} series completadas registradas el ${last.date}.`],
    }
  }

  const atLoad = sets.filter((s) => bodyweightExercise || s.weightKg === weight)
  const reps = atLoad.map((s) => s.reps!)
  const rirs = atLoad.map((s) => s.rir).filter((r): r is number => r != null)
  const avgRir = rirs.length ? rirs.reduce((a, b) => a + b, 0) / rirs.length : null
  evidence.push(`Última sesión (${last.date}): ${fmt(weight)} × ${repsStr(reps)}${rirs.length ? ` · RIR ${rirs.join(', ')}` : ' · sin RIR registrado'}.`)
  const prev = history[1]
  if (prev) {
    const pw = sessionLoad(prev.sets)
    const pr = workingSets(prev.sets).filter((s) => bodyweightExercise || s.weightKg === pw).map((s) => s.reps ?? 0)
    evidence.push(`Sesión anterior (${prev.date}): ${fmt(pw)} × ${repsStr(pr)}.`)
  }
  const confidence: ProgressionRecommendation['confidence'] = rirs.length === reps.length && history.length >= 2 ? 'high' : rirs.length ? 'medium' : 'low'

  if (last.techniqueOk === false) {
    return {
      ...base, action: 'technique', weightKg: weight, repTargets: reps, confidence,
      headline: 'Prioriza la técnica',
      message: `Marcaste técnica deficiente. Mantén ${fmt(weight)} y repite ${repsStr(reps)} con ejecución limpia antes de añadir repeticiones o carga.`,
      progressCondition: 'Una sesión con técnica correcta habilita la progresión.',
      evidence,
    }
  }

  // Esfuerzo demasiado alto (RIR claramente por debajo del objetivo): no forzar
  if (avgRir != null && avgRir < config.rirMin - 0.5) {
    const fatigueNote = last.fatigue != null && last.fatigue >= 4 ? ' También registraste fatiga alta.' : ''
    return {
      ...base, action: 'keep', weightKg: weight, repTargets: reps, confidence,
      headline: 'Mantén carga y repeticiones',
      message: `Llegaste muy cerca del fallo (RIR medio ${avgRir.toFixed(1)} vs. objetivo ${rirTxt}).${fatigueNote} Repite ${fmt(weight)} × ${repsStr(reps)} buscando RIR ${rirTxt}; cuando esas repeticiones salgan con margen, volveremos a progresar.`,
      progressCondition: `Mismas repeticiones con RIR ≥ ${config.rirMin}.`,
      evidence,
    }
  }

  // Tendencia de varias sesiones (para decidir si una caída es puntual o persistente)
  const e1rms = history.slice(0, 4).map((h) => bestE1RM(h.sets))
  // Una caída de e1RM tras subir la carga es esperable; solo cuenta si la carga no aumentó
  const loads = history.slice(0, 3).map((h) => sessionLoad(h.sets) ?? 0)
  const declining = e1rms.length >= 3 && e1rms[0] < e1rms[1] && e1rms[1] < e1rms[2] && loads[0] <= loads[2]
  const dropPct = e1rms.length >= 3 && e1rms[2] > 0 ? (e1rms[2] - e1rms[0]) / e1rms[2] : 0

  const allTop = reps.length >= config.sets && reps.every((r) => r >= config.repMax)
  const rirOk = avgRir == null || avgRir >= config.rirMin
  if (allTop && rirOk) {
    if (bodyweightExercise || config.increment <= 0) {
      return {
        ...base, action: 'consolidate', weightKg: weight, repTargets: reps.map(() => config.repMax), confidence,
        headline: 'Rango superior alcanzado',
        message: `Completaste ${repsStr(reps)} (rango ${range}). Sin incremento de carga disponible: añade lastre, usa una variante más difícil, ralentiza la bajada o añade una serie si tu volumen semanal lo permite.`,
        progressCondition: 'Elige una variante más exigente y vuelve a la parte baja del rango.',
        evidence,
      }
    }
    const newW = roundToIncrement(weight! + config.increment, config.increment)
    const jump = (newW - weight!) / weight!
    const e1 = bestE1RM(last.sets)
    const predicted = predictReps(e1, newW, config.rirMin)
    if (jump > 0.1) {
      return {
        ...base, action: 'consolidate', weightKg: weight, repTargets: reps.map(() => Math.min(config.repMax + 2, config.repMax + 1)), confidence,
        headline: 'Consolida antes de subir',
        message: `El siguiente incremento disponible (${fmt(weight)} → ${fmt(newW)}) supone +${Math.round(jump * 100)} %, demasiado para una progresión gradual. Mantén ${fmt(weight)} y suma 1–2 repeticiones por encima del rango, o usa microcargas si las tienes.`,
        progressCondition: `Con ${config.repMax + 2} repeticiones en todas las series, el salto a ${fmt(newW)} será más asumible.`,
        evidence: [...evidence, `Repeticiones estimadas a ${fmt(newW)}: ~${Math.max(0, predicted)}.`],
      }
    }
    const target = Math.max(config.repMin, Math.min(config.repMin + 2, predicted))
    return {
      ...base, action: 'increase_load', weightKg: newW, repTargets: Array(config.sets).fill(target), confidence,
      headline: `Sube a ${fmt(newW)}`,
      message: `Completaste el rango superior en todas las series (${repsStr(reps)}) con el esfuerzo objetivo. Sube a ${fmt(newW)} (+${fmt(newW - weight!)}) y apunta a ~${target} repeticiones por serie con RIR ${rirTxt}.`,
      progressCondition: `Vuelve a acumular repeticiones hasta ${config.repMax} en todas las series.`,
      evidence: [...evidence, `e1RM estimado ${e1.toFixed(1)} kg → ~${predicted} reps a ${fmt(newW)} dejando RIR ${config.rirMin}.`],
    }
  }

  const belowMin = reps.some((r) => r < config.repMin) || reps.length < config.sets
  if (belowMin) {
    const prevW = prev ? sessionLoad(prev.sets) : null
    const justIncreased = prevW != null && weight! > prevW
    const prevAlsoBelow = prev && prevW === weight && workingSets(prev.sets).some((s) => (s.reps ?? 0) < config.repMin)
    if (bodyweightExercise || weight == null) {
      return {
        ...base, action: 'keep', weightKg: weight, repTargets: reps.map((r) => Math.max(r, config.repMin)), confidence,
        headline: 'Mantén la variante actual',
        message: `Quedaste por debajo de ${config.repMin} repeticiones. Repite la misma variante o usa una versión más asistida para entrenar dentro del rango ${range}.`,
        progressCondition: `${config.repMin} repeticiones en todas las series.`,
        evidence,
      }
    }
    if (justIncreased) {
      return {
        ...base, action: 'retry_new_load', weightKg: weight, repTargets: reps.map((r) => Math.max(r, config.repMin)), confidence,
        headline: 'Consolida la nueva carga',
        message: `Es normal quedar por debajo del rango justo después de subir carga (${fmt(prevW)} → ${fmt(weight)}). Repite ${fmt(weight)} e intenta llegar a ${config.repMin} en todas las series.`,
        progressCondition: `Si en dos sesiones sigues por debajo de ${config.repMin}, volveremos temporalmente a ${fmt(prevW)}.`,
        evidence,
      }
    }
    if (declining && dropPct > 0.05) {
      const reduced = roundToIncrement(weight! * 0.9, config.increment || 1, 'down')
      return {
        ...base, action: 'consider_deload', weightKg: reduced, repTargets: null, confidence: 'medium',
        headline: 'Posible fatiga acumulada',
        message: `Tu rendimiento ha bajado en 3 sesiones seguidas (e1RM −${(dropPct * 100).toFixed(1)} %). Antes de cambiar muchas variables revisa sueño, alimentación y estrés. Una opción razonable: ${fmt(reduced)} (≈ −10 %) o reducir 1 serie durante una semana.`,
        progressCondition: 'Si el rendimiento se recupera, retomaremos la progresión desde la carga previa.',
        evidence: [...evidence, `e1RM últimas sesiones: ${e1rms.map((x) => x.toFixed(1)).join(' → ')} kg (más reciente primero).`],
      }
    }
    if (prevAlsoBelow) {
      const reduced = roundToIncrement(weight! - (config.increment || weight! * 0.05), config.increment || 1, 'down')
      return {
        ...base, action: 'reduce_load', weightKg: reduced, repTargets: Array(config.sets).fill(config.repMin), confidence,
        headline: `Baja a ${fmt(reduced)} temporalmente`,
        message: `Dos sesiones seguidas por debajo de ${config.repMin} repeticiones con ${fmt(weight)}. Usa ${fmt(reduced)} para entrenar dentro del rango ${range} y volver a construir repeticiones.`,
        progressCondition: `Cuando completes ${config.repMax} en todas las series, volverás a ${fmt(weight)}.`,
        evidence,
      }
    }
    return {
      ...base, action: 'keep', weightKg: weight, repTargets: reps.map((r) => Math.max(r, config.repMin)), confidence,
      headline: `Mantén ${fmt(weight)}`,
      message: `Una sesión por debajo del rango no indica pérdida de fuerza. Repite ${fmt(weight)} y busca al menos ${config.repMin} repeticiones por serie con RIR ${rirTxt}.`,
      progressCondition: 'Si se repite en la siguiente sesión, ajustaremos la carga.',
      evidence,
    }
  }

  const targets = nextRepTargets(reps.slice(0, config.sets), config.repMax)
  while (targets.length < config.sets) targets.push(config.repMin)
  const easy = avgRir != null && avgRir > config.rirMax + 1
  return {
    ...base, action: 'add_reps', weightKg: weight, repTargets: targets, confidence,
    headline: `Mantén ${fmt(weight)} y suma repeticiones`,
    message: `En tu entrenamiento anterior completaste ${repsStr(reps)} repeticiones. Intenta ${repsStr(targets)} manteniendo aproximadamente ${rirTxt} RIR.${easy ? ' Tu RIR fue alto: puedes buscar más repeticiones por serie.' : ''} Si completas ${config.repMax} en todas las series con buena técnica y esfuerzo adecuado, consideraremos aumentar la carga.`,
    progressCondition: `${config.sets}×${config.repMax} con RIR ≥ ${config.rirMin} y sin molestias.`,
    evidence,
  }
}
