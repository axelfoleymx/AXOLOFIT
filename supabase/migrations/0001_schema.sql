-- ATHLETIQ · esquema inicial (PostgreSQL / Supabase)
-- Cada tabla de usuario guarda columnas tipadas para consultas + `payload` (registro completo del cliente,
-- usado por la sincronización). Las tablas hijas normalizadas se derivan por trigger.
-- RLS estricta: cada usuario solo lee y escribe sus propias filas.
-- ESTADO: escrito pero NO aplicado ni probado contra un proyecto real (no hay credenciales en este entorno).

-- gen_random_uuid() es nativa desde PostgreSQL 13 (no requiere pgcrypto).

-- ---------- Tablas raíz sincronizadas (columnas comunes) ----------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','user_preferences','fitness_goals','food_log_items','recipes','favorite_foods','food_items',
    'body_weight_logs','body_measurements','recovery_logs','water_logs','step_logs','workout_plans',
    'workout_sessions','personal_records','coaching_recommendations','achievement_logs','planned_meals'
  ] loop
    execute format($f$
      create table if not exists public.%1$I (
        id uuid primary key,
        user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
        payload jsonb not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        deleted_at timestamptz
      );
      create index if not exists %1$s_user_updated on public.%1$I (user_id, updated_at);
      alter table public.%1$I enable row level security;
      drop policy if exists "own rows select" on public.%1$I;
      drop policy if exists "own rows insert" on public.%1$I;
      drop policy if exists "own rows update" on public.%1$I;
      drop policy if exists "own rows delete" on public.%1$I;
      create policy "own rows select" on public.%1$I for select using (user_id = auth.uid());
      create policy "own rows insert" on public.%1$I for insert with check (user_id = auth.uid());
      create policy "own rows update" on public.%1$I for update using (user_id = auth.uid()) with check (user_id = auth.uid());
      create policy "own rows delete" on public.%1$I for delete using (user_id = auth.uid());
    $f$, t);
  end loop;
end $$;

-- El catálogo global de alimentos (user_id null) es de solo lectura para todos los usuarios autenticados.
alter table public.food_items alter column user_id drop not null;
drop policy if exists "own rows select" on public.food_items;
create policy "own or global select" on public.food_items for select using (user_id = auth.uid() or user_id is null);

-- Last-write-wins en servidor: rechaza (ignora) actualizaciones con updated_at más antiguo que el almacenado,
-- y comprueba que el payload pertenezca al mismo usuario.
create or replace function public.athletiq_guard_write() returns trigger language plpgsql as $$
begin
  if new.payload ? 'userId' and (new.payload->>'userId')::uuid is distinct from new.user_id then
    raise exception 'payload.userId no coincide con user_id';
  end if;
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return old; -- versión del servidor más reciente: se conserva
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','user_preferences','fitness_goals','food_log_items','recipes','favorite_foods','food_items',
    'body_weight_logs','body_measurements','recovery_logs','water_logs','step_logs','workout_plans',
    'workout_sessions','personal_records','coaching_recommendations','achievement_logs','planned_meals'
  ] loop
    execute format('drop trigger if exists guard_write on public.%1$I; create trigger guard_write before insert or update on public.%1$I for each row execute function public.athletiq_guard_write();', t);
  end loop;
end $$;

-- ---------- Columnas tipadas (rellenadas desde payload) ----------
alter table public.food_log_items
  add column if not exists log_date date, add column if not exists meal text, add column if not exists food_id text,
  add column if not exists food_name text, add column if not exists grams numeric, add column if not exists source text,
  add column if not exists kcal numeric, add column if not exists protein_g numeric, add column if not exists carbs_g numeric, add column if not exists fat_g numeric;
alter table public.body_weight_logs add column if not exists log_date date, add column if not exists kg numeric, add column if not exists origin text;
alter table public.body_measurements add column if not exists log_date date, add column if not exists waist_cm numeric;
alter table public.workout_sessions add column if not exists session_date date, add column if not exists status text, add column if not exists started_at timestamptz, add column if not exists ended_at timestamptz;
alter table public.recovery_logs add column if not exists log_date date, add column if not exists sleep_hours numeric;
alter table public.water_logs add column if not exists log_date date, add column if not exists ml numeric;
alter table public.step_logs add column if not exists log_date date, add column if not exists steps integer, add column if not exists origin text;
alter table public.fitness_goals add column if not exists kcal integer, add column if not exists protein_g integer, add column if not exists valid_from date, add column if not exists mode text;

