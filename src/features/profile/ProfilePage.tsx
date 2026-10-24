import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Download, LogOut, Trash2 } from 'lucide-react'
import { useUser } from '../../lib/app'
import { useRows } from '../../lib/hooks'
import { exportUserData, repo } from '../../lib/db/db'
import { deleteAccount } from '../../lib/auth'
import { computePlan, EXPERIENCE_LABEL, GOAL_LABEL, PACE_LABEL, targetsRow } from '../../lib/plan'
import { ACTIVITY_LABEL, macroConsistency, manualTargetWarnings } from '../../lib/calc/energy'
import { ACHIEVEMENTS } from '../../lib/calc/habits'
import { EQUIPMENT_LABEL } from '../../lib/exercises'
import { supabaseConfigured } from '../../lib/sync/supabase'
import type { ActivityLevel, Equipment, Experience, Goal, Pace, Preferences, Profile, Sex } from '../../lib/types'
import { Badge, Card, Chips, ErrorBox, Field, Mascot, Note, NumberInput, Sheet, fmt, toast } from '../../components/ui'
import { CONDITION_OPTIONS } from '../nutrition/catalog'
import { SyncBadge } from '../../components/Layout'

export default function ProfilePage() {
  const { profile, prefs, targets, session, signOut } = useUser()
  const nav = useNavigate()
  const ach = useRows('achievements')
  const [editProfile, setEditProfile] = useState(false)
  const [editTargets, setEditTargets] = useState(false)
  const [privacy, setPrivacy] = useState(false)
  if (!profile || !prefs) return null
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center gap-4">
        <Mascot mood="wave" size={72} />
        <div className="flex-1">
          <h1 className="h-display text-2xl font-bold">{profile.displayName}</h1>
          <p className="text-sm text-muted">{session?.email} · {session?.mode === 'local' ? 'Cuenta local en este dispositivo' : 'Cuenta en la nube'}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Mis datos" action={<button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setEditProfile(true)}>Editar</button>}>
          <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
            <dt className="text-muted">Edad</dt><dd>{profile.age} años</dd>
            <dt className="text-muted">Estatura</dt><dd>{profile.heightCm} cm</dd>
            <dt className="text-muted">Peso (perfil)</dt><dd>{fmt(profile.weightKg, 1)} kg</dd>
            <dt className="text-muted">Objetivo</dt><dd>{GOAL_LABEL[prefs.goal]} · {PACE_LABEL[prefs.pace]}</dd>
            <dt className="text-muted">Experiencia</dt><dd>{EXPERIENCE_LABEL[prefs.experience]}</dd>
            <dt className="text-muted">Actividad</dt><dd>{ACTIVITY_LABEL[prefs.activity]}</dd>
            <dt className="text-muted">Entreno</dt><dd>{prefs.trainingDays} días × {prefs.sessionMinutes} min</dd>
            {profile.bodyFatPct != null && <><dt className="text-muted">% grasa</dt><dd>{profile.bodyFatPct}% <Badge>{profile.bodyFatOrigin === 'measured' ? 'medido' : 'estimado'}</Badge></dd></>}
          </dl>
        </Card>
        <Card title="Objetivos nutricionales" action={<button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setEditTargets(true)}>Revisar</button>}>
          {targets ? (
            <>
              <p className="h-display text-2xl font-bold">{fmt(targets.kcal)} <span className="text-sm text-muted">kcal</span> <Badge tone={targets.mode === 'manual' ? 'warn' : 'lime'}>{targets.mode === 'manual' ? 'Manual' : 'Calculado'}</Badge></p>
              <p className="text-sm text-soft">Proteína {targets.proteinG} g · Carbohidratos {targets.carbsG} g · Grasas {targets.fatG} g</p>
              <p className="mt-1 text-xs text-muted">Vigente desde {targets.validFrom}</p>
              <details className="mt-2 text-xs text-muted"><summary className="cursor-pointer text-soft">¿Cómo se calculó?</summary><p className="mt-1 whitespace-pre-line">{targets.rationale}</p></details>
            </>
          ) : <p className="text-sm text-muted">Sin objetivos.</p>}
        </Card>
      </div>

      <Card title="Logros">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ACHIEVEMENTS.map((a) => {
            const got = ach?.find((x) => x.key === a.key)
            return (
              <div key={a.key} className={`rounded-xl border p-3 text-center ${got ? 'border-lime/40 bg-lime/5' : 'border-line/60 opacity-50'}`}>
                <img src={`/mascot/${a.image}.png`} alt="" className={`mx-auto h-14 w-14 ${got ? '' : 'grayscale'}`} />
                <p className="mt-1 text-xs font-semibold">{a.title}</p>
                <p className="text-[10px] text-muted">{got ? got.date : a.description}</p>
              </div>
            )
          })}
        </div>
        <p className="mt-2 text-[11px] text-muted">Celebramos constancia y esfuerzo, no un número en la báscula. Perder una racha no borra lo logrado.</p>
      </Card>

      <Card title="Integraciones y sincronización">
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between"><span>Sincronización</span><SyncBadge /></div>
          <Integration name="Supabase (cuenta y nube)" status={supabaseConfigured ? 'Configurado' : 'No configurado'} ok={supabaseConfigured} detail="Requiere VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY y aplicar supabase/migrations." />
          <Integration name="Open Food Facts" status="Activo (sin clave)" ok detail="Búsqueda y código de barras de productos. Cobertura de México parcial." />
          <Integration name="USDA FoodData Central" status="Requiere clave en servidor" ok={false} detail="USDA_API_KEY como secreto del servidor." />
          <Integration name="Apple Health / HealthKit" status="No disponible en web" ok={false} detail="HealthKit solo es accesible desde una app nativa de iOS. Pasos y peso se registran manualmente." />
          <Integration name="Google Health Connect" status="No disponible en web" ok={false} detail="Requiere app nativa de Android con permisos del sistema." />
        </div>
      </Card>

      <div className="grid gap-2 sm:grid-cols-3">
        <button className="btn-ghost" onClick={() => nav('/ciencia')}><BookOpen size={16} /> Base científica</button>
        <button className="btn-ghost" onClick={() => setPrivacy(true)}><Download size={16} /> Privacidad y datos</button>
        <button className="btn-ghost" onClick={() => void signOut()}><LogOut size={16} /> Cerrar sesión</button>
      </div>

      {editProfile && <EditProfileSheet profile={profile} prefs={prefs} onClose={() => setEditProfile(false)} />}
      {editTargets && <TargetsSheet onClose={() => setEditTargets(false)} />}
      {privacy && <PrivacySheet onClose={() => setPrivacy(false)} />}
    </div>
  )
}

