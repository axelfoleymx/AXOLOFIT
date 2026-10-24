import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Plus, Trash2 } from 'lucide-react'
import { useUser } from '../../lib/app'
import { repo } from '../../lib/db/db'
import { computePlan, EXPERIENCE_LABEL, GOAL_LABEL, PACE_LABEL, targetsRow } from '../../lib/plan'
import { ACTIVITY_LABEL, activityFromSteps, bmi, macroConsistency, manualTargetWarnings } from '../../lib/calc/energy'
import { generateRoutine } from '../../lib/calc/routine'
import { EXERCISES, EQUIPMENT_LABEL } from '../../lib/exercises'
import type { ActivityLevel, Equipment, Experience, Goal, Pace, Sex } from '../../lib/types'
import { Badge, Card, Chips, ErrorBox, Field, Mascot, Note, NumberInput, fmt } from '../../components/ui'
import { CONDITION_OPTIONS } from '../nutrition/catalog'

const EQUIP_OPTIONS = (Object.keys(EQUIPMENT_LABEL) as Equipment[]).filter((e) => e !== 'other').map((e) => ({ value: e, label: EQUIPMENT_LABEL[e] }))
const DIETS = ['vegetariano', 'vegano', 'sin lactosa', 'sin gluten', 'pescetariano'].map((d) => ({ value: d, label: d[0].toUpperCase() + d.slice(1) }))
const COMMON_ALLERGENS = ['cacahuate', 'nueces', 'huevo', 'leche', 'trigo', 'soya', 'pescado', 'mariscos', 'camarón', 'ajonjolí'].map((d) => ({ value: d, label: d }))

const splitList = (s: string) => s.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean)

