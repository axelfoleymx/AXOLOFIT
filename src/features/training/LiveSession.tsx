import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronLeft, ChevronUp, Info, Plus, Repeat, Timer, Trash2, X } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useUser } from '../../lib/app'
import { useRows } from '../../lib/hooks'
import { repo, uid } from '../../lib/db/db'
import { getExercise, substitutesFor } from '../../lib/exercises'
import { exerciseHistory, detectPRs, sessionSummary } from '../../lib/calc/training'
import { recommendNext, workingSets, type ProgressionRecommendation } from '../../lib/calc/progression'
import { earnedAchievements, ACHIEVEMENTS, loggingStreak } from '../../lib/calc/habits'
import type { Exercise, WorkoutExerciseLog, WorkoutSession, WorkoutSet } from '../../lib/types'
import { Badge, EmptyState, Loading, Mascot, NumberInput, Sheet, fmt, toast } from '../../components/ui'
import { ExercisePicker } from './Training'
import { buildExerciseLog, defaultConfig, isBodyweight } from './logic'

export default function LiveSession() {
  const { id } = useParams()
  const { userId, prefs } = useUser()
  const nav = useNavigate()
  const dbSession = useLiveQuery(() => repo.get('sessions', userId, id!).then((r) => r ?? null), [userId, id])
  // Copia local como fuente de verdad mientras se edita: evita perder cambios rápidos entre escrituras
  const [session, setSession] = useState<WorkoutSession | null | undefined>(undefined)
  useEffect(() => {
    if (dbSession !== undefined && (session === undefined || session?.id !== dbSession?.id)) setSession(dbSession)
  }, [dbSession, session])
  const all = useRows('sessions')
  const [rest, setRest] = useState<{ until: number; total: number } | null>(null)
  const [adding, setAdding] = useState(false)
  const [subFor, setSubFor] = useState<number | null>(null)
  const [finishing, setFinishing] = useState(false)
  const [summary, setSummary] = useState<WorkoutSession | null>(null)
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])

  const previous = useMemo(() => (all ?? []).filter((s) => s.id !== id), [all, id])
  if (session === undefined) return <Loading />
  if (!session) return <div className="p-6"><EmptyState title="Sesión no encontrada" action={<button className="btn-primary" onClick={() => nav('/entrenar')}>Volver</button>} /></div>
  const s = session
  const elapsed = Math.floor(((s.endedAt ? Date.parse(s.endedAt) : now) - Date.parse(s.startedAt)) / 1000)
  const mutate = (fn: (cur: WorkoutSession) => WorkoutSession) =>
    setSession((cur) => {
      if (!cur) return cur
      const next = fn(cur)
      void repo.put('sessions', userId, next)
      return next
    })
  const save = (patch: Partial<WorkoutSession>) => mutate((cur) => ({ ...cur, ...patch }))
  const setEx = (i: number, e: WorkoutExerciseLog) => mutate((cur) => ({ ...cur, exercises: cur.exercises.map((x, j) => (j === i ? e : x)) }))

  function updateSet(i: number, si: number, patch: Partial<WorkoutSet>) {
    if (patch.done) {
      const e0 = s.exercises[i]
      const secs = e0.sets[si].kind === 'warmup' ? 60 : e0.config.restSec || prefs?.restTimerSec || 120
      setRest({ until: Date.now() + secs * 1000, total: secs })
    }
    mutate((cur) => {
    const e = cur.exercises[i]
    const sets = e.sets.map((x, j) => (j === si ? { ...x, ...patch } : x))
    // Al completar una serie se copia su peso a las siguientes vacías del mismo tipo
    if (patch.done) {
      const st = sets[si]
      for (let k = si + 1; k < sets.length; k++) if (sets[k].kind === st.kind && sets[k].weightKg == null && !sets[k].done) sets[k] = { ...sets[k], weightKg: st.weightKg }
      sets[si] = { ...st, completedAt: new Date().toISOString() }
    }
    return { ...cur, exercises: cur.exercises.map((x, j) => (j === i ? { ...e, sets } : x)) }
    })
  }

  async function finish(fatigue: number | null, note: string) {
    const done = { ...s, status: 'completed' as const, endedAt: s.endedAt ?? new Date().toISOString(), fatigue, note: note || null }
    // Solo se guardan las series marcadas como completadas; un ejercicio sin series completadas no entra al historial
    done.exercises = done.exercises.map((e) => ({ ...e, sets: e.sets.filter((x) => x.done) })).filter((e) => e.sets.some((x) => x.kind === 'working'))
    await repo.put('sessions', userId, done)
    setSession(done)
    const prs = detectPRs(done, previous)
    for (const p of prs) await repo.put('prs', userId, { ...p, date: done.date, sessionId: done.id })
    await awardAchievements(userId)
    setSummary(done)
    setFinishing(false)
  }

  if (summary) return <SessionSummary session={summary} previous={previous} onClose={() => nav('/entrenar')} />

  return (
    <div className="mx-auto min-h-dvh max-w-3xl pb-40">
      <header className="safe-top sticky top-0 z-30 flex items-center gap-3 border-b border-line/60 bg-ink/95 px-4 py-3 backdrop-blur">
        <button className="btn-ghost p-2" onClick={() => nav('/entrenar')} aria-label="Salir (la sesión se conserva)"><ChevronLeft size={18} /></button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{s.name}</p>
          <p className="text-xs text-lime tabular-nums">{s.status === 'active' ? 'En vivo' : 'Completada'} · {Math.floor(elapsed / 3600) ? `${Math.floor(elapsed / 3600)}:` : ''}{String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}</p>
        </div>
        {s.status === 'active' ? <button className="btn-primary" onClick={() => setFinishing(true)}>Terminar</button> : <Badge tone="lime">Editando sesión pasada</Badge>}
      </header>

      <div className="space-y-4 p-4">
        {s.exercises.length === 0 && <EmptyState mood="lift" title="Sesión libre" text="Añade el primer ejercicio para empezar a registrar series." />}
        {s.exercises.map((e, i) => (
          <ExerciseBlock key={`${e.exerciseId}-${i}`} e={e} index={i} count={s.exercises.length} previous={previous}
            onSet={(si, p) => updateSet(i, si, p)}
            onChange={(ne) => setEx(i, ne)}
            onRemove={() => { if (confirm(`¿Quitar ${e.exerciseName} de esta sesión?`)) void save({ exercises: s.exercises.filter((_, j) => j !== i) }) }}
            onMove={(d) => { const ex = [...s.exercises]; const j = i + d; if (j < 0 || j >= ex.length) return; [ex[i], ex[j]] = [ex[j], ex[i]]; void save({ exercises: ex }) }}
            onSubstitute={() => setSubFor(i)} />
        ))}
        <button className="btn-outline w-full" onClick={() => setAdding(true)}><Plus size={16} /> Añadir ejercicio</button>
        {s.status === 'active' && <button className="btn-ghost w-full text-xs text-muted" onClick={async () => { if (confirm('¿Descartar la sesión? No se guardará en el historial.')) { save({ status: 'discarded' }); nav('/entrenar') } }}>Descartar sesión</button>}
      </div>

      {rest && <RestTimer rest={rest} now={now} onAdd={() => setRest({ until: rest.until + 30000, total: rest.total + 30 })} onSkip={() => setRest(null)} />}

      {adding && <Sheet open onClose={() => setAdding(false)} title="Añadir ejercicio" wide><ExercisePicker onPick={(ex) => { void save({ exercises: [...s.exercises, buildExerciseLog(ex.id, defaultConfig(ex.id), 0, previous)] }); setAdding(false) }} /></Sheet>}
      {subFor != null && <SubstituteSheet exerciseId={s.exercises[subFor].exerciseId} onClose={() => setSubFor(null)} onPick={(ex) => {
        const old = s.exercises[subFor]
        const nl = buildExerciseLog(ex.id, { ...old.config, increment: ex.increment, repMin: ex.repRange[0], repMax: ex.repRange[1] }, 0, previous)
        void setEx(subFor, { ...nl, substitutedFrom: old.exerciseId })
        setSubFor(null)
        toast(`Sustituido por ${ex.name}`)
      }} />}
      {finishing && <FinishSheet session={s} onClose={() => setFinishing(false)} onFinish={finish} />}
    </div>
  )
}

