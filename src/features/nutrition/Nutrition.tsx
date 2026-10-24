import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Copy, Pencil, Plus, Trash2 } from 'lucide-react'
import { useUser } from '../../lib/app'
import { useRange } from '../../lib/hooks'
import { repo } from '../../lib/db/db'
import { addDays } from '../../lib/calc/weight'
import { dayTotals, itemNutrients, MEAL_LABEL, validateGrams } from '../../lib/calc/nutrition'
import type { FoodLogItem, MealType } from '../../lib/types'
import { Bar, Card, EmptyState, Field, NumberInput, Ring, Sheet, Tabs, fmt, toast } from '../../components/ui'
import { AddFoodSheet, MacroLine, QualityBadge } from './FoodPicker'
import { Learn, Planner, Recipes } from './NutritionExtras'

type Tab = 'diary' | 'recipes' | 'planner' | 'learn'

export default function Nutrition() {
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>((params.get('tab') as Tab) || 'diary')
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="h-display text-2xl font-bold">Nutrición</h1>
      <Tabs value={tab} onChange={(t) => { setTab(t); setParams(t === 'diary' ? {} : { tab: t }) }} tabs={[{ value: 'diary', label: 'Diario' }, { value: 'recipes', label: 'Recetas' }, { value: 'planner', label: 'Planificador' }, { value: 'learn', label: 'Aprende' }]} />
      {tab === 'diary' && <Diary />}
      {tab === 'recipes' && <Recipes />}
      {tab === 'planner' && <Planner />}
      {tab === 'learn' && <Learn />}
    </div>
  )
}

