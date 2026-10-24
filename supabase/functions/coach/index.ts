// Edge Function: proxy del coach IA. Requiere el secreto ANTHROPIC_API_KEY (supabase secrets set ANTHROPIC_API_KEY=...).
// Solo usuarios autenticados. El cliente ejecuta las herramientas sobre sus propios datos y reenvía los tool_result.
// ESTADO: escrita, no desplegada ni probada (no hay proyecto Supabase conectado).
import Anthropic from 'npm:@anthropic-ai/sdk@1'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { COACH_SYSTEM, COACH_TOOLS } from '../../../src/lib/coach/toolDefs.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info' }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return json(401, { error: 'unauthorized' })
  const key = Deno.env.get('ANTHROPIC_API_KEY')
  if (!key) return json(503, { error: 'coach_not_configured' })
  const { messages } = await req.json().catch(() => ({}))
  if (!Array.isArray(messages) || !messages.length || messages.length > 60) return json(400, { error: 'invalid_messages' })
  const client = new Anthropic({ apiKey: key })
  try {
    const r = await client.beta.messages.create({
      model: 'claude-opus-5-5', max_tokens: 16000, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      output_config: { effort: 'medium' }, system: [{ type: 'text', text: COACH_SYSTEM, cache_control: { type: 'ephemeral' } }],
      tools: COACH_TOOLS.map((t) => ({ ...t, strict: true })), tool_choice: { type: 'auto' }, messages,
    } as never)
    return json(200, { content: r.content, stop_reason: r.stop_reason, model: r.model })
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json(429, { error: 'rate_limited' })
    if (e instanceof Anthropic.APIError) return json(502, { error: 'api_error', status: e.status })
    return json(502, { error: 'network' })
  }
})
