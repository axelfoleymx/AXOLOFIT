import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowDown, ArrowUp, ExternalLink, Play, Plus, Search, Sparkles, Trash2, Wand2 } from 'lucide-react'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useUser } from '../../lib/app'
import { useRows } from '../../lib/hooks'
import { repo, uid } from '../../lib/db/db'
import { DIFFICULTY_LABEL, EQUIPMENT_LABEL, EXERCISES, filterExercises, getExercise, MUSCLE_LABEL, MUSCLES, PATTERN_LABEL, substitutesFor } from '../../lib/exercises'
import { generateRoutine, WEEKLY_SET_CAP } from '../../lib/calc/routine'
import { analyzePerformance, exerciseHistory, sessionSummary, weeklyVolume } from '../../lib/calc/training'
import { bestE1RM, recommendNext, workingSets } from '../../lib/calc/progression'
import { addDays } from '../../lib/calc/weight'
import type { Equipment, Exercise, PlanExercise, WorkoutDay, WorkoutPlan, WorkoutSession } from '../../lib/types'
import { Badge, Card, EmptyState, Field, Note, NumberInput, Sheet, Tabs, fmt, toast } from '../../components/ui'
import { defaultConfig, isBodyweight, nextDay, startSession } from './logic'

type Tab = 'plan' | 'library' | 'history'

export default function Training() {
  const [tab, setTab] = useState<Tab>('plan')
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="h-display text-2xl font-bold">Entrenamiento</h1>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'plan', label: 'Rutina' }, { value: 'library', label: 'Ejercicios' }, { value: 'history', label: 'Historial' }]} />
      {tab === 'plan' && <PlanView />}
      {tab === 'library' && <Library />}
      {tab === 'history' && <History />}
    </div>
  )
}

