import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChevronRight, Droplets, Dumbbell, Footprints, Moon, Plus, Scale, TrendingDown, TrendingUp, Minus, Utensils } from 'lucide-react'
import { useUser } from '../../lib/app'
import { useDays, useRange, useRows } from '../../lib/hooks'
import { dayTotals } from '../../lib/calc/nutrition'
import { classifyTrend, movingAverage7, trendSlope } from '../../lib/calc/weight'
import { loggingStreak, weeklyConsistency } from '../../lib/calc/habits'
import { recommendNext } from '../../lib/calc/progression'
import { exerciseHistory, sessionSummary } from '../../lib/calc/training'
import { adaptiveAdjustment } from '../../lib/calc/adaptive'
import { getExercise } from '../../lib/exercises'
import { repo } from '../../lib/db/db'
import { targetRate } from '../../lib/plan'
import { Badge, Bar, Card, Mascot, NumberInput, Ring, Tabs, fmt, toast } from '../../components/ui'
import { daysSince, isBodyweight, nextDay, startSession } from '../training/logic'
import { RecoverySheet, WeightSheet } from '../progress/QuickLogs'

export default function Dashboard() {
  const { userId, today, targets, prefs, profile } = useUser()
  const nav = useNavigate()
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('day')
  const [weightOpen, setWeightOpen] = useState(false)
  const [recOpen, setRecOpen] = useState(false)
  const r30 = useDays(today, 30)
  const r90 = useDays(today, 90)
  const logs = useRange('foodLogs', r90.from, r90.to)
  const weights = useRange('weights', r90.from, r90.to)
  const water = useRange('water', today, today)
  const steps = useRange('steps', r30.from, r30.to)
  const recovery = useRange('recovery', r30.from, r30.to)
  const sessions = useRows('sessions')
  const plans = useRows('plans')
  const recs = useRows('recommendations', (r) => r.kind === 'calories')

  const plan = plans?.find((p) => p.active)
  const completed = useMemo(() => (sessions ?? []).filter((s) => s.status === 'completed').sort((a, b) => b.startedAt.localeCompare(a.startedAt)), [sessions])
  const active = sessions?.find((s) => s.status === 'active')
  const day = nextDay(plan, sessions ?? [])

  const todayTotals = useMemo(() => dayTotals((logs ?? []).filter((l) => l.date === today)).total, [logs, today])
  const periodStats = useMemo(() => {
    const n = period === 'week' ? 7 : 30
    const from = new Date(Date.parse(today) - (n - 1) * 86400000).toISOString().slice(0, 10)
    const inRange = (logs ?? []).filter((l) => l.date >= from && l.date <= today)
    const byDay = new Map<string, typeof inRange>()
    for (const l of inRange) byDay.set(l.date, [...(byDay.get(l.date) ?? []), l])
    const days = [...byDay.values()].map((d) => dayTotals(d).total)
    const avg = (k: 'kcal' | 'protein' | 'carbs' | 'fat') => (days.length ? days.reduce((s, d) => s + d[k], 0) / days.length : 0)
    return { logged: days.length, n, kcal: avg('kcal'), protein: avg('protein'), carbs: avg('carbs'), fat: avg('fat') }
  }, [logs, period, today])

  const ma = useMemo(() => movingAverage7(weights ?? []), [weights])
  const slope = useMemo(() => trendSlope(weights ?? [], 21, today), [weights, today])
  const trend = classifyTrend(slope)
  const lastW = ma[ma.length - 1]
  const chart = ma.filter((p) => p.date >= r30.from).map((p) => ({ d: p.date.slice(5), kg: p.kg, avg: Math.round(p.avg7 * 10) / 10 }))

  const loggedDates = useMemo(() => [...new Set([...(logs ?? []).map((l) => l.date), ...(weights ?? []).map((w) => w.date), ...completed.map((s) => s.date)])], [logs, weights, completed])
  const streak = loggingStreak(loggedDates, today)
  const consistency = weeklyConsistency(loggedDates, today)
  const waterToday = (water ?? []).reduce((s, w) => s + w.ml, 0)
  const stepsToday = steps?.find((s) => s.date === today)
  const recToday = recovery?.find((r) => r.date === today)
  const lastSession = completed[0]
  const since = daysSince(lastSession?.date, today)

  const adaptive = useMemo(() => {
    if (!targets || !prefs || !profile || targets.mode === 'manual') return null
    const byDay = new Map<string, number>()
    for (const l of logs ?? []) byDay.set(l.date, (byDay.get(l.date) ?? 0) + (l.per100g.kcal ?? 0) * l.grams / 100)
    const intake = [...byDay.entries()].filter(([d]) => d < today).map(([date, kcal]) => ({ date, kcal, complete: kcal > targets.kcal * 0.5 }))
    const lastAdj = recs?.filter((r) => r.status === 'accepted').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.createdAt.slice(0, 10)
    return adaptiveAdjustment({ today, goal: prefs.goal, targetKcal: targets.kcal, bodyKg: profile.weightKg, targetRateKgWeek: targetRate(prefs.goal, prefs.pace, profile.weightKg), weights: weights ?? [], intake, lastAdjustment: lastAdj ?? targets.validFrom, highHunger: (recovery ?? []).filter((r) => (r.hunger ?? 0) >= 4).length >= 5 })
  }, [targets, prefs, profile, logs, weights, recovery, recs, today])

  async function begin() {
    if (active) return nav(`/entrenar/sesion/${active.id}`)
    const s = await startSession(userId, today, sessions ?? [], plan, day)
    nav(`/entrenar/sesion/${s.id}`)
  }
  async function addWater(ml: number) {
    await repo.put('water', userId, { date: today, ml })
    toast(`+${ml} ml de agua`)
  }
  async function saveSteps(v: number | null) {
    if (v == null || v < 0 || v > 100000) return
    await repo.put('steps', userId, { ...(stepsToday ?? {}), date: today, steps: Math.round(v), origin: 'user' })
  }
  async function acceptAdjustment() {
    if (!adaptive?.newKcal || !targets) return
    const delta = adaptive.deltaKcal
    const carbs = Math.max(0, targets.carbsG + Math.round(delta / 4))
    await repo.put('targets', userId, { mode: 'calculated', kcal: adaptive.newKcal, proteinG: targets.proteinG, fatG: targets.fatG, carbsG: carbs, fiberG: targets.fiberG, waterMl: targets.waterMl, validFrom: today, rationale: `Ajuste por tendencia (${delta > 0 ? '+' : ''}${delta} kcal, en carbohidratos):\n${adaptive.reasons.join('\n')}` })
    await repo.put('recommendations', userId, { kind: 'calories', subjectId: null, payload: adaptive, status: 'accepted', confidence: adaptive.confidence })
    toast('Objetivo actualizado')
  }

  const kcalT = targets?.kcal ?? 0
  const show = period === 'day' ? todayTotals : periodStats
  const hour = new Date().getHours()
  const greet = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted">{new Date(today + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1 className="h-display text-2xl font-bold md:text-3xl">{greet}, {profile?.displayName.split(' ')[0]}</h1>
        </div>
        <div className="w-56"><Tabs value={period} onChange={setPeriod} tabs={[{ value: 'day', label: 'Hoy' }, { value: 'week', label: '7 días' }, { value: 'month', label: '30 días' }]} /></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title={period === 'day' ? 'Nutrición de hoy' : `Promedio diario · ${periodStats.logged} de ${periodStats.n} días con registro`} action={<button className="text-xs text-lime" onClick={() => nav('/nutricion')}>Diario <ChevronRight size={12} className="inline" /></button>}>
          {!targets ? <p className="text-sm text-muted">Sin objetivos definidos.</p> : (
            <div className="flex flex-col items-center gap-5 sm:flex-row">
              <Ring value={show.kcal} max={kcalT} size={168} stroke={14} label="Calorías">
                {period === 'day' ? (
                  <>
                    <span className="text-[11px] text-muted">{show.kcal <= kcalT ? 'Restantes' : 'Por encima'}</span>
                    <span className="h-display text-3xl font-bold">{fmt(Math.abs(kcalT - show.kcal))}</span>
                    <span className="text-[11px] text-muted">kcal</span>
                  </>
                ) : (
                  <>
                    <span className="text-[11px] text-muted">Promedio</span>
                    <span className="h-display text-3xl font-bold">{fmt(show.kcal)}</span>
                    <span className="text-[11px] text-muted">de {fmt(kcalT)}</span>
                  </>
                )}
              </Ring>
              <div className="w-full flex-1 space-y-3">
                <div className="flex justify-between text-sm"><span className="text-muted">Consumido</span><span className="font-semibold tabular-nums">{fmt(show.kcal)} / {fmt(kcalT)} kcal · {kcalT ? fmt((show.kcal / kcalT) * 100) : 0}%</span></div>
                {([['Proteína', show.protein, targets.proteinG, 'var(--color-protein)'], ['Carbohidratos', show.carbs, targets.carbsG, 'var(--color-carbs)'], ['Grasas', show.fat, targets.fatG, 'var(--color-fat)']] as const).map(([l, v, t, c]) => (
                  <div key={l}>
                    <div className="mb-1 flex justify-between text-xs"><span className="text-soft">{l}</span><span className="tabular-nums text-muted">{fmt(v)} / {fmt(t)} g{period === 'day' && v < t ? ` · faltan ${fmt(t - v)} g` : ''}</span></div>
                    <Bar value={v} max={t} color={c} label={l} />
                  </div>
                ))}
                {period === 'day' && prefs?.trackFiber && targets.fiberG ? <p className="text-xs text-muted">Fibra {fmt(todayTotals.fiber)} / {fmt(targets.fiberG)} g{todayTotals.incomplete.includes('fiber') ? ' (algunos alimentos sin dato)' : ''}</p> : null}
                {period !== 'day' && <p className="text-xs text-muted">Un día por encima o por debajo no define tu progreso; mira la tendencia.</p>}
              </div>
            </div>
          )}
        </Card>

        <Card title="Acciones rápidas">
          <div className="grid gap-2">
            <button className="btn-primary justify-start" onClick={() => nav('/nutricion?add=1')}><Utensils size={16} /> Registrar comida</button>
            <button className="btn-primary justify-start" onClick={begin}><Dumbbell size={16} /> {active ? 'Continuar entrenamiento' : 'Comenzar entrenamiento'}</button>
            <button className="btn-primary justify-start" onClick={() => setWeightOpen(true)}><Scale size={16} /> Registrar peso</button>
          </div>
          <div className="mt-4 flex items-center gap-3 rounded-xl bg-raised p-3">
            <Mascot mood={streak >= 3 ? 'trophy' : 'wave'} size={52} />
            <div className="text-sm">
              <p className="font-semibold">{streak > 0 ? `Racha de ${streak} día${streak > 1 ? 's' : ''}` : '¡Empecemos hoy!'}</p>
              <p className="text-xs text-muted">{consistency}/7 días con registros esta semana. Descansar también cuenta.</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Siguiente entrenamiento" action={<button className="text-xs text-lime" onClick={() => nav('/entrenar')}>Rutina <ChevronRight size={12} className="inline" /></button>}>
          {!day ? (
            <div className="flex items-center gap-3"><Mascot mood="lift" size={64} /><div><p className="text-sm">Aún no tienes una rutina activa.</p><button className="btn-outline mt-2 px-3 py-1.5 text-xs" onClick={() => nav('/entrenar')}>Crear o generar rutina</button></div></div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="h-display text-xl font-bold">{day.name}</h3>
                <Badge>{day.focus}</Badge>
                {since != null && <Badge tone={since > 4 ? 'warn' : 'muted'}>{since === 0 ? 'Entrenaste hoy' : `Hace ${since} día${since > 1 ? 's' : ''} del último`}</Badge>}
              </div>
              <ul className="space-y-1.5">
                {day.exercises.slice(0, 4).map((pe) => {
                  const r = recommendNext(pe.config, exerciseHistory(sessions ?? [], pe.exerciseId), isBodyweight(pe.exerciseId))
                  return (
                    <li key={pe.exerciseId} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">{getExercise(pe.exerciseId)?.name ?? pe.exerciseId}</span>
                      <span className="shrink-0 text-xs text-muted">{r.weightKg != null ? `${fmt(r.weightKg, 1)} kg · ` : ''}{pe.config.sets}×{r.repTargets ? r.repTargets.join('/') : `${pe.config.repMin}–${pe.config.repMax}`}</span>
                    </li>
                  )
                })}
              </ul>
              {lastSession && (() => { const s = sessionSummary(lastSession); return <p className="text-xs text-muted">Última sesión: {lastSession.name} · {s.workingSets} series · {fmt(s.volumeKg)} kg de volumen{s.durationMin ? ` · ${s.durationMin} min` : ''}</p> })()}
              <button className="btn-primary" onClick={begin}><Dumbbell size={16} /> {active ? 'Continuar sesión activa' : 'Comenzar'}</button>
            </div>
          )}
        </Card>

        <Card title="Peso" action={<button className="text-xs text-lime" onClick={() => nav('/progreso')}>Detalle <ChevronRight size={12} className="inline" /></button>}>
          {!lastW ? <p className="text-sm text-muted">Sin pesajes.</p> : (
            <>
              <div className="flex items-end justify-between">
                <div><p className="h-display text-3xl font-bold">{fmt(lastW.kg, 1)}<span className="text-sm text-muted"> kg</span></p><p className="text-xs text-muted">Promedio 7 días: {fmt(lastW.avg7, 1)} kg{!lastW.reliable ? ' (pocos datos)' : ''}</p></div>
                <TrendIcon t={trend} perWeek={slope?.kgPerWeek} />
              </div>
              {chart.length > 1 && (
                <div className="mt-3 h-28">
                  <ResponsiveContainer>
                    <AreaChart data={chart} margin={{ left: -24, right: 4, top: 4 }}>
                      <defs><linearGradient id="wg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#c6f432" stopOpacity={0.35} /><stop offset="1" stopColor="#c6f432" stopOpacity={0} /></linearGradient></defs>
                      <XAxis dataKey="d" tick={{ fontSize: 10, fill: '#8b939e' }} tickLine={false} axisLine={false} minTickGap={24} />
                      <YAxis domain={['dataMin - 0.5', 'dataMax + 0.5']} tick={{ fontSize: 10, fill: '#8b939e' }} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ background: '#181b1f', border: '1px solid #2c3138', borderRadius: 12, fontSize: 12 }} />
                      <Area dataKey="avg" name="Promedio 7 d" stroke="#c6f432" strokeWidth={2} fill="url(#wg)" />
                      <Area dataKey="kg" name="Peso" stroke="#8b939e" strokeDasharray="3 3" fill="transparent" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      {adaptive && adaptive.action !== 'insufficient_data' && adaptive.action !== 'keep' && (
        <Card title="Sugerencia de ajuste calórico" action={<Badge tone={adaptive.confidence === 'high' ? 'lime' : 'warn'}>Confianza {adaptive.confidence === 'high' ? 'alta' : adaptive.confidence === 'medium' ? 'media' : 'baja'}</Badge>}>
          <p className="text-sm">Propuesta: <b>{fmt(targets?.kcal)} → {fmt(adaptive.newKcal)} kcal</b> ({adaptive.deltaKcal > 0 ? '+' : ''}{adaptive.deltaKcal}).</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-soft">{adaptive.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          <p className="mt-2 text-xs text-muted">Las calorías registradas y el gasto estimado tienen margen de error. Nada cambia hasta que lo aceptes.</p>
          <div className="mt-3 flex gap-2"><button className="btn-primary" onClick={acceptAdjustment}>Aplicar ajuste</button><button className="btn-ghost" onClick={async () => { await repo.put('recommendations', userId, { kind: 'calories', subjectId: null, payload: adaptive, status: 'dismissed', confidence: adaptive.confidence }); toast('Mantendremos tu objetivo') }}>Mantener</button></div>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {prefs?.trackWater !== false && (
          <Card title={<span className="flex items-center gap-1.5"><Droplets size={14} /> Agua</span>}>
            <p className="h-display text-2xl font-bold">{fmt(waterToday / 1000, 2)} <span className="text-sm text-muted">/ {fmt((targets?.waterMl ?? 2500) / 1000, 1)} L</span></p>
            <div className="mt-2"><Bar value={waterToday} max={targets?.waterMl ?? 2500} color="var(--color-info)" label="Agua" /></div>
            <div className="mt-3 flex gap-2">{[250, 500].map((ml) => <button key={ml} className="btn-ghost flex-1 px-2 py-1.5 text-xs" onClick={() => addWater(ml)}><Plus size={12} /> {ml} ml</button>)}</div>
          </Card>
        )}
        <Card title={<span className="flex items-center gap-1.5"><Footprints size={14} /> Pasos de hoy</span>}>
          <NumberInput ariaLabel="Pasos de hoy" value={stepsToday?.steps ?? null} onChange={(v) => void saveSteps(v)} placeholder="Introduce tus pasos" />
          <p className="mt-2 text-xs text-muted">{stepsToday ? `Origen: ${stepsToday.origin === 'device' ? 'dispositivo' : 'manual'}` : 'Sin fuente conectada: registro manual. La integración con HealthKit/Health Connect requiere app nativa.'}</p>
        </Card>
        <Card title={<span className="flex items-center gap-1.5"><Moon size={14} /> Sueño y recuperación</span>}>
          {recToday ? <p className="text-sm">{recToday.sleepHours != null ? `${fmt(recToday.sleepHours, 1)} h de sueño` : 'Registrado'}{recToday.fatigue ? ` · fatiga ${recToday.fatigue}/5` : ''}</p> : <p className="text-sm text-muted">Sin registro hoy.</p>}
          <button className="btn-ghost mt-3 w-full px-3 py-1.5 text-xs" onClick={() => setRecOpen(true)}>{recToday ? 'Editar' : 'Registrar'}</button>
        </Card>
      </div>

      {weightOpen && <WeightSheet open onClose={() => setWeightOpen(false)} />}
      {recOpen && <RecoverySheet open existing={recToday} onClose={() => setRecOpen(false)} />}
    </div>
  )
}

function TrendIcon({ t, perWeek }: { t: ReturnType<typeof classifyTrend>; perWeek?: number }) {
  if (t === 'insuficiente') return <Badge>Tendencia: faltan datos</Badge>
  const Icon = t === 'bajando' ? TrendingDown : t === 'subiendo' ? TrendingUp : Minus
  return <Badge tone="lime"><Icon size={12} /> {t === 'estable' ? 'Estable' : `${perWeek! > 0 ? '+' : ''}${fmt(perWeek, 2)} kg/sem`}</Badge>
}