function ExerciseBlock({ e, index, count, previous, onSet, onChange, onRemove, onMove, onSubstitute }: {
  e: WorkoutExerciseLog; index: number; count: number; previous: WorkoutSession[]
  onSet: (si: number, p: Partial<WorkoutSet>) => void; onChange: (e: WorkoutExerciseLog) => void; onRemove: () => void; onMove: (d: -1 | 1) => void; onSubstitute: () => void
}) {
  const ex = getExercise(e.exerciseId)
  const hist = useMemo(() => exerciseHistory(previous, e.exerciseId), [previous, e.exerciseId])
  const rec: ProgressionRecommendation = useMemo(() => recommendNext(e.config, hist, isBodyweight(e.exerciseId)), [e.config, hist, e.exerciseId])
  const [open, setOpen] = useState(index === 0)
  const [notes, setNotes] = useState(false)
  const last = hist[0]
  const bw = isBodyweight(e.exerciseId)
  const doneCount = e.sets.filter((x) => x.kind === 'working' && x.done).length
  const workIdx = (si: number) => e.sets.slice(0, si + 1).filter((x) => x.kind === e.sets[si].kind).length
  return (
    <section className="card p-0">
      <div className="flex items-start gap-2 p-4 pb-2">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{e.exerciseName}</h2>
          <p className="text-[11px] text-muted">{e.config.sets}×{e.config.repMin}–{e.config.repMax} · RIR {e.config.rirMin}–{e.config.rirMax} · descanso {e.config.restSec}s · {doneCount}/{e.sets.filter((x) => x.kind === 'working').length} hechas{e.substitutedFrom ? ` · sustituye a ${getExercise(e.substitutedFrom)?.name}` : ''}</p>
        </div>
        <div className="flex shrink-0">
          <button className="p-1.5 text-muted disabled:opacity-30" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Subir ejercicio"><ArrowUp size={15} /></button>
          <button className="p-1.5 text-muted disabled:opacity-30" disabled={index === count - 1} onClick={() => onMove(1)} aria-label="Bajar ejercicio"><ArrowDown size={15} /></button>
          <button className="p-1.5 text-muted" onClick={onSubstitute} aria-label="Sustituir ejercicio"><Repeat size={15} /></button>
          <button className="p-1.5 text-muted hover:text-danger" onClick={onRemove} aria-label="Quitar ejercicio"><Trash2 size={15} /></button>
        </div>
      </div>

      <button className="mx-4 mb-2 flex w-[calc(100%-2rem)] items-center justify-between gap-2 rounded-xl bg-lime/10 px-3 py-2 text-left text-xs text-lime" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="font-semibold">{rec.headline}</span>{open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <div className="mx-4 mb-2 space-y-1 text-xs">
          <p className="text-soft">{rec.message}</p>
          <p className="text-muted">Para progresar: {rec.progressCondition} · Confianza {rec.confidence === 'high' ? 'alta' : rec.confidence === 'medium' ? 'media' : 'baja'}</p>
          {last && <p className="text-muted">Última vez ({last.date}): {workingSets(last.sets).map((x) => `${x.weightKg ?? 'PC'}×${x.reps}${x.rir != null ? ` @${x.rir}` : ''}`).join(' · ')}</p>}
          <p className="text-[11px] text-muted">Es una sugerencia: ajusta peso y repeticiones a cómo te sientes hoy.</p>
        </div>
      )}

      <div className="overflow-x-auto px-2 pb-2">
        <table className="w-full text-sm">
          <thead><tr className="text-[11px] text-muted"><th className="w-10 py-1 font-medium">Serie</th>{!bw && <th className="font-medium">kg</th>}<th className="font-medium">Reps{rec.repTargets ? '' : ''}</th><th className="font-medium">RIR</th><th className="w-10 font-medium" aria-label="Completada"><Check size={12} className="mx-auto" /></th><th className="w-8" /></tr></thead>
          <tbody>
            {e.sets.map((st, si) => {
              const target = st.kind === 'working' && rec.repTargets ? rec.repTargets[workIdx(si) - 1] : null
              return (
                <tr key={st.id} className={st.done ? 'bg-lime/5' : ''}>
                  <td className="py-1 text-center text-xs">{st.kind === 'warmup' ? <span className="text-muted">C{workIdx(si)}</span> : <span className="font-semibold">{workIdx(si)}</span>}</td>
                  {!bw && <td className="px-1 py-1"><NumberInput ariaLabel={`Peso serie ${si + 1}`} value={st.weightKg} onChange={(v) => onSet(si, { weightKg: v })} className="py-2 text-center" /></td>}
                  <td className="px-1 py-1"><NumberInput ariaLabel={`Repeticiones serie ${si + 1}`} value={st.reps} onChange={(v) => onSet(si, { reps: v == null ? null : Math.round(v) })} placeholder={target ? String(target) : '—'} className="py-2 text-center" /></td>
                  <td className="px-1 py-1"><NumberInput ariaLabel={`RIR serie ${si + 1}`} value={st.rir ?? null} onChange={(v) => onSet(si, { rir: v })} placeholder={st.kind === 'working' ? `${e.config.rirMin}–${e.config.rirMax}` : ''} className="py-2 text-center" /></td>
                  <td className="px-1 text-center">
                    <button aria-pressed={st.done} aria-label={`Marcar serie ${si + 1} como ${st.done ? 'pendiente' : 'completada'}`}
                      onClick={() => {
                        if (!st.done && (st.reps == null || (!bw && st.weightKg == null))) {
                          if (target && (bw || st.weightKg != null)) return onSet(si, { reps: target, done: true })
                          return toast('Introduce peso y repeticiones', 'err')
                        }
                        onSet(si, { done: !st.done })
                      }}
                      className={`flex h-9 w-9 items-center justify-center rounded-lg border ${st.done ? 'border-lime bg-lime text-ink' : 'border-line text-muted'}`}><Check size={16} /></button>
                  </td>
                  <td><button className={`p-1 ${st.pain ? 'text-danger' : 'text-muted/50'}`} title="Molestia en esta serie" aria-label={`Molestia en serie ${si + 1}`} aria-pressed={!!st.pain} onClick={() => onSet(si, { pain: !st.pain })}>⚠︎</button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2 px-4 pb-3">
        <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => onChange({ ...e, sets: [...e.sets, { id: uid(), kind: 'working', weightKg: [...e.sets].reverse().find((x) => x.weightKg != null)?.weightKg ?? null, reps: null, rir: null, done: false }] })}><Plus size={12} /> Serie</button>
        <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => onChange({ ...e, sets: [{ id: uid(), kind: 'warmup', weightKg: null, reps: null, rir: null, done: false }, ...e.sets] })}><Plus size={12} /> Calentamiento</button>
        {e.sets.length > 0 && <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => onChange({ ...e, sets: e.sets.slice(0, -1) })}><X size={12} /> Quitar última</button>}
        <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setNotes(!notes)}><Info size={12} /> Notas</button>
      </div>
      {(notes || e.painNote || e.sets.some((x) => x.pain)) && (
        <div className="space-y-2 border-t border-line/60 p-4">
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" className="h-4 w-4 accent-[var(--color-lime)]" checked={e.techniqueOk === false} onChange={(ev) => onChange({ ...e, techniqueOk: ev.target.checked ? false : undefined })} /> Técnica deficiente hoy (no progresar)</label>
          <input className="input" placeholder="Nota técnica" value={e.techniqueNote ?? ''} onChange={(ev) => onChange({ ...e, techniqueNote: ev.target.value })} aria-label="Nota técnica" />
          <input className="input" placeholder="Dolor o molestia (dónde, cuándo)" value={e.painNote ?? ''} onChange={(ev) => onChange({ ...e, painNote: ev.target.value })} aria-label="Dolor o molestia" />
          {(e.painNote || e.sets.some((x) => x.pain)) && <p className="text-xs text-warn">No entrenes a través del dolor. Detén o modifica el ejercicio; si es intenso o persiste, consulta a un profesional.</p>}
          {ex?.sourceUrl && <a className="text-xs text-lime underline" href={ex.sourceUrl} target="_blank" rel="noreferrer">Ver técnica en MuscleWiki</a>}
        </div>
      )}
    </section>
  )
}

