import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { OutboxOp, SyncTable } from '../db/db'
import type { Remote, RemoteRow } from './engine'

// Configuración pública (URL + anon key). Es seguro exponerla: la seguridad la dan las políticas RLS.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = Boolean(url && anon)
export const supabase: SupabaseClient | null = supabaseConfigured ? createClient(url!, anon!, { auth: { persistSession: true } }) : null

/** Tabla local → tabla de Postgres (ver supabase/migrations/0001_schema.sql). */
export const REMOTE_TABLE: Record<SyncTable, string> = {
  profiles: 'profiles', preferences: 'user_preferences', targets: 'fitness_goals', foodLogs: 'food_log_items',
  recipes: 'recipes', favorites: 'favorite_foods', customFoods: 'food_items', weights: 'body_weight_logs',
  measurements: 'body_measurements', recovery: 'recovery_logs', water: 'water_logs', steps: 'step_logs',
  plans: 'workout_plans', sessions: 'workout_sessions', prs: 'personal_records', recommendations: 'coaching_recommendations',
  achievements: 'achievement_logs', plannedMeals: 'planned_meals',
}

/**
 * Cada tabla remota guarda columnas tipadas (rellenadas por triggers) y el registro completo en `payload`.
 * Las tablas hijas normalizadas (workout_exercises, workout_sets, recipe_ingredients, workout_days, food_logs)
 * se derivan en el servidor por trigger; el cliente solo escribe la fila raíz.
 */
export function supabaseRemote(client: SupabaseClient): Remote {
  return {
    async push(userId, ops: OutboxOp[]) {
      const acked: string[] = []
      const failed: { opId: string; error: string }[] = []
      const byTable = new Map<SyncTable, OutboxOp[]>()
      for (const op of ops) byTable.set(op.table, [...(byTable.get(op.table) ?? []), op])
      for (const [t, list] of byTable) {
        const rows = list.map((op) => {
          const p = op.payload as { id: string; updatedAt: string; createdAt: string; deletedAt?: string | null }
          return { id: p.id, user_id: userId, payload: p, created_at: p.createdAt, updated_at: p.updatedAt, deleted_at: p.deletedAt ?? null }
        })
        const { error } = await client.from(REMOTE_TABLE[t]).upsert(rows, { onConflict: 'id' })
        if (error) for (const op of list) failed.push({ opId: op.opId, error: error.message })
        else acked.push(...list.map((o) => o.opId))
      }
      return { acked, failed }
    },
    async pull(userId, since) {
      const out: RemoteRow[] = []
      for (const [t, remote] of Object.entries(REMOTE_TABLE) as [SyncTable, string][]) {
        let q = client.from(remote).select('payload, updated_at').eq('user_id', userId)
        if (since) q = q.gt('updated_at', since)
        const { data, error } = await q.limit(5000)
        if (error) throw new Error(`${remote}: ${error.message}`)
        for (const d of data ?? []) out.push({ table: t, row: d.payload })
      }
      return out
    },
  }
}
