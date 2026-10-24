// Ejecuta supabase/migrations/0001_schema.sql en PGlite (Postgres embebido) con stubs mínimos de Supabase
// (auth.users, auth.uid(), storage) y comprueba RLS con dos usuarios. No sustituye una prueba en Supabase real.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

const db = new PGlite()
const u1 = '11111111-1111-4111-8111-111111111111', u2 = '22222222-2222-4222-8222-222222222222'
await db.exec(`
  create schema auth; create schema storage;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.sub', true), '')::uuid $$;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
  create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
  alter table storage.objects enable row level security;
  create role authenticated; grant usage on schema public, auth to authenticated;
  insert into auth.users values ('${u1}'), ('${u2}');
`)
try {
  await db.exec(readFileSync('supabase/migrations/0001_schema.sql', 'utf8'))
} catch (e) {
  console.error('Error en la migración:', e.message, e.where ?? '')
  process.exit(1)
}
console.log('ok - migración aplicada sin errores')
await db.exec(`grant all on all tables in schema public to authenticated; grant all on all sequences in schema public to authenticated;`)
const as = async (uid, sql, params) => { await db.exec(`set role authenticated; set request.jwt.sub = '${uid}';`); try { return await db.query(sql, params) } finally { await db.exec('reset role;') } }
const ok = (c, m) => { if (!c) { console.error('FALLO:', m); process.exitCode = 1 } else console.log('ok -', m) }

const sess = (id, uid, updated) => ({ id, userId: uid, date: '2026-10-24', status: 'completed', startedAt: '2026-10-24T10:00:00Z', updatedAt: updated, exercises: [{ exerciseId: 'mw-barbell-bench-press', exerciseName: 'Press', config: { repMin: 8, repMax: 12, rirMin: 1, rirMax: 3, increment: 2.5 }, sets: [{ id: 's1', kind: 'working', weightKg: 40, reps: 10, rir: 2, done: true }, { id: 's2', kind: 'working', weightKg: 40, reps: 9, rir: 2, done: true }] }] })
const sid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
await as(u1, `insert into workout_sessions (id, user_id, payload, updated_at) values ($1, $2, $3, $4)`, [sid, u1, sess(sid, u1, '2026-10-24T11:00:00Z'), '2026-10-24T11:00:00Z'])
ok((await as(u1, 'select count(*)::int n from workout_sets')).rows[0].n === 2, 'trigger expande series normalizadas (workout_sets)')
ok((await as(u1, 'select session_date from workout_sessions')).rows[0].session_date != null, 'columnas tipadas rellenadas desde payload')
ok((await as(u2, 'select count(*)::int n from workout_sessions')).rows[0].n === 0, 'RLS: otro usuario no ve la sesión')
ok((await as(u2, 'select count(*)::int n from workout_sets')).rows[0].n === 0, 'RLS: otro usuario no ve las series')
let denied = false
try { await as(u2, `insert into body_weight_logs (id, user_id, payload) values (gen_random_uuid(), $1, '{}')`, [u1]) } catch { denied = true }
ok(denied, 'RLS: no se puede insertar a nombre de otro usuario')
const upd = await as(u2, `update workout_sessions set payload = '{}' where id = $1 returning id`, [sid])
ok(upd.rows.length === 0, 'RLS: no se puede modificar la fila de otro usuario')
await as(u1, `update workout_sessions set payload = $2, updated_at = $3 where id = $1`, [sid, sess(sid, u1, '2026-10-24T09:00:00Z'), '2026-10-24T09:00:00Z'])
ok((await as(u1, 'select updated_at from workout_sessions')).rows[0].updated_at.toISOString() === '2026-10-24T11:00:00.000Z', 'last-write-wins: una escritura más antigua no sobrescribe')
denied = false
try { await as(u1, `insert into body_weight_logs (id, user_id, payload) values (gen_random_uuid(), $1, $2)`, [u1, { userId: u2, kg: 80, date: '2026-10-24' }]) } catch { denied = true }
ok(denied, 'payload.userId debe coincidir con user_id')
await as(u1, `insert into food_log_items (id, user_id, payload) values (gen_random_uuid(), $1, $2)`, [u1, { userId: u1, date: '2026-10-24', meal: 'comida', foodId: 'mx-70', foodName: 'Pechuga', grams: 150, per100g: { kcal: 165, protein: 31, carbs: 0, fat: 3.6 } }])
const fl = (await as(u1, 'select kcal, protein_g from food_logs')).rows[0]
ok(Math.abs(Number(fl.kcal) - 247.5) < 0.01 && Math.abs(Number(fl.protein_g) - 46.5) < 0.01, 'vista food_logs calcula 150 g → 247.5 kcal, 46.5 g proteína')
ok((await as(u2, 'select count(*)::int n from food_logs')).rows[0].n === 0, 'RLS en vista food_logs (security_invoker)')