export default function Onboarding() {
  const { userId, session, today } = useUser()
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [f, setF] = useState({
    consent: false,
    displayName: session?.displayName ?? '',
    birthDate: '' as string,
    age: null as number | null,
    sex: 'unspecified' as Sex,
    heightCm: null as number | null,
    weightKg: null as number | null,
    bodyFatPct: null as number | null,
    bodyFatMeasured: false,
    goal: 'recomposition' as Goal,
    pace: 'moderate' as Pace,
    performanceGoals: '',
    activity: 'light' as ActivityLevel,
    avgSteps: null as number | null,
    sleepHours: null as number | null,
    extraMin: 0 as number | null,
    experience: 'beginner' as Experience,
    trainingDays: 3,
    sessionMinutes: 60 as number | null,
    equipment: ['barbell', 'dumbbells', 'machine', 'cables', 'bodyweight'] as Equipment[],
    gymName: '',
    injuries: '',
    avoidText: '',
    diet: [] as string[],
    allergies: [] as string[],
    allergiesExtra: '',
    intolerances: '',
    disliked: '',
    conditions: [] as string[],
    snacks: 1 as 0 | 1 | 2,
    budget: 'medio' as 'barato' | 'medio' | 'alto',
    trackWater: true,
    trackFiber: true,
    measurements: { waistCm: null as number | null, abdomenCm: null as number | null, chestCm: null as number | null, armCm: null as number | null, hipCm: null as number | null, thighCm: null as number | null },
    history: [] as { date: string; kg: number | null }[],
    manual: false,
    manualKcal: null as number | null,
    manualP: null as number | null,
    manualC: null as number | null,
    manualF: null as number | null,
    createRoutine: true,
  })
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }))

  const age = f.birthDate ? Math.floor((Date.parse(today) - Date.parse(f.birthDate)) / (365.2425 * 86400000)) : f.age
  const ready = age != null && f.heightCm != null && f.weightKg != null
  const plan = useMemo(
    () => ready ? computePlan({ sex: f.sex, age: age!, heightCm: f.heightCm!, weightKg: f.weightKg!, bodyFatPct: f.bodyFatPct, bodyFatOrigin: f.bodyFatMeasured ? 'measured' : 'estimated', goal: f.goal, pace: f.pace, experience: f.experience, activity: f.activity, trainingDays: f.trainingDays, sessionMinutes: f.sessionMinutes ?? 60, extraActivityMinPerWeek: f.extraMin ?? 0 }) : null,
    [ready, f, age],
  )

  const steps = ['Bienvenida', 'Tú', 'Objetivo', 'Actividad', 'Entrenamiento', 'Alimentación', 'Medidas', 'Tu plan']

  function validate(): string | null {
    if (step === 0 && !f.consent) return 'Necesitamos tu consentimiento para guardar estos datos.'
    if (step === 1) {
      if (!f.displayName.trim()) return 'Escribe tu nombre'
      if (age == null || age < 13 || age > 100) return 'La edad debe estar entre 13 y 100 años'
      if (f.heightCm == null || f.heightCm < 120 || f.heightCm > 230) return 'Estatura entre 120 y 230 cm'
      if (f.weightKg == null || f.weightKg < 30 || f.weightKg > 300) return 'Peso entre 30 y 300 kg'
      if (f.bodyFatPct != null && (f.bodyFatPct < 3 || f.bodyFatPct > 60)) return '% de grasa entre 3 y 60'
    }
    if (step === 4) {
      if (!f.sessionMinutes || f.sessionMinutes < 20 || f.sessionMinutes > 180) return 'Duración de sesión entre 20 y 180 min'
      if (!f.equipment.length) return 'Selecciona al menos un tipo de equipamiento (o peso corporal)'
    }
    if (step === 7 && f.manual && (!f.manualKcal || !f.manualP || f.manualC == null || f.manualF == null)) return 'Completa los objetivos manuales o vuelve a la propuesta calculada'
    return null
  }

  const next = () => {
    const e = validate()
    setError(e)
    if (!e) setStep((s) => Math.min(steps.length - 1, s + 1))
  }

  async function finish() {
    const e = validate()
    if (e || !plan) return setError(e ?? 'Faltan datos básicos')
    setSaving(true)
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
      const prefs = {
        goal: f.goal, pace: f.pace, experience: f.experience, activity: f.activity, avgSteps: f.avgSteps, sleepHours: f.sleepHours,
        trainingDays: f.trainingDays, sessionMinutes: f.sessionMinutes ?? 60, extraActivityMinPerWeek: f.extraMin ?? 0, equipment: f.equipment,
        gymName: f.gymName || null, diet: f.diet, allergies: [...f.allergies, ...splitList(f.allergiesExtra)], intolerances: splitList(f.intolerances),
        dislikedFoods: splitList(f.disliked), conditions: f.conditions, snacksPerDay: f.snacks, budget: f.budget, trackWater: f.trackWater,
        trackFiber: f.trackFiber, restTimerSec: 120, performanceGoals: f.performanceGoals, avoidExercises: [], favoriteExercises: [], injuries: f.injuries,
      }
      await repo.put('preferences', userId, prefs)
      const t = targetsRow(plan, today)
      await repo.put('targets', userId, f.manual
        ? { ...t, mode: 'manual', kcal: f.manualKcal!, proteinG: f.manualP!, carbsG: f.manualC!, fatG: f.manualF!, rationale: 'Objetivos definidos manualmente por el usuario.\n' + t.rationale }
        : t)
      await repo.put('weights', userId, { date: today, kg: f.weightKg!, origin: 'user', conditions: null, note: 'Peso inicial (onboarding)' })
      for (const h of f.history) if (h.kg && h.date && h.date < today) await repo.put('weights', userId, { date: h.date, kg: h.kg, origin: 'user', note: 'Historial previo' })
      if (Object.values(f.measurements).some((v) => v != null)) await repo.put('measurements', userId, { date: today, ...f.measurements, note: 'Onboarding' })
      if (f.createRoutine) {
        const avoidTerms = splitList(f.avoidText)
        const r = generateRoutine({ days: f.trainingDays, minutes: f.sessionMinutes ?? 60, experience: f.experience, goal: f.goal, equipment: f.equipment, avoid: EXERCISES.filter((x) => avoidTerms.some((t) => x.name.toLowerCase().includes(t))).map((x) => x.id), favorites: [] }, EXERCISES)
        await repo.put('plans', userId, { name: `Rutina ${r.split}`, split: r.split, days: r.days, active: true, generated: true })
      }
      await repo.put('profiles', userId, {
        displayName: f.displayName.trim(), birthDate: f.birthDate || null, age: age!, sex: f.sex, heightCm: f.heightCm!, weightKg: f.weightKg!,
        bodyFatPct: f.bodyFatPct, bodyFatOrigin: f.bodyFatPct == null ? null : f.bodyFatMeasured ? 'measured' : 'estimated', country: 'MX', language: 'es',
        units: 'metric', timezone: tz, consentAt: new Date().toISOString(), onboardingDone: true,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
      setSaving(false)
    }
  }

  const mw = manualTargetWarnings(f.manualKcal ?? 0, plan?.bmr.kcal ?? 0, f.manualP ?? 0, f.weightKg ?? 70, age ?? 30)

  return (
    <div className="mx-auto min-h-dvh max-w-xl px-4 py-6">
      <div className="mb-4 flex items-center gap-3">
        {step > 0 && <button className="btn-ghost p-2" onClick={() => setStep(step - 1)} aria-label="Atrás"><ArrowLeft size={18} /></button>}
        <div className="flex-1">
          <p className="text-xs text-muted">Paso {step + 1} de {steps.length} · {steps[step]}</p>
          <div className="mt-1 h-1.5 rounded-full bg-raised"><div className="h-full rounded-full bg-lime transition-all" style={{ width: `${((step + 1) / steps.length) * 100}%` }} /></div>
        </div>
      </div>

      {step === 0 && (
        <div className="space-y-4">
          <div className="flex flex-col items-center text-center">
            <Mascot mood="wave" size={160} float />
            <h1 className="h-display mt-2 text-3xl font-bold">¡Hola! Soy Axo.</h1>
            <p className="mt-2 text-soft">Te haré unas preguntas para calcular objetivos transparentes y una rutina inicial. Todo se puede editar después.</p>
          </div>
          <Card title="Privacidad y consentimiento">
            <ul className="list-disc space-y-1 pl-5 text-sm text-soft">
              <li>Tu peso, medidas, fotos y registros de salud se tratan como datos sensibles.</li>
              <li>Solo tú puedes verlos. Puedes exportarlos o eliminar tu cuenta cuando quieras desde Perfil.</li>
              <li>Las recomendaciones son orientativas: no sustituyen a un médico, nutriólogo o entrenador certificado.</li>
              <li>Distinguimos lo que introduces, lo importado, lo estimado y lo medido. No rellenamos datos faltantes.</li>
            </ul>
            <label className="mt-4 flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[var(--color-lime)]" checked={f.consent} onChange={(e) => set('consent', e.target.checked)} />
              <span>Entiendo y acepto que ATHLETIQ guarde estos datos para calcular mis objetivos y recomendaciones.</span>
            </label>
          </Card>
        </div>
      )}

      {step === 1 && (
        <Card title="Datos básicos">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Field label="Nombre">{(id) => <input id={id} className="input" value={f.displayName} onChange={(e) => set('displayName', e.target.value)} />}</Field></div>
            <Field label="Edad">{(id) => <NumberInput id={id} value={f.birthDate ? age : f.age} onChange={(v) => set('age', v)} suffix="años" />}</Field>
            <Field label="Fecha de nacimiento (opcional)">{(id) => <input id={id} type="date" className="input" value={f.birthDate} max={today} onChange={(e) => set('birthDate', e.target.value)} />}</Field>
            <Field label="Estatura">{(id) => <NumberInput id={id} value={f.heightCm} onChange={(v) => set('heightCm', v)} suffix="cm" />}</Field>
            <Field label="Peso actual">{(id) => <NumberInput id={id} value={f.weightKg} onChange={(v) => set('weightKg', v)} suffix="kg" />}</Field>
            <div className="col-span-2">
              <span className="label">Sexo fisiológico</span>
              <Chips value={f.sex} onChange={(v) => set('sex', v as Sex)} options={[{ value: 'male', label: 'Masculino' }, { value: 'female', label: 'Femenino' }, { value: 'unspecified', label: 'Prefiero no decir' }]} />
              <p className="mt-2 text-xs text-muted">Se usa solo porque la ecuación Mifflin-St Jeor tiene coeficientes distintos (diferencia de 166 kcal). Si no respondes, usamos el punto medio y lo afinamos con tu tendencia de peso.</p>
            </div>
            <Field label="% de grasa (opcional)">{(id) => <NumberInput id={id} value={f.bodyFatPct} onChange={(v) => set('bodyFatPct', v)} suffix="%" />}</Field>
            <label className="mt-6 flex items-center gap-2 text-xs text-soft">
              <input type="checkbox" className="h-4 w-4 accent-[var(--color-lime)]" checked={f.bodyFatMeasured} onChange={(e) => set('bodyFatMeasured', e.target.checked)} /> Medido (DEXA, bioimpedancia validada…)
            </label>
          </div>
          {f.heightCm && f.weightKg ? <p className="mt-3 text-xs text-muted">IMC {fmt(bmi(f.weightKg, f.heightCm), 1)} (indicador poblacional; no distingue músculo de grasa).</p> : null}
          {age != null && age < 18 && <div className="mt-3"><Note tone="warn">Eres menor de edad: no aplicaremos déficits calóricos automáticos. Te recomendamos supervisión de un profesional.</Note></div>}
        </Card>
      )}

      {step === 2 && (
        <Card title="¿Qué quieres lograr?">
          <div className="space-y-4">
            <Chips value={f.goal} onChange={(v) => set('goal', v as Goal)} options={(Object.keys(GOAL_LABEL) as Goal[]).map((g) => ({ value: g, label: GOAL_LABEL[g] }))} />
            {f.goal !== 'maintenance' && (
              <div>
                <span className="label">Ritmo de cambio</span>
                <Chips value={f.pace} onChange={(v) => set('pace', v as Pace)} options={(Object.keys(PACE_LABEL) as Pace[]).map((p) => ({ value: p, label: PACE_LABEL[p] }))} />
                <p className="mt-2 text-xs text-muted">{f.goal === 'fat_loss' ? 'Lento ≈ 0.25 %, moderado ≈ 0.5 %, rápido ≈ 0.75 % del peso por semana. Ritmos más lentos suelen preservar mejor el rendimiento.' : 'Superávits más pequeños reducen la ganancia de grasa; el ritmo se ajusta a tu experiencia.'}</p>
              </div>
            )}
            <Field label="Objetivos de rendimiento (opcional)" hint="Ej.: 10 dominadas, sentadilla 120 kg, press 100 kg">{(id) => <textarea id={id} rows={2} className="input" value={f.performanceGoals} onChange={(e) => set('performanceGoals', e.target.value)} />}</Field>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card title="Actividad cotidiana (sin contar el gimnasio)">
          <div className="space-y-4">
            <Chips value={f.activity} onChange={(v) => set('activity', v as ActivityLevel)} options={(Object.keys(ACTIVITY_LABEL) as ActivityLevel[]).map((a) => ({ value: a, label: ACTIVITY_LABEL[a] }))} />
            <p className="text-xs text-muted">Sedentaria: trabajo sentado, &lt; 5 000 pasos · Ligera: 5–7.5 k · Moderada: 7.5–10 k o de pie · Alta: 10–12.5 k o trabajo físico · Muy alta: &gt; 12.5 k o trabajo físico intenso.</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Pasos diarios promedio (si los conoces)">{(id) => <NumberInput id={id} value={f.avgSteps} onChange={(v) => set('avgSteps', v)} />}</Field>
              <Field label="Horas de sueño habituales">{(id) => <NumberInput id={id} value={f.sleepHours} onChange={(v) => set('sleepHours', v)} suffix="h" />}</Field>
              <div className="col-span-2"><Field label="Otra actividad física (no pesas)" hint="Fútbol, bici, correr… minutos por semana">{(id) => <NumberInput id={id} value={f.extraMin} onChange={(v) => set('extraMin', v)} suffix="min" />}</Field></div>
            </div>
            {f.avgSteps != null && activityFromSteps(f.avgSteps) !== f.activity && (
              <Note>Con {fmt(f.avgSteps)} pasos/día el nivel sugerido es <b>{ACTIVITY_LABEL[activityFromSteps(f.avgSteps)]}</b>. <button className="font-semibold text-lime" onClick={() => set('activity', activityFromSteps(f.avgSteps!))}>Usar este nivel</button></Note>
            )}
          </div>
        </Card>
      )}

      {step === 4 && (
        <Card title="Entrenamiento">
          <div className="space-y-4">
            <div><span className="label">Experiencia con pesas</span><Chips value={f.experience} onChange={(v) => set('experience', v as Experience)} options={(Object.keys(EXPERIENCE_LABEL) as Experience[]).map((e) => ({ value: e, label: EXPERIENCE_LABEL[e] }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Días por semana">{(id) => <select id={id} className="input" value={f.trainingDays} onChange={(e) => set('trainingDays', Number(e.target.value))}>{[1, 2, 3, 4, 5, 6].map((d) => <option key={d} value={d}>{d}</option>)}</select>}</Field>
              <Field label="Duración por sesión">{(id) => <NumberInput id={id} value={f.sessionMinutes} onChange={(v) => set('sessionMinutes', v)} suffix="min" />}</Field>
            </div>
            <div><span className="label">Equipamiento disponible</span><Chips multi value={f.equipment} onChange={(v) => set('equipment', v as Equipment[])} options={EQUIP_OPTIONS} /></div>
            <Field label="Gimnasio habitual (opcional)">{(id) => <input id={id} className="input" value={f.gymName} onChange={(e) => set('gymName', e.target.value)} />}</Field>
            <Field label="Lesiones o limitaciones (opcional)" hint="Lo tendremos en cuenta; no sustituye una valoración profesional.">{(id) => <textarea id={id} rows={2} className="input" value={f.injuries} onChange={(e) => set('injuries', e.target.value)} />}</Field>
            <Field label="Ejercicios que quieres evitar (separados por comas)">{(id) => <input id={id} className="input" placeholder="sentadilla, peso muerto" value={f.avoidText} onChange={(e) => set('avoidText', e.target.value)} />}</Field>
          </div>
        </Card>
      )}

      {step === 5 && (
        <Card title="Alimentación">
          <div className="space-y-4">
            <div><span className="label">Preferencias</span><Chips multi value={f.diet} onChange={(v) => set('diet', v as string[])} options={DIETS} /></div>
            <div><span className="label">Alergias</span><Chips multi value={f.allergies} onChange={(v) => set('allergies', v as string[])} options={COMMON_ALLERGENS} /></div>
            <Field label="Otras alergias (separadas por comas)">{(id) => <input id={id} className="input" value={f.allergiesExtra} onChange={(e) => set('allergiesExtra', e.target.value)} />}</Field>
            <Field label="Intolerancias">{(id) => <input id={id} className="input" placeholder="lactosa, fructosa…" value={f.intolerances} onChange={(e) => set('intolerances', e.target.value)} />}</Field>
            <Field label="Alimentos que no consumes o no te gustan">{(id) => <input id={id} className="input" placeholder="hígado, brócoli…" value={f.disliked} onChange={(e) => set('disliked', e.target.value)} />}</Field>
            <div>
              <span className="label">Condiciones de salud (opcional, orientativo)</span>
              <Chips multi value={f.conditions} onChange={(v) => set('conditions', v as string[])} options={CONDITION_OPTIONS} />
              <p className="mt-2 text-xs text-muted">Se usan para mostrar sugerencias educativas del catálogo. No es una validación clínica: sigue las indicaciones de tu médico.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><span className="label">Colaciones al día</span><Chips value={String(f.snacks) as '0'} onChange={(v) => set('snacks', Number(v) as 0 | 1 | 2)} options={[{ value: '0', label: '0' }, { value: '1', label: '1' }, { value: '2', label: '2' }]} /></div>
              <div><span className="label">Presupuesto</span><Chips value={f.budget} onChange={(v) => set('budget', v as 'medio')} options={[{ value: 'barato', label: 'Económico' }, { value: 'medio', label: 'Medio' }, { value: 'alto', label: 'Alto' }]} /></div>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-[var(--color-lime)]" checked={f.trackWater} onChange={(e) => set('trackWater', e.target.checked)} /> Registrar agua</label>
              <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-[var(--color-lime)]" checked={f.trackFiber} onChange={(e) => set('trackFiber', e.target.checked)} /> Mostrar fibra</label>
            </div>
          </div>
        </Card>
      )}

      {step === 6 && (
        <div className="space-y-4">
          <Card title="Medidas corporales (opcional)">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {([['waistCm', 'Cintura'], ['abdomenCm', 'Abdomen'], ['chestCm', 'Pecho'], ['armCm', 'Brazo'], ['hipCm', 'Cadera'], ['thighCm', 'Muslo']] as const).map(([k, l]) => (
                <Field key={k} label={l}>{(id) => <NumberInput id={id} value={f.measurements[k]} onChange={(v) => set('measurements', { ...f.measurements, [k]: v })} suffix="cm" />}</Field>
              ))}
            </div>
          </Card>
          <Card title="Historial de peso (opcional)" action={<button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => set('history', [...f.history, { date: '', kg: null }])}><Plus size={14} /> Añadir</button>}>
            {f.history.length === 0 ? <p className="text-sm text-muted">Si tienes pesajes anteriores, añádelos para ver tu tendencia desde el primer día.</p> : (
              <div className="space-y-2">
                {f.history.map((h, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="date" aria-label="Fecha" className="input" max={today} value={h.date} onChange={(e) => set('history', f.history.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} />
                    <NumberInput ariaLabel="Peso" value={h.kg} onChange={(v) => set('history', f.history.map((x, j) => (j === i ? { ...x, kg: v } : x)))} suffix="kg" />
                    <button className="btn-ghost p-2" aria-label="Quitar" onClick={() => set('history', f.history.filter((_, j) => j !== i))}><Trash2 size={16} /></button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {step === 7 && plan && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Mascot mood="coach" size={84} />
            <p className="text-sm text-soft">Así calculamos tu propuesta inicial. Es una estimación: la ajustaremos con tu tendencia real de peso tras 2–3 semanas de registros.</p>
          </div>
          <Card title="Gasto energético estimado">
            <div className="space-y-1.5 text-sm">
              <Row k={`Metabolismo basal (${plan.bmr.method === 'katch' ? 'Katch-McArdle' : 'Mifflin-St Jeor'})`} v={`${fmt(plan.bmr.kcal)} kcal`} />
              {plan.bmr.range && <Row k="Rango según sexo" v={`${fmt(plan.bmr.range[0])}–${fmt(plan.bmr.range[1])} kcal`} />}
              <Row k={`Actividad cotidiana (${ACTIVITY_LABEL[f.activity].toLowerCase()})`} v={`+${fmt(plan.tdee.neat)} kcal`} />
              <Row k={`Entrenamiento (${f.trainingDays}×${f.sessionMinutes} min/sem${f.extraMin ? ` + ${f.extraMin} min otra actividad` : ''})`} v={`+${fmt(plan.tdee.exercise)} kcal`} />
              <div className="border-t border-line pt-1.5"><Row k={<b>Gasto total estimado</b>} v={<b>{fmt(plan.tdee.tdee)} kcal</b>} /></div>
            </div>
            <p className="mt-3 text-xs text-muted">{plan.bmr.note} El ejercicio se suma aparte de la actividad cotidiana para no contarlo dos veces.</p>
          </Card>
          <Card title={`Objetivos · ${GOAL_LABEL[f.goal]}`} action={<Badge tone="lime">Calculado</Badge>}>
            <div className="grid grid-cols-4 gap-2 text-center">
              <Macro label="Calorías" v={plan.targets.kcal} u="kcal" />
              <Macro label="Proteína" v={plan.targets.proteinG} u="g" />
              <Macro label="Carbohidratos" v={plan.targets.carbsG} u="g" />
              <Macro label="Grasas" v={plan.targets.fatG} u="g" />
            </div>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-soft">{plan.targets.rationale.map((r) => <li key={r}>{r}</li>)}</ul>
            <p className="mt-2 text-xs text-muted">Rango orientativo de proteína: {plan.targets.proteinRangeG[0]}–{plan.targets.proteinRangeG[1]} g/día · Fibra ~{plan.targets.fiberG} g · Agua ~{fmt(plan.targets.waterMl / 1000, 1)} L.</p>
            {plan.targets.warnings.map((w) => <div key={w} className="mt-2"><Note tone="warn">{w}</Note></div>)}
          </Card>
          <Card title="¿Prefieres definir tus objetivos?">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[var(--color-lime)]" checked={f.manual} onChange={(e) => setF((s) => ({ ...s, manual: e.target.checked, manualKcal: s.manualKcal ?? plan.targets.kcal, manualP: s.manualP ?? plan.targets.proteinG, manualC: s.manualC ?? plan.targets.carbsG, manualF: s.manualF ?? plan.targets.fatG }))} /> Definir manualmente</label>
            {f.manual && (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Calorías">{(id) => <NumberInput id={id} value={f.manualKcal} onChange={(v) => set('manualKcal', v)} suffix="kcal" />}</Field>
                  <Field label="Proteína">{(id) => <NumberInput id={id} value={f.manualP} onChange={(v) => set('manualP', v)} suffix="g" />}</Field>
                  <Field label="Carbohidratos">{(id) => <NumberInput id={id} value={f.manualC} onChange={(v) => set('manualC', v)} suffix="g" />}</Field>
                  <Field label="Grasas">{(id) => <NumberInput id={id} value={f.manualF} onChange={(v) => set('manualF', v)} suffix="g" />}</Field>
                </div>
                {f.manualKcal && f.manualP != null && f.manualC != null && f.manualF != null && (() => {
                  const c = macroConsistency(f.manualKcal, f.manualP, f.manualC, f.manualF)
                  return <p className={`text-xs ${c.ok ? 'text-muted' : 'text-warn'}`}>Los macros suman {fmt(c.fromMacros)} kcal ({c.diffPct >= 0 ? '+' : ''}{fmt(c.diffPct * 100, 1)} % vs. objetivo).</p>
                })()}
                {mw.map((w) => <Note key={w} tone="warn">{w}</Note>)}
              </div>
            )}
          </Card>
          <Card>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[var(--color-lime)]" checked={f.createRoutine} onChange={(e) => set('createRoutine', e.target.checked)} /> Crear una rutina inicial de {f.trainingDays} día(s) con mi equipamiento</label>
          </Card>
        </div>
      )}

      {error && <div className="mt-4"><ErrorBox>{error}</ErrorBox></div>}
      <div className="mt-6 flex justify-end">
        {step < steps.length - 1 ? (
          <button className="btn-primary" onClick={next}>Continuar <ArrowRight size={16} /></button>
        ) : (
          <button className="btn-primary" onClick={finish} disabled={saving}>{saving ? 'Guardando…' : 'Empezar'}</button>
        )}
      </div>
    </div>
  )
}

function Row({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return <div className="flex justify-between gap-3"><span className="text-soft">{k}</span><span className="tabular-nums">{v}</span></div>
}
function Macro({ label, v, u }: { label: string; v: number; u: string }) {
  return <div className="rounded-xl bg-raised p-2"><p className="text-[11px] text-muted">{label}</p><p className="h-display text-lg font-bold">{fmt(v)}</p><p className="text-[10px] text-muted">{u}</p></div>
}
