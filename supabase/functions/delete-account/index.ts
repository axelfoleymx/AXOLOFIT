// Edge Function: elimina la cuenta del usuario autenticado y, por cascada (on delete cascade), todos sus datos.
// Usa SUPABASE_SERVICE_ROLE_KEY, que nunca sale del servidor. ESTADO: escrita, no desplegada ni probada.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info' }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  const auth = req.headers.get('Authorization') ?? ''
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return new Response('unauthorized', { status: 401, headers: cors })
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: files } = await admin.storage.from('progress-photos').list(user.id)
  if (files?.length) await admin.storage.from('progress-photos').remove(files.map((f) => `${user.id}/${f.name}`))
  const { error } = await admin.auth.admin.deleteUser(user.id)
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors })
  return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } })
})