function Diary() {
  const { userId, today, targets, prefs } = useUser()
  const [params, setParams] = useSearchParams()
  const [date, setDate] = useState(today)
  const [adding, setAdding] = useState<{ meal?: MealType } | null>(null)
  const [editing, setEditing] = useState<FoodLogItem | null>(null)
  useEffect(() => {
    if (params.get('add')) {
      setAdding({})
      setParams({}, { replace: true })
    }
  }, [params, setParams])
  const logs = useRange('foodLogs', addDays(date, -1), date)
  const dayLogs = useMemo(() => (logs ?? []).filter((l) => l.date === date).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [logs, date])
  const yesterday = useMemo(() => (logs ?? []).filter((l) => l.date === addDays(date, -1)), [logs, date])
  const totals = dayTotals(dayLogs)
  const snacks = prefs?.snacksPerDay ?? 1
  const meals: MealType[] = (['desayuno', 'colacion_am', 'comida', 'colacion_pm', 'cena'] as MealType[]).filter((m) => m === 'desayuno' || m === 'comida' || m === 'cena' || (m === 'colacion_am' && snacks >= 2) || (m === 'colacion_pm' && snacks >= 1) || dayLogs.some((l) => l.meal === m))

  async function remove(item: FoodLogItem) {
    await repo.remove('foodLogs', userId, item.id)
    toast(`${item.foodName} eliminado`, 'ok', { label: 'Deshacer', run: () => void repo.put('foodLogs', userId, { ...item, deletedAt: null }) })
  }
  async function copyMeal(meal: MealType) {
    const src = yesterday.filter((l) => l.meal === meal)
    if (!src.length) return toast('No hay registros de ayer en esta comida', 'err')
    for (const l of src) {
      const { id: _i, createdAt: _c, updatedAt: _u, userId: _uid, ...rest } = l
      await repo.put('foodLogs', userId, { ...rest, date })
    }
    toast(`${src.length} alimento(s) copiados de ayer`)
  }

  const t = targets
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button className="btn-ghost p-2" onClick={() => setDate(addDays(date, -1))} aria-label="Día anterior"><ChevronLeft size={18} /></button>
        <div className="text-center">
          <p className="font-semibold">{date === today ? 'Hoy' : date === addDays(today, -1) ? 'Ayer' : new Date(date + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' })}</p>
          <input type="date" className="bg-transparent text-xs text-muted" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Elegir fecha" />
        </div>
        <button className="btn-ghost p-2" onClick={() => setDate(addDays(date, 1))} disabled={date >= today} aria-label="Día siguiente"><ChevronRight size={18} /></button>
      </div>

      {t && (
        <Card>
          <div className="flex items-center gap-4">
            <Ring value={totals.total.kcal} max={t.kcal} size={110} stroke={10} label="Calorías">
              <span className="h-display text-xl font-bold">{fmt(totals.total.kcal)}</span>
              <span className="text-[10px] text-muted">de {fmt(t.kcal)}</span>
            </Ring>
            <div className="flex-1 space-y-2">
              {([['Proteína', totals.total.protein, t.proteinG, 'var(--color-protein)'], ['Carbohidratos', totals.total.carbs, t.carbsG, 'var(--color-carbs)'], ['Grasas', totals.total.fat, t.fatG, 'var(--color-fat)']] as const).map(([l, v, m, c]) => (
                <div key={l}><div className="mb-0.5 flex justify-between text-xs"><span>{l}</span><span className="tabular-nums text-muted">{fmt(v)} / {fmt(m)} g</span></div><Bar value={v} max={m} color={c} label={l} /></div>
              ))}
              {prefs?.trackFiber && <p className="text-[11px] text-muted">Fibra {fmt(totals.total.fiber, 1)} g{t.fiberG ? ` / ${t.fiberG} g` : ''}{totals.total.incomplete.includes('fiber') ? ' (datos parciales)' : ''} · Sodio {totals.total.incomplete.includes('sodiumMg') ? (totals.total.sodiumMg ? `≥ ${fmt(totals.total.sodiumMg)} mg (parcial)` : 'sin datos') : `${fmt(totals.total.sodiumMg)} mg`}</p>}
            </div>
          </div>
          <p className="mt-3 text-[11px] text-muted">Restante: {fmt(t.kcal - totals.total.kcal)} kcal · {fmt(t.proteinG - totals.total.protein)} g de proteína. Los objetivos son una guía, no hace falta clavarlos al gramo.</p>
        </Card>
      )}

      {dayLogs.length === 0 && <Card><EmptyState mood="food" title="Aún no registras nada este día" text="Añade tu primera comida: busca en el catálogo mexicano, escanea un código o crea un alimento." action={<button className="btn-primary mt-2" onClick={() => setAdding({})}><Plus size={16} /> Registrar comida</button>} /></Card>}

      {meals.map((m) => {
        const items = dayLogs.filter((l) => l.meal === m)
        const mt = totals.byMeal[m]
        return (
          <Card key={m} title={<span>{MEAL_LABEL[m]} {mt ? <span className="ml-2 text-xs font-normal text-muted">{fmt(mt.kcal)} kcal · P {fmt(mt.protein)} g</span> : null}</span>}
            action={<div className="flex gap-1">
              <button className="rounded-lg p-1.5 text-muted hover:bg-raised hover:text-text" title="Copiar de ayer" aria-label={`Copiar ${MEAL_LABEL[m]} de ayer`} onClick={() => copyMeal(m)}><Copy size={15} /></button>
              <button className="rounded-lg p-1.5 text-lime hover:bg-raised" aria-label={`Añadir a ${MEAL_LABEL[m]}`} onClick={() => setAdding({ meal: m })}><Plus size={17} /></button>
            </div>}>
            {items.length === 0 ? <p className="text-xs text-muted">Sin registros.</p> : (
              <ul className="divide-y divide-line/60">
                {items.map((it) => {
                  const n = itemNutrients(it)
                  return (
                    <li key={it.id} className="flex items-center gap-2 py-2">
                      <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(it)}>
                        <p className="truncate text-sm">{it.foodName} <span className="text-muted">· {fmt(it.grams)} g</span></p>
                        <div className="flex flex-wrap items-center gap-2"><MacroLine n={n} />{it.quality !== 'imported' && <QualityBadge f={it} />}</div>
                      </button>
                      <button className="rounded-lg p-1.5 text-muted hover:text-text" aria-label={`Editar ${it.foodName}`} onClick={() => setEditing(it)}><Pencil size={14} /></button>
                      <button className="rounded-lg p-1.5 text-muted hover:text-danger" aria-label={`Eliminar ${it.foodName}`} onClick={() => remove(it)}><Trash2 size={14} /></button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        )
      })}

      <button className="btn-primary fixed right-4 bottom-24 z-30 rounded-full p-4 shadow-xl md:hidden" aria-label="Registrar comida" onClick={() => setAdding({})}><Plus size={22} /></button>
      {adding && <AddFoodSheet open date={date} meal={adding.meal} onClose={() => setAdding(null)} />}
      {editing && <EditItemSheet item={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function EditItemSheet({ item, onClose }: { item: FoodLogItem; onClose: () => void }) {
  const { userId } = useUser()
  const [grams, setGrams] = useState<number | null>(item.grams)
  const [meal, setMeal] = useState<MealType>(item.meal)
  const v = grams == null ? { ok: false as const, error: 'Introduce una cantidad' } : validateGrams(grams)
  const n = v.ok ? itemNutrients({ ...item, grams: v.value }) : null
  return (
    <Sheet open onClose={onClose} title="Editar registro">
      <div className="space-y-3">
        <p className="font-medium">{item.foodName}</p>
        <QualityBadge f={item} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Gramos" error={v.ok ? null : v.error}>{(id) => <NumberInput id={id} value={grams} onChange={setGrams} suffix="g" />}</Field>
          <Field label="Comida">{(id) => <select id={id} className="input" value={meal} onChange={(e) => setMeal(e.target.value as MealType)}>{(Object.keys(MEAL_LABEL) as MealType[]).map((m) => <option key={m} value={m}>{MEAL_LABEL[m]}</option>)}</select>}</Field>
        </div>
        {n && <div className="rounded-xl bg-raised p-3"><MacroLine n={n} /></div>}
        <button className="btn-primary w-full" disabled={!v.ok} onClick={async () => { await repo.put('foodLogs', userId, { ...item, grams: (v as { value: number }).value, meal }); toast('Registro actualizado'); onClose() }}>Guardar cambios</button>
      </div>
    </Sheet>
  )
}
