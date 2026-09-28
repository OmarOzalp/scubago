-- Lets a signed-in user delete their own account from inside the app, as the App Store requires
-- of any app that lets people create one (guideline 5.1.1(v)).
--
-- Deleting the auth user cascades to their profile and sightings (migration 0002); dive sites they
-- added stay, without an owner. Their photos are removed by the app first, through the Storage API
-- (Supabase does not allow deleting stored files with SQL). SECURITY DEFINER because only the
-- database may delete from auth.users; it deletes nobody but the caller, and signed-out callers get
-- an error. The empty search_path makes every name below fully qualified.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'Sign in to delete your account' using errcode = '42501';
  end if;
  delete from auth.users where id = caller;
end;
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;
