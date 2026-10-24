import { useState } from 'react'
import { useUser } from '../../lib/app'
import { repo } from '../../lib/db/db'
import type { RecoveryLog, WeightLog } from '../../lib/types'
import { ErrorBox, Field, NumberInput, Sheet, toast } from '../../components/ui'

const CONDITIONS = ['En ayunas, tras ir al baño', 'Por la mañana', 'Por la tarde/noche', 'Tras entrenar', 'Otra']

export function WeightSheet({ open, onClose, edit }: { open: boolean; onClose: () => void; edit?: WeightLog | null }) {
  const { userId, today, profile } = useUser()
  const [kg, setKg] = useState<number | null>(edit?.kg ?? profile?.weightKg ?? null)
  const [date, setDate] = useState(edit?.date ?? today)
  const [cond, setCond] = useState(edit?.conditions ?? CONDITIONS[0])
  const [note, setNote] = useState(edit?.note ?? '')
  const [err, setErr] = useState<string | null>(null)
  async function save() {
    if (kg == null || kg < 25 || kg > 350) return setErr('Introduce un peso entre 25 y 350 kg')
    if (date > today) return setErr('La fecha no puede ser futura')
    const row = { ...(edit ?? {}), date, kg, conditions: cond, note: note || null, origin: 'user' as const }
    await repo.put('weights', userId, row)
    if (date === today && profile) await repo.put('profiles', userId, { ...profile, weightKg: kg })
    toast('Peso registrado')
    onClose()
  }
  return (
    <Sheet open={open} onClose={onClose} title={edit ? 'Editar pesaje' : 'Registrar peso'}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Peso">{(id) => <NumberInput id={id} value={kg} onChange={setKg} suffix="kg" />}</Field>
          <Field label="Fecha">{(id) => <input id={id} type="date" className="input" max={today} value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
        </div>
        <Field label="Condiciones de medición" hint="Medir en condiciones similares reduce el ruido.">{(id) => <select id={id} className="input" value={cond ?? ''} onChange={(e) => setCond(e.target.value)}>{CONDITIONS.map((c) => <option key={c}>{c}</option>)}</select>}</Field>
        <Field label="Nota (opcional)">{(id) => <input id={id} className="input" value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
        {err && <ErrorBox>{err}</ErrorBox>}
        <button className="btn-primary w-full" onClick={save}>Guardar</button>
      </div>
    </Sheet>
  )
}

const SCALE = [1, 2, 3, 4, 5] as const

export function RecoverySheet({ open, onClose, existing }: { open: boolean; onClose: () => void; existing?: RecoveryLog }) {
  const { userId, today } = useUser()
  const [r, setR] = useState<Partial<RecoveryLog>>(existing ?? { date: today })
  async function save() {
    if (r.sleepHours != null && (r.sleepHours < 0 || r.sleepHours > 16)) return toast('Horas de sueño entre 0 y 16', 'err')
    await repo.put('recovery', userId, { date: today, ...r } as RecoveryLog)
    toast('Recuperación registrada')
    onClose()
  }
  const scale = (k: 'sleepQuality' | 'hunger' | 'fatigue' | 'soreness' | 'stress', label: string, low: string, high: string) => (
    <div>
      <span className="label">{label} <span className="text-muted">({low} → {high})</span></span>
      <div className="flex gap-2">{SCALE.map((v) => <button key={v} type="button" aria-pressed={r[k] === v} onClick={() => setR({ ...r, [k]: r[k] === v ? null : v })} className={`chip flex-1 justify-center ${r[k] === v ? 'chip-on' : ''}`}>{v}</button>)}</div>
    </div>
  )
  return (
    <Sheet open={open} onClose={onClose} title="Sueño y recuperación">
      <div className="space-y-3">
        <Field label="Horas de sueño">{(id) => <NumberInput id={id} value={r.sleepHours ?? null} onChange={(v) => setR({ ...r, sleepHours: v })} suffix="h" />}</Field>
        {scale('sleepQuality', 'Calidad del sueño', 'mala', 'excelente')}
        {scale('fatigue', 'Fatiga', 'baja', 'muy alta')}
        {scale('soreness', 'Dolor muscular', 'nada', 'mucho')}
        {scale('hunger', 'Hambre', 'poca', 'mucha')}
        {scale('stress', 'Estrés', 'bajo', 'alto')}
        <Field label="Nota">{(id) => <input id={id} className="input" value={r.note ?? ''} onChange={(e) => setR({ ...r, note: e.target.value })} />}</Field>
        <p className="text-xs text-muted">Todo es opcional. Se usa para contextualizar tu rendimiento, nunca para juzgarte.</p>
        <button className="btn-primary w-full" onClick={save}>Guardar</button>
      </div>
    </Sheet>
  )
}
