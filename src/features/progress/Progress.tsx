import { useEffect, useMemo, useState } from 'react'
import { Bar as RBar, BarChart, CartesianGrid, ComposedChart, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Camera, Pencil, Plus, Trash2 } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useUser } from '../../lib/app'
import { useRows } from '../../lib/hooks'
import { db, repo, uid } from '../../lib/db/db'
import { supabase } from '../../lib/sync/supabase'
import { addDays, classifyTrend, dayNum, movingAverage7, periodChange, trendSlope } from '../../lib/calc/weight'
import { dayTotals } from '../../lib/calc/nutrition'
import { bestE1RM } from '../../lib/calc/progression'
import { exerciseHistory, weeklyVolume } from '../../lib/calc/training'
import { getExercise, MUSCLE_LABEL } from '../../lib/exercises'
import type { BodyMeasurement, WeightLog } from '../../lib/types'
import { Badge, Card, EmptyState, Field, Note, NumberInput, Sheet, Stat, Tabs, fmt, toast } from '../../components/ui'
import { WeightSheet } from './QuickLogs'

const tt = { contentStyle: { background: '#181b1f', border: '1px solid #2c3138', borderRadius: 12, fontSize: 12 } }
const ax = { tick: { fontSize: 10, fill: '#8b939e' }, tickLine: false, axisLine: false }

type Tab = 'weight' | 'body' | 'stats'

export default function Progress() {
  const [tab, setTab] = useState<Tab>('weight')
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="h-display text-2xl font-bold">Progreso</h1>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'weight', label: 'Peso' }, { value: 'body', label: 'Medidas y fotos' }, { value: 'stats', label: 'Estadísticas' }]} />
      {tab === 'weight' && <WeightTab />}
      {tab === 'body' && <BodyTab />}
      {tab === 'stats' && <StatsTab />}
    </div>
  )
}

