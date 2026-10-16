# Editing, deleting and syncing sightings

How a diver's changes reach the server, including offline. The code is in `src/lib/db.ts`
(the local database and its outbox), `src/lib/sync-service.ts` (one sync pass) and
`src/lib/sync-scheduler.ts` (when passes run). The tests that pin this behaviour are
`src/lib/__tests__/offline-sync.test.ts` (end to end, on real SQLite),
`privacy-sync.test.ts` (who can see what, end to end) and `sighting-store.test.ts`.

## What the diver sees

- **Logbook → a sighting** opens its page (`/sighting/[id]`). It shows the species, the site, the
  date, the dive (not linked yet: dive logs don't exist), notes, verification status, evidence,
  who logged it and when, and, for the diver's own sightings, whether it has synced.
- **Edit sighting** reopens the logging screen with everything filled in. It uses the same steps
  and the same checks: a known species and site, a real date, not in the future. Dates are the
  diver's own calendar day (7am in Cairns is not "yesterday").
- **Delete sighting** asks first, then removes the sighting from the log, the collection and the
  island at once. A species stays in the collection while another sighting of it remains.
- Only the diver who logged a sighting sees Edit and Delete. The store refuses anyone else, and
  so does the server (row-level security, `supabase/checks/rls-isolation.sql`).
- While signed in, changes that haven't synced show as **Waiting to sync** (on the row and the
  page), with a count and a **Sync now** link at the top of the logbook. A failure shows why, and it's
  retried automatically.

## Rules

| Situation | What happens |
| --- | --- |
| Offline edit | Saved locally and shown at once (`synced = 0`); sent when a sync succeeds. |
| Offline delete | The row becomes a *tombstone* (`deleted = 1`): hidden everywhere, kept until the server confirms the delete. |
| Edit, then delete, before syncing | Only the delete is sent. |
| A pull arrives while a change waits | The local change wins: pulls never overwrite unsynced edits or bring back tombstoned rows. |
| Deleted here, but it reappears on the server | The delete is queued again. Confirmed tombstones are kept for 30 days. |
| Deleted on another device | The next pull removes it here. If this device had an unsynced edit, **the delete wins**: the edit is dropped rather than resurrecting the sighting. |
| Another diver deletes a community sighting | It disappears from site feeds on the next pull (within the window the pull covers). |
| A push lands but the reply is lost | Retrying is safe. New rows are inserted only if absent, then updated; deleting what's gone isn't an error. |
| An edit made while a push is on its way | Every local change bumps `version`; a push only marks the row synced if the version still matches, so the newer edit goes next time. |
| Species, site or date changed on a verified sighting | Its local status resets to unverified (a buddy vouched for the old facts); the server does the same and removes the old answers (migration 0006, [buddy-verification.md](buddy-verification.md)). Notes and photo edits keep the status. Renaming a "something else" sighting counts as changing the species (0007). |
| A whole dive logged at once | Each species is its own sighting in the outbox (a millisecond apart, so they keep their order). All are checked before any is saved. |
| "Something else" before migration 0007 | The project has no `custom_name` column yet: those sightings fail with the reason shown and keep retrying; everything else syncs. Once 0007 is applied they go through. |
| Not signed in | Nothing leaves the device. Deletes are immediate (no tombstone), and edits just update the row. |
| Something private, before migration 0008 | Public sightings sync as before (without `visibility`). A private sighting, private notes or a private photo waits on the phone with the reason shown; nothing private is sent. Once 0008 is applied it goes through, without restarting the app. |

Pushes send only what an owner may change after logging (`species_id`, `site_id`,
`sighted_on`, `notes`, `photo_url`, `custom_name` for "something else", and `visibility`), never
the id, owner or creation time. This keeps working once column privileges restrict updates to those columns.
`custom_name` and `visibility` are only sent when a sighting has one, and pulls ask for `status`
(0006), `custom_name` (0007) and `visibility` (0008) only while the project has them: a 42703 "no
such column" drops that column for the rest of the session.

## Photos

- A picked photo is copied into the app's documents folder (`src/lib/photo-files.ts`). The
  picker's copy sits in a cache the system may clear, and an offline sighting can wait days.
- Uploads go to `<user id>/<sighting id>-<tag>.<ext>` in the `sighting-photos` bucket, or in
  `sighting-photos-private` for a private photo (see [Who can see it](#who-can-see-it)). The tag
  comes from the file, so a retry reuses the path and a replaced photo gets a new URL rather than
  a cached old one.
- Replacing or removing a photo deletes the old file after the row is updated. Deleting a
  sighting deletes its photo first. Only files in the diver's own folder are ever removed.
- If a queued photo has vanished from the device, the sighting syncs without it instead of
  waiting forever.
- Another diver's photo is shown only from their own folder in ScubaGo's bucket, never from an
  arbitrary URL.

## Who can see it

The diver chooses on the log screen ("Who can see this", `src/components/privacy-fields.tsx`):
the sighting is **Everyone** or **Only me**, and for a shared sighting so are its notes and its
photo. A private sighting keeps all of it private. The rules are in `src/lib/privacy.ts`; the
server's side is migration 0008 and `supabase/checks/privacy-check.sql`.

| Part | Shared | Private |
| --- | --- | --- |
| The sighting | `visibility = 'public'`: everyone reads the row | `visibility = 'private'`: row-level security lets only its diver read it |
| Notes | `sightings.notes` | `sighting_details.notes` (only the owner can read the table); `sightings.notes` stays empty |
| Photo | `sighting-photos` bucket, public URL in `sightings.photo_url` | `sighting-photos-private` bucket, path in `sighting_details.photo_path`; the app shows it through a signed link that lasts an hour (`src/hooks/use-photo-url.ts`) |

- `sightingToRemoteRow` leaves private notes and photos out of the public row whatever it's
  given, and a private photo is uploaded straight to the private bucket. Nothing private is ever
  sent to a public place first.
- Locally, a private photo is known as `private:<user id>/<file>` once it has been uploaded.
- Changing the choice moves things: the photo is copied to the other bucket (same path) and the
  old file deleted, and the `sighting_details` row is written or removed. Each step can be
  repeated: a move interrupted after the old file went is finished by the next sync.
- A pull brings the diver's own private notes and photos back from `sighting_details`, on any of
  their devices. Anything found there stays private if the sighting is shared later.
- A pull that says nothing about visibility (a project without 0008, as far as the app knows)
  never makes a private sighting look shared.
- Asking a buddy to confirm a private sighting shows them its species, site and date (migration
  0006's preview), never its private notes or photo.
- A new log starts with the sighting and photo shared and the notes private, then remembers the
  diver's last choice (`src/lib/privacy-choice.ts`). Sightings from before 0008 are shared, notes
  and photos included, as they always were.
- A local-only build (no Supabase settings) shares nothing, so it doesn't ask.

## When syncs run

One pass at a time. A change made during a pass triggers one more pass. A failed pass (offline,
or any change refused) is retried after 5 s, 10 s, 20 s … up to 5 minutes, with jitter. Returning
to the app retries at once and resets the backoff. The outbox lives in SQLite, so closing the app
loses nothing.

## Upgrading the local database

Schema version 3 adds the columns above to `sightings`. Existing rows keep everything. Rows
already synced are marked as known to the server, with their current photo URL, so a later edit
updates them instead of inserting. The upgrade is tested from a version-2 database.

Version 6 adds `visibility`, `notes_private` and `photo_private`. Existing rows stay as they
were: shared.
