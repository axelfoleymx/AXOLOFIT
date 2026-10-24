import { useEffect, useRef, useState } from 'react'
import { Send, Database, Sparkles } from 'lucide-react'
import { useUser } from '../../lib/app'
import { runTool } from '../../lib/coach/tools'
import { answerWithData } from '../../lib/coach/dataMode'
import type { CoachToolName } from '../../lib/coach/toolDefs'
import { supabase } from '../../lib/sync/supabase'
import { Badge, Mascot, Note } from '../../components/ui'

type ApiBlock = { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> } & Record<string, unknown>
type ApiMessage = { role: 'user' | 'assistant'; content: string | ApiBlock[] }
interface ChatItem { role: 'user' | 'coach'; text: string; tools?: string[]; mode?: 'ai' | 'data'; error?: boolean }

const TOOL_LABEL: Record<string, string> = {
  get_profile: 'perfil', get_day_nutrition: 'diario de hoy', get_nutrition_summary: 'resumen nutricional', get_weight_trend: 'tendencia de peso',
  get_training_overview: 'entrenamientos', get_exercise_recommendation: 'historial del ejercicio', get_substitutes: 'sustituciones', get_recovery: 'recuperación',
  suggest_meals: 'recetario', compare_periods: 'comparación de periodos', preview_routine: 'generador de rutinas',
}

async function callCoach(messages: ApiMessage[]): Promise<{ content: ApiBlock[]; stop_reason: string }> {
  if (supabase) {
    const { data, error } = await supabase.functions.invoke('coach', { body: { messages } })
    if (error) throw new Error(error.message)
    return data
  }
  const res = await fetch('/api/coach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages }) })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(j.message ?? `Error ${res.status}`), { status: res.status })
  return j
}

const SUGGESTIONS = ['¿Qué debería entrenar hoy?', '¿Cuánta proteína me falta hoy?', '¿Qué puedo cenar con lo que me queda?', '¿Cómo voy esta semana?', '¿Estoy recuperándome bien?', '¿Cuánto peso uso en press de banca?']

export default function Coach() {
  const { userId, today, profile } = useUser()
  const [ai, setAi] = useState<boolean | null>(null)
  const [chat, setChat] = useState<ChatItem[]>([])
  const [history, setHistory] = useState<ApiMessage[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (supabase) return setAi(true)
    fetch('/api/health').then((r) => r.json()).then((j) => setAi(!!j.coach)).catch(() => setAi(false))
  }, [])
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat, busy])

  async function ask(q: string) {
    if (!q.trim() || busy) return
    setText('')
    setChat((c) => [...c, { role: 'user', text: q }])
    setBusy(true)
    try {
      if (!ai) {
        const r = await answerWithData(userId, today, q)
        setChat((c) => [...c, { role: 'coach', text: r.text, tools: r.tools, mode: 'data' }])
        return
      }
      let msgs: ApiMessage[] = [...history, { role: 'user', content: q }]
      const used: string[] = []
      for (let i = 0; i < 6; i++) {
        const r = await callCoach(msgs)
        msgs = [...msgs, { role: 'assistant', content: r.content }]
        if (r.stop_reason !== 'tool_use') {
          const out = r.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim()
          setChat((c) => [...c, { role: 'coach', text: r.stop_reason === 'refusal' ? 'No puedo ayudar con esa solicitud.' : out || '…', tools: used, mode: 'ai' }])
          break
        }
        const results = await Promise.all(r.content.filter((b) => b.type === 'tool_use').map(async (b) => {
          used.push(b.name!)
          try {
            return { type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(await runTool(userId, today, b.name as CoachToolName, b.input ?? {})) }
          } catch (e) {
            return { type: 'tool_result', tool_use_id: b.id, is_error: true, content: e instanceof Error ? e.message : 'Error' }
          }
        }))
        msgs = [...msgs, { role: 'user', content: results as unknown as ApiBlock[] }]
      }
      // Recorta el historial solo en un turno de usuario con texto, para no separar tool_use de su tool_result
      const cut = msgs.findIndex((m, idx) => idx >= msgs.length - 40 && m.role === 'user' && typeof m.content === 'string')
      setHistory(cut > 0 ? msgs.slice(cut) : msgs)
    } catch (e) {
      const status = (e as { status?: number }).status
      if (status === 503) setAi(false)
      const r = await answerWithData(userId, today, q)
      setChat((c) => [...c, { role: 'coach', text: `No pude contactar al coach con IA (${e instanceof Error ? e.message : 'error'}). Respuesta en modo datos:\n\n${r.text}`, tools: r.tools, mode: 'data', error: true }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-10rem)] max-w-3xl flex-col md:h-[calc(100dvh-5rem)]">
      <div className="mb-3 flex items-center gap-3">
        <Mascot mood="coach" size={56} />
        <div className="flex-1">
          <h1 className="h-display text-xl font-bold">Coach</h1>
          {ai == null ? <p className="text-xs text-muted">Comprobando…</p> : ai ? <Badge tone="lime"><Sparkles size={11} /> IA conectada · consulta tus datos con herramientas</Badge> : <Badge tone="warn"><Database size={11} /> Modo datos (sin IA)</Badge>}
        </div>
      </div>
      {ai === false && <div className="mb-3"><Note>El coach con IA requiere una clave de Anthropic en el servidor (<code>ANTHROPIC_API_KEY</code>), que no está configurada. Mientras tanto respondo preguntas frecuentes con cálculos deterministas sobre tus registros, sin generar texto con IA.</Note></div>}
      <div className="flex-1 space-y-3 overflow-y-auto pb-2" aria-live="polite">
        {chat.length === 0 && (
          <div className="flex flex-col items-center py-6 text-center">
            <p className="text-sm text-soft">Hola {profile?.displayName.split(' ')[0]}. Pregúntame por tu entrenamiento, tu alimentación o tu progreso. Siempre consulto tus datos antes de responder.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">{SUGGESTIONS.map((s) => <button key={s} className="chip hover:border-lime" onClick={() => ask(s)}>{s}</button>)}</div>
          </div>
        )}
        {chat.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${m.role === 'user' ? 'bg-lime text-ink' : m.error ? 'border border-warn/40 bg-surface' : 'bg-surface'}`}>
              <Rich text={m.text} />
              {m.tools && m.tools.length > 0 && <p className="mt-2 text-[10px] text-muted">Datos consultados: {[...new Set(m.tools)].map((t) => TOOL_LABEL[t] ?? t).join(', ')}</p>}
            </div>
          </div>
        ))}
        {busy && <div className="flex items-center gap-2 text-xs text-muted"><Mascot mood="coach" size={28} float /> Revisando tus datos…</div>}
        <div ref={end} />
      </div>
      <form className="flex gap-2 border-t border-line/60 pt-3" onSubmit={(e) => { e.preventDefault(); void ask(text) }}>
        <input className="input" placeholder="Escribe tu pregunta…" value={text} onChange={(e) => setText(e.target.value)} aria-label="Pregunta para el coach" />
        <button className="btn-primary" disabled={busy || !text.trim()} aria-label="Enviar"><Send size={16} /></button>
      </form>
      <p className="mt-2 text-center text-[10px] text-muted">Orientación general basada en tus datos; no sustituye a profesionales de la salud.</p>
    </div>
  )
}

/** Negritas **así** sin interpretar HTML (evita inyección). */
function Rich({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : <span key={i}>{p}</span>))}</>
}
