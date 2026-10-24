import Anthropic from '@anthropic-ai/sdk'
import { COACH_SYSTEM, COACH_TOOLS } from '../src/lib/coach/toolDefs.ts'

// Lógica de servidor compartida por el plugin de desarrollo de Vite. Las Edge Functions de Supabase
// (supabase/functions/*) replican esta misma lógica en Deno. Las claves viven solo aquí.

export interface ServerEnv { ANTHROPIC_API_KEY?: string; USDA_API_KEY?: string }

export function health(env: ServerEnv) {
  return { coach: Boolean(env.ANTHROPIC_API_KEY), usda: Boolean(env.USDA_API_KEY) }
}

const MAX_MESSAGES = 60

/**
 * Un paso del bucle de herramientas: el cliente envía el historial (append-only, incluidos los bloques del
 * asistente tal cual los devolvió la API) y recibe la siguiente respuesta. Si stop_reason es "tool_use",
 * el cliente ejecuta las herramientas sobre sus propios datos y vuelve a llamar con los tool_result.
 * El sistema y las herramientas se fijan aquí: el navegador no puede cambiarlos.
 */
export async function coachStep(env: ServerEnv, body: unknown) {
  if (!env.ANTHROPIC_API_KEY) return { status: 503, json: { error: 'coach_not_configured', message: 'Falta ANTHROPIC_API_KEY en el servidor.' } }
  const messages = (body as { messages?: unknown })?.messages
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES)
    return { status: 400, json: { error: 'invalid_messages' } }
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  try {
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      system: [{ type: 'text', text: COACH_SYSTEM, cache_control: { type: 'ephemeral' } }],
      tools: COACH_TOOLS.map((t) => ({ ...t, input_schema: t.input_schema as Anthropic.Beta.BetaTool.InputSchema, strict: true })),
      tool_choice: { type: 'auto' },
      messages: messages as Anthropic.Beta.BetaMessageParam[],
    } as Anthropic.Beta.MessageCreateParamsNonStreaming)
    return { status: 200, json: { content: response.content, stop_reason: response.stop_reason, model: response.model } }
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return { status: 502, json: { error: 'auth', message: 'Clave de Anthropic inválida.' } }
    if (error instanceof Anthropic.RateLimitError) return { status: 429, json: { error: 'rate_limited', message: 'Límite de uso alcanzado; intenta en un momento.' } }
    if (error instanceof Anthropic.BadRequestError) return { status: 400, json: { error: 'bad_request', message: error.message } }
    if (error instanceof Anthropic.APIError) return { status: 502, json: { error: 'api_error', message: `Error ${error.status}` } }
    return { status: 502, json: { error: 'network', message: 'No se pudo contactar al servicio de IA.' } }
  }
}

/** Búsqueda en USDA FoodData Central (requiere clave gratuita de api.data.gov). */
export async function usdaSearch(env: ServerEnv, q: string) {
  if (!env.USDA_API_KEY) return { status: 503, json: { error: 'usda_not_configured' } }
  if (!q || q.length > 100) return { status: 400, json: { error: 'invalid_query' } }
  const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search')
  url.searchParams.set('query', q)
  url.searchParams.set('pageSize', '20')
  url.searchParams.set('dataType', 'Foundation,SR Legacy,Survey (FNDDS),Branded')
  const res = await fetch(url, { headers: { 'X-Api-Key': env.USDA_API_KEY } })
  if (!res.ok) return { status: 502, json: { error: 'usda_error', status: res.status } }
  return { status: 200, json: await res.json() }
}
