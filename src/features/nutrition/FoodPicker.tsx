import { useEffect, useMemo, useRef, useState } from 'react'
import { Barcode, ChevronLeft, Heart, PenLine, Search, Star } from 'lucide-react'
import { useUser } from '../../lib/app'
import { useRows } from '../../lib/hooks'
import { repo } from '../../lib/db/db'
import { catalogToFood, loadCatalog, offByBarcode, offSearch, QUALITY_LABEL, rankByName, SOURCE_LABEL, usdaSearch } from '../../lib/providers/foods'
import { isLikelyDuplicate, MEAL_LABEL, recipeNutrition, scaleNutrients, toGrams, validateGrams } from '../../lib/calc/nutrition'
import type { FoodItem, FoodLogItem, MealType, Nutrients } from '../../lib/types'
import { Badge, ErrorBox, Field, Note, NumberInput, Sheet, Tabs, fmt, toast } from '../../components/ui'
import { BarcodeScanner, scannerSupported } from './BarcodeScanner'

type Source = 'mx' | 'mine' | 'off' | 'usda'

export function QualityBadge({ f }: { f: Pick<FoodItem, 'source' | 'quality'> }) {
  const tone = f.quality === 'verified' ? 'lime' : f.quality === 'incomplete' ? 'danger' : f.quality === 'estimated' ? 'warn' : 'muted'
  return <span className="inline-flex gap-1"><Badge>{SOURCE_LABEL[f.source]}</Badge><Badge tone={tone}>{QUALITY_LABEL[f.quality]}</Badge></span>
}

export function MacroLine({ n, className = '' }: { n: Nutrients; className?: string }) {
  return <span className={`tabular-nums text-xs text-muted ${className}`}>{fmt(n.kcal)} kcal · P {fmt(n.protein, 1)} · C {fmt(n.carbs, 1)} · G {fmt(n.fat, 1)}</span>
}