create or replace function public.athletiq_typed_columns() returns trigger language plpgsql as $$
declare p jsonb := new.payload; f numeric;
begin
  case tg_table_name
    when 'food_log_items' then
      f := coalesce((p->>'grams')::numeric, 0) / 100;
      new.log_date := (p->>'date')::date; new.meal := p->>'meal'; new.food_id := p->>'foodId'; new.food_name := p->>'foodName';
      new.grams := (p->>'grams')::numeric; new.source := p->>'source';
      new.kcal := (p->'per100g'->>'kcal')::numeric * f; new.protein_g := (p->'per100g'->>'protein')::numeric * f;
      new.carbs_g := (p->'per100g'->>'carbs')::numeric * f; new.fat_g := (p->'per100g'->>'fat')::numeric * f;
    when 'body_weight_logs' then new.log_date := (p->>'date')::date; new.kg := (p->>'kg')::numeric; new.origin := p->>'origin';
    when 'body_measurements' then new.log_date := (p->>'date')::date; new.waist_cm := (p->>'waistCm')::numeric;
    when 'workout_sessions' then new.session_date := (p->>'date')::date; new.status := p->>'status'; new.started_at := (p->>'startedAt')::timestamptz; new.ended_at := (p->>'endedAt')::timestamptz;
    when 'recovery_logs' then new.log_date := (p->>'date')::date; new.sleep_hours := (p->>'sleepHours')::numeric;
    when 'water_logs' then new.log_date := (p->>'date')::date; new.ml := (p->>'ml')::numeric;
    when 'step_logs' then new.log_date := (p->>'date')::date; new.steps := (p->>'steps')::integer; new.origin := p->>'origin';
    when 'fitness_goals' then new.kcal := (p->>'kcal')::integer; new.protein_g := (p->>'proteinG')::integer; new.valid_from := (p->>'validFrom')::date; new.mode := p->>'mode';
    else null;
  end case;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['food_log_items','body_weight_logs','body_measurements','workout_sessions','recovery_logs','water_logs','step_logs','fitness_goals'] loop
    execute format('drop trigger if exists typed_columns on public.%1$I; create trigger typed_columns before insert or update on public.%1$I for each row execute function public.athletiq_typed_columns();', t);
  end loop;
end $$;

-- ---------- Tablas hijas normalizadas (solo lectura para el cliente; las escribe el trigger) ----------
create table if not exists public.workout_exercises (
  id bigserial primary key, session_id uuid not null references public.workout_sessions(id) on delete cascade,
  user_id uuid not null, position int not null, exercise_id text not null, exercise_name text,
  rep_min int, rep_max int, rir_min int, rir_max int, increment_kg numeric, technique_note text, pain_note text
);
create table if not exists public.workout_sets (
  id text primary key, workout_exercise_id bigint not null references public.workout_exercises(id) on delete cascade,
  user_id uuid not null, position int not null, kind text not null check (kind in ('warmup','working')),
  weight_kg numeric, reps int, rir numeric, rpe numeric, done boolean not null default false, pain boolean, completed_at timestamptz
);
create table if not exists public.workout_days (
  id bigserial primary key, plan_id uuid not null references public.workout_plans(id) on delete cascade,
  user_id uuid not null, day_key text not null, name text, focus text, exercises jsonb
);
create table if not exists public.recipe_ingredients (
  id bigserial primary key, recipe_id uuid not null references public.recipes(id) on delete cascade,
  user_id uuid not null, food_id text not null, food_name text, grams numeric not null check (grams > 0)
);
create table if not exists public.food_brands (id bigserial primary key, name text unique not null);
create table if not exists public.exercises (
  id text primary key, name text not null, primary_muscles text[] not null, secondary_muscles text[] not null default '{}',
  equipment text not null, pattern text, mechanic text, difficulty text, source text not null, source_url text
);
create table if not exists public.exercise_substitutions (exercise_id text references public.exercises(id), substitute_id text references public.exercises(id), primary key (exercise_id, substitute_id));
create table if not exists public.recommendation_feedback (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  recommendation_id uuid references public.coaching_recommendations(id) on delete cascade, accepted boolean, comment text, created_at timestamptz default now()
);
create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  provider text not null check (provider in ('healthkit','health_connect','openfoodfacts','usda')), status text not null default 'disconnected',
  scopes text[] default '{}', last_sync_at timestamptz, created_at timestamptz default now(), unique (user_id, provider)
);
-- food_logs: cabecera por día y tiempo de comida (vista derivada de food_log_items)
create or replace view public.food_logs with (security_invoker = true) as
  select user_id, log_date, meal, count(*) as items, sum(kcal) as kcal, sum(protein_g) as protein_g, sum(carbs_g) as carbs_g, sum(fat_g) as fat_g
  from public.food_log_items where deleted_at is null group by user_id, log_date, meal;

