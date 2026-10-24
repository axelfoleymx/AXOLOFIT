import { useMemo, useState } from 'react'
import { Check, ChefHat, Clock, Plus, RefreshCw, Trash2, Utensils } from 'lucide-react'
import { useUser } from '../../lib/app'
import { useAsync, useRange, useRows } from '../../lib/hooks'
import { repo } from '../../lib/db/db'
import { dayTotals, MEAL_LABEL, recipeNutrition } from '../../lib/calc/nutrition'
import { generateMenu, scaledIngredients, suggestForRemaining, type CatalogRecipe, type PlannedOption } from '../../lib/calc/menu'
import { catalogFood } from '../../lib/providers/foods'
import type { FoodItem, MealType, Recipe } from '../../lib/types'
import { Badge, Card, EmptyState, ErrorBox, Field, Loading, Note, NumberInput, Sheet, Tabs, fmt, toast } from '../../components/ui'
import { FoodPicker, logFood, MacroLine } from './FoodPicker'
import { CONDITION_LABEL, exclusionTerms, foodLookup, loadConditions, loadDrinks, loadEducation, loadRecipes } from './catalog'

// ---------------- Recetas ----------------

export function Recipes() {
  const recipes = useRows('recipes')
  const [view, setView] = useState<'mine' | 'mx'>('mine')
  const [edit, setEdit] = useState<Recipe | 'new' | null>(null)
  const [logR, setLogR] = useState<Recipe | null>(null)
  return (
    <div className="space-y-4">
      <Tabs value={view} onChange={setView} tabs={[{ value: 'mine', label: 'Mis recetas' }, { value: 'mx', label: 'Recetario mexicano' }]} />
      {view === 'mine' ? (
        <>
          <button className="btn-primary" onClick={() => setEdit('new')}><Plus size={16} /> Nueva receta</button>
          {recipes?.length === 0 && <Card><EmptyState mood="food" title="Sin recetas propias" text="Crea una receta con varios ingredientes y ATHLETIQ calculará los nutrientes por porción." /></Card>}
          <div className="grid gap-3 sm:grid-cols-2">
            {recipes?.map((r) => {
              const n = recipeNutrition(r.ingredients, r.servings)
              return (
                <Card key={r.id} title={r.name} action={<Badge>{r.servings} porc.</Badge>}>
                  <p className="text-xs text-muted">Por porción ({fmt(n.gramsPerServing)} g):</p>
                  <MacroLine n={n.perServing} />
                  <p className="mt-1 text-[11px] text-muted">{r.ingredients.length} ingredientes · {fmt(n.totalGrams)} g en total (crudo)</p>
                  <div className="mt-3 flex gap-2"><button className="btn-primary px-3 py-1.5 text-xs" onClick={() => setLogR(r)}>Registrar</button><button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setEdit(r)}>Editar</button></div>
                </Card>
              )
            })}
          </div>
        </>
      ) : <CatalogRecipes />}
      {edit && <RecipeEditor recipe={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
      {logR && <LogRecipeSheet recipe={logR} onClose={() => setLogR(null)} />}
    </div>
  )
}

function RecipeEditor({ recipe, onClose }: { recipe: Recipe | null; onClose: () => void }) {
  const { userId } = useUser()
  const [name, setName] = useState(recipe?.name ?? '')
  const [servings, setServings] = useState<number | null>(recipe?.servings ?? 2)
  const [ings, setIngs] = useState(recipe?.ingredients ?? [])
  const [adding, setAdding] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const n = servings && servings > 0 ? recipeNutrition(ings, servings) : null
  async function save() {
    if (!name.trim()) return setErr('Ponle nombre a la receta')
    if (!ings.length) return setErr('Añade al menos un ingrediente')
    if (!servings || servings <= 0 || servings > 50) return setErr('Porciones entre 1 y 50')
    await repo.put('recipes', userId, { ...(recipe ?? {}), name: name.trim(), servings, ingredients: ings, notes: null, favorite: recipe?.favorite ?? false })
    toast('Receta guardada')
    onClose()
  }
  return (
    <Sheet open onClose={onClose} title={recipe ? 'Editar receta' : 'Nueva receta'} wide>
      {adding ? (
        <FoodPicker showMeal={false} pickLabel="Añadir ingrediente" onPick={(f: FoodItem, g: number) => { setIngs([...ings, { foodId: f.id, foodName: f.name, grams: g, per100g: f.per100g }]); setAdding(false) }} />
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2"><Field label="Nombre">{(id) => <input id={id} className="input" value={name} onChange={(e) => setName(e.target.value)} />}</Field></div>
            <Field label="Porciones">{(id) => <NumberInput id={id} value={servings} onChange={setServings} />}</Field>
          </div>
          <ul className="divide-y divide-line/60">
            {ings.map((i, idx) => (
              <li key={idx} className="flex items-center gap-2 py-2">
                <span className="min-w-0 flex-1 truncate text-sm">{i.foodName}</span>
                <div className="w-24"><NumberInput ariaLabel={`Gramos de ${i.foodName}`} value={i.grams} onChange={(v) => v && v > 0 && setIngs(ings.map((x, j) => (j === idx ? { ...x, grams: v } : x)))} suffix="g" /></div>
                <button className="p-1.5 text-muted hover:text-danger" aria-label={`Quitar ${i.foodName}`} onClick={() => setIngs(ings.filter((_, j) => j !== idx))}><Trash2 size={14} /></button>
              </li>
            ))}
          </ul>
          <button className="btn-outline w-full" onClick={() => setAdding(true)}><Plus size={16} /> Añadir ingrediente</button>
          {n && ings.length > 0 && (
            <div className="rounded-xl bg-raised p-3 text-sm">
              <p>Total: <MacroLine n={n.total} /></p>
              <p>Por porción ({fmt(n.gramsPerServing)} g): <MacroLine n={n.perServing} /></p>
              {n.total.incomplete.some((k) => ['kcal', 'protein', 'carbs', 'fat'].includes(k)) && <p className="mt-1 text-xs text-warn">Algún ingrediente no tiene todos los macros: el total puede estar subestimado.</p>}
            </div>
          )}
          {err && <ErrorBox>{err}</ErrorBox>}
          <div className="flex gap-2">
            {recipe && <button className="btn-danger" onClick={async () => { await repo.remove('recipes', userId, recipe.id); toast('Receta eliminada'); onClose() }}><Trash2 size={16} /></button>}
            <button className="btn-primary flex-1" onClick={save}>Guardar receta</button>
          </div>
        </div>
      )}
    </Sheet>
  )
}

function LogRecipeSheet({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const { userId, today } = useUser()
  const [portions, setPortions] = useState<number | null>(1)
  const [meal, setMeal] = useState<MealType>('comida')
  const n = recipeNutrition(recipe.ingredients, recipe.servings)
  return (
    <Sheet open onClose={onClose} title={`Registrar ${recipe.name}`}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Porciones comidas">{(id) => <NumberInput id={id} value={portions} onChange={setPortions} />}</Field>
          <Field label="Comida">{(id) => <select id={id} className="input" value={meal} onChange={(e) => setMeal(e.target.value as MealType)}>{(Object.keys(MEAL_LABEL) as MealType[]).map((m) => <option key={m} value={m}>{MEAL_LABEL[m]}</option>)}</select>}</Field>
        </div>
        {portions && portions > 0 ? <div className="rounded-xl bg-raised p-3"><MacroLine n={Object.fromEntries(Object.entries(n.perServing).map(([k, v]) => [k, typeof v === 'number' ? v * portions : v])) as never} /></div> : null}
        <button className="btn-primary w-full" disabled={!portions || portions <= 0} onClick={async () => {
          await logFood(userId, { id: `recipe-${recipe.id}`, name: recipe.name, per100g: n.per100g, source: 'recipe', quality: 'imported' } as FoodItem, n.gramsPerServing * portions!, meal, today, recipe.id)
          toast('Receta registrada'); onClose()
        }}>Registrar</button>
      </div>
    </Sheet>
  )
}

function CatalogRecipes() {
  const { prefs, userId, today } = useUser()
  const { data, loading, error } = useAsync(loadRecipes, [])
  const [q, setQ] = useState('')
  const [meal, setMeal] = useState<string>('')
  const excl = exclusionTerms(prefs)
  const list = useMemo(() => (data ?? []).filter((r) => (!meal || r.mealType === meal) && (!q || r.name.toLowerCase().includes(q.toLowerCase()))).slice(0, 60), [data, q, meal])
  if (loading) return <Loading label="Cargando recetario…" />
  if (error) return <ErrorBox>{error}</ErrorBox>
  return (
    <div className="space-y-3">
      <div className="flex gap-2"><input className="input" placeholder="Buscar receta…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar receta" /><select className="input w-40" value={meal} onChange={(e) => setMeal(e.target.value)} aria-label="Tipo de comida"><option value="">Todas</option><option value="desayuno">Desayuno</option><option value="comida">Comida</option><option value="cena">Cena</option><option value="colacion">Colación</option></select></div>
      <p className="text-[11px] text-muted">{data?.length} recetas del catálogo Nutrion. Los nutrientes se recalculan a partir de los ingredientes y sus gramos (no se usan los totales declarados).</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {list.map((r) => <CatalogRecipeCard key={r.id} r={r} warn={r.ingredients.some((i) => { const f = foodLookup(i.foodId); return f && excl.some((t) => f.name.toLowerCase().includes(t)) })} onLog={async (m) => { await logRecipeIngredients(userId, today, r, 1, m); toast('Ingredientes añadidos al diario') }} />)}
      </div>
    </div>
  )
}

function CatalogRecipeCard({ r, warn, onLog }: { r: CatalogRecipe; warn: boolean; onLog: (m: MealType) => void }) {
  const [open, setOpen] = useState(false)
  const n = recipeNutrition(r.ingredients.map((i) => ({ grams: i.grams, per100g: foodLookup(i.foodId)!.per100g })), 1).total
  const meal: MealType = r.mealType === 'colacion' ? 'colacion_pm' : (r.mealType as MealType)
  return (
    <Card title={r.name} action={<Badge>{r.mealType}</Badge>}>
      <MacroLine n={n} />
      <p className="mt-1 flex items-center gap-2 text-[11px] text-muted">{r.prepMin ? <><Clock size={11} /> {r.prepMin} min</> : null}{r.difficulty && <span>· {r.difficulty}</span>}{r.priceRange && <span>· {r.priceRange}</span>}</p>
      {warn && <p className="mt-1 text-xs text-warn">Contiene un ingrediente que marcaste como alergia o no deseado.</p>}
      {open && (
        <div className="mt-2 space-y-1 text-xs text-soft">
          {r.ingredients.map((i) => <p key={i.foodId}>• {foodLookup(i.foodId)?.name} — {fmt(i.grams)} g</p>)}
          {r.instructions && <p className="pt-1 text-muted">{r.instructions}</p>}
        </div>
      )}
      <div className="mt-3 flex gap-2"><button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setOpen(!open)}>{open ? 'Ocultar' : 'Ver ingredientes'}</button><button className="btn-primary px-3 py-1.5 text-xs" onClick={() => onLog(meal)}>Lo comí</button></div>
    </Card>
  )
}

async function logRecipeIngredients(userId: string, date: string, r: CatalogRecipe | { id: string }, scale: number, meal: MealType, ingredients?: PlannedOption['ingredients']) {
  const list = ingredients ?? scaledIngredients(r as CatalogRecipe, scale, foodLookup)
  for (const i of list) {
    const cf = catalogFood(i.foodId)
    await logFood(userId, { id: i.foodId, name: i.foodName, per100g: i.per100g, source: 'catalogo_mx', quality: cf?.flag ? 'estimated' : 'imported' } as FoodItem, i.grams, meal, date, r.id)
  }
}

// ---------------- Planificador ----------------

export function Planner() {
  const { userId, today, targets, prefs } = useUser()
  const { data: recipes, loading, error } = useAsync(loadRecipes, [])
  const { data: conds } = useAsync(loadConditions, [])
  const todayLogs = useRange('foodLogs', today, today)
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9))
  const [maxPrep, setMaxPrep] = useState<number | null>(null)
  const [veg, setVeg] = useState(!!prefs?.diet.some((d) => d === 'vegetariano' || d === 'vegano'))
  const avoidCond = true
  const [eaten, setEaten] = useState<Set<string>>(new Set())
  const [swap, setSwap] = useState<Record<string, number>>({})

  const excl = useMemo(() => [...exclusionTerms(prefs), ...(prefs?.diet.includes('vegano') ? ['leche', 'queso', 'yogur', 'huevo', 'miel', 'crema'] : [])], [prefs])
  const excludeIds = useMemo(() => {
    // La base EnfermedadAlimento solo contiene "recomendado" y "moderado" (sin "evitar"); se usa "moderado" como precaución opcional.
    if (!avoidCond || !conds || !prefs?.conditions.length) return undefined
    return new Set(prefs.conditions.flatMap((c) => (conds.conditions[c]?.evitar ?? []).map(([id]) => id)))
  }, [avoidCond, conds, prefs])

  const menu = useMemo(() => {
    if (!recipes || !targets) return null
    return generateMenu(recipes, foodLookup, { kcalTarget: targets.kcal, proteinTarget: targets.proteinG, snacks: prefs?.snacksPerDay ?? 1, excludeTerms: excl, excludeFoodIds: excludeIds, maxPrepMin: maxPrep, budget: prefs?.budget, vegetarian: veg, seed })
  }, [recipes, targets, prefs, excl, excludeIds, maxPrep, veg, seed])

  const totals = useMemo(() => {
    if (!menu) return null
    const t = { kcal: 0, protein: 0, carbs: 0, fat: 0 }
    for (const o of menu.options) for (const k of Object.keys(t) as (keyof typeof t)[]) t[k] += o.nutrients[k]
    return t
  }, [menu])

  const consumed = dayTotals(todayLogs ?? []).total
  const remaining = targets ? { kcal: targets.kcal - consumed.kcal, protein: targets.proteinG - consumed.protein } : null
  const suggestions = useMemo(() => (recipes && remaining ? suggestForRemaining(recipes, foodLookup, remaining.kcal, remaining.protein, { excludeTerms: excl, excludeFoodIds: excludeIds, vegetarian: veg, maxPrepMin: maxPrep }, 'cena', 3, (targets?.kcal ?? 2000) * 0.4) : []), [recipes, remaining?.kcal, remaining?.protein, excl, excludeIds, veg, maxPrep]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Loading label="Cargando catálogo…" />
  if (error) return <ErrorBox>{error}</ErrorBox>
  if (!targets) return <Note>Define tus objetivos en Perfil para usar el planificador.</Note>

  async function eat(o: PlannedOption) {
    await logRecipeIngredients(userId, today, o.recipe, o.scale, o.meal, o.ingredients)
    setEaten(new Set([...eaten, o.recipe.id]))
    toast(`${o.recipe.name} añadido al diario`)
  }

  return (
    <div className="space-y-4">
      <Note>Las propuestas usan recetas e ingredientes reales del catálogo mexicano; los nutrientes se calculan con código a partir de los gramos. <b>Solo se suman a tu diario cuando confirmas que las comiste.</b></Note>
      <Card title="Preferencias del menú">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-36"><Field label="Tiempo máx. (min)">{(id) => <NumberInput id={id} value={maxPrep} onChange={setMaxPrep} placeholder="Sin límite" />}</Field></div>
          <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[var(--color-lime)]" checked={veg} onChange={(e) => setVeg(e.target.checked)} /> Vegetariano</label>
          <button className="btn-outline ml-auto" onClick={() => { setSeed(Math.floor(Math.random() * 1e9)); setSwap({}); setEaten(new Set()) }}><RefreshCw size={16} /> Otras opciones</button>
        </div>
        {excl.length > 0 && <p className="mt-2 text-[11px] text-muted">Excluyendo ingredientes que contienen: {excl.slice(0, 12).join(', ')}{excl.length > 12 ? '…' : ''}</p>}
        {!!prefs?.conditions.length && <p className="mt-1 text-[11px] text-muted">Condiciones registradas: {prefs.conditions.map((c) => CONDITION_LABEL[c] ?? c).join(', ')}. El catálogo solo clasifica alimentos como «recomendado» o «moderado» por condición (no hay lista de «evitar»), así que el planificador no excluye alimentos por condición; consulta la pestaña Aprende y sigue a tu médico.</p>}
      </Card>

      {menu && totals && (
        <Card title={`Menú propuesto · ${fmt(totals.kcal)} / ${fmt(targets.kcal)} kcal`} action={<Badge tone="lime">P {fmt(totals.protein)} g</Badge>}>
          {totals.protein < targets.proteinG * 0.8 && <div className="mb-3"><Note tone="warn">Este menú aporta {fmt(totals.protein)} g de proteína (objetivo {targets.proteinG} g). Puedes añadir una fuente extra (huevo, yogur griego, pollo) o pedir otras opciones.</Note></div>}
          {menu.missing.length > 0 && <p className="mb-2 text-xs text-warn">Sin recetas compatibles para: {menu.missing.map((m) => MEAL_LABEL[m]).join(', ')}.</p>}
          <div className="space-y-3">
            {menu.options.map((o) => {
              const alt = swap[o.meal]
              const opt = alt != null ? altOption(recipes!, o, alt, excl, excludeIds, veg, maxPrep) ?? o : o
              const done = eaten.has(opt.recipe.id)
              return (
                <div key={o.meal} className="rounded-xl border border-line/70 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-lime">{MEAL_LABEL[o.meal]} · objetivo ~{fmt(o.targetKcal)} kcal</p>
                      <p className="font-semibold">{opt.recipe.name}</p>
                      <MacroLine n={opt.nutrients} />
                    </div>
                    <ChefHat size={18} className="shrink-0 text-muted" />
                  </div>
                  <p className="mt-1 text-[11px] text-muted">{opt.ingredients.map((i) => `${i.foodName} ${i.grams} g`).join(' · ')}</p>
                  <div className="mt-2 flex gap-2">
                    <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setSwap({ ...swap, [o.meal]: (alt ?? 0) + 1 })}><RefreshCw size={12} /> Cambiar</button>
                    <button className="btn-primary px-3 py-1.5 text-xs" disabled={done} onClick={() => eat(opt)}>{done ? <><Check size={12} /> Registrado</> : <><Utensils size={12} /> Lo comí</>}</button>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {remaining && (
        <Card title="¿Qué puedo cenar con lo que me queda?">
          {remaining.kcal < 100 ? <p className="text-sm text-muted">Te quedan {fmt(remaining.kcal)} kcal hoy. Si tienes hambre, prioriza verduras o una fuente de proteína ligera; un día no define tu progreso.</p> : (
            <>
              <p className="text-sm text-soft">Te quedan {fmt(remaining.kcal)} kcal y {fmt(Math.max(0, remaining.protein))} g de proteína.</p>
              <ul className="mt-2 space-y-2">{suggestions.map((s) => (
                <li key={s.recipe.id} className="flex items-center justify-between gap-2 rounded-xl bg-raised p-2.5">
                  <div className="min-w-0"><p className="truncate text-sm font-medium">{s.recipe.name}</p><p className="text-xs text-muted">×{s.scale} · {fmt(s.kcal)} kcal · P {fmt(s.protein)} g</p></div>
                  <button className="btn-primary shrink-0 px-3 py-1.5 text-xs" onClick={async () => { await logRecipeIngredients(userId, today, s.recipe, s.scale, 'cena', s.ingredients); toast('Cena registrada') }}>Lo comí</button>
                </li>
              ))}</ul>
            </>
          )}
        </Card>
      )}
    </div>
  )
}

function altOption(recipes: CatalogRecipe[], o: PlannedOption, n: number, excl: string[], excludeIds: Set<string> | undefined, veg: boolean, maxPrep: number | null): PlannedOption | null {
  const s = suggestForRemaining(recipes, foodLookup, o.targetKcal / 0.9, 0, { excludeTerms: excl, excludeFoodIds: excludeIds, vegetarian: veg, maxPrepMin: maxPrep }, o.meal, 12).filter((x) => x.recipe.id !== o.recipe.id)
  if (!s.length) return null
  const pick = s[(n - 1) % s.length]
  return { meal: o.meal, recipe: pick.recipe, scale: pick.scale, ingredients: pick.ingredients, nutrients: recipeNutrition(pick.ingredients, 1).total, targetKcal: o.targetKcal }
}

// ---------------- Aprende ----------------

const GOAL_KEY = { fat_loss: 'bajar_peso', maintenance: 'mantener_peso', muscle_gain: 'subir_musculo', recomposition: 'subir_musculo' } as const

export function Learn() {
  const { prefs } = useUser()
  const { data, loading } = useAsync(loadEducation, [])
  const { data: drinks } = useAsync(loadDrinks, [])
  const { data: conds } = useAsync(loadConditions, [])
  const [cat, setCat] = useState('Proteína')
  if (loading || !data) return <Loading />
  const goal = GOAL_KEY[prefs?.goal ?? 'maintenance']
  const g = data.learn.find((l) => l.clave === goal)
  const tips = data.tips.filter((t) => t.goal === goal && t.category === cat)
  const cats = [...new Set(data.tips.filter((t) => t.goal === goal).map((t) => t.category))]
  const myConds = prefs?.conditions ?? []
  return (
    <div className="space-y-4">
      {g && (
        <Card title={`Tu objetivo: ${g.nombre_visible}`}>
          <p className="text-sm">{g.resumen_simple}</p>
          <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
            <div><dt className="text-muted">Cómo armar el plato</dt><dd>{g.como_balancear_plato}</dd></div>
            <div><dt className="text-muted">Tips prácticos</dt><dd>{g.tips_practicos}</dd></div>
            <div><dt className="text-muted">Si comes fuera</dt><dd>{g.si_comes_fuera}</dd></div>
            <div><dt className="text-muted">Mito común</dt><dd>{g.mitos_comunes}</dd></div>
          </dl>
          <p className="mt-2 text-[11px] text-muted">Señales para consultar a un profesional: {g.senales_alerta}.</p>
        </Card>
      )}
      <Card title="Guías por tema">
        <div className="mb-3 flex flex-wrap gap-1.5">{cats.map((c) => <button key={c} className={`chip ${c === cat ? 'chip-on' : ''}`} onClick={() => setCat(c)}>{c}</button>)}</div>
        <ul className="space-y-2">{tips.slice(0, 6).map((t, i) => <li key={i} className="rounded-xl bg-raised p-3 text-sm"><p>{t.content}</p><p className="mt-1 text-xs text-lime">Mejor elección: {t.better}</p><p className="text-xs text-muted">Menos recomendable: {t.worse}</p></li>)}</ul>
      </Card>
      {myConds.map((c) => {
        const info = data.learn.find((l) => l.clave === c)
        const rec = conds?.conditions[c]
        return (
          <Card key={c} title={CONDITION_LABEL[c] ?? c} action={<Badge tone="warn">Orientativo</Badge>}>
            {info ? <p className="text-sm">{info.resumen_simple}</p> : <p className="text-sm text-muted">Sin contenido educativo específico en el catálogo.</p>}
            {info && <p className="mt-2 text-xs"><span className="text-muted">Preferir:</span> {info.alimentos_preferir}. <span className="text-muted">Moderar:</span> {info.alimentos_moderar}. <span className="text-muted">Evitar:</span> {info.alimentos_evitar}.</p>}
            {rec && <p className="mt-2 text-xs text-soft">Alimentos del catálogo marcados como recomendados: {rec.recomendado.slice(0, 10).map(([id]) => foodLookup(id)?.name).filter(Boolean).join(', ')}…</p>}
            <p className="mt-2 text-[11px] text-muted">{info?.disclaimer ?? 'Contenido educativo; no sustituye consulta médica o nutricional profesional.'}</p>
          </Card>
        )
      })}
      {drinks && (
        <Card title="Bebidas mexicanas (por porción)">
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface text-left text-muted"><tr><th className="py-1">Bebida</th><th>ml</th><th>kcal</th><th>Azúcar</th><th>Perfil</th></tr></thead>
              <tbody>{drinks.map((d) => <tr key={d.id} className="border-t border-line/50"><td className="py-1.5 pr-2">{d.name}</td><td>{d.servingMl}</td><td>{fmt(d.kcal)}</td><td>{fmt(d.sugarG)} g</td><td><Badge tone={d.healthProfile.includes('saludable') && !d.healthProfile.includes('poco') ? 'lime' : d.healthProfile === 'moderada' ? 'warn' : 'danger'}>{d.healthProfile.replace('_', ' ')}</Badge></td></tr>)}</tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
