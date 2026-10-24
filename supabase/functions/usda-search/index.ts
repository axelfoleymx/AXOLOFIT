// Edge Function: búsqueda en USDA FoodData Central con la clave USDA_API_KEY guardada como secreto.
// ESTADO: escrita, no desplegada ni probada.
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info' }
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  const q = new URL(req.url).searchParams.get('q') ?? ''
  const key = Deno.env.get('USDA_API_KEY')
  if (!key) return new Response(JSON.stringify({ error: 'usda_not_configured' }), { status: 503, headers: cors })
  if (!q || q.length > 100) return new Response(JSON.stringify({ error: 'invalid_query' }), { status: 400, headers: cors })
  const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search')
  url.searchParams.set('query', q)
  url.searchParams.set('pageSize', '20')
  const r = await fetch(url, { headers: { 'X-Api-Key': key } })
  return new Response(await r.text(), { status: r.ok ? 200 : 502, headers: { ...cors, 'Content-Type': 'application/json' } })
})
