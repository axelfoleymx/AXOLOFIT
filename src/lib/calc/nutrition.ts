import type { FoodItem, FoodLogItem, MealType, Nutrients } from '../types'

export const NUTRIENT_KEYS = ['kcal', 'protein', 'carbs', 'fat', 'fiber', 'satFat', 'sugar', 'sodiumMg'] as const
export type NutrientKey = (typeof NUTRIENT_KEYS)[number]

export type NutrientTotals = { [K in NutrientKey]: number }

export const emptyNutrients = (): NutrientTotals => ({
  kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, satFat: 0, sugar: 0, sodiumMg: 0,
})

/** Redondeo para mostrar; los cálculos internos conservan la precisión. */
export const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d

/**
 * Escala valores por 100 g a una cantidad en gramos.
 * Un nutriente desconocido (null/undefined) permanece desconocido: nunca se convierte en 0.
 */
export function scaleNutrients(per100g: Nutrients, grams: number): Nutrients {
  if (!Number.isFinite(grams) || grams < 0) throw new RangeError('La cantidad debe ser un número ≥ 0')
  const f = grams / 100
  const out: Record<NutrientKey, number | null> = { kcal: null, protein: null, carbs: null, fat: null, fiber: null, satFat: null, sugar: null, sodiumMg: null }
  for (const k of NUTRIENT_KEYS) {
    const v = per100g[k]
    out[k] = v == null ? null : v * f
  }
  return out
}

export interface Totals extends NutrientTotals {
  /** Nutrientes para los que al menos un elemento carecía de dato. */
  incomplete: NutrientKey[]
}

/** Suma nutrientes; registra qué nutrientes quedaron incompletos en lugar de inventarlos. */
export function sumNutrients(list: Nutrients[]): Totals {
  const t = { ...emptyNutrients(), incomplete: [] as NutrientKey[] }
  const missing = new Set<NutrientKey>()
  for (const n of list) {
    for (const k of NUTRIENT_KEYS) {
      const v = n[k]
      if (v == null) {
        // fibra/sat/azúcar/sodio son opcionales: se marcan incompletos solo si faltan
        missing.add(k)
      } else t[k] += v as number
    }
  }
  t.incomplete = [...missing]
  return t
}

/** Convierte una cantidad en distintas unidades a gramos. */
export function toGrams(
  qty: number,
  unit: 'g' | 'serving' | 'unit' | 'oz',
  food: Pick<FoodItem, 'servingG' | 'unitG'>,
): number {
  if (!Number.isFinite(qty) || qty <= 0) throw new RangeError('La cantidad debe ser mayor que 0')
  switch (unit) {
    case 'g':
      return qty
    case 'oz':
      return qty * 28.349523125
    case 'serving':
      if (!food.servingG) throw new Error('Este alimento no tiene porción definida')
      return qty * food.servingG
    case 'unit':
      if (!food.unitG) throw new Error('Este alimento no tiene peso por pieza definido')
      return qty * food.unitG
  }
}

export interface RecipeIngredient { grams: number; per100g: Nutrients }

/** Nutrición total y por porción de una receta a partir de sus ingredientes reales. */
export function recipeNutrition(ingredients: RecipeIngredient[], servings: number) {
  if (!Number.isFinite(servings) || servings <= 0) throw new RangeError('Las porciones deben ser > 0')
  const total = sumNutrients(ingredients.map((i) => scaleNutrients(i.per100g, i.grams)))
  const totalGrams = ingredients.reduce((s, i) => s + i.grams, 0)
  const perServing = { ...total } as Totals
  for (const k of NUTRIENT_KEYS) perServing[k] = total[k] / servings
  // Valores por 100 g de la receta cruda (suma de ingredientes; no considera pérdida de agua al cocinar)
  const per100g: Nutrients = { kcal: null, protein: null, carbs: null, fat: null }
  for (const k of NUTRIENT_KEYS) (per100g as Record<NutrientKey, number | null>)[k] = totalGrams > 0 && !total.incomplete.includes(k) ? (total[k] / totalGrams) * 100 : null
  return { total, perServing, totalGrams, gramsPerServing: totalGrams / servings, per100g }
}

export const itemNutrients = (i: Pick<FoodLogItem, 'per100g' | 'grams'>) => scaleNutrients(i.per100g, i.grams)

export function dayTotals(items: Pick<FoodLogItem, 'per100g' | 'grams' | 'meal'>[]) {
  const byMeal: Partial<Record<MealType, Totals>> = {}
  const meals = new Set(items.map((i) => i.meal))
  for (const m of meals) byMeal[m] = sumNutrients(items.filter((i) => i.meal === m).map(itemNutrients))
  return { total: sumNutrients(items.map(itemNutrients)), byMeal }
}

/** Energía según factores Atwater generales (4/4/9). */
export const atwaterKcal = (p: number, c: number, f: number) => 4 * p + 4 * c + 9 * f

/**
 * Prevención de duplicados accidentales: mismo alimento, misma comida, misma cantidad (±1 g),
 * registrado hace menos de `windowSec` segundos.
 */
export function isLikelyDuplicate(
  candidate: Pick<FoodLogItem, 'foodId' | 'meal' | 'grams' | 'date'>,
  existing: Pick<FoodLogItem, 'foodId' | 'meal' | 'grams' | 'date' | 'createdAt' | 'deletedAt'>[],
  now = Date.now(),
  windowSec = 90,
) {
  return existing.some(
    (e) =>
      !e.deletedAt &&
      e.foodId === candidate.foodId &&
      e.meal === candidate.meal &&
      e.date === candidate.date &&
      Math.abs(e.grams - candidate.grams) <= 1 &&
      now - Date.parse(e.createdAt) < windowSec * 1000,
  )
}

export const MEAL_LABEL: Record<MealType, string> = {
  desayuno: 'Desayuno',
  colacion_am: 'Colación matutina',
  comida: 'Comida',
  colacion_pm: 'Colación vespertina',
  cena: 'Cena',
}

/** Distribución calórica por número de colaciones (heredada de Nutrion). */
export function mealDistribution(snacks: 0 | 1 | 2): Partial<Record<MealType, number>> {
  if (snacks === 0) return { desayuno: 0.3, comida: 0.4, cena: 0.3 }
  if (snacks === 1) return { desayuno: 0.27, colacion_pm: 0.1, comida: 0.38, cena: 0.25 }
  return { desayuno: 0.25, colacion_am: 0.1, comida: 0.35, colacion_pm: 0.1, cena: 0.2 }
}

export function validateGrams(raw: string | number): { ok: true; value: number } | { ok: false; error: string } {
  const v = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'))
  if (!Number.isFinite(v)) return { ok: false, error: 'Introduce un número válido' }
  if (v <= 0) return { ok: false, error: 'La cantidad debe ser mayor que 0' }
  if (v > 5000) return { ok: false, error: 'Cantidad demasiado grande (máx. 5000 g por registro)' }
  return { ok: true, value: v }
}