function WeightTab() {
  const { userId, today, prefs } = useUser()
  const weights = useRows('weights')
  const [range, setRange] = useState<'30' | '90' | '365' | 'all'>('90')
  const [open, setOpen] = useState(false)
  const [edit, setEdit] = useState<WeightLog | null>(null)
  const [goalKg, setGoalKg] = useState<number | null>(null)
  useEffect(() => {
    void db.meta.get(`goalWeight:${userId}`).then((m) => setGoalKg((m?.value as number) ?? null))
  }, [userId])
  const ma = useMemo(() => movingAverage7(weights ?? []), [weights])
  const from = range === 'all' ? '0000' : addDays(today, -Number(range))
  const data = ma.filter((p) => p.date >= from).map((p) => ({ d: p.date, kg: p.kg, avg: Math.round(p.avg7 * 100) / 100 }))
  const slope = trendSlope(weights ?? [], 21, today)
  const trend = classifyTrend(slope)
  const week = periodChange(weights ?? [], addDays(today, -7), today)
  const month = periodChange(weights ?? [], addDays(today, -30), today)
  const last = ma[ma.length - 1]
  if (!weights) return null
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card><Stat label="Último pesaje" value={fmt(last?.kg, 1)} unit="kg" sub={last?.date} /></Card>
        <Card><Stat label="Promedio 7 días" value={fmt(last?.avg7, 1)} unit="kg" sub={last && !last.reliable ? 'Pocos datos en la ventana' : `${last?.points ?? 0} pesajes`} /></Card>
        <Card><Stat label="Cambio semanal" value={week == null ? '—' : `${week > 0 ? '+' : ''}${fmt(week, 2)}`} unit="kg" sub="Promedio vs. hace 7 días" /></Card>
        <Card><Stat label="Cambio mensual" value={month == null ? '—' : `${month > 0 ? '+' : ''}${fmt(month, 2)}`} unit="kg" sub={`Tendencia: ${trend}`} /></Card>
      </div>
      <Card title="Peso diario y promedio de 7 días" action={<div className="flex items-center gap-2"><select className="input w-28 py-1.5 text-xs" value={range} onChange={(e) => setRange(e.target.value as typeof range)} aria-label="Periodo"><option value="30">30 días</option><option value="90">90 días</option><option value="365">1 año</option><option value="all">Todo</option></select><button className="btn-primary px-3 py-1.5 text-xs" onClick={() => setOpen(true)}><Plus size={14} /> Peso</button></div>}>
        {data.length < 2 ? <EmptyState mood="scale" title="Registra al menos 2 pesajes" text="Con pesajes frecuentes (idealmente en condiciones similares) la tendencia separa el cambio real de las fluctuaciones de agua y digestión." /> : (
          <div className="h-64">
            <ResponsiveContainer>
              <ComposedChart data={data} margin={{ left: -16, right: 8, top: 8 }}>
                <CartesianGrid stroke="#2c3138" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="d" {...ax} tickFormatter={(d: string) => d.slice(5)} minTickGap={28} />
                <YAxis domain={['dataMin - 1', 'dataMax + 1']} {...ax} />
                <Tooltip {...tt} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {goalKg && <ReferenceLine y={goalKg} stroke="#f59bb8" strokeDasharray="4 4" label={{ value: `Meta ${goalKg} kg`, fill: '#f59bb8', fontSize: 10, position: 'insideTopRight' }} />}
                <Line dataKey="kg" name="Pesaje" stroke="transparent" dot={{ r: 3, fill: '#8b939e', stroke: 'none' }} activeDot={{ r: 5 }} isAnimationActive={false} />
                <Line dataKey="avg" name="Promedio 7 días" stroke="#c6f432" strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="w-36"><Field label="Peso meta (opcional)">{(id) => <NumberInput id={id} value={goalKg} onChange={(v) => { setGoalKg(v); void db.meta.put({ key: `goalWeight:${userId}`, value: v }) }} suffix="kg" />}</Field></div>
          {slope && goalKg && prefs?.goal === 'fat_loss' && slope.kgPerWeek < -0.05 && last && last.avg7 > goalKg && <p className="pb-2 text-xs text-muted">Al ritmo actual la tendencia se acercaría a la meta en ~{Math.ceil((last.avg7 - goalKg) / -slope.kgPerWeek)} semanas. Es una extrapolación, no una promesa: el ritmo suele cambiar.</p>}
        </div>
        <p className="mt-2 text-[11px] text-muted">Los cambios de peso no equivalen a cambios de grasa: el agua, el glucógeno y el contenido intestinal pueden mover la báscula 1–2 kg de un día a otro.</p>
      </Card>
      <Card title="Registros">
        <ul className="divide-y divide-line/60">
          {[...weights].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 60).map((w) => (
            <li key={w.id} className="flex items-center gap-2 py-2 text-sm">
              <span className="w-24 text-muted">{w.date}</span><span className="flex-1 font-semibold tabular-nums">{fmt(w.kg, 1)} kg</span>
              <span className="hidden text-xs text-muted sm:inline">{w.conditions}{w.note ? ` · ${w.note}` : ''}</span>
              {w.origin !== 'user' && <Badge>{w.origin}</Badge>}
              <button className="p-1.5 text-muted" aria-label="Editar pesaje" onClick={() => setEdit(w)}><Pencil size={14} /></button>
              <button className="p-1.5 text-muted hover:text-danger" aria-label="Eliminar pesaje" onClick={async () => { await repo.remove('weights', userId, w.id); toast('Pesaje eliminado', 'ok', { label: 'Deshacer', run: () => void repo.put('weights', userId, { ...w, deletedAt: null }) }) }}><Trash2 size={14} /></button>
            </li>
          ))}
        </ul>
      </Card>
      {open && <WeightSheet open onClose={() => setOpen(false)} />}
      {edit && <WeightSheet open edit={edit} onClose={() => setEdit(null)} />}
    </div>
  )
}

const MEASURES = [['waistCm', 'Cintura'], ['abdomenCm', 'Abdomen'], ['chestCm', 'Pecho'], ['armCm', 'Brazo'], ['hipCm', 'Cadera'], ['thighCm', 'Muslo']] as const

