import Dexie, { type Table } from 'dexie'
import type {
  AchievementLog, BaseRow, BodyMeasurement, CoachingRecommendation, CustomFood, FavoriteFood, FoodLogItem, NutritionTargets,
  PersonalRecord, PlannedMeal, Preferences, Profile, ProgressPhoto, Recipe, RecoveryLog, StepLog, WaterLog, WeightLog,
  WorkoutPlan, WorkoutSession,
} from '../types'

export interface LocalAccount {
  id: string
  email: string
  displayName: string
  passwordHash: string
  salt: string
  createdAt: string
}

export interface OutboxOp {
  seq?: number
  opId: string
  userId: string
  table: SyncTable
  rowId: string
  op: 'upsert' | 'delete'
  payload: unknown
  ts: string
  attempts: number
  lastError?: string | null
}

export interface MetaRow { key: string; value: unknown }

/** Tablas con datos del usuario que se sincronizan con el servidor. */
export const SYNC_TABLES = [
  'profiles', 'preferences', 'targets', 'foodLogs', 'recipes', 'favorites', 'customFoods', 'weights', 'measurements',
  'recovery', 'water', 'steps', 'plans', 'sessions', 'prs', 'recommendations', 'achievements', 'plannedMeals',
] as const
export type SyncTable = (typeof SYNC_TABLES)[number]

export class AthletiqDB extends Dexie {
  accounts!: Table<LocalAccount, string>
  profiles!: Table<Profile, string>
  preferences!: Table<Preferences, string>
  targets!: Table<NutritionTargets, string>
  foodLogs!: Table<FoodLogItem, string>
  recipes!: Table<Recipe, string>
  favorites!: Table<FavoriteFood, string>
  customFoods!: Table<CustomFood, string>
  weights!: Table<WeightLog, string>
  measurements!: Table<BodyMeasurement, string>
  photos!: Table<ProgressPhoto, string>
  recovery!: Table<RecoveryLog, string>
  water!: Table<WaterLog, string>
  steps!: Table<StepLog, string>
  plans!: Table<WorkoutPlan, string>
  sessions!: Table<WorkoutSession, string>
  prs!: Table<PersonalRecord, string>
  recommendations!: Table<CoachingRecommendation, string>
  achievements!: Table<AchievementLog, string>
  plannedMeals!: Table<PlannedMeal, string>
  outbox!: Table<OutboxOp, number>
  meta!: Table<MetaRow, string>

  constructor(name = 'athletiq') {
    super(name)
    this.version(1).stores({
      accounts: 'id, &email',
      profiles: 'id, userId',
      preferences: 'id, userId',
      targets: 'id, userId, validFrom',
      foodLogs: 'id, userId, [userId+date], foodId, createdAt',
      recipes: 'id, userId',
      favorites: 'id, userId',
      customFoods: 'id, userId, barcode',
      weights: 'id, userId, [userId+date]',
      measurements: 'id, userId, [userId+date]',
      photos: 'id, userId, [userId+date]',
      recovery: 'id, userId, [userId+date]',
      water: 'id, userId, [userId+date]',
      steps: 'id, userId, [userId+date]',
      plans: 'id, userId',
      sessions: 'id, userId, [userId+date], status',
      prs: 'id, userId, exerciseId',
      recommendations: 'id, userId, subjectId, status',
      achievements: 'id, userId, key',
      plannedMeals: 'id, userId, [userId+date]',
      outbox: '++seq, userId, opId, table',
      meta: 'key',
    })
  }
}

export let db = new AthletiqDB()
/** Solo para pruebas: base de datos aislada. */
export function _setDb(d: AthletiqDB) {
  db = d
}

export const uid = () => crypto.randomUUID()
export const nowIso = () => new Date().toISOString()

export type Row<T extends SyncTable> = AthletiqDB[T] extends Table<infer R, string> ? R : never
export type NewRow<T extends SyncTable> = Omit<Row<T>, keyof BaseRow> & Partial<Pick<BaseRow, 'id' | 'createdAt'>>

const table = <T extends SyncTable>(t: T) => db[t] as unknown as Table<Row<T> & BaseRow, string>