function PlanView() {
  const { userId, today, prefs } = useUser()
  const nav = useNavigate()
  const plans = useRows('plans')
  const sessions = useRows('sessions')
  const [genOpen, setGenOpen] = useState(false)
  const [editDay, setEditDay] = useState<{ plan: WorkoutPlan; day: WorkoutDay } | null>(null)
  const active = plans?.find((p) => p.active)
  const activeSession = sessions?.find((s) => s.status === 'active')
  const next = nextDay(active, sessions ?? [])
  const from = addDays(today, -6)
  const vol = useMemo(() => weeklyVolume(sessions ?? [], getExercise, from, today), [sessions, from, today])
  const planned = useMemo(() => {
    const v: Record<string, number> = {}
    for (const d of active?.days ?? []) for (const e of d.exercises) {
      const ex = getExercise(e.exerciseId)
      for (const m of ex?.primary ?? []) v[m] = (v[m] ?? 0) + e.config.sets
      for (const m of ex?.secondary ?? []) v[m] = (v[m] ?? 0) + e.config.sets * 0.5
    }
    return v
  }, [active])

  async function start(day?: WorkoutDay) {
    if (activeSession) return nav(`/entrenar/sesion/${activeSession.id}`)
    const s = await startSession(userId, today, sessions ?? [], active, day)
    nav(`/entrenar/sesion/${s.id}`)
  }
  async function newPlan() {
    const p = await repo.put('plans', userId, { name: 'Mi rutina', split: 'Personalizada', days: [{ id: uid(), name: 'Día 1', focus: '', exercises: [] }], active: !active, generated: false })
    toast('Rutina creada')
    return p
  }

  return (
    <div className="space-y-4">
      {activeSession && <Note tone="warn">Tienes una sesión en curso: <b>{activeSession.name}</b>. <button className="font-semibold text-lime" onClick={() => nav(`/entrenar/sesion/${activeSession.id}`)}>Continuar</button></Note>}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" onClick={() => start(next)}><Play size={16} /> {activeSession ? 'Continuar sesión' : next ? `Empezar ${next.name}` : 'Entrenamiento libre'}</button>
        <button className="btn-ghost" onClick={() => setGenOpen(true)}><Wand2 size={16} /> Generar rutina</button>
        <button className="btn-ghost" onClick={newPlan}><Plus size={16} /> Rutina vacía</button>
      </div>

      {!plans?.length && <Card><EmptyState mood="coach" title="Sin rutinas" text="Genera una rutina según tus días, tiempo y equipamiento, o crea la tuya desde cero." /></Card>}

      {plans?.map((p) => (
        <Card key={p.id} title={<span className="flex items-center gap-2">{p.name} {p.active && <Badge tone="lime">Activa</Badge>} {p.generated && <Badge>Generada</Badge>}</span>}
          action={<div className="flex gap-1">
            {!p.active && <button className="btn-ghost px-2 py-1 text-xs" onClick={async () => { for (const q of plans) if (q.active) await repo.put('plans', userId, { ...q, active: false }); await repo.put('plans', userId, { ...p, active: true }) }}>Activar</button>}
            <button className="rounded-lg p-1.5 text-muted hover:text-danger" aria-label="Eliminar rutina" onClick={async () => { if (confirm(`¿Eliminar la rutina «${p.name}»? Tu historial de sesiones se conserva.`)) await repo.remove('plans', userId, p.id) }}><Trash2 size={15} /></button>
          </div>}>
          <p className="mb-3 text-xs text-muted">{p.split} · {p.days.length} día(s)</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {p.days.map((d) => (
              <div key={d.id} className={`rounded-xl border p-3 ${p.active && next?.id === d.id ? 'border-lime/60' : 'border-line/70'}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{d.name}{p.active && next?.id === d.id && <span className="ml-2 text-[11px] text-lime">Siguiente</span>}</p>
                  <div className="flex gap-1">
                    <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setEditDay({ plan: p, day: d })}>Editar</button>
                    {p.active && <button className="btn-primary px-2 py-1 text-xs" onClick={() => start(d)} aria-label={`Empezar ${d.name}`}><Play size={12} /></button>}
                  </div>
                </div>
                {d.focus && <p className="text-[11px] text-muted">{d.focus}</p>}
                <ul className="mt-2 space-y-0.5 text-xs text-soft">
                  {d.exercises.map((e) => <li key={e.exerciseId + e.order}>{getExercise(e.exerciseId)?.name ?? e.exerciseId} <span className="text-muted">{e.config.sets}×{e.config.repMin}–{e.config.repMax} · RIR {e.config.rirMin}–{e.config.rirMax}</span></li>)}
                  {!d.exercises.length && <li className="text-muted">Sin ejercicios</li>}
                </ul>
              </div>
            ))}
          </div>
          <button className="btn-outline mt-3 px-3 py-1.5 text-xs" onClick={() => repo.put('plans', userId, { ...p, days: [...p.days, { id: uid(), name: `Día ${p.days.length + 1}`, focus: '', exercises: [] }] })}><Plus size={12} /> Añadir día</button>
        </Card>
      ))}

      {active && (
        <Card title="Volumen semanal por grupo muscular (series efectivas)">
          <p className="mb-2 text-xs text-muted">Programado vs. realizado en los últimos 7 días. Principal = 1 serie, secundario = 0.5. Más volumen no siempre significa mejores resultados.</p>
          <div className="space-y-1.5">
            {MUSCLES.filter((m) => planned[m] || vol.sets[m]).map((m) => (
              <div key={m} className="grid grid-cols-[110px_1fr_70px] items-center gap-2 text-xs">
                <span className="truncate text-soft">{MUSCLE_LABEL[m]}</span>
                <div className="relative h-2 rounded-full bg-raised">
                  <div className="absolute h-full rounded-full bg-line" style={{ width: `${Math.min(100, ((planned[m] ?? 0) / 20) * 100)}%` }} />
                  <div className="absolute h-full rounded-full bg-lime" style={{ width: `${Math.min(100, ((vol.sets[m] ?? 0) / 20) * 100)}%` }} />
                </div>
                <span className="text-right tabular-nums text-muted">{fmt(vol.sets[m] ?? 0, 1)} / {fmt(planned[m] ?? 0, 1)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {genOpen && <GenerateSheet onClose={() => setGenOpen(false)} hasActive={!!active} prefsEquipment={prefs?.equipment ?? []} />}
      {editDay && <DayEditor plan={editDay.plan} day={editDay.day} onClose={() => setEditDay(null)} />}
    </div>
  )
}

function GenerateSheet({ onClose, hasActive, prefsEquipment }: { onClose: () => void; hasActive: boolean; prefsEquipment: Equipment[] }) {
  const { userId, prefs } = useUser()
  const [days, setDays] = useState(prefs?.trainingDays ?? 3)
  const [minutes, setMinutes] = useState<number | null>(prefs?.sessionMinutes ?? 60)
  const [equip, setEquip] = useState<Equipment[]>(prefsEquipment)
  const r = useMemo(() => generateRoutine({ days, minutes: minutes ?? 60, experience: prefs?.experience ?? 'beginner', goal: prefs?.goal ?? 'maintenance', equipment: equip, avoid: prefs?.avoidExercises ?? [], favorites: prefs?.favoriteExercises ?? [] }, EXERCISES), [days, minutes, equip, prefs])
  async function save() {
    const plans = await repo.list('plans', userId)
    for (const q of plans) if (q.active) await repo.put('plans', userId, { ...q, active: false })
    await repo.put('plans', userId, { name: `Rutina ${r.split}`, split: r.split, days: r.days, active: true, generated: true })
    toast('Rutina guardada y activada')
    onClose()
  }
  return (
    <Sheet open onClose={onClose} title="Generar rutina" wide>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Días por semana">{(id) => <select id={id} className="input" value={days} onChange={(e) => setDays(Number(e.target.value))}>{[1, 2, 3, 4, 5, 6].map((d) => <option key={d}>{d}</option>)}</select>}</Field>
          <Field label="Minutos por sesión">{(id) => <NumberInput id={id} value={minutes} onChange={setMinutes} suffix="min" />}</Field>
        </div>
        <div><span className="label">Equipamiento</span><div className="flex flex-wrap gap-1.5">{(Object.keys(EQUIPMENT_LABEL) as Equipment[]).filter((e) => e !== 'other').map((e) => <button key={e} className={`chip ${equip.includes(e) ? 'chip-on' : ''}`} onClick={() => setEquip(equip.includes(e) ? equip.filter((x) => x !== e) : [...equip, e])}>{EQUIPMENT_LABEL[e]}</button>)}</div></div>
        <p className="text-sm font-semibold">{r.split}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {r.days.map((d) => <div key={d.id} className="rounded-xl bg-raised p-3 text-xs"><p className="mb-1 text-sm font-semibold">{d.name}</p>{d.exercises.map((e) => <p key={e.exerciseId}>{getExercise(e.exerciseId)?.name} <span className="text-muted">· {e.config.sets}×{e.config.repMin}–{e.config.repMax}, RIR {e.config.rirMin}–{e.config.rirMax}, {e.config.restSec}s</span></p>)}</div>)}
        </div>
        <p className="text-xs text-muted">Series semanales estimadas por músculo: {Object.entries(r.weeklySets).filter(([, v]) => v >= 1).map(([m, v]) => `${MUSCLE_LABEL[m]} ${fmt(v, 1)}`).join(' · ')} (techo {WEEKLY_SET_CAP[prefs?.experience ?? 'beginner']}).</p>
        {r.notes.map((n) => <Note key={n}>{n}</Note>)}
        {prefs?.injuries && <Note tone="warn">Registraste limitaciones: «{prefs.injuries}». Revisa la rutina y sustituye lo que te genere molestias; ante dolor, consulta a un profesional.</Note>}
        <button className="btn-primary w-full" onClick={save}><Sparkles size={16} /> {hasActive ? 'Guardar y reemplazar rutina activa' : 'Guardar rutina'}</button>
      </div>
    </Sheet>
  )
}

function DayEditor({ plan, day, onClose }: { plan: WorkoutPlan; day: WorkoutDay; onClose: () => void }) {
  const { userId } = useUser()
  const [d, setD] = useState<WorkoutDay>(day)
  const [picking, setPicking] = useState(false)
  const setEx = (i: number, pe: PlanExercise) => setD({ ...d, exercises: d.exercises.map((x, j) => (j === i ? pe : x)) })
  const move = (i: number, dir: -1 | 1) => {
    const ex = [...d.exercises]
    const j = i + dir
    if (j < 0 || j >= ex.length) return
    ;[ex[i], ex[j]] = [ex[j], ex[i]]
    setD({ ...d, exercises: ex.map((e, k) => ({ ...e, order: k })) })
  }
  async function save() {
    for (const e of d.exercises) if (e.config.repMin > e.config.repMax || e.config.sets < 1 || e.config.rirMin > e.config.rirMax) return toast(`Revisa la configuración de ${getExercise(e.exerciseId)?.name}`, 'err')
    await repo.put('plans', userId, { ...plan, days: plan.days.map((x) => (x.id === d.id ? d : x)) })
    toast('Día guardado')
    onClose()
  }
  if (picking) return <Sheet open onClose={() => setPicking(false)} title="Añadir ejercicio" wide><ExercisePicker onPick={(e) => { setD({ ...d, exercises: [...d.exercises, { exerciseId: e.id, order: d.exercises.length, config: defaultConfig(e.id), warmupSets: e.mechanic === 'compound' ? 1 : 0 }] }); setPicking(false) }} /></Sheet>
  return (
    <Sheet open onClose={onClose} title={`Editar ${day.name}`} wide>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre">{(id) => <input id={id} className="input" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />}</Field>
          <Field label="Enfoque">{(id) => <input id={id} className="input" value={d.focus} onChange={(e) => setD({ ...d, focus: e.target.value })} />}</Field>
        </div>
        {d.exercises.map((pe, i) => (
          <div key={pe.exerciseId + i} className="rounded-xl border border-line/70 p-3">
            <div className="mb-2 flex items-center gap-2">
              <p className="flex-1 text-sm font-semibold">{getExercise(pe.exerciseId)?.name}</p>
              <button className="p-1 text-muted" onClick={() => move(i, -1)} aria-label="Subir"><ArrowUp size={14} /></button>
              <button className="p-1 text-muted" onClick={() => move(i, 1)} aria-label="Bajar"><ArrowDown size={14} /></button>
              <button className="p-1 text-muted hover:text-danger" onClick={() => setD({ ...d, exercises: d.exercises.filter((_, j) => j !== i) })} aria-label="Quitar"><Trash2 size={14} /></button>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-7">
              {([['sets', 'Series'], ['repMin', 'Reps mín'], ['repMax', 'Reps máx'], ['rirMin', 'RIR mín'], ['rirMax', 'RIR máx'], ['increment', 'Incr. kg'], ['restSec', 'Descanso s']] as const).map(([k, l]) => (
                <Field key={k} label={l}>{(id) => <NumberInput id={id} value={pe.config[k]} onChange={(v) => v != null && v >= 0 && setEx(i, { ...pe, config: { ...pe.config, [k]: v } })} />}</Field>
              ))}
            </div>
            <div className="mt-2 w-28"><Field label="Calentamiento">{(id) => <NumberInput id={id} value={pe.warmupSets} onChange={(v) => v != null && v >= 0 && v <= 5 && setEx(i, { ...pe, warmupSets: v })} />}</Field></div>
          </div>
        ))}
        <button className="btn-outline w-full" onClick={() => setPicking(true)}><Plus size={16} /> Añadir ejercicio</button>
        <div className="flex gap-2">
          <button className="btn-danger" onClick={async () => { if (plan.days.length <= 1) return toast('La rutina necesita al menos un día', 'err'); await repo.put('plans', userId, { ...plan, days: plan.days.filter((x) => x.id !== day.id) }); onClose() }}><Trash2 size={16} /></button>
          <button className="btn-primary flex-1" onClick={save}>Guardar</button>
        </div>
      </div>
    </Sheet>
  )
}

export function ExercisePicker({ onPick, initialMuscle, onlyIds }: { onPick: (e: Exercise) => void; initialMuscle?: string; onlyIds?: string[] }) {
  const [text, setText] = useState('')
  const [muscle, setMuscle] = useState(initialMuscle ?? '')
  const [equipment, setEquipment] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [pattern, setPattern] = useState('')
  const list = useMemo(() => (onlyIds ? EXERCISES.filter((e) => onlyIds.includes(e.id)) : filterExercises({ text, muscle, equipment, difficulty, pattern })).slice(0, 80), [text, muscle, equipment, difficulty, pattern, onlyIds])
  return (
    <div className="space-y-3">
      {!onlyIds && <>
        <div className="relative"><Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" /><input className="input pl-9" placeholder="Buscar ejercicio…" value={text} onChange={(e) => setText(e.target.value)} aria-label="Buscar ejercicio" /></div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <select className="input" value={muscle} onChange={(e) => setMuscle(e.target.value)} aria-label="Músculo"><option value="">Músculo</option>{MUSCLES.map((m) => <option key={m} value={m}>{MUSCLE_LABEL[m]}</option>)}</select>
          <select className="input" value={equipment} onChange={(e) => setEquipment(e.target.value)} aria-label="Equipamiento"><option value="">Equipo</option>{Object.entries(EQUIPMENT_LABEL).filter(([k]) => k !== 'other').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select className="input" value={difficulty} onChange={(e) => setDifficulty(e.target.value)} aria-label="Dificultad"><option value="">Dificultad</option>{Object.entries(DIFFICULTY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select className="input" value={pattern} onChange={(e) => setPattern(e.target.value)} aria-label="Patrón"><option value="">Patrón</option>{Object.entries(PATTERN_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </div>
      </>}
      <p className="text-[11px] text-muted">{list.length} ejercicios · catálogo de MuscleWiki (musclewiki.com)</p>
      <ul className="divide-y divide-line/60">
        {list.map((e) => (
          <li key={e.id}><button className="flex w-full items-center justify-between gap-2 py-2.5 text-left hover:bg-raised/40" onClick={() => onPick(e)}>
            <span className="min-w-0"><span className="block truncate text-sm">{e.name}</span><span className="text-[11px] text-muted">{e.primary.map((m) => MUSCLE_LABEL[m]).join(', ')} · {EQUIPMENT_LABEL[e.equipment]}</span></span>
            <Badge>{DIFFICULTY_LABEL[e.difficulty]}</Badge>
          </button></li>
        ))}
      </ul>
    </div>
  )
}

function Library() {
  const [ex, setEx] = useState<Exercise | null>(null)
  return (
    <>
      <Card><ExercisePicker onPick={setEx} /></Card>
      {ex && <ExerciseDetail exercise={ex} onClose={() => setEx(null)} />}
    </>
  )
}

export function ExerciseDetail({ exercise, onClose }: { exercise: Exercise; onClose: () => void }) {
  const { prefs } = useUser()
  const sessions = useRows('sessions')
  const prs = useRows('prs', (p) => p.exerciseId === exercise.id, [exercise.id])
  const plans = useRows('plans')
  const pe = plans?.flatMap((p) => p.days.flatMap((d) => d.exercises)).find((e) => e.exerciseId === exercise.id)
  const hist = exerciseHistory(sessions ?? [], exercise.id)
  const config = pe?.config ?? defaultConfig(exercise.id)
  const rec = recommendNext(config, hist, isBodyweight(exercise.id))
  const analysis = analyzePerformance(hist)
  const subs = substitutesFor(exercise.id, prefs?.equipment)
  const chart = analysis.series.map((p) => ({ d: p.date.slice(5), e1rm: Math.round(p.e1rm * 10) / 10 }))
  return (
    <Sheet open onClose={onClose} title={exercise.name} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {exercise.primary.map((m) => <Badge key={m} tone="lime">{MUSCLE_LABEL[m]}</Badge>)}
          {exercise.secondary.map((m) => <Badge key={m}>{MUSCLE_LABEL[m]}</Badge>)}
          <Badge tone="info">{EQUIPMENT_LABEL[exercise.equipment]}</Badge>
          <Badge>{PATTERN_LABEL[exercise.pattern]}</Badge>
          <Badge>{exercise.mechanic === 'compound' ? 'Compuesto' : 'Aislamiento'}</Badge>
          <Badge>{DIFFICULTY_LABEL[exercise.difficulty]}</Badge>
        </div>
        <p className="text-xs text-muted">Rango orientativo: {exercise.repRange[0]}–{exercise.repRange[1]} reps. La distribución de músculos es orientativa: no atribuimos porcentajes exactos de activación.</p>
        {exercise.sourceUrl && <a href={exercise.sourceUrl} target="_blank" rel="noreferrer" className="btn-outline w-fit px-3 py-1.5 text-xs">Ver vídeo y técnica en MuscleWiki <ExternalLink size={12} /></a>}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-raised p-3 text-sm"><p className="mb-1 text-xs font-semibold text-lime">Claves técnicas (generales del patrón)</p><ul className="list-disc space-y-0.5 pl-4 text-xs">{exercise.cues?.map((c) => <li key={c}>{c}</li>)}</ul></div>
          <div className="rounded-xl bg-raised p-3 text-sm"><p className="mb-1 text-xs font-semibold text-warn">Errores frecuentes</p><ul className="list-disc space-y-0.5 pl-4 text-xs">{exercise.mistakes?.map((c) => <li key={c}>{c}</li>)}</ul>{exercise.safety && <p className="mt-2 text-[11px] text-muted">{exercise.safety}</p>}</div>
        </div>
        <Card title="Próxima sesión (calculado con tu historial)" action={<Badge tone={rec.confidence === 'high' ? 'lime' : rec.confidence === 'medium' ? 'warn' : 'muted'}>Confianza {rec.confidence === 'high' ? 'alta' : rec.confidence === 'medium' ? 'media' : 'baja'}</Badge>}>
          <p className="font-semibold">{rec.headline}</p>
          <p className="mt-1 text-sm text-soft">{rec.message}</p>
          <p className="mt-2 text-xs text-muted">Para progresar: {rec.progressCondition}</p>
          <ul className="mt-2 list-disc pl-5 text-[11px] text-muted">{rec.evidence.map((e) => <li key={e}>{e}</li>)}</ul>
        </Card>
        <Card title={`Rendimiento · ${analysis.label}`}>
          {analysis.detail && <p className="text-sm text-soft">{analysis.detail}</p>}
          {analysis.hypotheses.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-soft">{analysis.hypotheses.map((h) => <li key={h}>{h}</li>)}</ul>}
          {chart.length > 1 && <div className="mt-3 h-40"><ResponsiveContainer><LineChart data={chart} margin={{ left: -20, right: 8 }}><XAxis dataKey="d" tick={{ fontSize: 10, fill: '#8b939e' }} /><YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: '#8b939e' }} /><Tooltip contentStyle={{ background: '#181b1f', border: '1px solid #2c3138', borderRadius: 12, fontSize: 12 }} /><Line dataKey="e1rm" name="1RM estimado (kg)" stroke="#c6f432" strokeWidth={2} dot /></LineChart></ResponsiveContainer></div>}
        </Card>
        {!!prs?.length && <Card title="Marcas personales"><ul className="space-y-1 text-sm">{prs.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8).map((p) => <li key={p.id} className="flex justify-between"><span>{p.kind === 'e1rm' ? '1RM estimado' : p.kind === 'weight' ? 'Carga máxima' : `Reps con ${fmt(p.weightKg, 1)} kg`}</span><span className="tabular-nums">{p.kind === 'reps_at_weight' ? `${p.value} reps` : `${fmt(p.value, 1)} kg`} · <span className="text-muted">{p.date}</span></span></li>)}</ul></Card>}
        <Card title="Historial">
          {hist.length === 0 ? <p className="text-sm text-muted">Aún no has hecho este ejercicio.</p> : (
            <ul className="space-y-1.5 text-xs">{hist.slice(0, 10).map((h, i) => <li key={i} className="flex justify-between gap-2"><span className="text-muted">{h.date}</span><span className="tabular-nums">{workingSets(h.sets).map((s) => `${s.weightKg ?? 'PC'}×${s.reps}${s.rir != null ? ` @${s.rir}` : ''}`).join(' · ')}</span><span className="text-muted">e1RM {fmt(bestE1RM(h.sets), 1)}</span></li>)}</ul>
          )}
        </Card>
        {subs.length > 0 && <Card title="Sustituciones con tu equipamiento"><ul className="space-y-1 text-sm">{subs.map((s) => <li key={s.id}>{s.name} <span className="text-xs text-muted">· {EQUIPMENT_LABEL[s.equipment]}</span></li>)}</ul></Card>}
      </div>
    </Sheet>
  )
}

function History() {
  const { userId } = useUser()
  const nav = useNavigate()
  const sessions = useRows('sessions')
  const list = (sessions ?? []).filter((s) => s.status !== 'discarded').sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  if (!list.length) return <Card><EmptyState mood="rest" title="Sin sesiones todavía" text="Cuando completes un entrenamiento aparecerá aquí con su resumen." /></Card>
  return (
    <div className="space-y-3">
      {list.map((s: WorkoutSession) => {
        const sum = sessionSummary(s)
        return (
          <Card key={s.id} title={<span>{s.name} <span className="ml-1 text-xs font-normal text-muted">{s.date}</span></span>} action={<div className="flex gap-1">{s.status === 'active' ? <Badge tone="warn">En curso</Badge> : null}<button className="btn-ghost px-2 py-1 text-xs" onClick={() => nav(`/entrenar/sesion/${s.id}`)}>{s.status === 'active' ? 'Continuar' : 'Ver / editar'}</button><button className="rounded-lg p-1.5 text-muted hover:text-danger" aria-label="Eliminar sesión" onClick={async () => { if (confirm('¿Eliminar esta sesión? Se recalcularán tus recomendaciones.')) await repo.remove('sessions', userId, s.id) }}><Trash2 size={14} /></button></div>}>
            <p className="text-xs text-muted">{sum.workingSets}/{sum.plannedSets} series · {fmt(sum.volumeKg)} kg · {sum.reps} reps{sum.durationMin != null ? ` · ${sum.durationMin} min` : ''}</p>
            <p className="mt-1 text-xs text-soft">{s.exercises.map((e) => e.exerciseName).join(' · ')}</p>
          </Card>
        )
      })}
    </div>
  )
}
