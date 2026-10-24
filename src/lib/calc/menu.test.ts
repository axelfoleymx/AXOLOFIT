import { describe, expect, it } from 'vitest'
import foods from '../../data/foods-mx.json'
import recipes from '../../data/recipes-mx.json'
import { generateMenu, recipeAllowed, suggestForRemaining, type CatalogRecipe } from './menu'

const byId = new Map((foods as unknown as { id: string; name: string; per100g: never; category: string }[]).map((f) => [f.id, f]))
const lookup = (id: string) => byId.get(id)
const R = recipes as CatalogRecipe[]

describe('planificador de menús con catálogo real', () => {
  it('genera los tiempos con nutrientes calculados de los ingredientes', () => {
    const m = generateMenu(R, lookup, { kcalTarget: 2400, proteinTarget: 150, snacks: 2, excludeTerms: [], seed: 1 })
    expect(m.options.map((o) => o.meal).sort()).toEqual(['cena', 'colacion_am', 'colacion_pm', 'comida', 'desayuno'])
    for (const o of m.options) expect(o.nutrients.kcal).toBeGreaterThan(0)
  })
  it('determinista con la misma semilla', () => {
    const a = generateMenu(R, lookup, { kcalTarget: 2000, proteinTarget: 120, snacks: 0, excludeTerms: [], seed: 7 })
    const b = generateMenu(R, lookup, { kcalTarget: 2000, proteinTarget: 120, snacks: 0, excludeTerms: [], seed: 7 })
    expect(a.options.map((o) => o.recipe.id)).toEqual(b.options.map((o) => o.recipe.id))
  })
  it('excluye alérgenos por nombre de ingrediente', () => {
    const m = generateMenu(R, lookup, { kcalTarget: 2000, proteinTarget: 120, snacks: 1, excludeTerms: ['huevo', 'cacahuate'], seed: 3 })
    for (const o of m.options) for (const i of o.ingredients) expect(i.foodName.toLowerCase()).not.toMatch(/huevo|cacahuate/)
  })
  it('vegetariano sin carnes', () => {
    const veg = R.filter((r) => recipeAllowed(r, lookup, { kcalTarget: 0, proteinTarget: 0, snacks: 0, excludeTerms: [], vegetarian: true }))
    expect(veg.length).toBeGreaterThan(0)
    for (const r of veg) for (const i of r.ingredients) expect(lookup(i.foodId)!.name.toLowerCase()).not.toMatch(/pollo|res |cerdo|atún|pescado/)
  })
  it('sugerencias para calorías restantes', () => {
    const s = suggestForRemaining(R, lookup, 600, 40, { excludeTerms: [] })
    expect(s.length).toBe(3)
    expect(s[0].kcal).toBeGreaterThan(300)
    expect(suggestForRemaining(R, lookup, 50, 10, { excludeTerms: [] })).toEqual([])
  })
})
