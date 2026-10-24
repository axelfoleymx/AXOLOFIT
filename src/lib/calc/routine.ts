import type { Equipment, Exercise, Experience, Goal, PlanExercise, WorkoutDay } from '../types'

export interface RoutineInput {
  days: number
  minutes: number
  experience: Experience
  goal: Goal
  equipment: Equipment[]
  avoid: string[] // ids de ejercicio
  favorites: string[]
  /** Patrones a evitar por limitaciones comunicadas (p. ej. 'vertical_push' con molestia de hombro). */
  avoidPatterns?: string[]
}

type Slot = { pattern: string; muscle?: string }

const UPPER: Slot[] = [
  { pattern: 'horizontal_push' }, { pattern: 'horizontal_pull' }, { pattern: 'vertical_push' }, { pattern: 'vertical_pull' },
  { pattern: 'lateral_raise' }, { pattern: 'elbow_flexion' }, { pattern: 'elbow_extension' },
]
const LOWER: Slot[] = [
  { pattern: 'squat' }, { pattern: 'hinge' }, { pattern: 'lunge' }, { pattern: 'knee_flexion' }, { pattern: 'calf' }, { pattern: 'core_anti' },
]
const PUSH: Slot[] = [{ pattern: 'horizontal_push' }, { pattern: 'vertical_push' }, { pattern: 'horizontal_push', muscle: 'pe' }, { pattern: 'lateral_raise' }, { pattern: 'elbow_extension' }]
const PULL: Slot[] = [{ pattern: 'vertical_pull' }, { pattern: 'horizontal_pull' }, { pattern: 'rear_delt' }, { pattern: 'elbow_flexion' }, { pattern: 'elbow_flexion', muscle: 'an' }]
const LEGS: Slot[] = [{ pattern: 'squat' }, { pattern: 'hinge' }, { pattern: 'lunge' }, { pattern: 'knee_extension' }, { pattern: 'knee_flexion' }, { pattern: 'calf' }]
const FULL_A: Slot[] = [{ pattern: 'squat' }, { pattern: 'horizontal_push' }, { pattern: 'horizontal_pull' }, { pattern: 'knee_flexion' }, { pattern: 'lateral_raise' }, { pattern: 'core_anti' }]
const FULL_B: Slot[] = [{ pattern: 'hinge' }, { pattern: 'vertical_push' }, { pattern: 'vertical_pull' }, { pattern: 'lunge' }, { pattern: 'elbow_flexion' }, { pattern: 'elbow_extension' }]
const FULL_C: Slot[] = [{ pattern: 'lunge' }, { pattern: 'horizontal_push' }, { pattern: 'vertical_pull' }, { pattern: 'hip_extension' }, { pattern: 'rear_delt' }, { pattern: 'calf' }]

export function chooseSplit(days: number): { split: string; days: { name: string; focus: string; slots: Slot[] }[] } {
  const d = Math.max(1, Math.min(6, Math.round(days)))
  if (d <= 1) return { split: 'Cuerpo completo ×1', days: [{ name: 'Cuerpo completo', focus: 'Todo el cuerpo', slots: FULL_A }] }
  if (d === 2) return { split: 'Cuerpo completo A/B', days: [{ name: 'Full body A', focus: 'Todo el cuerpo', slots: FULL_A }, { name: 'Full body B', focus: 'Todo el cuerpo', slots: FULL_B }] }
  if (d === 3) return { split: 'Cuerpo completo A/B/C', days: [{ name: 'Full body A', focus: 'Todo el cuerpo', slots: FULL_A }, { name: 'Full body B', focus: 'Todo el cuerpo', slots: FULL_B }, { name: 'Full body C', focus: 'Todo el cuerpo', slots: FULL_C }] }
  if (d === 4) return { split: 'Torso / Pierna ×2', days: [{ name: 'Torso A', focus: 'Pecho, espalda, hombros, brazos', slots: UPPER }, { name: 'Pierna A', focus: 'Cuádriceps, glúteos, isquios', slots: LOWER }, { name: 'Torso B', focus: 'Pecho, espalda, hombros, brazos', slots: [UPPER[3], UPPER[0], UPPER[1], UPPER[2], { pattern: 'rear_delt' }, UPPER[5], UPPER[6]] }, { name: 'Pierna B', focus: 'Glúteos, isquios, cuádriceps', slots: [LOWER[1], LOWER[0], { pattern: 'hip_extension' }, { pattern: 'knee_extension' }, LOWER[4], { pattern: 'core_flexion' }] }] }
  if (d === 5) return { split: 'Push / Pull / Pierna + Torso / Pierna', days: [{ name: 'Empuje', focus: 'Pecho, hombros, tríceps', slots: PUSH }, { name: 'Tracción', focus: 'Espalda, bíceps', slots: PULL }, { name: 'Pierna A', focus: 'Tren inferior', slots: LEGS }, { name: 'Torso', focus: 'Tren superior', slots: UPPER.slice(0, 6) }, { name: 'Pierna B', focus: 'Tren inferior', slots: LOWER }] }
  return { split: 'Push / Pull / Pierna ×2', days: [{ name: 'Empuje A', focus: 'Pecho, hombros, tríceps', slots: PUSH }, { name: 'Tracción A', focus: 'Espalda, bíceps', slots: PULL }, { name: 'Pierna A', focus: 'Tren inferior', slots: LEGS }, { name: 'Empuje B', focus: 'Pecho, hombros, tríceps', slots: PUSH }, { name: 'Tracción B', focus: 'Espalda, bíceps', slots: PULL }, { name: 'Pierna B', focus: 'Tren inferior', slots: LOWER }] }
}