function BodyTab() {
  const { userId, today, session } = useUser()
  const ms = useRows('measurements')
  const photos = useLiveQuery(() => db.photos.where('userId').equals(userId).toArray(), [userId])
  const [open, setOpen] = useState<BodyMeasurement | 'new' | null>(null)
  const [metric, setMetric] = useState<(typeof MEASURES)[number][0]>('waistCm')
  const sorted = [...(ms ?? [])].sort((a, b) => a.date.localeCompare(b.date))
  const data = sorted.filter((m) => m[metric] != null).map((m) => ({ d: m.date, v: m[metric] }))
  async function addPhoto(file: File) {
    if (!file.type.startsWith('image/')) return toast('Selecciona una imagen', 'err')
    if (file.size > 8_000_000) return toast('Imagen demasiado grande (máx. 8 MB)', 'err')
    const ts = new Date().toISOString()
    const id = uid()
    await db.photos.add({ id, userId, createdAt: ts, updatedAt: ts, date: today, blob: file, note: null })
    if (session?.mode === 'supabase' && supabase) {
      // Bucket privado: la política RLS solo permite la carpeta {userId}/ del propio usuario
      const { error } = await supabase.storage.from('progress-photos').upload(`${userId}/${today}-${id}`, file, { contentType: file.type, upsert: false })
      toast(error ? `Foto guardada en el dispositivo; no se pudo subir: ${error.message}` : 'Foto guardada y respaldada en tu almacenamiento privado', error ? 'err' : 'ok')
    } else toast('Foto guardada de forma privada en este dispositivo')
  }
  return (
    <div className="space-y-4">
      <Card title="Medidas corporales" action={<button className="btn-primary px-3 py-1.5 text-xs" onClick={() => setOpen('new')}><Plus size={14} /> Medidas</button>}>
        <div className="mb-3 flex flex-wrap gap-1.5">{MEASURES.map(([k, l]) => <button key={k} className={`chip ${metric === k ? 'chip-on' : ''}`} onClick={() => setMetric(k)}>{l}</button>)}</div>
        {data.length < 2 ? <p className="text-sm text-muted">Registra al menos dos mediciones de {MEASURES.find((m) => m[0] === metric)![1].toLowerCase()} para ver su evolución.</p> : (
          <div className="h-52"><ResponsiveContainer><LineChart data={data} margin={{ left: -16, right: 8 }}><CartesianGrid stroke="#2c3138" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="d" {...ax} tickFormatter={(d: string) => d.slice(5)} /><YAxis domain={['dataMin - 1', 'dataMax + 1']} {...ax} /><Tooltip {...tt} /><Line dataKey="v" name="cm" stroke="#f59bb8" strokeWidth={2} /></LineChart></ResponsiveContainer></div>
        )}
        <ul className="mt-3 divide-y divide-line/60 text-xs">{[...sorted].reverse().map((m) => <li key={m.id} className="flex items-center gap-2 py-2"><span className="w-24 text-muted">{m.date}</span><span className="flex-1">{MEASURES.filter(([k]) => m[k] != null).map(([k, l]) => `${l} ${m[k]}`).join(' · ')}</span><button className="p-1 text-muted" onClick={() => setOpen(m)} aria-label="Editar medidas"><Pencil size={13} /></button><button className="p-1 text-muted hover:text-danger" onClick={() => repo.remove('measurements', userId, m.id)} aria-label="Eliminar medidas"><Trash2 size={13} /></button></li>)}</ul>
        <p className="mt-2 text-[11px] text-muted">No estimamos tu % de grasa a partir de medidas o fotos: esos métodos tienen errores grandes. Si tienes una medición (DEXA, bioimpedancia), regístrala en tu perfil.</p>
      </Card>
      <Card title="Fotos de progreso (privadas)" action={<label className="btn-primary cursor-pointer px-3 py-1.5 text-xs"><Camera size={14} /> Añadir<input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && addPhoto(e.target.files[0])} /></label>}>
        <Note>Las fotos se guardan solo en este dispositivo (IndexedDB) y no se incluyen en la exportación JSON. Con Supabase configurado también se respaldan en un bucket privado, al que solo tú tienes acceso.</Note>
        {!photos?.length ? <p className="mt-3 text-sm text-muted">Sin fotos. Son opcionales.</p> : (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {[...photos].sort((a, b) => b.date.localeCompare(a.date)).map((p) => <PhotoThumb key={p.id} blob={p.blob} date={p.date} onDelete={async () => { if (confirm('¿Eliminar foto definitivamente?')) await db.photos.delete(p.id) }} />)}
          </div>
        )}
      </Card>
      {open && <MeasureSheet m={open === 'new' ? null : open} onClose={() => setOpen(null)} />}
    </div>
  )
}

