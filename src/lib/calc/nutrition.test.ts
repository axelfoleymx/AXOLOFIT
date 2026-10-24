import { describe, expect, it } from 'vitest'
import { dayTotals, isLikelyDuplicate, mealDistribution, recipeNutrition, scaleNutrients, sumNutrients, toGrams, validateGrams } from './nutrition'

const chicken = { kcal: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0 }
const rice = { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4 }

describe('escalado de nutrientes', () => {
  it('150 g de un alimento con 20 g de proteína/100 g = 30 g', () => {
    expect(scaleNutrients({ kcal: 100, protein: 20, carbs: 0, fat: 0 }, 150).protein).toBeCloseTo(30)
  })
  it('aplica el mismo factor a todos los nutrientes', () => {
    const n = scaleNutrients(chicken, 250)
    expect(n.kcal).toBeCloseTo(412.5)
    expect(n.fat).toBeCloseTo(9)
  })
  it('conserva desconocidos como null, nunca como 0', () => {
    const n = scaleNutrients({ kcal: 50, protein: null, carbs: 10, fat: null }, 200)
    expect(n.protein).toBeNull()
    expect(n.kcal).toBe(100)
  })
  it('rechaza cantidades negativas o no numéricas', () => {
    expect(() => scaleNutrients(chicken, -5)).toThrow()
    expect(() => scaleNutrients(chicken, Number.NaN)).toThrow()
  })
})

describe('conversión a gramos', () => {
  it('porciones y unidades', () => {
    expect(toGrams(2, 'serving', { servingG: 30 })).toBe(60)
    expect(toGrams(3, 'unit', { unitG: 50 })).toBe(150)
    expect(toGrams(1, 'oz', {})).toBeCloseTo(28.35, 2)
  })
  it('falla si no hay porción definida', () => {
    expect(() => toGrams(1, 'serving', {})).toThrow()
    expect(() => toGrams(0, 'g', {})).toThrow()
  })
})

describe('recetas', () => {
  it('suma ingredientes y divide por porciones', () => {
    const r = recipeNutrition([{ grams: 200, per100g: chicken }, { grams: 300, per100g: rice }], 2)
    expect(r.total.kcal).toBeCloseTo(330 + 390)
    expect(r.perServing.protein).toBeCloseTo((62 + 8.1) / 2)
    expect(r.gramsPerServing).toBe(250)
    expect(r.per100g.kcal).toBeCloseTo(720 / 5)
  })
  it('marca nutrientes incompletos', () => {
    const r = recipeNutrition([{ grams: 100, per100g: { kcal: 10, protein: null, carbs: 1, fat: 0 } }], 1)
    expect(r.total.incomplete).toContain('protein')
    expect(r.per100g.protein).toBeNull()
  })
  it('porciones inválidas', () => expect(() => recipeNutrition([], 0)).toThrow())
})

describe('totales diarios', () => {
  it('por comida y total', () => {
    const t = dayTotals([
      { meal: 'desayuno', grams: 100, per100g: rice },
      { meal: 'comida', grams: 150, per100g: chicken },
      { meal: 'comida', grams: 200, per100g: rice },
    ])
    expect(t.total.kcal).toBeCloseTo(130 + 247.5 + 260)
    expect(t.byMeal.comida!.protein).toBeCloseTo(46.5 + 5.4)
  })
  it('suma vacía = 0', () => expect(sumNutrients([]).kcal).toBe(0))
})

describe('duplicados y validación', () => {
  const now = Date.parse('2026-10-23T12:00:30Z')
  const existing = [{ foodId: 'a', meal: 'comida' as const, grams: 150, date: '2026-10-23', createdAt: '2026-10-23T12:00:00Z', deletedAt: null }]
  it('detecta duplicado inmediato', () => {
    expect(isLikelyDuplicate({ foodId: 'a', meal: 'comida', grams: 150.5, date: '2026-10-23' }, existing, now)).toBe(true)
  })
  it('no marca registros distintos o antiguos', () => {
    expect(isLikelyDuplicate({ foodId: 'a', meal: 'cena', grams: 150, date: '2026-10-23' }, existing, now)).toBe(false)
    expect(isLikelyDuplicate({ foodId: 'a', meal: 'comida', grams: 150, date: '2026-10-23' }, existing, now + 600_000)).toBe(false)
  })
  it('valida gramos', () => {
    expect(validateGrams('120,5')).toEqual({ ok: true, value: 120.5 })
    expect(validateGrams('abc').ok).toBe(false)
    expect(validateGrams(0).ok).toBe(false)
    expect(validateGrams(99999).ok).toBe(false)
  })
  it('distribuciones suman 100 %', () => {
    for (const s of [0, 1, 2] as const) expect(Object.values(mealDistribution(s)).reduce((a, b) => a + b, 0)).toBeCloseTo(1)
  })
})