function Integration({ name, status, ok, detail }: { name: string; status: string; ok: boolean; detail: string }) {
  return <div className="rounded-xl bg-raised p-3"><div className="flex items-center justify-between gap-2"><span className="font-medium">{name}</span><Badge tone={ok ? 'lime' : 'muted'}>{status}</Badge></div><p className="mt-1 text-[11px] text-muted">{detail}</p></div>
}

function EditProfileSheet({ profile, prefs, onClose }: { profile: Profile; prefs: Preferences; onClose: () => void }) {
  const { userId } = useUser()
  const [p, setP] = useState(profile)
  const [q, setQ] = useState(prefs)
  const [err, setErr] = useState<string | null>(null)
  const list = (s: string) => s.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean)
  async function save() {
    if (p.age < 13 || p.age > 100 || p.heightCm < 120 || p.heightCm > 230 || p.weightKg < 30 || p.weightKg > 300) return setErr('Revisa edad (13–100), estatura (120–230) y peso (30–300)')
    await repo.put('profiles', userId, p)
    await repo.put('preferences', userId, q)
    toast('Perfil actualizado. Revisa tus objetivos si cambiaron datos clave.')
    onClose()
  }
  return (
    <Sheet open onClose={onClose} title="Editar perfil" wide>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Nombre">{(id) => <input id={id} className="input" value={p.displayName} onChange={(e) => setP({ ...p, displayName: e.target.value })} />}</Field>
          <Field label="Edad">{(id) => <NumberInput id={id} value={p.age} onChange={(v) => v != null && setP({ ...p, age: v })} />}</Field>
          <Field label="Estatura">{(id) => <NumberInput id={id} value={p.heightCm} onChange={(v) => v != null && setP({ ...p, heightCm: v })} suffix="cm" />}</Field>
          <Field label="Peso">{(id) => <NumberInput id={id} value={p.weightKg} onChange={(v) => v != null && setP({ ...p, weightKg: v })} suffix="kg" />}</Field>
        </div>
        <div><span className="label">Sexo fisiológico</span><Chips value={p.sex} onChange={(v) => setP({ ...p, sex: v as Sex })} options={[{ value: 'male', label: 'Masculino' }, { value: 'female', label: 'Femenino' }, { value: 'unspecified', label: 'Prefiero no decir' }]} /></div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="% de grasa">{(id) => <NumberInput id={id} value={p.bodyFatPct ?? null} onChange={(v) => setP({ ...p, bodyFatPct: v })} suffix="%" />}</Field>
          <label className="mt-6 flex items-center gap-2 text-xs"><input type="checkbox" className="h-4 w-4 accent-[var(--color-lime)]" checked={p.bodyFatOrigin === 'measured'} onChange={(e) => setP({ ...p, bodyFatOrigin: e.target.checked ? 'measured' : 'estimated' })} /> Medido</label>
        </div>
        <div><span className="label">Objetivo</span><Chips value={q.goal} onChange={(v) => setQ({ ...q, goal: v as Goal })} options={(Object.keys(GOAL_LABEL) as Goal[]).map((g) => ({ value: g, label: GOAL_LABEL[g] }))} /></div>
        <div><span className="label">Ritmo</span><Chips value={q.pace} onChange={(v) => setQ({ ...q, pace: v as Pace })} options={(Object.keys(PACE_LABEL) as Pace[]).map((g) => ({ value: g, label: PACE_LABEL[g] }))} /></div>
        <div><span className="label">Actividad cotidiana</span><Chips value={q.activity} onChange={(v) => setQ({ ...q, activity: v as ActivityLevel })} options={(Object.keys(ACTIVITY_LABEL) as ActivityLevel[]).map((g) => ({ value: g, label: ACTIVITY_LABEL[g] }))} /></div>
        <div><span className="label">Experiencia</span><Chips value={q.experience} onChange={(v) => setQ({ ...q, experience: v as Experience })} options={(Object.keys(EXPERIENCE_LABEL) as Experience[]).map((g) => ({ value: g, label: EXPERIENCE_LABEL[g] }))} /></div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Días/semana">{(id) => <NumberInput id={id} value={q.trainingDays} onChange={(v) => v && v >= 1 && v <= 7 && setQ({ ...q, trainingDays: v })} />}</Field>
          <Field label="Min/sesión">{(id) => <NumberInput id={id} value={q.sessionMinutes} onChange={(v) => v && setQ({ ...q, sessionMinutes: v })} />}</Field>
          <Field label="Descanso (s)">{(id) => <NumberInput id={id} value={q.restTimerSec} onChange={(v) => v && setQ({ ...q, restTimerSec: v })} />}</Field>
        </div>
        <div><span className="label">Equipamiento</span><Chips multi value={q.equipment} onChange={(v) => setQ({ ...q, equipment: v as Equipment[] })} options={(Object.keys(EQUIPMENT_LABEL) as Equipment[]).filter((e) => e !== 'other').map((e) => ({ value: e, label: EQUIPMENT_LABEL[e] }))} /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Alergias (comas)">{(id) => <input id={id} className="input" defaultValue={q.allergies.join(', ')} onBlur={(e) => setQ({ ...q, allergies: list(e.target.value) })} />}</Field>
          <Field label="Intolerancias (comas)">{(id) => <input id={id} className="input" defaultValue={q.intolerances.join(', ')} onBlur={(e) => setQ({ ...q, intolerances: list(e.target.value) })} />}</Field>
          <Field label="No me gusta (comas)">{(id) => <input id={id} className="input" defaultValue={q.dislikedFoods.join(', ')} onBlur={(e) => setQ({ ...q, dislikedFoods: list(e.target.value) })} />}</Field>
          <Field label="Lesiones / limitaciones">{(id) => <input id={id} className="input" value={q.injuries} onChange={(e) => setQ({ ...q, injuries: e.target.value })} />}</Field>
        </div>
        <div><span className="label">Preferencias alimentarias</span><Chips multi value={q.diet} onChange={(v) => setQ({ ...q, diet: v as string[] })} options={['vegetariano', 'vegano', 'sin lactosa', 'sin gluten', 'pescetariano'].map((d) => ({ value: d, label: d }))} /></div>
        <div><span className="label">Condiciones (orientativo)</span><Chips multi value={q.conditions} onChange={(v) => setQ({ ...q, conditions: v as string[] })} options={CONDITION_OPTIONS} /></div>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-[var(--color-lime)]" checked={q.trackWater} onChange={(e) => setQ({ ...q, trackWater: e.target.checked })} /> Agua</label>
          <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-[var(--color-lime)]" checked={q.trackFiber} onChange={(e) => setQ({ ...q, trackFiber: e.target.checked })} /> Fibra</label>
          <label className="flex items-center gap-2">Colaciones <select className="input w-16 py-1" value={q.snacksPerDay} onChange={(e) => setQ({ ...q, snacksPerDay: Number(e.target.value) as 0 | 1 | 2 })}><option>0</option><option>1</option><option>2</option></select></label>
        </div>
        {err && <ErrorBox>{err}</ErrorBox>}
        <button className="btn-primary w-full" onClick={save}>Guardar</button>
      </div>
    </Sheet>
  )
}