do $$
declare t text;
begin
  foreach t in array array['workout_exercises','workout_sets','workout_days','recipe_ingredients','recommendation_feedback','integrations'] loop
    execute format('alter table public.%1$I enable row level security; drop policy if exists "own select" on public.%1$I; create policy "own select" on public.%1$I for select using (user_id = auth.uid());', t);
  end loop;
  execute 'drop policy if exists "own write" on public.recommendation_feedback; create policy "own write" on public.recommendation_feedback for insert with check (user_id = auth.uid())';
  execute 'drop policy if exists "own write" on public.integrations; create policy "own write" on public.integrations for all using (user_id = auth.uid()) with check (user_id = auth.uid())';
end $$;
alter table public.exercises enable row level security;
alter table public.exercise_substitutions enable row level security;
alter table public.food_brands enable row level security;
create policy "public read" on public.exercises for select using (true);
create policy "public read" on public.exercise_substitutions for select using (true);
create policy "public read" on public.food_brands for select using (true);

create or replace function public.athletiq_expand_children() returns trigger language plpgsql security definer set search_path = public as $$
declare e jsonb; s jsonb; i int; j int; we_id bigint; d jsonb;
begin
  if tg_table_name = 'workout_sessions' then
    delete from workout_exercises where session_id = new.id;
    if new.deleted_at is null then
      i := 0;
      for e in select * from jsonb_array_elements(coalesce(new.payload->'exercises', '[]')) loop
        insert into workout_exercises (session_id, user_id, position, exercise_id, exercise_name, rep_min, rep_max, rir_min, rir_max, increment_kg, technique_note, pain_note)
        values (new.id, new.user_id, i, e->>'exerciseId', e->>'exerciseName', (e->'config'->>'repMin')::int, (e->'config'->>'repMax')::int,
                (e->'config'->>'rirMin')::int, (e->'config'->>'rirMax')::int, (e->'config'->>'increment')::numeric, e->>'techniqueNote', e->>'painNote')
        returning id into we_id;
        j := 0;
        for s in select * from jsonb_array_elements(coalesce(e->'sets', '[]')) loop
          insert into workout_sets (id, workout_exercise_id, user_id, position, kind, weight_kg, reps, rir, rpe, done, pain, completed_at)
          values (new.id || ':' || i || ':' || (s->>'id'), we_id, new.user_id, j, s->>'kind', (s->>'weightKg')::numeric, (s->>'reps')::int,
                  (s->>'rir')::numeric, (s->>'rpe')::numeric, coalesce((s->>'done')::boolean, false), (s->>'pain')::boolean, (s->>'completedAt')::timestamptz);
          j := j + 1;
        end loop;
        i := i + 1;
      end loop;
    end if;
  elsif tg_table_name = 'recipes' then
    delete from recipe_ingredients where recipe_id = new.id;
    if new.deleted_at is null then
      insert into recipe_ingredients (recipe_id, user_id, food_id, food_name, grams)
      select new.id, new.user_id, x->>'foodId', x->>'foodName', (x->>'grams')::numeric from jsonb_array_elements(coalesce(new.payload->'ingredients', '[]')) x;
    end if;
  elsif tg_table_name = 'workout_plans' then
    delete from workout_days where plan_id = new.id;
    if new.deleted_at is null then
      for d in select * from jsonb_array_elements(coalesce(new.payload->'days', '[]')) loop
        insert into workout_days (plan_id, user_id, day_key, name, focus, exercises) values (new.id, new.user_id, d->>'id', d->>'name', d->>'focus', d->'exercises');
      end loop;
    end if;
  end if;
  return null;
end $$;

drop trigger if exists expand_children on public.workout_sessions;
create trigger expand_children after insert or update on public.workout_sessions for each row execute function public.athletiq_expand_children();
drop trigger if exists expand_children on public.recipes;
create trigger expand_children after insert or update on public.recipes for each row execute function public.athletiq_expand_children();
drop trigger if exists expand_children on public.workout_plans;
create trigger expand_children after insert or update on public.workout_plans for each row execute function public.athletiq_expand_children();

-- ---------- Almacenamiento privado de fotos de progreso ----------
insert into storage.buckets (id, name, public) values ('progress-photos', 'progress-photos', false) on conflict (id) do nothing;
create policy "own photos read" on storage.objects for select using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own photos write" on storage.objects for insert with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own photos delete" on storage.objects for delete using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);
