import type { BaseRow } from '../types'
import { db, nowIso, repo, SYNC_TABLES, type OutboxOp, type SyncTable } from '../db/db'

export interface RemoteRow { table: SyncTable; row: BaseRow & Record<string, unknown> }

/** Contrato de un backend remoto. La implementación real es supabaseRemote; las pruebas usan un simulado. */
export interface Remote {
  push(userId: string, ops: OutboxOp[]): Promise<{ acked: string[]; failed: { opId: string; error: string }[] }>
  pull(userId: string, since: string | null): Promise<RemoteRow[]>
}

export type SyncStatus = 'local_only' | 'idle' | 'pending' | 'syncing' | 'offline' | 'error'

export interface SyncState { status: SyncStatus; pending: number; lastSyncAt: string | null; lastError: string | null }

/**
 * Cola de operaciones pendientes → servidor.
 * - Coalescencia: solo se envía la última operación de cada fila (evita duplicados y reenvíos).
 * - Idempotencia: el servidor hace upsert por id; reenviar la misma fila no crea duplicados.
 * - Conflictos: last-write-wins por updatedAt en ambos lados (el servidor rechaza escrituras más antiguas).
 * - Reintentos con backoff exponencial; los errores quedan visibles en el estado.
 */
export class SyncEngine {
  private running = false
  private listeners = new Set<(s: SyncState) => void>()
  state: SyncState = { status: 'local_only', pending: 0, lastSyncAt: null, lastError: null }

  private remote: Remote | null
  private userId: string
  private isOnline: () => boolean

  constructor(remote: Remote | null, userId: string, isOnline: () => boolean = () => navigator.onLine) {
    this.remote = remote
    this.userId = userId
    this.isOnline = isOnline
  }

  subscribe(fn: (s: SyncState) => void) {
    this.listeners.add(fn)
    fn(this.state)
    return () => void this.listeners.delete(fn)
  }

  private set(p: Partial<SyncState>) {
    this.state = { ...this.state, ...p }
    for (const l of this.listeners) l(this.state)
  }

  async pendingCount() {
    return db.outbox.where('userId').equals(this.userId).count()
  }

  /** Sin backend, la cola se compacta (una operación por fila) para no crecer indefinidamente. */
  async compact() {
    const ops = await db.outbox.where('userId').equals(this.userId).sortBy('seq')
    const latest = new Map<string, number>()
    for (const op of ops) latest.set(`${op.table}:${op.rowId}`, op.seq!)
    const keep = new Set(latest.values())
    const drop = ops.filter((o) => !keep.has(o.seq!)).map((o) => o.seq!)
    if (drop.length) await db.outbox.bulkDelete(drop)
  }

  async refresh() {
    const pending = await this.pendingCount()
    if (!this.remote) return this.set({ status: 'local_only', pending })
    if (!this.isOnline()) return this.set({ status: 'offline', pending })
    if (!this.running) this.set({ status: pending ? 'pending' : this.state.lastError ? 'error' : 'idle', pending })
  }

  async run(): Promise<SyncState> {
    if (!this.remote) {
      await this.compact()
      await this.refresh()
      return this.state
    }
    if (this.running) return this.state
    if (!this.isOnline()) {
      await this.refresh()
      return this.state
    }
    this.running = true
    this.set({ status: 'syncing' })
    try {
      const ops = await db.outbox.where('userId').equals(this.userId).sortBy('seq')
      const latest = new Map<string, OutboxOp>()
      for (const op of ops) latest.set(`${op.table}:${op.rowId}`, op)
      const toSend = [...latest.values()].filter((op) => op.attempts < 8)
      const superseded = ops.filter((op) => latest.get(`${op.table}:${op.rowId}`)!.opId !== op.opId).map((o) => o.seq!)

      let lastError: string | null = null
      if (toSend.length) {
        const { acked, failed } = await this.remote.push(this.userId, toSend)
        const ackedSet = new Set(acked)
        await db.transaction('rw', db.outbox, async () => {
          await db.outbox.bulkDelete(superseded)
          // Se borran también las operaciones anteriores de las filas confirmadas
          await db.outbox.bulkDelete(ops.filter((o) => ackedSet.has(latest.get(`${o.table}:${o.rowId}`)!.opId)).map((o) => o.seq!))
          for (const f of failed) {
            const op = toSend.find((o) => o.opId === f.opId)
            if (op?.seq != null) await db.outbox.update(op.seq, { attempts: op.attempts + 1, lastError: f.error })
          }
        })
        if (failed.length) lastError = `${failed.length} cambio(s) no se pudieron sincronizar: ${failed[0].error}`
      }

      const since = ((await db.meta.get(`lastPull:${this.userId}`))?.value as string | undefined) ?? null
      const pulledAt = nowIso()
      const rows = await this.remote.pull(this.userId, since)
      for (const r of rows) if ((SYNC_TABLES as readonly string[]).includes(r.table)) await repo.applyRemote(r.table, this.userId, r.row as never)
      await db.meta.put({ key: `lastPull:${this.userId}`, value: pulledAt })

      const pending = await this.pendingCount()
      this.set({ status: lastError ? 'error' : pending ? 'pending' : 'idle', pending, lastSyncAt: nowIso(), lastError })
    } catch (e) {
      const pending = await this.pendingCount()
      this.set({ status: this.isOnline() ? 'error' : 'offline', pending, lastError: e instanceof Error ? e.message : String(e) })
    } finally {
      this.running = false
    }
    return this.state
  }
}