const DIFF_RANK = { beginner: 0, intermediate: 1, advanced: 2 }
/** Ejercicios básicos, fáciles de progresar y de medir: se prefieren al generar rutinas. */
const STAPLES = new Set([
  'mw-barbell-bench-press', 'mw-dumbbell-bench-press', 'mw-dumbbell-incline-bench-press', 'mw-machine-chest-press', 'mw-barbell-squat', 'mw-dumbbell-goblet-squat',
  'mw-machine-leg-press', 'mw-barbell-romanian-deadlift', 'mw-dumbbell-romanian-deadlift', 'mw-pull-ups', 'mw-machine-pulldown', 'mw-barbell-bent-over-row',
  'mw-dumbbell-row-unilateral', 'mw-machine-seated-cable-row', 'mw-barbell-overhead-press', 'mw-dumbbell-seated-overhead-press', 'mw-dumbbell-lateral-raise',
  'mw-cable-rope-pushdown', 'mw-dumbbell-curl', 'mw-barbell-curl', 'mw-machine-hamstring-curl', 'mw-machine-seated-leg-curl', 'mw-machine-leg-extension',
  'mw-dumbbell-bulgarian-split-squat', 'mw-bulgarian-split-squat', 'mw-machine-standing-calf-raises', 'mw-dumbbell-calf-raise', 'mw-barbell-hip-thrust',
  'mw-cable-pallof-press', 'mw-hand-plank', 'mw-machine-face-pulls', 'mw-dumbbell-rear-delt-fly', 'mw-push-up', 'mw-inverted-row', 'mw-dumbbell-skullcrusher',
  'mw-cable-rope-kneeling-crunch', 'mw-dumbbell-hammer-curl', 'mw-forward-lunges', 'mw-glute-bridge', 'mw-calf-raises',
])
const LEVEL: Record<Experience, number> = { none: 0, beginner: 0, intermediate: 1, advanced: 2 }
/** Techo orientativo de series semanales por grupo (rangos habituales en la literatura: ~10–20). */
export const WEEKLY_SET_CAP: Record<Experience, number> = { none: 10, beginner: 12, intermediate: 16, advanced: 20 }

export function generateRoutine(input: RoutineInput, catalog: Exercise[]): { split: string; days: WorkoutDay[]; weeklySets: Record<string, number>; notes: string[] } {
  const { split, days } = chooseSplit(input.days)
  const lvl = LEVEL[input.experience]
  const pool = catalog.filter(
    (e) => (input.equipment.includes(e.equipment) || e.equipment === 'bodyweight') && !input.avoid.includes(e.id) && DIFF_RANK[e.difficulty] <= lvl + (lvl === 0 ? 0 : 1) && !(input.avoidPatterns ?? []).includes(e.pattern),
  )
  const notes: string[] = []
  const setsPer = lvl === 0 ? 2 : 3
  const restCompound = 150
  const restIso = 90
  // Ejercicios por día según tiempo disponible (≈ series × (descanso + 45 s) + calentamiento 8 min)
  const minutesPerExercise = (setsPer * (restCompound + 45)) / 60
  const maxExercises = Math.max(3, Math.min(7, Math.floor((input.minutes - 8) / minutesPerExercise)))
  const used = new Set<string>()
  const weekly: Record<string, number> = {}

  const out: WorkoutDay[] = days.map((d, di) => {
    const exercises: PlanExercise[] = []
    for (const slot of d.slots) {
      if (exercises.length >= maxExercises) break
      const cands = pool.filter((e) => e.pattern === slot.pattern && (!slot.muscle || e.primary.includes(slot.muscle)))
      if (!cands.length) {
        notes.push(`${d.name}: sin ejercicio disponible para «${slot.pattern}» con tu equipamiento.`)
        continue
      }
      const score = (e: Exercise) =>
        (input.favorites.includes(e.id) ? 100 : 0) + (STAPLES.has(e.id) ? 20 : 0) + (used.has(e.id) ? -40 : 0) + (e.mechanic === 'compound' ? 10 : 0) +
        (['barbell', 'dumbbells', 'machine', 'cables'].includes(e.equipment) ? 5 : 0) - DIFF_RANK[e.difficulty] * (lvl === 0 ? 8 : 2)
      const pick = [...cands].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name))[0]
      // Respeta el techo semanal por músculo
      if (pick.primary.some((m) => (weekly[m] ?? 0) + setsPer > WEEKLY_SET_CAP[input.experience])) continue
      used.add(pick.id)
      for (const m of pick.primary) weekly[m] = (weekly[m] ?? 0) + setsPer
      for (const m of pick.secondary) weekly[m] = (weekly[m] ?? 0) + setsPer * 0.5
      const compound = pick.mechanic === 'compound'
      exercises.push({
        exerciseId: pick.id,
        order: exercises.length,
        warmupSets: compound && exercises.length < 2 ? 2 : 0,
        config: {
          repMin: pick.repRange[0], repMax: pick.repRange[1], sets: setsPer,
          rirMin: lvl === 0 ? 2 : 1, rirMax: 3, increment: pick.increment,
          restSec: compound ? restCompound : restIso,
        },
      })
    }
    return { id: `day-${di + 1}`, name: d.name, focus: d.focus, exercises }
  })
  if (input.goal === 'fat_loss') notes.push('En déficit, mantener cargas y volumen moderado ayuda a conservar masa muscular; no es necesario aumentar el volumen.')
  notes.push(`Volumen inicial conservador (${setsPer} series por ejercicio). Auméntalo solo si tu recuperación y progreso lo justifican.`)
  return { split, days: out, weeklySets: weekly, notes }
}
