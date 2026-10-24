import type { MealType, Nutrients } from '../types'
import { mealDistribution, recipeNutrition } from './nutrition'

export interface CatalogRecipe {
  id: string
  name: string
  mealType: string
  ingredients: { foodId: string; grams: number }[]
  prepMin: number | null
  difficulty: string | null
  tags: string[]
  instructions: string | null
  priceRange: string | null
}

export interface FoodLookup { (id: string): { name: string; per100g: Nutrients; category?: string | null } | undefined }

export interface MenuConstraints {
  kcalTarget: number
  proteinTarget: number
  snacks: 0 | 1 | 2
  /** Palabras que excluyen un ingrediente (alergias, intolerancias, no me gusta). Coincidencia por nombre. */
  excludeTerms: string[]
  /** Ids de alimentos a evitar por condición (si la base lo indica). */
  excludeFoodIds?: Set<string>
  maxPrepMin?: number | null
  budget?: 'barato' | 'medio' | 'alto' | null
  vegetarian?: boolean
  seed?: number
}

export interface PlannedOption {
  meal: MealType
  recipe: CatalogRecipe
  scale: number
  ingredients: { foodId: string; foodName: string; grams: number; per100g: Nutrients }[]
  nutrients: ReturnType<typeof recipeNutrition>['total']
  targetKcal: number
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
const MEAT = ['pollo', 'res', 'cerdo', 'pescado', 'atun', 'salmon', 'camaron', 'pulpo', 'jamon', 'chorizo', 'carne', 'pavo', 'tocino', 'sardina', 'mariscos', 'higado', 'barbacoa', 'carnitas']

export function recipeAllowed(r: CatalogRecipe, food: FoodLookup, c: MenuConstraints) {
  if (c.maxPrepMin && r.prepMin && r.prepMin > c.maxPrepMin) return false
  if (c.budget === 'barato' && r.priceRange === 'alto') return false
  const terms = c.excludeTerms.map(norm).filter(Boolean)
  for (const i of r.ingredients) {
    const f = food(i.foodId)
    if (!f) return false
    const n = norm(f.name)
    if (terms.some((t) => n.includes(t))) return false
    if (c.excludeFoodIds?.has(i.foodId)) return false
    if (c.vegetarian && (f.category === 'proteina_animal' && !/huevo|queso|yogur|leche/.test(n) || MEAT.some((m) => n.includes(m)))) return false
  }
  if (terms.some((t) => norm(r.name).includes(t))) return false
  return true
}

const MEAL_CATALOG: Record<MealType, string[]> = {
  desayuno: ['desayuno'], comida: ['comida'], cena: ['cena', 'comida'], colacion_am: ['colacion'], colacion_pm: ['colacion'],
}

/** PRNG determinista (mulberry32) para que una misma semilla produzca el mismo menú. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Hierbas, condimentos y salsas no se escalan: un platillo más grande no lleva 250 g de cilantro. */
const FIXED = /cilantro|perejil|epazote|hierbabuena|or[eé]gano|comino|pimienta|\bsal\b|ajo|chile|salsa|lim[oó]n|vinagre|canela|especia|consom|caldo/i

export function scaledIngredients(r: CatalogRecipe, scale: number, food: FoodLookup) {
  return r.ingredients.map((i) => {
    const f = food(i.foodId)!
    const fixed = f.category === 'condimento' || FIXED.test(f.name)
    return { foodId: i.foodId, foodName: f.name, grams: Math.round(fixed ? i.grams : i.grams * scale), per100g: f.per100g }
  })
}

const kcalOf = (ings: { grams: number; per100g: Nutrients }[]) => recipeNutrition(ings, 1).total

/** Escala que acerca la receta a un objetivo de kcal, limitada a 0.7–1.5× para conservar porciones realistas. */
function fitScale(r: CatalogRecipe, target: number, food: FoodLookup) {
  const base = kcalOf(scaledIngredients(r, 1, food)).kcal
  if (base <= 0) return null
  const raw = target / base
  const scale = Math.min(1.5, Math.max(0.7, Math.round(raw * 20) / 20))
  const ings = scaledIngredients(r, scale, food)
  const n = kcalOf(ings)
  return { scale, ings, n, fit: Math.abs(n.kcal - target) / target }
}

/**
 * Genera un menú determinista a partir del catálogo real: escoge recetas permitidas cuyo tamaño base esté
 * cerca del objetivo de cada tiempo y ajusta las porciones (0.7–1.5×). Todos los nutrientes salen de los ingredientes.
 */
export function generateMenu(recipes: CatalogRecipe[], food: FoodLookup, c: MenuConstraints): { options: PlannedOption[]; missing: MealType[] } {
  const dist = mealDistribution(c.snacks)
  const rand = rng(c.seed ?? Date.now())
  const options: PlannedOption[] = []
  const missing: MealType[] = []
  const usedIds = new Set<string>()
  for (const [meal, frac] of Object.entries(dist) as [MealType, number][]) {
    const target = c.kcalTarget * frac
    const pool = recipes.filter((r) => MEAL_CATALOG[meal].includes(r.mealType) && !usedIds.has(r.id) && recipeAllowed(r, food, c))
    // Candidatas que quedan a ±15 % del objetivo; entre ellas se prefieren las de más proteína por kcal
    const fitted = pool
      .map((r) => ({ r, f: fitScale(r, target, food) }))
      .filter((x): x is { r: CatalogRecipe; f: NonNullable<ReturnType<typeof fitScale>> } => x.f != null)
    let cands = fitted.filter((x) => x.f.fit <= 0.15)
    if (!cands.length) cands = [...fitted].sort((a, b) => a.f.fit - b.f.fit).slice(0, 5)
    cands = cands.sort((a, b) => b.f.n.protein / b.f.n.kcal - a.f.n.protein / a.f.n.kcal).slice(0, 10)
    if (!cands.length) {
      missing.push(meal)
      continue
    }
    const pick = cands[Math.floor(rand() * cands.length)]
    usedIds.add(pick.r.id)
    options.push({ meal, recipe: pick.r, scale: pick.f.scale, ingredients: pick.f.ings, nutrients: pick.f.n, targetKcal: Math.round(target) })
  }
  return { options, missing }
}

/** Sugerencias para cubrir lo que falta del día (p. ej. «¿qué ceno?»): ordenadas por ajuste a kcal y proteína restantes. */
export function suggestForRemaining(recipes: CatalogRecipe[], food: FoodLookup, remainingKcal: number, remainingProtein: number, c: Omit<MenuConstraints, 'kcalTarget' | 'proteinTarget' | 'snacks'>, meal: MealType = 'cena', limit = 3, maxMealKcal = Infinity) {
  if (remainingKcal < 100) return []
  // Una sola comida no debería cubrir todo lo restante de un día con poco registro: se limita a una porción razonable
  const budget = Math.min(remainingKcal, maxMealKcal)
  remainingProtein = remainingProtein * (budget / remainingKcal)
  const target = budget * 0.9
  return recipes
    .filter((r) => MEAL_CATALOG[meal].includes(r.mealType) && recipeAllowed(r, food, { ...c, kcalTarget: 0, proteinTarget: 0, snacks: 0 }))
    .map((r) => {
      const f = fitScale(r, target, food)
      if (!f) return null
      const score = f.fit + Math.max(0, remainingProtein - f.n.protein) / Math.max(remainingProtein, 1)
      return { recipe: r, scale: f.scale, kcal: f.n.kcal, protein: f.n.protein, ingredients: f.ings, score }
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
}
