import type { Goal, ISODate } from '../types'
import { addDays, dayNum, trendSlope, type WeightPoint } from './weight'

export interface IntakeDay { date: ISODate; kcal: number; complete: boolean }

export interface AdaptiveInput {
  today: ISODate
  goal: Goal
  targetKcal: number
  bodyKg: number
  /** Ritmo objetivo en kg/semana (negativo para pérdida). */
  targetRateKgWeek: number
  weights: WeightPoint[]
  intake: IntakeDay[]
  lastAdjustment?: ISODate | null
  /** Rendimiento en el gimnasio cayendo (del motor de estancamiento). */
  performanceDeclining?: boolean
  highHunger?: boolean
}

export interface AdaptiveResult {
  action: 'insufficient_data' | 'keep' | 'increase' | 'decrease'
  deltaKcal: number
  newKcal?: number
  observedRateKgWeek?: number
  estimatedTdee?: number
  confidence: 'low' | 'medium' | 'high'
  reasons: string[]
}

const WINDOW = 21

/**
 * Ajuste adaptativo de calorías basado en tendencias de ≥ 2–3 semanas, nunca en un día aislado.
 * TDEE observado ≈ ingesta media − (cambio de peso · 7 700 kcal/kg) / días.
 * La ingesta registrada y el factor 7 700 tienen error: por eso los pasos son pequeños (≤ 150 kcal).
 */
export function adaptiveAdjustment(i: AdaptiveInput): AdaptiveResult {
  const reasons: string[] = []
  const start = addDays(i.today, -WINDOW + 1)
  const inWin = (d: ISODate) => dayNum(d) >= dayNum(start) && dayNum(d) <= dayNum(i.today)

  if (i.lastAdjustment && dayNum(i.today) - dayNum(i.lastAdjustment) < 14) {
    return { action: 'keep', deltaKcal: 0, confidence: 'medium', reasons: [`El último ajuste fue hace ${dayNum(i.today) - dayNum(i.lastAdjustment)} días; se esperan al menos 14 para evaluar su efecto.`] }
  }

  const intake = i.intake.filter((d) => inWin(d.date) && d.complete)
  const weights = i.weights.filter((w) => inWin(w.date))
  const slope = trendSlope(weights, WINDOW, i.today)

  if (intake.length < 10 || !slope || slope.points < 8 || slope.spanDays < 14) {
    return {
      action: 'insufficient_data', deltaKcal: 0, confidence: 'low',
      reasons: [`Se necesitan ≥ 14 días con ≥ 8 pesajes y ≥ 10 días de registro nutricional completo en las últimas 3 semanas (tienes ${weights.length} pesajes y ${intake.length} días completos).`],
    }
  }

  const avgIntake = intake.reduce((s, d) => s + d.kcal, 0) / intake.length
  const observed = slope.kgPerWeek
  const estimatedTdee = avgIntake - (slope.kgPerDay * 7700)
  const compliance = intake.length / WINDOW
  reasons.push(`Tendencia de peso: ${observed >= 0 ? '+' : ''}${observed.toFixed(2)} kg/semana (${slope.points} pesajes).`)
  reasons.push(`Ingesta media registrada: ${Math.round(avgIntake)} kcal (${intake.length}/${WINDOW} días completos).`)
  reasons.push(`Gasto estimado por balance: ~${Math.round(estimatedTdee)} kcal (margen de error considerable).`)

  const diff = observed - i.targetRateKgWeek
  const tolerance = Math.max(0.1, i.bodyKg * 0.001) // ~0.1 % del peso por semana
  let action: AdaptiveResult['action'] = 'keep'
  let delta = 0

  if (Math.abs(diff) <= tolerance || Math.abs(diff) < 2 * slope.stdErrPerWeek) {
    reasons.push('El ritmo observado es compatible con el objetivo: se recomienda mantener.')
  } else {
    // kcal/día necesarias para corregir la diferencia, con paso máximo de 150
    const raw = (-diff * 7700) / 7
    delta = Math.max(-150, Math.min(150, Math.round(raw / 25) * 25))
    if (i.goal === 'fat_loss' && delta < 0 && (i.performanceDeclining || i.highHunger)) {
      reasons.push('Registras caída de rendimiento u hambre alta: en lugar de recortar más, considera mantener o una pausa de dieta.')
      delta = 0
    }
    if (delta !== 0) {
      action = delta > 0 ? 'increase' : 'decrease'
      reasons.push(`Diferencia con el ritmo objetivo (${i.targetRateKgWeek.toFixed(2)} kg/sem): ajuste sugerido ${delta > 0 ? '+' : ''}${delta} kcal/día.`)
    }
  }

  const confidence: AdaptiveResult['confidence'] = compliance >= 0.8 && slope.points >= 14 ? 'high' : compliance >= 0.6 ? 'medium' : 'low'
  return {
    action, deltaKcal: delta, newKcal: i.targetKcal + delta, observedRateKgWeek: observed, estimatedTdee, confidence, reasons,
  }
}
