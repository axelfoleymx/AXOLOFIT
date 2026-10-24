// Modelo de dominio de ATHLETIQ. Todas las filas persistidas llevan userId y marcas de tiempo
// para aislamiento por usuario y sincronización (last-write-wins por updatedAt).

export type ISODate = string // 'YYYY-MM-DD' en la zona horaria del usuario
export type ISODateTime = string

/** Procedencia de un dato: nunca se mezcla lo medido con lo estimado. */
export type DataOrigin = 'user' | 'imported' | 'estimated' | 'measured' | 'device'

export interface BaseRow {
  id: string
  userId: string
  createdAt: ISODateTime
  updatedAt: ISODateTime
  deletedAt?: ISODateTime | null
}

export type Sex = 'male' | 'female' | 'unspecified'
export type Goal = 'fat_loss' | 'maintenance' | 'muscle_gain' | 'recomposition'
export type Experience = 'none' | 'beginner' | 'intermediate' | 'advanced'
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'high' | 'very_high'
export type Pace = 'slow' | 'moderate' | 'fast'
export type MealType = 'desayuno' | 'colacion_am' | 'comida' | 'colacion_pm' | 'cena'

export interface Profile extends BaseRow {
  displayName: string
  birthDate?: ISODate | null
  age: number
  sex: Sex
  heightCm: number
  weightKg: number
  bodyFatPct?: number | null
  bodyFatOrigin?: DataOrigin | null
  country: string
  language: string
  units: 'metric'
  timezone: string
  consentAt: ISODateTime
  onboardingDone: boolean
}

export interface Preferences extends BaseRow {
  goal: Goal
  pace: Pace
  experience: Experience
  activity: ActivityLevel
  avgSteps?: number | null
  sleepHours?: number | null
  trainingDays: number // por semana
  sessionMinutes: number
  extraActivityMinPerWeek: number // actividad adicional (no gimnasio): fútbol, bici...
  equipment: Equipment[]
  gymName?: string | null
  diet: string[] // vegetariano, vegano, etc.
  allergies: string[]
  intolerances: string[]
  dislikedFoods: string[]
  conditions: string[] // claves de EnfermedadAlimento (orientativo)
  snacksPerDay: 0 | 1 | 2
  budget?: 'barato' | 'medio' | 'alto' | null
  trackWater: boolean
  trackFiber: boolean
  restTimerSec: number
  performanceGoals: string
  avoidExercises: string[]
  favoriteExercises: string[]
  injuries: string
}

/** Objetivos nutricionales vigentes. mode=manual respeta lo definido por la persona. */
export interface NutritionTargets extends BaseRow {
  mode: 'calculated' | 'manual'
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
  fiberG?: number | null
  waterMl?: number | null
  validFrom: ISODate
  rationale: string
}

export interface Nutrients {
  kcal: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
  fiber?: number | null
  satFat?: number | null
  sugar?: number | null
  sodiumMg?: number | null
}

export type FoodSource = 'catalogo_mx' | 'usda' | 'openfoodfacts' | 'user' | 'recipe'

export interface FoodItem {
  id: string
  userId?: string | null // null = catálogo global
  name: string
  brand?: string | null
  barcode?: string | null
  category?: string | null
  per100g: Nutrients
  servingG?: number | null
  servingLabel?: string | null
  unitG?: number | null // peso de 1 unidad (pieza)
  state?: 'raw' | 'cooked' | 'as_sold' | null
  source: FoodSource
  sourceRef?: string | null
  quality: 'verified' | 'imported' | 'estimated' | 'incomplete'
  flag?: string | null
  updatedAt?: ISODateTime | null
  notes?: string | null
}

export interface FoodLogItem extends BaseRow {
  date: ISODate
  meal: MealType
  foodId: string
  foodName: string
  grams: number
  /** Copia de los valores por 100 g al momento del registro (trazabilidad). */
  per100g: Nutrients
  source: FoodSource
  quality: FoodItem['quality']
  state?: FoodItem['state']
  recipeId?: string | null
  origin: DataOrigin
}

export interface Recipe extends BaseRow {
  name: string
  servings: number
  ingredients: { foodId: string; foodName: string; grams: number; per100g: Nutrients }[]
  notes?: string | null
  favorite: boolean
}

export interface FavoriteFood extends BaseRow {
  foodId: string
  foodName: string
  grams: number
  per100g: Nutrients
  source: FoodSource
  quality: FoodItem['quality']
}

export interface CustomFood extends BaseRow, Omit<FoodItem, 'id' | 'userId' | 'updatedAt'> {}