function RestTimer({ rest, now, onAdd, onSkip }: { rest: { until: number; total: number }; now: number; onAdd: () => void; onSkip: () => void }) {
  const left = Math.max(0, Math.ceil((rest.until - now) / 1000))
  const fired = useRef(false)
  useEffect(() => {
    if (left === 0 && !fired.current) {
      fired.current = true
      navigator.vibrate?.([200, 100, 200])
    }
    if (left > 0) fired.current = false
  }, [left])
  return (
    <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-lime/40 bg-surface/95 px-4 py-3 backdrop-blur" role="timer" aria-live="polite">
      <div className="mx-auto flex max-w-3xl items-center gap-3">
        <Timer className="text-lime" size={20} />
        <div className="flex-1">
          <p className="text-xs text-muted">{left === 0 ? '¡Listo para la siguiente serie!' : 'Descanso'}</p>
          <p className="h-display text-2xl font-bold tabular-nums">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</p>
          <div className="mt-1 h-1 rounded-full bg-raised"><div className="h-full rounded-full bg-lime" style={{ width: `${(left / rest.total) * 100}%` }} /></div>
        </div>
        <button className="btn-ghost" onClick={onAdd}>+30 s</button>
        <button className="btn-primary" onClick={onSkip}>{left === 0 ? 'Cerrar' : 'Saltar'}</button>
      </div>
    </div>
  )
}

