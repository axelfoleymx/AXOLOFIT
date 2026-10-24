import { beforeEach, describe, expect, it } from 'vitest'
import { AthletiqDB, _setDb, db, exportUserData, purgeUser, repo } from './db'
import { SyncEngine, type Remote, type RemoteRow } from '../sync/engine'
import { hashPassword, validateCredentials } from '../auth'
import { normalizeOFF, normalizeUSDA, rankByName } from '../providers/foods'
import type { WeightLog } from '../types'

let n = 0
beforeEach(() => _setDb(new AthletiqDB(`test-${n++}`)))

const weight = (kg: number, date = '2026-10-23') => ({ date, kg, origin: 'user' as const })

describe('persistencia', () => {
  it('guarda y recupera registros', async () => {
    const w = await repo.put('weights', 'u1', weight(80))
    expect((await repo.get('weights', 'u1', w.id))!.kg).toBe(80)
    const fresh = new AthletiqDB(db.name) // simula recargar la app
    expect((await fresh.weights.get(w.id))!.kg).toBe(80)
  })
  it('editar conserva createdAt y actualiza updatedAt', async () => {
    const w = await repo.put('weights', 'u1', weight(80))
    await new Promise((r) => setTimeout(r, 5))
    const e = await repo.put('weights', 'u1', { ...w, kg: 79.5 })
    expect(e.createdAt).toBe(w.createdAt)
    expect(e.updatedAt > w.updatedAt).toBe(true)
  })
  it('borrado lógico oculta el registro', async () => {
    const w = await repo.put('weights', 'u1', weight(80))
    await repo.remove('weights', 'u1', w.id)
    expect(await repo.list('weights', 'u1')).toHaveLength(0)
  })
  it('consulta por rango de fechas', async () => {
    await repo.put('weights', 'u1', weight(80, '2026-10-01'))
    await repo.put('weights', 'u1', weight(79, '2026-10-15'))
    expect(await repo.byDate('weights', 'u1', '2026-10-10', '2026-10-31')).toHaveLength(1)
  })
})

describe('aislamiento entre usuarios', () => {
  it('un usuario no lee datos de otro', async () => {
    const w = await repo.put('weights', 'u1', weight(80))
    expect(await repo.list('weights', 'u2')).toHaveLength(0)
    expect(await repo.get('weights', 'u2', w.id)).toBeUndefined()
  })
  it('un usuario no puede sobrescribir ni borrar filas ajenas', async () => {
    const w = await repo.put('weights', 'u1', weight(80))
    await expect(repo.put('weights', 'u2', { ...w, kg: 1 })).rejects.toThrow(/Acceso denegado/)
    await expect(repo.remove('weights', 'u2', w.id)).rejects.toThrow(/Acceso denegado/)
    expect((await repo.get('weights', 'u1', w.id))!.kg).toBe(80)
  })
  it('el servidor no puede inyectar filas de otro usuario', async () => {
    const r = await repo.applyRemote('weights', 'u1', { id: 'x', userId: 'u2', createdAt: '', updatedAt: '', ...weight(1) } as WeightLog)
    expect(r).toBe('rejected')
  })
  it('exportar y purgar solo afecta al usuario', async () => {
    await repo.put('weights', 'u1', weight(80))
    await repo.put('weights', 'u2', weight(70))
    expect(((await exportUserData('u1')).weights as unknown[]).length).toBe(1)
    await purgeUser('u1')
    expect(await repo.list('weights', 'u1')).toHaveLength(0)
    expect(await repo.list('weights', 'u2')).toHaveLength(1)
  })
})

class FakeRemote implements Remote {
  store = new Map<string, RemoteRow>()
  pushes = 0
  failNext = false
  async push(_u: string, ops: Parameters<Remote['push']>[1]) {
    this.pushes++
    if (this.failNext) {
      this.failNext = false
      throw new Error('Network error')
    }
    for (const op of ops) {
      const p = op.payload as RemoteRow['row']
      const cur = this.store.get(op.rowId)
      if (!cur || cur.row.updatedAt <= p.updatedAt) this.store.set(op.rowId, { table: op.table, row: p })
    }
    return { acked: ops.map((o) => o.opId), failed: [] }
  }
  async pull(_u: string, since: string | null) {
    return [...this.store.values()].filter((r) => !since || r.row.updatedAt > since)
  }
}

