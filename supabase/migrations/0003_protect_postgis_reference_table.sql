-- PostGIS keeps its coordinate-system catalog, spatial_ref_sys, in the public schema without
-- row-level security, and Supabase's default privileges can give the API roles write access to
-- it: anyone with the app's publishable key could then insert, change or delete coordinate
-- systems through the REST API (breaking spatial queries). Nobody but the database needs to
-- write there. Revoke those rights; reading stays allowed.
--
-- Where the table belongs to another role and the revoke is not permitted, this reports a
-- notice instead of failing the migration (see docs/ios-distribution.md, "Supabase after a reset").
do $$
begin
  if to_regclass('public.spatial_ref_sys') is not null then
    revoke insert, update, delete, truncate on public.spatial_ref_sys from anon, authenticated;
  end if;
exception when insufficient_privilege then
  raise notice 'spatial_ref_sys: could not revoke write access (%); check the Security Advisor.', sqlerrm;
end $$;