function TargetsSheet({ onClose }: { onClose: () => void }) {
  const { userId, profile, prefs, targets, today } = useUser()
  const plan = useMemo(() => profile && prefs ? computePlan({ ...profile, ...prefs }) : null, [profile, prefs])
  const [manual, setManual] = useState({ kcal: targets?.kcal ?? null, p: targets?.proteinG ?? null, c: targets?.carbsG ?? null, f: targets?.fatG ?? null })
  if (!plan || !profile) return null
  const w = manualTargetWarnings(manual.kcal ?? 0, plan.bmr.kcal, manual.p ?? 0, profile.weightKg, profile.age)
  const c = manual.kcal && manual.p != null && manual.c != null && manual.f != null ? macroConsistency(manual.kcal, manual.p, manual.c, manual.f) : null
  return (
    <Sheet open onClose={onClose} title="Objetivos nutricionales" wide>
      <div className="space-y-4">
        <Card title="Propuesta calculada con tus datos actuales">
          <p className="text-sm">TMB {fmt(plan.bmr.kcal)} + actividad {fmt(plan.tdee.neat)} + ejercicio {fmt(plan.tdee.exercise)} = <b>{fmt(plan.tdee.tdee)} kcal</b> de gasto estimado.</p>
          <p className="mt-1 text-lg font-semibold">{plan.targets.kcal} kcal · P {plan.targets.proteinG} g · C {plan.targets.carbsG} g · G {plan.targets.fatG} g</p>
          <ul className="mt-2 list-disc pl-5 text-xs text-soft">{plan.targets.rationale.map((r) => <li key={r}>{r}</li>)}</ul>
          {plan.targets.warnings.map((x) => <div key={x} className="mt-2"><Note tone="warn">{x}</Note></div>)}
          <button className="btn-primary mt-3" onClick={async () => { await repo.put('targets', userId, targetsRow(plan, today)); toast('Objetivos calculados aplicados'); onClose() }}>Aplicar propuesta</button>
        </Card>
        <Card title="Definir manualmente">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Calorías">{(id) => <NumberInput id={id} value={manual.kcal} onChange={(v) => setManual({ ...manual, kcal: v })} />}</Field>
            <Field label="Proteína g">{(id) => <NumberInput id={id} value={manual.p} onChange={(v) => setManual({ ...manual, p: v })} />}</Field>
            <Field label="Carbos g">{(id) => <NumberInput id={id} value={manual.c} onChange={(v) => setManual({ ...manual, c: v })} />}</Field>
            <Field label="Grasas g">{(id) => <NumberInput id={id} value={manual.f} onChange={(v) => setManual({ ...manual, f: v })} />}</Field>
          </div>
          {c && <p className={`mt-2 text-xs ${c.ok ? 'text-muted' : 'text-warn'}`}>Los macros suman {fmt(c.fromMacros)} kcal ({c.diffPct >= 0 ? '+' : ''}{fmt(c.diffPct * 100, 1)} %).</p>}
          {w.map((x) => <div key={x} className="mt-2"><Note tone="warn">{x}</Note></div>)}
          <button className="btn-ghost mt-3" disabled={!manual.kcal || manual.p == null || manual.c == null || manual.f == null} onClick={async () => {
            await repo.put('targets', userId, { mode: 'manual', kcal: manual.kcal!, proteinG: manual.p!, carbsG: manual.c!, fatG: manual.f!, fiberG: plan.targets.fiberG, waterMl: plan.targets.waterMl, validFrom: today, rationale: 'Objetivos definidos manualmente por el usuario.' })
            toast('Objetivos manuales guardados'); onClose()
          }}>Guardar manuales</button>
        </Card>
      </div>
    </Sheet>
  )
}