/** Buscador unificado de alimentos con selección de cantidad. `onPick` recibe el alimento y gramos. */
export function FoodPicker({ onPick, pickLabel = 'Añadir', defaultMeal, showMeal = true }: { onPick: (f: FoodItem, grams: number, meal: MealType) => Promise<void> | void; pickLabel?: string; defaultMeal?: MealType; showMeal?: boolean }) {
  const [src, setSrc] = useState<Source>('mx')
  const [q, setQ] = useState('')
  const [results, setResults] = useState<FoodItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<FoodItem | null>(null)
  const [custom, setCustom] = useState(false)
  const [barcode, setBarcode] = useState('')
  const [scanning, setScanning] = useState(false)
  const customFoods = useRows('customFoods')
  const favorites = useRows('favorites')
  const recipes = useRows('recipes')
  const abort = useRef<AbortController | null>(null)

  const mine: FoodItem[] = useMemo(() => [
    ...(favorites ?? []).map((f) => ({ id: f.foodId, name: f.foodName, per100g: f.per100g, source: f.source, quality: f.quality, servingG: f.grams, servingLabel: `${fmt(f.grams)} g (favorito)` } as FoodItem)),
    ...(recipes ?? []).map((r) => { const n = recipeNutrition(r.ingredients, r.servings); return { id: `recipe-${r.id}`, name: r.name, per100g: n.per100g, source: 'recipe', quality: n.total.incomplete.some((k) => ['kcal', 'protein', 'carbs', 'fat'].includes(k)) ? 'incomplete' : 'imported', servingG: n.gramsPerServing, servingLabel: `1 porción (${fmt(n.gramsPerServing)} g)` } as FoodItem }),
    ...(customFoods ?? []).map((c) => ({ ...c, id: c.id } as FoodItem)),
  ], [customFoods, favorites, recipes])

  useEffect(() => {
    setError(null)
    abort.current?.abort()
    if (src === 'mx') {
      // El catálogo importado contiene entradas repetidas (mismo nombre y valores): se muestran una sola vez
      void loadCatalog().then((cat) => {
        const seen = new Set<string>()
        setResults(q.trim() ? rankByName(cat, q, 80).filter((f) => { const k = `${f.name.toLowerCase()}|${f.per100g.kcal}|${f.per100g.protein}`; if (seen.has(k)) return false; seen.add(k); return true }).slice(0, 30).map(catalogToFood) : [])
      })
      return
    }
    if (src === 'mine') return setResults(q.trim() ? rankByName(mine, q) : mine.slice(0, 40))
    if (q.trim().length < 3) return setResults([])
    const ctrl = new AbortController()
    abort.current = ctrl
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        setResults(src === 'off' ? await offSearch(q, ctrl.signal) : await usdaSearch(q, ctrl.signal))
      } catch (e) {
        if (!ctrl.signal.aborted) setError(navigator.onLine ? (e instanceof Error ? e.message : 'Error de búsqueda') : 'Sin conexión: usa el catálogo local o tus alimentos.')
      } finally {
        if (!ctrl.signal.aborted) setLoading(false)
      }
    }, 450)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [q, src, mine])

  async function lookupBarcode(raw?: string) {
    setError(null)
    const code = (raw ?? barcode).trim()
    const local = (customFoods ?? []).find((c) => c.barcode === code)
    if (local) return setPicked(local as unknown as FoodItem)
    setLoading(true)
    try {
      const f = await offByBarcode(code)
      if (!f) setError('Producto no encontrado en Open Food Facts. Puedes crearlo manualmente con los datos de la etiqueta.')
      else setPicked(f)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }

  if (custom) return <CustomFoodForm initialBarcode={barcode} onCancel={() => setCustom(false)} onSaved={(f) => { setCustom(false); setPicked(f) }} />
  if (picked) return <QuantityStep food={picked} onBack={() => setPicked(null)} onPick={onPick} pickLabel={pickLabel} defaultMeal={defaultMeal} showMeal={showMeal} />

  return (
    <div className="space-y-3">
      <Tabs value={src} onChange={(v) => { setSrc(v); setResults([]) }} tabs={[{ value: 'mx', label: 'Catálogo MX' }, { value: 'mine', label: 'Míos' }, { value: 'off', label: 'Productos' }, { value: 'usda', label: 'USDA' }]} />
      <div className="relative">
        <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
        <input autoFocus className="input pl-9" placeholder={src === 'off' ? 'Marca o producto (p. ej. yogurt lala)' : 'Buscar alimento…'} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar alimento" />
      </div>
      {src === 'off' && (
        <div className="flex gap-2">
          <div className="relative flex-1"><Barcode size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" /><input inputMode="numeric" className="input pl-9" placeholder="Código de barras" value={barcode} onChange={(e) => setBarcode(e.target.value.replace(/\D/g, ''))} aria-label="Código de barras" /></div>
          <button className="btn-ghost" onClick={() => lookupBarcode()} disabled={barcode.length < 6}>Buscar</button>
          {scannerSupported() && <button className="btn-primary" onClick={() => setScanning(true)} aria-label="Escanear con la cámara"><Barcode size={16} /></button>}
        </div>
      )}
      {src === 'off' && scanning && <BarcodeScanner onClose={() => setScanning(false)} onCode={(c) => { setScanning(false); setBarcode(c); void lookupBarcode(c) }} />}
      {src === 'off' && <p className="text-[11px] text-muted">Datos de Open Food Facts (licencia ODbL), aportados por la comunidad. La cobertura de productos mexicanos es parcial y puede contener errores.</p>}
      {src === 'usda' && <p className="text-[11px] text-muted">USDA FoodData Central (EE. UU.). Requiere USDA_API_KEY configurada en el servidor.</p>}
      {error && <ErrorBox>{error}</ErrorBox>}
      {loading && <p className="text-sm text-muted">Buscando…</p>}
      <ul className="divide-y divide-line/60">
        {results.map((f) => (
          <li key={f.id}>
            <button className="flex w-full items-start justify-between gap-3 py-2.5 text-left hover:bg-raised/40" onClick={() => setPicked(f)}>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{f.name}{f.brand ? <span className="text-muted"> · {f.brand}</span> : null}</span>
                <span className="text-xs text-muted">por 100 g: </span><MacroLine n={f.per100g} />
              </span>
              <QualityBadge f={f} />
            </button>
          </li>
        ))}
      </ul>
      {!loading && q.trim() && results.length === 0 && !error && <p className="text-sm text-muted">Sin resultados en esta fuente.</p>}
      <button className="btn-outline w-full" onClick={() => setCustom(true)}><PenLine size={16} /> Crear alimento manual</button>
    </div>
  )
}

