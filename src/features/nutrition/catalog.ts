import type { CatalogRecipe } from '../../lib/calc/menu'
import { catalogFood, loadCatalog } from '../../lib/providers/foods'
import type { Preferences } from '../../lib/types'

// Catálogos importados de Nutrion (export Base44). Se cargan bajo demanda para no inflar el bundle inicial.

const CONDITION_KEYS = [
  'diabetes_tipo_2', 'hipertension', 'obesidad', 'dislipidemia', 'hiperuricemia_gota', 'enfermedad_renal_cronica', 'gastritis', 'colitis',
  'reflujo_gastroesofagico', 'sindrome_intestino_irritable', 'higado_graso', 'enfermedad_cardiovascular', 'sindrome_metabolico', 'sop',
  'hipotiroidismo', 'hipertiroidismo', 'anemia', 'osteoporosis', 'artritis', 'celiaquia', 'intolerancia_lactosa', 'estrenimiento',
  'hemorroides', 'migrana', 'insomnio', 'calculos_renales_oxalato', 'hipoglucemia_reactiva', 'embarazo_saludable', 'lactancia', 'menopausia',
  'acne', 'caries_dental', 'depresion_apoyo', 'enfermedad_pulmonar_asma_epoc', 'alzheimer', 'cancer', 'dislipidemia_colesterol',
]
const pretty = (k: string) => {
  const s = k.replace(/_/g, ' ').replace('sop', 'SOP').replace('epoc', 'EPOC')
  return s[0].toUpperCase() + s.slice(1)
}
export const CONDITION_LABEL: Record<string, string> = Object.fromEntries(CONDITION_KEYS.map((k) => [k, pretty(k)]))
Object.assign(CONDITION_LABEL, { diabetes_tipo_2: 'Diabetes tipo 2', hipertension: 'Hipertensión', hiperuricemia_gota: 'Hiperuricemia / gota', enfermedad_renal_cronica: 'Enfermedad renal crónica', reflujo_gastroesofagico: 'Reflujo', sindrome_intestino_irritable: 'Colon irritable', higado_graso: 'Hígado graso', estrenimiento: 'Estreñimiento', migrana: 'Migraña', calculos_renales_oxalato: 'Cálculos renales (oxalato)', celiaquia: 'Celiaquía', cancer: 'Cáncer', depresion_apoyo: 'Depresión (apoyo)', dislipidemia_colesterol: 'Colesterol alto' })
export const CONDITION_OPTIONS = CONDITION_KEYS.map((k) => ({ value: k, label: CONDITION_LABEL[k] }))

export interface Drink { id: string; name: string; category: string; servingMl: number; kcal: number | null; sugarG: number | null; caffeineMg: number | null; alcoholPct: number | null; healthProfile: string; cautions: string; notes: string; season: string }
export interface LearnItem { clave: string; tipo_contenido: string; nombre_visible: string; resumen_simple: string; alimentos_preferir: string; alimentos_moderar: string; alimentos_evitar: string; bebidas_preferir: string; bebidas_evitar: string; como_balancear_plato: string; tips_practicos: string; mitos_comunes: string; si_comes_fuera: string; senales_alerta: string; disclaimer: string }
export interface Tip { goal: string; category: string; title: string; content: string; tip: string; better: string; worse: string }

let recipes: CatalogRecipe[] | null = null
export async function loadRecipes() {
  await loadCatalog()
  recipes ??= (await import('../../data/recipes-mx.json')).default as CatalogRecipe[]
  return recipes
}
export async function loadDrinks() {
  return (await import('../../data/drinks-mx.json')).default as Drink[]
}
export async function loadEducation() {
  return (await import('../../data/education-mx.json')).default as { learn: LearnItem[]; tips: Tip[] }
}
export async function loadConditions() {
  return (await import('../../data/conditions-mx.json')).default as unknown as { justifications: string[]; conditions: Record<string, { recomendado: [string, number][]; moderado: [string, number][]; evitar: [string, number][] }> }
}

export const foodLookup = (id: string) => {
  const f = catalogFood(id)
  return f ? { name: f.name, per100g: f.per100g, category: f.category } : undefined
}

/** Términos de exclusión a partir de alergias, intolerancias y alimentos no deseados. */
export function exclusionTerms(p: Preferences | undefined) {
  if (!p) return []
  const map: Record<string, string[]> = {
    leche: ['leche', 'queso', 'yogur', 'crema', 'requesón', 'panela', 'mantequilla'], lactosa: ['leche', 'queso', 'yogur', 'crema'],
    trigo: ['trigo', 'pan', 'pasta', 'harina', 'galleta', 'tortilla de harina'], gluten: ['trigo', 'pan', 'pasta', 'harina', 'cebada', 'centeno'],
    mariscos: ['camarón', 'pulpo', 'calamar', 'ostión', 'jaiba', 'mariscos', 'almeja'], pescado: ['pescado', 'atún', 'salmón', 'sardina', 'tilapia', 'mojarra', 'huachinango'],
    nueces: ['nuez', 'almendra', 'pistache', 'avellana', 'nueces'], cacahuate: ['cacahuate'], soya: ['soya', 'tofu'], huevo: ['huevo'], ajonjolí: ['ajonjolí'],
  }
  const base = [...p.allergies, ...p.intolerances, ...(p.diet.includes('sin lactosa') ? ['lactosa'] : []), ...(p.diet.includes('sin gluten') ? ['gluten'] : [])]
  return [...new Set([...base.flatMap((a) => map[a] ?? [a]), ...p.dislikedFoods])]
}
