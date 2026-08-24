-- Account deletion support + Storage bucket hardening.
--
-- (a) `sightings.user_id` and `dive_sites.created_by` reference `profiles(user_id)`
--     with the default NO ACTION, so deleting a user's auth.users row (which cascades
--     to profiles) fails on those FKs — account deletion is currently impossible.
--     Re-add both constraints with explicit delete behavior: a deleted user's
--     sightings go with them, but their dive-site contributions stay (unowned).
-- (b) The `sighting-photos` bucket was created with only `public = true` — no size
--     or MIME-type limit, so any authenticated user could upload arbitrarily large
--     or arbitrary-type files into a world-readable bucket.
-- (c) There is no DELETE policy on `storage.objects`, so users cannot remove their
--     own uploaded photos.

alter table sightings drop constraint if exists sightings_user_id_fkey;
alter table sightings
  add constraint sightings_user_id_fkey
  foreign key (user_id) references profiles (user_id) on delete cascade;

alter table dive_sites drop constraint if exists dive_sites_created_by_fkey;
alter table dive_sites
  add constraint dive_sites_created_by_fkey
  foreign key (created_by) references profiles (user_id) on delete set null;

update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg','image/png','image/heic','image/webp']
where id = 'sighting-photos';

create policy "users delete own photos" on storage.objects
  for delete using (
    bucket_id = 'sighting-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