function QuantityStep({ food, onBack, onPick, pickLabel, defaultMeal, showMeal }: { food: FoodItem; onBack: () => void; onPick: (f: FoodItem, g: number, m: MealType) => Promise<void> | void; pickLabel: string; defaultMeal?: MealType; showMeal: boolean }) {
  const { userId } = useUser()
  const favorites = useRows('favorites')
  const units = [{ value: 'g', label: 'Gramos' }, ...(food.servingG ? [{ value: 'serving', label: food.servingLabel ?? `Porción (${food.servingG} g)` }] : []), ...(food.unitG ? [{ value: 'unit', label: `Pieza (${food.unitG} g)` }] : []), { value: 'oz', label: 'Onzas' }] as { value: 'g' | 'serving' | 'unit' | 'oz'; label: string }[]
  const [unit, setUnit] = useState<'g' | 'serving' | 'unit' | 'oz'>(food.servingG && food.source !== 'catalogo_mx' ? 'serving' : 'g')
  const [qty, setQty] = useState<number | null>(unit === 'serving' ? 1 : (food.servingG ?? 100))
  const [meal, setMeal] = useState<MealType>(defaultMeal ?? 'comida')
  const [busy, setBusy] = useState(false)
  let grams: number | null = null
  let err: string | null = null
  try {
    if (qty != null) {
      grams = toGrams(qty, unit, food)
      const v = validateGrams(grams)
      if (!v.ok) err = v.error
    } else err = 'Introduce una cantidad'
  } catch (e) {
    err = e instanceof Error ? e.message : 'Cantidad inválida'
  }
  const n = grams != null && !err ? scaleNutrients(food.per100g, grams) : null
  const fav = favorites?.find((f) => f.foodId === food.id)
  const incomplete = [food.per100g.kcal, food.per100g.protein, food.per100g.carbs, food.per100g.fat].some((v) => v == null)

  async function toggleFav() {
    if (fav) await repo.remove('favorites', userId, fav.id)
    else if (grams) await repo.put('favorites', userId, { foodId: food.id, foodName: food.name, grams, per100g: food.per100g, source: food.source, quality: food.quality })
    toast(fav ? 'Quitado de favoritos' : 'Guardado en favoritos')
  }

  return (
    <div className="space-y-4">
      <button className="flex items-center gap-1 text-sm text-muted hover:text-text" onClick={onBack}><ChevronLeft size={16} /> Volver</button>
      <div>
        <h3 className="text-lg font-semibold">{food.name}</h3>
        {food.brand && <p className="text-sm text-muted">{food.brand}{food.barcode ? ` · ${food.barcode}` : ''}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-2"><QualityBadge f={food} />{food.state && <Badge>{food.state === 'raw' ? 'Crudo' : food.state === 'cooked' ? 'Cocido' : 'Tal como se vende'}</Badge>}</div>
        {food.sourceRef && <p className="mt-1 text-[11px] text-muted">Fuente: {food.sourceRef}{food.updatedAt ? ` · actualizado ${food.updatedAt.slice(0, 10)}` : ''}</p>}
        {food.flag === 'kcal_inconsistente' && <div className="mt-2"><Note tone="warn">Las calorías de este registro no cuadran con sus macronutrientes (diferencia &gt; 25 %). Verifica con otra fuente si es importante.</Note></div>}
        {incomplete && <div className="mt-2"><Note tone="warn">Este alimento no tiene información completa. Los nutrientes faltantes no se suman (no los inventamos).</Note></div>}
        {food.notes && <p className="mt-2 text-xs text-soft">{food.notes}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Cantidad" error={err}>{(id) => <NumberInput id={id} value={qty} onChange={setQty} />}</Field>
        <Field label="Unidad">{(id) => <select id={id} className="input" value={unit} onChange={(e) => { const u = e.target.value as typeof unit; setUnit(u); setQty(u === 'g' ? (grams ? Math.round(grams) : 100) : 1) }}>{units.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}</select>}</Field>
      </div>
      {showMeal && <Field label="Comida">{(id) => <select id={id} className="input" value={meal} onChange={(e) => setMeal(e.target.value as MealType)}>{(Object.keys(MEAL_LABEL) as MealType[]).map((m) => <option key={m} value={m}>{MEAL_LABEL[m]}</option>)}</select>}</Field>}
      <div className="rounded-xl bg-raised p-3">
        <p className="mb-2 text-xs text-muted">{grams ? `${fmt(grams, 1)} g` : '—'}{food.state === 'raw' ? ' · pesado en crudo' : food.state === 'cooked' ? ' · pesado cocido' : ''}</p>
        <div className="grid grid-cols-4 gap-2 text-center">
          {(['kcal', 'protein', 'carbs', 'fat'] as const).map((k) => <div key={k}><p className="text-[11px] text-muted">{{ kcal: 'kcal', protein: 'Proteína', carbs: 'Carbos', fat: 'Grasas' }[k]}</p><p className="font-semibold tabular-nums">{fmt(n?.[k] ?? null, k === 'kcal' ? 0 : 1)}</p></div>)}
        </div>
        {n && (n.fiber != null || n.sugar != null || n.sodiumMg != null) && <p className="mt-2 text-[11px] text-muted">Fibra {fmt(n.fiber, 1)} g · Azúcares {fmt(n.sugar, 1)} g · Sat. {fmt(n.satFat, 1)} g · Sodio {fmt(n.sodiumMg)} mg</p>}
      </div>
      <p className="text-[11px] text-muted">Importante: el peso crudo y el cocido no son intercambiables (el arroz o la carne cambian de peso al cocinarse). Usa la entrada que corresponda a cómo pesaste el alimento.</p>
      <div className="flex gap-2">
        <button className="btn-ghost" onClick={toggleFav} aria-label={fav ? 'Quitar de favoritos' : 'Añadir a favoritos'} disabled={!grams}>{fav ? <Heart size={16} className="fill-axo text-axo" /> : <Star size={16} />}</button>
        <button className="btn-primary flex-1" disabled={!!err || busy} onClick={async () => { setBusy(true); try { await onPick(food, grams!, meal) } finally { setBusy(false) } }}>{pickLabel}</button>
      </div>
    </div>
  )
}

function CustomFoodForm({ onSaved, onCancel, initialBarcode }: { onSaved: (f: FoodItem) => void; onCancel: () => void; initialBarcode?: string }) {
  const { userId } = useUser()
  const [basis, setBasis] = useState<'100g' | 'serving'>('100g')
  const [s, setS] = useState({ name: '', brand: '', barcode: initialBarcode ?? '', servingG: null as number | null, unitG: null as number | null, kcal: null as number | null, protein: null as number | null, carbs: null as number | null, fat: null as number | null, fiber: null as number | null, sugar: null as number | null, satFat: null as number | null, sodiumMg: null as number | null, state: 'as_sold' as FoodItem['state'], estimate: false })
  const [err, setErr] = useState<string | null>(null)
  const up = (k: keyof typeof s, v: unknown) => setS((x) => ({ ...x, [k]: v }))
  async function save() {
    if (!s.name.trim()) return setErr('El nombre es obligatorio')
    if (basis === 'serving' && !s.servingG) return setErr('Indica el tamaño de la porción en gramos')
    if (s.kcal == null) return setErr('Las calorías son obligatorias (puedes marcarlas como estimación)')
    for (const k of ['kcal', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'satFat', 'sodiumMg'] as const) if (s[k] != null && s[k]! < 0) return setErr('Los valores no pueden ser negativos')
    const f = basis === 'serving' ? 100 / s.servingG! : 1
    const conv = (v: number | null) => (v == null ? null : Math.round(v * f * 100) / 100)
    const per100g: Nutrients = { kcal: conv(s.kcal), protein: conv(s.protein), carbs: conv(s.carbs), fat: conv(s.fat), fiber: conv(s.fiber), sugar: conv(s.sugar), satFat: conv(s.satFat), sodiumMg: conv(s.sodiumMg) }
    const complete = [per100g.protein, per100g.carbs, per100g.fat].every((v) => v != null)
    const row = await repo.put('customFoods', userId, {
      name: s.name.trim(), brand: s.brand || null, barcode: s.barcode || null, per100g, servingG: s.servingG, servingLabel: s.servingG ? `Porción (${s.servingG} g)` : null, unitG: s.unitG,
      state: s.state, source: 'user', sourceRef: s.estimate ? 'Estimación manual del usuario' : 'Introducido por el usuario (etiqueta)', quality: s.estimate ? 'estimated' : complete ? 'imported' : 'incomplete', category: null, flag: null, notes: null,
    })
    toast('Alimento guardado')
    onSaved(row as unknown as FoodItem)
  }
  const num = (k: 'kcal' | 'protein' | 'carbs' | 'fat' | 'fiber' | 'sugar' | 'satFat' | 'sodiumMg', l: string, u = 'g') => <Field label={l}>{(id) => <NumberInput id={id} value={s[k]} onChange={(v) => up(k, v)} suffix={u} />}</Field>
  return (
    <div className="space-y-3">
      <button className="flex items-center gap-1 text-sm text-muted hover:text-text" onClick={onCancel}><ChevronLeft size={16} /> Volver</button>
      <Field label="Nombre">{(id) => <input id={id} className="input" value={s.name} onChange={(e) => up('name', e.target.value)} />}</Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Marca (opcional)">{(id) => <input id={id} className="input" value={s.brand} onChange={(e) => up('brand', e.target.value)} />}</Field>
        <Field label="Código de barras">{(id) => <input id={id} inputMode="numeric" className="input" value={s.barcode} onChange={(e) => up('barcode', e.target.value.replace(/\D/g, ''))} />}</Field>
        <Field label="Porción (g)">{(id) => <NumberInput id={id} value={s.servingG} onChange={(v) => up('servingG', v)} suffix="g" />}</Field>
        <Field label="Peso por pieza (g)">{(id) => <NumberInput id={id} value={s.unitG} onChange={(v) => up('unitG', v)} suffix="g" />}</Field>
      </div>
      <div><span className="label">Valores nutricionales expresados</span><Tabs value={basis} onChange={setBasis} tabs={[{ value: '100g', label: 'Por 100 g' }, { value: 'serving', label: 'Por porción' }]} /></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {num('kcal', 'Calorías', 'kcal')}{num('protein', 'Proteína')}{num('carbs', 'Carbohidratos')}{num('fat', 'Grasas')}
        {num('fiber', 'Fibra')}{num('sugar', 'Azúcares')}{num('satFat', 'Grasa sat.')}{num('sodiumMg', 'Sodio', 'mg')}
      </div>
      <Field label="Estado al pesarlo">{(id) => <select id={id} className="input" value={s.state ?? 'as_sold'} onChange={(e) => up('state', e.target.value)}><option value="as_sold">Tal como se vende</option><option value="raw">Crudo</option><option value="cooked">Cocido</option></select>}</Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[var(--color-lime)]" checked={s.estimate} onChange={(e) => up('estimate', e.target.checked)} /> Son valores estimados (no de etiqueta)</label>
      {err && <ErrorBox>{err}</ErrorBox>}
      <button className="btn-primary w-full" onClick={save}>Guardar alimento</button>
    </div>
  )
}

/** Hoja para registrar un alimento en el diario, con prevención de duplicados accidentales. */
export function AddFoodSheet({ open, onClose, date, meal }: { open: boolean; onClose: () => void; date: string; meal?: MealType }) {
  const { userId } = useUser()
  const existing = useRows('foodLogs', (l) => l.date === date, [date])
  async function add(f: FoodItem, grams: number, m: MealType) {
    const candidate = { foodId: f.id, meal: m, grams, date }
    if (isLikelyDuplicate(candidate, existing ?? []) && !confirm('Acabas de registrar este mismo alimento y cantidad. ¿Registrarlo otra vez?')) return
    await logFood(userId, f, grams, m, date)
    toast(`${f.name} añadido a ${MEAL_LABEL[m].toLowerCase()}`)
    onClose()
  }
  return (
    <Sheet open={open} onClose={onClose} title="Registrar comida" wide>
      <FoodPicker onPick={add} defaultMeal={meal} />
    </Sheet>
  )
}

export async function logFood(userId: string, f: FoodItem, grams: number, meal: MealType, date: string, recipeId?: string) {
  return repo.put('foodLogs', userId, {
    date, meal, foodId: f.id, foodName: f.brand ? `${f.name} (${f.brand})` : f.name, grams: Math.round(grams * 10) / 10, per100g: f.per100g,
    source: f.source, quality: f.quality, state: f.state ?? null, recipeId: recipeId ?? (f.source === 'recipe' ? f.id.replace('recipe-', '') : null), origin: 'user',
  } satisfies Omit<FoodLogItem, 'id' | 'userId' | 'createdAt' | 'updatedAt'>)
}
