import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { coachStep, health, usdaSearch, type ServerEnv } from './handlers.ts'

const readBody = (req: IncomingMessage) =>
  new Promise<string>((resolve, reject) => {
    let data = ''
    req.on('data', (c) => {
      data += c
      if (data.length > 2_000_000) reject(new Error('too_large'))
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })

const send = (res: ServerResponse, status: number, json: unknown) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(json))
}

/** Expone /api/* en `vite dev` y `vite preview` para que las claves privadas permanezcan en el servidor. */
export function serverApiPlugin(env: ServerEnv): Plugin {
  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (!url.pathname.startsWith('/api/')) return next()
    try {
      if (url.pathname === '/api/health') return send(res, 200, health(env))
      if (url.pathname === '/api/coach' && req.method === 'POST') {
        const r = await coachStep(env, JSON.parse((await readBody(req)) || '{}'))
        return send(res, r.status, r.json)
      }
      if (url.pathname === '/api/usda/search') {
        const r = await usdaSearch(env, url.searchParams.get('q') ?? '')
        return send(res, r.status, r.json)
      }
      return send(res, 404, { error: 'not_found' })
    } catch {
      return send(res, 500, { error: 'server_error' })
    }
  }
  return {
    name: 'athletiq-server-api',
    configureServer: (s) => void s.middlewares.use(handler),
    configurePreviewServer: (s) => void s.middlewares.use(handler),
  }
}
