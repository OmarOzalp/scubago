-- 0008: who can see a sighting, its notes and its photo.
--
-- A diver chooses, per sighting:
--   - the sighting itself: everyone (as before) or only them (sightings.visibility);
--   - their notes: shared on the sighting, or kept in sighting_details, which only they can read;
--   - their photo: in the public bucket, or in the private bucket 'sighting-photos-private', which
--     only they can read (the app shows it through a short-lived signed link).
-- The app puts notes and photos where the diver's choice says; it never sends private ones to the
-- public row or bucket.
--
-- Additive only: existing sightings default to 'public', exactly as they were, and apps from
-- before this keep working (they never send visibility, so their sightings stay public). The one
-- policy that changes, the public read on sightings, is replaced inside this migration with one
-- that still lets everyone read public sightings.

-- ── Sightings: public or only me ───────────────────────────────────────────────────────────
alter table public.sightings
  add column if not exists visibility text not null default 'public'
    constraint sightings_visibility_check check (visibility in ('public', 'private'));

-- Everyone reads public sightings; a private one only by the diver who logged it. (ScubaGo's own
-- functions, such as the buddy-code preview from 0006, run as their owner and are unaffected: a
-- diver who sends a code chooses to show that sighting to that buddy.)
alter policy "sightings are public" on public.sightings rename to "sightings are public unless private";
alter policy "sightings are public unless private" on public.sightings
  using (visibility = 'public' or user_id = (select auth.uid()));

-- ── Private details: notes and photo paths only the owner can read ─────────────────────────
-- The roadmap's sighting_details (docs/roadmap/sightings-schema-draft.sql), plus the private photo.
create table if not exists public.sighting_details (
  sighting_id text primary key references public.sightings (id) on delete cascade,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  notes text check (char_length(notes) <= 4000),
  -- Path in the private bucket: <owner's uid>/<file>.
  photo_path text check (char_length(photo_path) <= 300),
  updated_at timestamptz not null default now(),
  constraint sighting_details_photo_in_own_folder check (photo_path is null or photo_path like user_id::text || '/%')
);
create index if not exists sighting_details_user_idx on public.sighting_details (user_id);

alter table public.sighting_details enable row level security;
revoke all on public.sighting_details from anon;
-- Only the owner, and only for their own sighting.
create policy "own sighting details" on public.sighting_details for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.sightings s where s.id = sighting_id and s.user_id = (select auth.uid()))
  );

-- ── Private photos ─────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sighting-photos-private', 'sighting-photos-private', false, 10485760,
        array['image/jpeg', 'image/png', 'image/heic', 'image/webp'])
on conflict (id) do nothing;

-- Each diver reads and writes only inside their own folder: <uid>/…
create policy "owners read own private photos" on storage.objects for select to authenticated
  using (bucket_id = 'sighting-photos-private' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "owners add own private photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'sighting-photos-private' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "owners replace own private photos" on storage.objects for update to authenticated
  using (bucket_id = 'sighting-photos-private' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'sighting-photos-private' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "owners delete own private photos" on storage.objects for delete to authenticated
  using (bucket_id = 'sighting-photos-private' and (storage.foldername(name))[1] = (select auth.uid())::text);