function SubstituteSheet({ exerciseId, onClose, onPick }: { exerciseId: string; onClose: () => void; onPick: (e: Exercise) => void }) {
  const { prefs } = useUser()
  const subs = substitutesFor(exerciseId, prefs?.equipment, 12)
  const [all, setAll] = useState(false)
  return (
    <Sheet open onClose={onClose} title="Sustituir ejercicio" wide>
      {!all && subs.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs text-muted">Mismo patrón de movimiento y músculo principal, con tu equipamiento.</p>
          <ExercisePicker onlyIds={subs.map((s) => s.id)} onPick={onPick} />
          <button className="btn-outline w-full" onClick={() => setAll(true)}>Buscar en toda la biblioteca</button>
        </div>
      ) : <ExercisePicker onPick={onPick} initialMuscle={getExercise(exerciseId)?.primary[0]} />}
    </Sheet>
  )
}

function FinishSheet({ session, onClose, onFinish }: { session: WorkoutSession; onClose: () => void; onFinish: (fatigue: number | null, note: string) => void }) {
  const [fatigue, setFatigue] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const pending = session.exercises.reduce((n, e) => n + e.sets.filter((x) => x.kind === 'working' && !x.done).length, 0)
  return (
    <Sheet open onClose={onClose} title="Terminar sesión">
      <div className="space-y-3">
        {pending > 0 && <p className="text-sm text-warn">Tienes {pending} serie(s) efectivas sin marcar como completadas: no se guardarán en el historial.</p>}
        <div><span className="label">¿Qué tan fatigado terminas? (opcional)</span><div className="flex gap-2">{[1, 2, 3, 4, 5].map((v) => <button key={v} className={`chip flex-1 justify-center ${fatigue === v ? 'chip-on' : ''}`} onClick={() => setFatigue(fatigue === v ? null : v)}>{v}</button>)}</div></div>
        <input className="input" placeholder="Nota de la sesión (opcional)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Nota de la sesión" />
        <button className="btn-primary w-full" onClick={() => onFinish(fatigue, note)}>Guardar y ver resumen</button>
      </div>
    </Sheet>
  )
}

