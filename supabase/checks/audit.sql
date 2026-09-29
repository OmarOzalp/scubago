-- ScubaGo: read-only configuration audit.
--
-- Paste into the Supabase SQL editor and run; it only reads. One row per check, with a verdict:
-- "ok", "ACTION" (fix it; see docs/ios-distribution.md, "Supabase after a reset") or "info".
with
tables as (
  select c.relname as name, c.relrowsecurity as rls
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
),
expected_policies(tbl, policy) as (values
  ('species', 'species are public'), ('dive_sites', 'sites are public'), ('dive_sites', 'users add sites'),
  ('sightings', 'sightings are public'), ('sightings', 'users log own sightings'), ('sightings', 'users edit own sightings'),
  ('sightings', 'users delete own sightings'), ('profiles', 'profiles are public'), ('profiles', 'users manage own profile'),
  ('profiles', 'users update own profile'), ('objects', 'photos are public'), ('objects', 'users upload own photos'),
  ('objects', 'users replace own photos'), ('objects', 'users delete own photos')
),
bucket as (select * from storage.buckets where id = 'sighting-photos'),
checks(section, item, detail, verdict) as (
  -- Row-level security on every app table (spatial_ref_sys belongs to PostGIS: see below).
  select 'RLS', 'table ' || name, case when rls then 'row-level security on' else 'row-level security OFF' end,
         case when rls then 'ok' else 'ACTION' end
  from tables where name <> 'spatial_ref_sys'
  union all
  select 'RLS', 'app tables present', string_agg(e.t, ', ') || ' missing', 'ACTION'
  from (values ('species'), ('dive_sites'), ('sightings'), ('profiles')) e(t)
  where not exists (select 1 from tables where name = e.t) having count(*) > 0
  union all
  -- The policies from migrations 0001 and 0002.
  select 'Policies', e.tbl || ': ' || e.policy,
         case when p.policyname is null then 'missing' else p.cmd || ' for ' || array_to_string(p.roles, ',') end,
         case when p.policyname is null then 'ACTION' else 'ok' end
  from expected_policies e
  left join pg_policies p on p.tablename = e.tbl and p.policyname = e.policy
    and p.schemaname = case when e.tbl = 'objects' then 'storage' else 'public' end
  union all
  select 'Policies', p.schemaname || '.' || p.tablename || ': ' || p.policyname, p.cmd || ' (not in ScubaGo''s migrations: review it)', 'info'
  from pg_policies p
  where (p.schemaname = 'public' or (p.schemaname = 'storage' and p.tablename = 'objects'))
    and not exists (select 1 from expected_policies e where e.policy = p.policyname)
  union all
  -- Migration 0002: account deletion cascades, photo limits.
  select 'Migrations', 'sightings.user_id on delete', coalesce(max(case rc.delete_rule when 'CASCADE' then 'cascade' else lower(rc.delete_rule) end), 'constraint missing'),
         case when max(rc.delete_rule) = 'CASCADE' then 'ok' else 'ACTION' end
  from information_schema.referential_constraints rc where rc.constraint_schema = 'public' and rc.constraint_name = 'sightings_user_id_fkey'
  union all
  select 'Migrations', 'history (supabase db push)',
         case when to_regclass('supabase_migrations.schema_migrations') is null then 'no CLI migration history (applied in the SQL editor?)'
              else (xpath('/row/v/text()', query_to_xml('select string_agg(version, '', '' order by version) as v from supabase_migrations.schema_migrations', false, true, '')))[1]::text end,
         'info'
  union all
  -- Photo bucket.
  select 'Storage', 'bucket sighting-photos',
         coalesce((select format('%s, limit %s bytes, types %s', case when public then 'public read' else 'private' end, coalesce(file_size_limit::text, 'none'), coalesce(array_to_string(allowed_mime_types, ' '), 'any')) from bucket), 'missing'),
         case when not exists (select 1 from bucket) then 'ACTION'
              when (select file_size_limit is null or allowed_mime_types is null from bucket) then 'ACTION'
              else 'ok' end
  union all
  -- Catalog (the app's sightings point at these rows: an empty catalog makes every upload fail).
  select 'Catalog', 'species', count(*)::text || ' rows (the app ships 119)', case when count(*) >= 119 then 'ok' else 'ACTION' end from public.species
  union all
  select 'Catalog', 'curated dive sites', count(*)::text || ' rows (the app ships 69)', case when count(*) >= 69 then 'ok' else 'ACTION' end from public.dive_sites where source = 'seed'
  union all
  select 'Data', 'accounts / profiles / sightings / user-added sites',
         format('%s / %s / %s / %s', (select count(*) from auth.users), (select count(*) from public.profiles), (select count(*) from public.sightings), (select count(*) from public.dive_sites where source = 'user')),
         'info'
  union all
  -- PostGIS's reference table lives in public without RLS; the API roles should not be able to change it.
  select 'PostGIS', 'spatial_ref_sys writable by anon/authenticated',
         case when to_regclass('public.spatial_ref_sys') is null then 'PostGIS not in public'
              when has_table_privilege('anon', 'public.spatial_ref_sys', 'INSERT,UPDATE,DELETE') or has_table_privilege('authenticated', 'public.spatial_ref_sys', 'INSERT,UPDATE,DELETE') then 'yes'
              else 'no' end,
         case when to_regclass('public.spatial_ref_sys') is not null
               and (has_table_privilege('anon', 'public.spatial_ref_sys', 'INSERT,UPDATE,DELETE') or has_table_privilege('authenticated', 'public.spatial_ref_sys', 'INSERT,UPDATE,DELETE'))
              then 'ACTION' else 'ok' end
  union all
  -- Account deletion (migration 0004): callable when signed in, never anonymously.
  select 'Functions', 'delete_own_account (in-app account deletion)',
         case when to_regprocedure('public.delete_own_account()') is null then 'missing: apply migration 0004'
              when has_function_privilege('anon', 'public.delete_own_account()', 'EXECUTE') then 'callable by anonymous visitors'
              when not has_function_privilege('authenticated', 'public.delete_own_account()', 'EXECUTE') then 'not callable by signed-in users'
              else 'signed-in users only' end,
         case when to_regprocedure('public.delete_own_account()') is not null
               and not has_function_privilege('anon', 'public.delete_own_account()', 'EXECUTE')
               and has_function_privilege('authenticated', 'public.delete_own_account()', 'EXECUTE') then 'ok' else 'ACTION' end
  union all
  select 'Functions', 'other SECURITY DEFINER functions in public', coalesce(string_agg(p.proname, ', '), 'none'),
         case when count(*) = 0 then 'ok' else 'info' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef and p.proname <> 'delete_own_account'
)
select section, item, detail, verdict from checks
order by case verdict when 'ACTION' then 0 when 'info' then 2 else 1 end, section, item;
