import type { FoodItem, Nutrients } from '../types'

// Arquitectura de proveedores de alimentos. Todos normalizan a FoodItem con valores por 100 g.
// - catalogo_mx: catálogo mexicano importado de Nutrion (1 201 alimentos). Valores por porción convertidos a 100 g;
//   origen de los datos no documentado en el export → calidad "imported" (verificar).
// - openfoodfacts: productos con código de barras (ODbL, atribución obligatoria). Sin clave. Cobertura de México parcial.
// - usda: FoodData Central (dominio público) vía /api/usda (clave en el servidor).

export interface CatalogFood {
  id: string
  name: string
  category: string
  per100g: Nutrients
  servingG: number
  notes: string | null
  priceMxnKg: number | null
  priceRange: string | null
  availability: string | null
  season: string | null
  flag: string | null
}

let catalog: CatalogFood[] | null = null
let catalogById: Map<string, CatalogFood> | null = null

export async function loadCatalog() {
  if (!catalog) {
    catalog = (await import('../../data/foods-mx.json')).default as CatalogFood[]
    catalogById = new Map(catalog.map((f) => [f.id, f]))
  }
  return catalog
}
export const catalogFood = (id: string) => catalogById?.get(id)

export function catalogToFood(f: CatalogFood): FoodItem {
  return {
    id: f.id, name: f.name, category: f.category, per100g: f.per100g, servingG: f.servingG, servingLabel: `${f.servingG} g (porción estándar)`,
    source: 'catalogo_mx', sourceRef: 'Catálogo Nutrion (export Base44)', quality: f.flag ? 'estimated' : 'imported', flag: f.flag, notes: f.notes, state: null,
  }
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim()

/** Búsqueda local con puntuación: coincidencia al inicio > palabra completa > subcadena. */
export function rankByName<T extends { name: string }>(items: T[], q: string, limit = 30): T[] {
  const nq = norm(q)
  if (!nq) return []
  const words = nq.split(/\s+/)
  return items
    .map((it) => {
      const n = norm(it.name)
      if (!words.every((w) => n.includes(w))) return null
      const score = (n.startsWith(nq) ? 0 : n.split(/\s+/).some((w) => w.startsWith(words[0])) ? 1 : 2) + n.length / 200
      return { it, score }
    })
    .filter((x): x is { it: T; score: number } => x != null)
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((x) => x.it)
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null)

/** Normaliza un producto de Open Food Facts. Sin kcal declaradas, intenta kJ/4.184; si tampoco, queda incompleto. */
export function normalizeOFF(p: Record<string, unknown>, code?: string): FoodItem | null {
  const n = (p.nutriments ?? {}) as Record<string, unknown>
  const name = String(p.product_name_es || p.product_name || '').trim()
  if (!name) return null
  let kcal = num(n['energy-kcal_100g'])
  if (kcal == null && num(n['energy-kj_100g']) != null) kcal = num(n['energy-kj_100g'])! / 4.184
  const sodium = num(n['sodium_100g'])
  const per100g: Nutrients = {
    kcal, protein: num(n['proteins_100g']), carbs: num(n['carbohydrates_100g']), fat: num(n['fat_100g']),
    fiber: num(n['fiber_100g']), satFat: num(n['saturated-fat_100g']), sugar: num(n['sugars_100g']), sodiumMg: sodium == null ? null : sodium * 1000,
  }
  const complete = [per100g.kcal, per100g.protein, per100g.carbs, per100g.fat].every((v) => v != null)
  const servingG = num(p.serving_quantity)
  const lm = num(p.last_modified_t)
  return {
    id: `off-${code ?? p.code}`, name, brand: (p.brands as string) || null, barcode: String(code ?? p.code ?? ''), per100g,
    servingG, servingLabel: (p.serving_size as string) || null, source: 'openfoodfacts', sourceRef: 'Open Food Facts (ODbL)',
    quality: complete ? 'imported' : 'incomplete', updatedAt: lm ? new Date(lm * 1000).toISOString() : null, state: 'as_sold',
  }
}

const OFF_FIELDS = 'code,product_name,product_name_es,brands,nutriments,serving_size,serving_quantity,last_modified_t'

export async function offByBarcode(code: string, signal?: AbortSignal): Promise<FoodItem | null> {
  if (!/^\d{6,14}$/.test(code)) throw new Error('Código de barras inválido (6–14 dígitos)')
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${OFF_FIELDS}`, { signal })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Open Food Facts respondió ${res.status}`)
  const j = await res.json()
  return j.status === 1 || j.product ? normalizeOFF(j.product, code) : null
}

export async function offSearch(q: string, signal?: AbortSignal): Promise<FoodItem[]> {
  const url = `https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=20&fields=${OFF_FIELDS}`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Open Food Facts respondió ${res.status}`)
  const j = await res.json()
  return ((j.hits ?? []) as Record<string, unknown>[]).map((h) => normalizeOFF(h)).filter((x): x is FoodItem => x != null)
}

/** Normaliza un alimento de USDA FoodData Central (búsqueda). Ids de nutriente: 1008 kcal, 1003 proteína, 1005 carbs, 1004 grasa. */
export function normalizeUSDA(f: { fdcId: number; description: string; brandOwner?: string; gtinUpc?: string; dataType?: string; publishedDate?: string; foodNutrients?: { nutrientId: number; value: number; unitName?: string }[] }): FoodItem {
  const by = new Map((f.foodNutrients ?? []).map((n) => [n.nutrientId, n]))
  const v = (id: number) => (by.has(id) ? by.get(id)!.value : null)
  let kcal = v(1008) ?? v(2047) ?? v(2048)
  if (kcal == null && by.get(1062)) kcal = by.get(1062)!.value / 4.184
  const per100g: Nutrients = { kcal, protein: v(1003), carbs: v(1005), fat: v(1004), fiber: v(1079), satFat: v(1258), sugar: v(2000), sodiumMg: v(1093) }
  const complete = [per100g.kcal, per100g.protein, per100g.carbs, per100g.fat].every((x) => x != null)
  return {
    id: `usda-${f.fdcId}`, name: f.description, brand: f.brandOwner ?? null, barcode: f.gtinUpc ?? null, per100g,
    source: 'usda', sourceRef: `USDA FoodData Central · ${f.dataType ?? ''}`, quality: complete ? 'verified' : 'incomplete',
    updatedAt: f.publishedDate ?? null, state: null,
  }
}

export async function usdaSearch(q: string, signal?: AbortSignal): Promise<FoodItem[]> {
  const res = await fetch(`/api/usda/search?q=${encodeURIComponent(q)}`, { signal })
  if (res.status === 503) throw new Error('USDA no configurado (falta USDA_API_KEY en el servidor)')
  if (!res.ok) throw new Error(`USDA respondió ${res.status}`)
  const j = await res.json()
  return (j.foods ?? []).map(normalizeUSDA)
}

export const SOURCE_LABEL: Record<FoodItem['source'], string> = {
  catalogo_mx: 'Catálogo MX', usda: 'USDA', openfoodfacts: 'Open Food Facts', user: 'Personal', recipe: 'Receta',
}
export const QUALITY_LABEL: Record<FoodItem['quality'], string> = {
  verified: 'Fuente oficial', imported: 'Importado', estimated: 'Estimación / revisar', incomplete: 'Datos incompletos',
}