function PrivacySheet({ onClose }: { onClose: () => void }) {
  const { userId, session, setSession } = useUser()
  const [pwd, setPwd] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const [err, setErr] = useState<string | null>(null)
  async function exportData() {
    const data = await exportUserData(userId)
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `athletiq-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  return (
    <Sheet open onClose={onClose} title="Privacidad y datos">
      <div className="space-y-4 text-sm">
        <div className="space-y-2 text-soft">
          <p><b>Qué guardamos:</b> perfil, preferencias, registros de comida, peso, medidas, entrenamientos, recuperación y fotos opcionales. Solo lo que introduces o importas.</p>
          <p><b>Dónde:</b> {session?.mode === 'local' ? 'solo en este navegador (IndexedDB). Si borras los datos del navegador, se pierden.' : 'en tu dispositivo y en el servidor, con acceso restringido a tu cuenta mediante políticas RLS.'}</p>
          <p><b>Con quién se comparte:</b> con nadie. Si usas el coach con IA, se envían al proveedor de IA únicamente los resultados de las consultas necesarias para responder tu pregunta.</p>
          <p><b>Menores:</b> se desactivan los déficits automáticos y se recomienda supervisión profesional.</p>
        </div>
        <button className="btn-primary w-full" onClick={exportData}><Download size={16} /> Exportar mis datos (JSON)</button>
        <div className="rounded-xl border border-danger/40 p-3">
          <p className="font-semibold text-danger">Eliminar cuenta y datos</p>
          <p className="mt-1 text-xs text-muted">Se borran permanentemente tu cuenta y todos tus registros de este dispositivo{session?.mode === 'supabase' ? ' y del servidor' : ''}. No se puede deshacer.</p>
          <div className="mt-2 space-y-2">
            {session?.mode === 'local' && <input type="password" className="input" placeholder="Tu contraseña" value={pwd} onChange={(e) => setPwd(e.target.value)} aria-label="Contraseña" />}
            <input className="input" placeholder='Escribe "ELIMINAR"' value={confirmText} onChange={(e) => setConfirmText(e.target.value)} aria-label="Confirmación" />
            {err && <ErrorBox>{err}</ErrorBox>}
            <button className="btn-danger w-full" disabled={confirmText !== 'ELIMINAR'} onClick={async () => {
              try { await deleteAccount(session!, pwd); setSession(null) } catch (e) { setErr(e instanceof Error ? e.message : 'Error') }
            }}><Trash2 size={16} /> Eliminar definitivamente</button>
          </div>
        </div>
      </div>
    </Sheet>
  )
}
