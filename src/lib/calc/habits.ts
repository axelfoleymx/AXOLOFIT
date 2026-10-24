import type { ISODate } from '../types'
import { addDays, dayNum } from './weight'

/**
 * Racha de registro: días consecutivos con algún registro hasta hoy.
 * Si hoy aún no hay registro, la racha cuenta hasta ayer (no se "pierde" a media mañana).
 */
export function loggingStreak(loggedDates: Iterable<ISODate>, today: ISODate) {
  const set = new Set(loggedDates)
  let d = set.has(today) ? today : addDays(today, -1)
  let n = 0
  while (set.has(d)) {
    n++
    d = addDays(d, -1)
  }
  return n
}

/** Consistencia semanal: días registrados en los últimos 7 (incluyendo hoy). Sin castigo por descansar. */
export function weeklyConsistency(loggedDates: Iterable<ISODate>, today: ISODate) {
  const t = dayNum(today)
  let n = 0
  for (const d of new Set(loggedDates)) if (dayNum(d) > t - 7 && dayNum(d) <= t) n++
  return n
}

export interface AchievementDef { key: string; title: string; description: string; image: string }

export const ACHIEVEMENTS: AchievementDef[] = [
  { key: 'first_session', title: 'Primera sesión', description: 'Completaste tu primer entrenamiento.', image: 'lift' },
  { key: 'sessions_10', title: '10 sesiones', description: 'Diez entrenamientos completados.', image: 'lift' },
  { key: 'sessions_50', title: '50 sesiones', description: 'Cincuenta entrenamientos: constancia real.', image: 'trophy' },
  { key: 'first_pr', title: 'Primer récord', description: 'Superaste una marca personal.', image: 'trophy' },
  { key: 'prs_10', title: '10 récords', description: 'Diez marcas personales superadas.', image: 'trophy' },
  { key: 'log_7', title: '7 días registrando', description: 'Registraste comidas 7 días (no necesariamente seguidos).', image: 'food' },
  { key: 'log_30', title: '30 días registrando', description: 'Treinta días con registro nutricional.', image: 'food' },
  { key: 'streak_7', title: 'Racha de 7 días', description: 'Siete días seguidos con algún registro.', image: 'wave' },
  { key: 'weigh_10', title: 'Seguimiento de peso', description: 'Diez pesajes registrados para ver tendencias.', image: 'scale' },
  { key: 'week_plan', title: 'Semana cumplida', description: 'Completaste las sesiones planeadas de una semana.', image: 'coach' },
  { key: 'protein_week', title: 'Proteína constante', description: '5 de 7 días dentro del 90 % de tu objetivo de proteína.', image: 'food' },
]

export interface AchievementStats {
  sessions: number
  prs: number
  foodLogDays: number
  streak: number
  weighIns: number
  plannedWeekDone: boolean
  proteinDaysLast7: number
}

export function earnedAchievements(s: AchievementStats): string[] {
  const k: string[] = []
  if (s.sessions >= 1) k.push('first_session')
  if (s.sessions >= 10) k.push('sessions_10')
  if (s.sessions >= 50) k.push('sessions_50')
  if (s.prs >= 1) k.push('first_pr')
  if (s.prs >= 10) k.push('prs_10')
  if (s.foodLogDays >= 7) k.push('log_7')
  if (s.foodLogDays >= 30) k.push('log_30')
  if (s.streak >= 7) k.push('streak_7')
  if (s.weighIns >= 10) k.push('weigh_10')
  if (s.plannedWeekDone) k.push('week_plan')
  if (s.proteinDaysLast7 >= 5) k.push('protein_week')
  return k
}