function SessionSummary({ session, previous, onClose }: { session: WorkoutSession; previous: WorkoutSession[]; onClose: () => void }) {
  const sum = sessionSummary(session)
  const prs = detectPRs(session, previous)
  const withThis = [...previous, session]
  return (
    <div className="mx-auto min-h-dvh max-w-2xl space-y-4 p-4 pb-20">
      <div className="flex flex-col items-center text-center">
        <Mascot mood={prs.length ? 'trophy' : 'lift'} size={150} float />
        <h1 className="h-display mt-2 text-2xl font-bold">¡Sesión completada!</h1>
        <p className="text-sm text-muted">{prs.length ? `${prs.length} récord(s) nuevo(s). Excelente trabajo.` : 'La constancia es lo que construye resultados.'}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[['Duración', sum.durationMin != null ? `${sum.durationMin} min` : '—'], ['Series', `${sum.workingSets}`], ['Repeticiones', `${sum.reps}`], ['Volumen', `${fmt(sum.volumeKg)} kg`]].map(([l, v]) => <div key={l} className="card text-center"><p className="text-xs text-muted">{l}</p><p className="h-display text-xl font-bold">{v}</p></div>)}
      </div>
      {prs.length > 0 && <section className="card"><h2 className="mb-2 text-sm font-semibold text-soft">Récords</h2><ul className="space-y-1 text-sm">{prs.map((p, i) => <li key={i}>🏆 {getExercise(p.exerciseId)?.name}: {p.kind === 'e1rm' ? `1RM estimado ${fmt(p.value, 1)} kg` : p.kind === 'weight' ? `carga máxima ${fmt(p.value, 1)} kg` : `${p.reps} reps con ${fmt(p.weightKg, 1)} kg`}</li>)}</ul></section>}
      <section className="card">
        <h2 className="mb-2 text-sm font-semibold text-soft">Para la próxima sesión</h2>
        <ul className="space-y-2">
          {session.exercises.map((e) => {
            const r = recommendNext(e.config, exerciseHistory(withThis, e.exerciseId), isBodyweight(e.exerciseId))
            return <li key={e.exerciseId} className="rounded-xl bg-raised p-3"><p className="text-sm font-semibold">{e.exerciseName}</p><p className="text-xs text-lime">{r.headline}</p><p className="text-xs text-soft">{r.message}</p></li>
          })}
        </ul>
      </section>
      <button className="btn-primary w-full" onClick={onClose}>Listo</button>
    </div>
  )
}

/** Registra logros nuevos a partir de datos reales (idempotente por clave). */
export async function awardAchievements(userId: string) {
  const [sessions, prs, logs, weights, existing] = await Promise.all([repo.list('sessions', userId), repo.list('prs', userId), repo.list('foodLogs', userId), repo.list('weights', userId), repo.list('achievements', userId)])
  const today = new Date().toISOString().slice(0, 10)
  const days = [...new Set([...logs.map((l) => l.date), ...weights.map((w) => w.date), ...sessions.filter((s) => s.status === 'completed').map((s) => s.date)])]
  const keys = earnedAchievements({ sessions: sessions.filter((s) => s.status === 'completed').length, prs: prs.length, foodLogDays: new Set(logs.map((l) => l.date)).size, streak: loggingStreak(days, today), weighIns: weights.length, plannedWeekDone: false, proteinDaysLast7: 0 })
  const have = new Set(existing.map((a) => a.key))
  for (const k of keys) if (!have.has(k)) {
    await repo.put('achievements', userId, { key: k, date: today })
    toast(`Logro: ${ACHIEVEMENTS.find((a) => a.key === k)?.title}`)
  }
}