describe('sincronización', () => {
  it('sin backend: modo solo local y cola visible', async () => {
    await repo.put('weights', 'u1', weight(80))
    const e = new SyncEngine(null, 'u1', () => true)
    const s = await e.run()
    expect(s.status).toBe('local_only')
    expect(s.pending).toBe(1)
  })
  it('coalesce ediciones y vacía la cola', async () => {
    const remote = new FakeRemote()
    const w = await repo.put('weights', 'u1', weight(80))
    await repo.put('weights', 'u1', { ...w, kg: 79 })
    await repo.put('weights', 'u1', { ...w, kg: 78 })
    const e = new SyncEngine(remote, 'u1', () => true)
    const s = await e.run()
    expect(s.status).toBe('idle')
    expect(s.pending).toBe(0)
    expect(remote.store.size).toBe(1)
    expect((remote.store.get(w.id)!.row as unknown as WeightLog).kg).toBe(78)
  })
  it('sin conexión conserva la cola; al reconectar sincroniza', async () => {
    const remote = new FakeRemote()
    let online = false
    await repo.put('weights', 'u1', weight(80))
    const e = new SyncEngine(remote, 'u1', () => online)
    expect((await e.run()).status).toBe('offline')
    expect(remote.pushes).toBe(0)
    online = true
    expect((await e.run()).pending).toBe(0)
  })
  it('error de red: no pierde datos y reporta el error', async () => {
    const remote = new FakeRemote()
    remote.failNext = true
    await repo.put('weights', 'u1', weight(80))
    const e = new SyncEngine(remote, 'u1', () => true)
    const s = await e.run()
    expect(s.status).toBe('error')
    expect(s.pending).toBe(1)
    expect((await e.run()).pending).toBe(0)
  })
  it('reenviar no duplica (idempotente por id)', async () => {
    const remote = new FakeRemote()
    const w = await repo.put('weights', 'u1', weight(80))
    const e = new SyncEngine(remote, 'u1', () => true)
    await e.run()
    await repo.put('weights', 'u1', { ...w })
    await e.run()
    expect(remote.store.size).toBe(1)
  })
  it('conflicto: la versión más reciente gana en ambos lados', async () => {
    const remote = new FakeRemote()
    const w = await repo.put('weights', 'u1', weight(80))
    remote.store.set(w.id, { table: 'weights', row: { ...w, kg: 81, updatedAt: '2099-01-01T00:00:00Z' } as never })
    const e = new SyncEngine(remote, 'u1', () => true)
    await e.run()
    expect((await repo.get('weights', 'u1', w.id))!.kg).toBe(81)
  })
})

describe('auth y proveedores', () => {
  it('hash de contraseña determinista con sal y validación', async () => {
    const a = await hashPassword('secreto123')
    expect((await hashPassword('secreto123', a.salt)).hash).toBe(a.hash)
    expect((await hashPassword('otro12345', a.salt)).hash).not.toBe(a.hash)
    expect(validateCredentials('mal', '12345678')).toMatch(/correo/)
    expect(validateCredentials('a@b.co', '123')).toMatch(/8/)
  })
  it('normaliza Open Food Facts (kJ → kcal y sodio a mg)', () => {
    const f = normalizeOFF({ product_name: 'Yogurt', brands: 'Lala', nutriments: { 'energy-kj_100g': 418.4, proteins_100g: 3, carbohydrates_100g: 12, fat_100g: 2, sodium_100g: 0.05 } }, '7501020569407')!
    expect(f.per100g.kcal).toBeCloseTo(100)
    expect(f.per100g.sodiumMg).toBeCloseTo(50)
    expect(f.quality).toBe('imported')
    expect(normalizeOFF({ product_name: 'X', nutriments: {} }, '1')!.quality).toBe('incomplete')
  })
  it('normaliza USDA', () => {
    const f = normalizeUSDA({ fdcId: 1, description: 'Chicken breast', foodNutrients: [{ nutrientId: 1008, value: 120 }, { nutrientId: 1003, value: 22.5 }, { nutrientId: 1005, value: 0 }, { nutrientId: 1004, value: 2.6 }] })
    expect(f.per100g.protein).toBe(22.5)
    expect(f.quality).toBe('verified')
  })
  it('búsqueda insensible a acentos', () => {
    const r = rankByName([{ name: 'Plátano macho' }, { name: 'Pan de plátano' }, { name: 'Arroz' }], 'platano')
    expect(r.map((x) => x.name)).toEqual(['Plátano macho', 'Pan de plátano'])
  })
})