export interface WeightLog extends BaseRow {
  date: ISODate
  kg: number
  conditions?: string | null // en ayunas, tras baño, etc.
  note?: string | null
  origin: DataOrigin
}

export interface BodyMeasurement extends BaseRow {
  date: ISODate
  waistCm?: number | null
  abdomenCm?: number | null
  chestCm?: number | null
  armCm?: number | null
  hipCm?: number | null
  thighCm?: number | null
  note?: string | null
}

export interface ProgressPhoto extends BaseRow {
  date: ISODate
  blob: Blob
  note?: string | null
}

export interface RecoveryLog extends BaseRow {
  date: ISODate
  sleepHours?: number | null
  sleepQuality?: 1 | 2 | 3 | 4 | 5 | null
  hunger?: 1 | 2 | 3 | 4 | 5 | null
  fatigue?: 1 | 2 | 3 | 4 | 5 | null
  soreness?: 1 | 2 | 3 | 4 | 5 | null
  stress?: 1 | 2 | 3 | 4 | 5 | null
  note?: string | null
}

export interface WaterLog extends BaseRow { date: ISODate; ml: number }
export interface StepLog extends BaseRow { date: ISODate; steps: number; origin: DataOrigin }

// ---------- Entrenamiento ----------

export type Equipment =
  | 'barbell' | 'dumbbells' | 'machine' | 'cables' | 'bodyweight' | 'kettlebells'
  | 'band' | 'smith-machine' | 'plate' | 'trx' | 'other'

export interface Exercise {
  id: string
  name: string
  nameEn?: string
  primary: string[] // grupos musculares (claves internas)
  secondary: string[]
  equipment: Equipment
  pattern: string
  mechanic: 'compound' | 'isolation'
  force?: 'push' | 'pull' | 'static' | 'hinge' | 'other'
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  repRange: [number, number]
  increment: number // incremento mínimo típico en kg
  cues?: string[]
  mistakes?: string[]
  safety?: string
  substitutes?: string[]
  source: 'musclewiki' | 'athletiq' | 'user'
  sourceUrl?: string
}

export interface ProgressionConfig {
  repMin: number
  repMax: number
  sets: number
  rirMin: number
  rirMax: number
  increment: number // kg disponibles (p. ej. 2.5 barra, 2 mancuernas)
  restSec: number
}

export interface PlanExercise {
  exerciseId: string
  order: number
  config: ProgressionConfig
  warmupSets: number
  notes?: string
}

export interface WorkoutDay { id: string; name: string; focus: string; exercises: PlanExercise[] }

export interface WorkoutPlan extends BaseRow {
  name: string
  split: string
  days: WorkoutDay[]
  active: boolean
  generated: boolean
}

export interface WorkoutSet {
  id: string
  kind: 'warmup' | 'working'
  weightKg: number | null
  reps: number | null
  rir?: number | null
  rpe?: number | null
  done: boolean
  pain?: boolean
  completedAt?: ISODateTime | null
}

export interface WorkoutExerciseLog {
  exerciseId: string
  exerciseName: string
  config: ProgressionConfig
  sets: WorkoutSet[]
  techniqueNote?: string
  painNote?: string
  substitutedFrom?: string | null
  techniqueOk?: boolean
}

export interface WorkoutSession extends BaseRow {
  planId?: string | null
  dayId?: string | null
  name: string
  date: ISODate
  startedAt: ISODateTime
  endedAt?: ISODateTime | null
  status: 'active' | 'completed' | 'discarded'
  exercises: WorkoutExerciseLog[]
  fatigue?: number | null
  note?: string | null
  origin: DataOrigin
}

export interface PersonalRecord extends BaseRow {
  exerciseId: string
  kind: 'e1rm' | 'weight' | 'reps_at_weight' | 'volume'
  value: number
  weightKg?: number
  reps?: number
  date: ISODate
  sessionId: string
}

export interface CoachingRecommendation extends BaseRow {
  kind: 'progression' | 'calories' | 'deload' | 'recovery'
  subjectId?: string | null
  payload: unknown
  status: 'pending' | 'accepted' | 'dismissed'
  confidence: 'low' | 'medium' | 'high'
}

export interface AchievementLog extends BaseRow { key: string; date: ISODate; detail?: string }

export interface PlannedMeal extends BaseRow {
  date: ISODate
  meal: MealType
  recipeId: string
  recipeName: string
  scale: number
  ingredients: { foodId: string; foodName: string; grams: number; per100g: Nutrients }[]
  consumed: boolean
}