function PhotoThumb({ blob, date, onDelete }: { blob: Blob; date: string; onDelete: () => void }) {
  const [url, setUrl] = useState<string>()
  useEffect(() => { const u = URL.createObjectURL(blob); setUrl(u); return () => URL.revokeObjectURL(u) }, [blob])
  return <figure className="relative"><img src={url} alt={`Foto de progreso ${date}`} className="aspect-[3/4] w-full rounded-xl object-cover" /><figcaption className="mt-1 text-[10px] text-muted">{date}</figcaption><button onClick={onDelete} className="absolute top-1 right-1 rounded-full bg-ink/80 p-1 text-muted hover:text-danger" aria-label="Eliminar foto"><Trash2 size={12} /></button></figure>
}

function MeasureSheet({ m, onClose }: { m: BodyMeasurement | null; onClose: () => void }) {
  const { userId, today } = useUser()
  const [v, setV] = useState<Partial<BodyMeasurement>>(m ?? { date: today })
  return (
    <Sheet open onClose={onClose} title="Medidas corporales">
      <div className="space-y-3">
        <Field label="Fecha">{(id) => <input id={id} type="date" className="input" max={today} value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />}</Field>
        <div className="grid grid-cols-2 gap-3">{MEASURES.map(([k, l]) => <Field key={k} label={l}>{(id) => <NumberInput id={id} value={(v[k] as number) ?? null} onChange={(x) => setV({ ...v, [k]: x })} suffix="cm" />}</Field>)}</div>
        <p className="text-[11px] text-muted">Mide siempre en el mismo punto y a la misma hora (p. ej. cintura a la altura del ombligo, en ayunas).</p>
        <button className="btn-primary w-full" onClick={async () => {
          if (!MEASURES.some(([k]) => v[k] != null)) return toast('Introduce al menos una medida', 'err')
          if (MEASURES.some(([k]) => v[k] != null && (v[k]! < 10 || v[k]! > 250))) return toast('Valores entre 10 y 250 cm', 'err')
          await repo.put('measurements', userId, v as BodyMeasurement); toast('Medidas guardadas'); onClose()
        }}>Guardar</button>
      </div>
    </Sheet>
  )
}