/**
 * Repositorio con aislamiento por usuario: todas las lecturas filtran por userId y toda escritura
 * comprueba la propiedad de la fila y la encola para sincronización en la misma transacción.
 */
export const repo = {
  async list<T extends SyncTable>(t: T, userId: string, where?: (r: Row<T>) => boolean): Promise<Row<T>[]> {
    const rows = await table(t).where('userId').equals(userId).toArray()
    return rows.filter((r) => !r.deletedAt && (!where || where(r as Row<T>))) as Row<T>[]
  },

  async byDate<T extends SyncTable>(t: T, userId: string, from: string, to: string): Promise<Row<T>[]> {
    const rows = await table(t).where('[userId+date]').between([userId, from], [userId, to], true, true).toArray()
    return rows.filter((r) => !r.deletedAt) as Row<T>[]
  },

  async get<T extends SyncTable>(t: T, userId: string, id: string): Promise<Row<T> | undefined> {
    const r = await table(t).get(id)
    return r && r.userId === userId && !r.deletedAt ? (r as Row<T>) : undefined
  },

  async put<T extends SyncTable>(t: T, userId: string, data: NewRow<T> | Row<T>): Promise<Row<T>> {
    if (!userId) throw new Error('Sin sesión')
    return db.transaction('rw', [table(t), db.outbox], async () => {
      const id = (data as BaseRow).id ?? uid()
      const existing = await table(t).get(id)
      if (existing && existing.userId !== userId) throw new Error('Acceso denegado: el registro pertenece a otra cuenta')
      const ts = nowIso()
      const row = { ...(existing as object), ...(data as object), id, userId, createdAt: existing?.createdAt ?? (data as BaseRow).createdAt ?? ts, updatedAt: ts, deletedAt: null } as Row<T> & BaseRow
      await table(t).put(row)
      await db.outbox.add({ opId: uid(), userId, table: t, rowId: id, op: 'upsert', payload: row, ts, attempts: 0 })
      return row as Row<T>
    })
  },

  /** Borrado lógico (para sincronizar la eliminación); la purga física ocurre al borrar la cuenta. */
  async remove<T extends SyncTable>(t: T, userId: string, id: string) {
    return db.transaction('rw', [table(t), db.outbox], async () => {
      const existing = await table(t).get(id)
      if (!existing) return
      if (existing.userId !== userId) throw new Error('Acceso denegado: el registro pertenece a otra cuenta')
      const ts = nowIso()
      const row = { ...existing, deletedAt: ts, updatedAt: ts }
      await table(t).put(row)
      await db.outbox.add({ opId: uid(), userId, table: t, rowId: id, op: 'delete', payload: row, ts, attempts: 0 })
    })
  },

  /** Aplica una fila llegada del servidor sin generar operaciones de salida (last-write-wins por updatedAt). */
  async applyRemote<T extends SyncTable>(t: T, userId: string, remote: Row<T> & BaseRow) {
    if (remote.userId !== userId) return 'rejected' as const
    const local = await table(t).get(remote.id)
    if (local && local.updatedAt > remote.updatedAt) return 'kept_local' as const
    await table(t).put(remote)
    return 'applied' as const
  },
}

/** Exporta todos los datos del usuario (derecho de portabilidad). Las fotos se excluyen del JSON. */
export async function exportUserData(userId: string) {
  const out: Record<string, unknown> = { exportedAt: nowIso(), format: 'athletiq-export-v1' }
  for (const t of SYNC_TABLES) out[t] = await repo.list(t, userId)
  out.photos = (await db.photos.where('userId').equals(userId).toArray()).map(({ blob: _b, ...rest }) => rest)
  return out
}

/** Elimina físicamente todos los datos locales de un usuario. */
export async function purgeUser(userId: string) {
  await db.transaction('rw', [...SYNC_TABLES.map((t) => db[t]), db.photos, db.outbox, db.accounts], async () => {
    for (const t of SYNC_TABLES) await table(t).where('userId').equals(userId).delete()
    await db.photos.where('userId').equals(userId).delete()
    await db.outbox.where('userId').equals(userId).delete()
    await db.accounts.delete(userId)
  })
}