function StatsTab() {
  const { today, targets } = useUser()
  const logs = useRows('foodLogs')
  const sessions = useRows('sessions')
  const weights = useRows('weights')
  const recovery = useRows('recovery')
  const plans = useRows('plans')
  const [cmp, setCmp] = useState<'week' | 'month' | 'custom'>('week')
  const [custom, setCustom] = useState({ aFrom: addDays(today, -27), aTo: addDays(today, -14), bFrom: addDays(today, -13), bTo: today })
  const completed = useMemo(() => (sessions ?? []).filter((s) => s.status === 'completed'), [sessions])
  const exIds = useMemo(() => [...new Set(completed.flatMap((s) => s.exercises.map((e) => e.exerciseId)))], [completed])
  const [exId, setExId] = useState<string>('')
  const ex = exId || exIds[0]

  const daily = useMemo(() => {
    const by = new Map<string, NonNullable<typeof logs>>()
    for (const l of logs ?? []) by.set(l.date, [...(by.get(l.date) ?? []), l])
    return new Map([...by.entries()].map(([d, items]) => [d, dayTotals(items).total]))
  }, [logs])

  const last28 = Array.from({ length: 28 }, (_, i) => addDays(today, -27 + i))
  const nutriChart = last28.map((d) => ({ d: d.slice(5), kcal: daily.get(d)?.kcal ?? null, protein: daily.get(d)?.protein ?? null }))
  const weekly = Array.from({ length: 8 }, (_, w) => {
    const end = addDays(today, -7 * (7 - w))
    const days = Array.from({ length: 7 }, (_, i) => addDays(end, -6 + i))
    const got = days.map((d) => daily.get(d)).filter(Boolean)
    const vol = weeklyVolume(completed, getExercise, days[0], end)
    return { w: end.slice(5), protein: got.length ? Math.round(got.reduce((s, t) => s + t!.protein, 0) / got.length) : null, logged: got.length, sessions: completed.filter((s) => s.date >= days[0] && s.date <= end).length, tonnage: Math.round(vol.tonnage) }
  })

  const ranges = cmp === 'week' ? { a: [addDays(today, -13), addDays(today, -7)], b: [addDays(today, -6), today] } : cmp === 'month' ? { a: [addDays(today, -59), addDays(today, -30)], b: [addDays(today, -29), today] } : { a: [custom.aFrom, custom.aTo], b: [custom.bFrom, custom.bTo] }
  const summarize = ([f, t]: string[]) => {
    const ds = [...daily.entries()].filter(([d]) => d >= f && d <= t).map(([, v]) => v)
    const ws = (weights ?? []).filter((w) => w.date >= f && w.date <= t)
    const ss = completed.filter((s) => s.date >= f && s.date <= t)
    const rs = (recovery ?? []).filter((r) => r.date >= f && r.date <= t && r.sleepHours != null)
    const span = dayNum(t) - dayNum(f) + 1
    return {
      kcal: ds.length ? ds.reduce((s, d) => s + d.kcal, 0) / ds.length : null, protein: ds.length ? ds.reduce((s, d) => s + d.protein, 0) / ds.length : null,
      logged: `${ds.length}/${span}`, weight: ws.length ? ws.reduce((s, w) => s + w.kg, 0) / ws.length : null, sessions: ss.length,
      tonnage: weeklyVolume(completed, getExercise, f, t).tonnage, sleep: rs.length ? rs.reduce((s, r) => s + r.sleepHours!, 0) / rs.length : null,
    }
  }
  const A = summarize(ranges.a)
  const B = summarize(ranges.b)
  const hist = ex ? exerciseHistory(completed, ex).reverse() : []
  const strength = hist.map((h) => ({ d: h.date.slice(5), e1rm: Math.round(bestE1RM(h.sets) * 10) / 10, top: Math.max(0, ...h.sets.filter((s) => s.kind === 'working' && s.done).map((s) => s.weightKg ?? 0)) }))
  const vol7 = weeklyVolume(completed, getExercise, addDays(today, -6), today)
  const volData = Object.entries(vol7.sets).sort((a, b) => b[1] - a[1]).map(([m, v]) => ({ m: MUSCLE_LABEL[m], series: v, freq: vol7.frequency[m] ?? 0 }))
  const active = plans?.find((p) => p.active)
  const plannedPerWeek = active?.days.length ?? 0

  return (
    <div className="space-y-4">
      <Card title="Comparar periodos" action={<div className="w-56"><Tabs value={cmp} onChange={setCmp} tabs={[{ value: 'week', label: 'Semana' }, { value: 'month', label: 'Mes' }, { value: 'custom', label: 'Personal' }]} /></div>}>
        {cmp === 'custom' && (
          <div className="mb-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            {(['aFrom', 'aTo', 'bFrom', 'bTo'] as const).map((k) => <Field key={k} label={{ aFrom: 'A desde', aTo: 'A hasta', bFrom: 'B desde', bTo: 'B hasta' }[k]}>{(id) => <input id={id} type="date" className="input" max={today} value={custom[k]} onChange={(e) => setCustom({ ...custom, [k]: e.target.value })} />}</Field>)}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted"><tr><th className="py-1">Métrica</th><th>{cmp === 'custom' ? 'A' : 'Anterior'}</th><th>{cmp === 'custom' ? 'B' : 'Actual'}</th><th>Cambio</th></tr></thead>
            <tbody className="tabular-nums">
              {([['Calorías / día', A.kcal, B.kcal, 0], ['Proteína / día (g)', A.protein, B.protein, 0], ['Peso medio (kg)', A.weight, B.weight, 2], ['Sesiones', A.sessions, B.sessions, 0], ['Volumen (kg)', A.tonnage, B.tonnage, 0], ['Sueño medio (h)', A.sleep, B.sleep, 1]] as const).map(([l, a, b, d]) => (
                <tr key={l} className="border-t border-line/50"><td className="py-1.5 text-soft">{l}</td><td>{fmt(a, d)}</td><td>{fmt(b, d)}</td><td className={a != null && b != null ? (b - a >= 0 ? 'text-lime' : 'text-axo') : ''}>{a != null && b != null ? `${b - a >= 0 ? '+' : ''}${fmt(b - a, d)}` : '—'}</td></tr>
              ))}
              <tr className="border-t border-line/50"><td className="py-1.5 text-soft">Días registrados</td><td>{A.logged}</td><td>{B.logged}</td><td /></tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-muted">Periodos: {ranges.a.join(' → ')} vs. {ranges.b.join(' → ')}. Las diferencias muestran asociación, no causalidad.</p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Calorías y proteína (28 días)">
          {daily.size === 0 ? <p className="text-sm text-muted">Sin registros nutricionales.</p> : (
            <div className="h-56"><ResponsiveContainer><ComposedChart data={nutriChart} margin={{ left: -12, right: 0 }}><CartesianGrid stroke="#2c3138" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="d" {...ax} minTickGap={20} /><YAxis yAxisId="k" {...ax} /><YAxis yAxisId="p" orientation="right" {...ax} /><Tooltip {...tt} /><Legend wrapperStyle={{ fontSize: 11 }} />{targets && <ReferenceLine yAxisId="k" y={targets.kcal} stroke="#c6f432" strokeDasharray="4 4" />}<RBar yAxisId="k" dataKey="kcal" name="kcal" fill="#3a4250" radius={[4, 4, 0, 0]} /><Line yAxisId="p" dataKey="protein" name="Proteína (g)" stroke="#c6f432" dot={false} connectNulls /></ComposedChart></ResponsiveContainer></div>
          )}
          <p className="mt-1 text-[11px] text-muted">Días sin registro aparecen vacíos: no se interpretan como 0 kcal.</p>
        </Card>
        <Card title="Semanas: proteína media, registro y entrenamiento">
          <div className="h-56"><ResponsiveContainer><BarChart data={weekly} margin={{ left: -16 }}><CartesianGrid stroke="#2c3138" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="w" {...ax} /><YAxis {...ax} /><Tooltip {...tt} /><Legend wrapperStyle={{ fontSize: 11 }} /><RBar dataKey="logged" name="Días con registro" fill="#6cb8ff" radius={[4, 4, 0, 0]} /><RBar dataKey="sessions" name="Sesiones" fill="#c6f432" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
          {plannedPerWeek > 0 && <p className="text-[11px] text-muted">Cumplimiento de rutina esta semana: {weekly[7].sessions}/{plannedPerWeek} sesiones planeadas.</p>}
        </Card>
      </div>

      <Card title="Rendimiento por ejercicio" action={exIds.length > 0 && <select className="input max-w-56 py-1.5 text-xs" value={ex} onChange={(e) => setExId(e.target.value)} aria-label="Ejercicio">{exIds.map((id) => <option key={id} value={id}>{getExercise(id)?.name ?? id}</option>)}</select>}>
        {strength.length < 2 ? <p className="text-sm text-muted">Completa al menos dos sesiones de un ejercicio para ver su evolución.</p> : (
          <div className="h-56"><ResponsiveContainer><LineChart data={strength} margin={{ left: -16, right: 8 }}><CartesianGrid stroke="#2c3138" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="d" {...ax} /><YAxis domain={['auto', 'auto']} {...ax} /><Tooltip {...tt} /><Legend wrapperStyle={{ fontSize: 11 }} /><Line dataKey="e1rm" name="1RM estimado (Epley, con RIR)" stroke="#c6f432" strokeWidth={2} /><Line dataKey="top" name="Carga máxima" stroke="#f59bb8" strokeWidth={2} /></LineChart></ResponsiveContainer></div>
        )}
        <p className="mt-1 text-[11px] text-muted">El 1RM estimado permite comparar sesiones con distintas repeticiones; es una aproximación (menos precisa por encima de ~12 repeticiones).</p>
      </Card>

      <Card title="Volumen por grupo muscular · últimos 7 días">
        {volData.length === 0 ? <p className="text-sm text-muted">Sin sesiones esta semana.</p> : (
          <div className="h-64"><ResponsiveContainer><BarChart data={volData} layout="vertical" margin={{ left: 30 }}><XAxis type="number" {...ax} /><YAxis type="category" dataKey="m" {...ax} width={110} /><Tooltip {...tt} /><RBar dataKey="series" name="Series efectivas" fill="#c6f432" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></div>
        )}
        <p className="mt-1 text-[11px] text-muted">Frecuencia: {volData.map((v) => `${v.m} ${v.freq}×`).join(' · ') || '—'}.</p>
      </Card>
    </div>
  )
}
