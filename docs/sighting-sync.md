# Editing, deleting and syncing sightings

How a diver's changes reach the server, including offline. The code is in `src/lib/db.ts`
(the local database and its outbox), `src/lib/sync-service.ts` (one sync pass) and
`src/lib/sync-scheduler.ts` (when passes run). The tests that pin this behaviour are
`src/lib/__tests__/offline-sync.test.ts` (end to end, on real SQLite) and
`sighting-store.test.ts`.

## What the diver sees

- **My Log → a sighting** opens its page (`/sighting/[id]`). It shows the species, the site, the
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
  page), with a count and a **Sync now** link at the top of My Log. A failure shows why, and it's
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
| Species, site or date changed on a verified sighting | Its local status resets to unverified (a buddy vouched for the old facts); the server does the same when verification ships. Notes and photo edits keep the status. |
| Not signed in | Nothing leaves the device. Deletes are immediate (no tombstone), and edits just update the row. |

Pushes send only what an owner may change after logging (`species_id`, `site_id`,
`sighted_on`, `notes`, `photo_url`), never the id, owner or creation time. This keeps working
once column privileges restrict updates to those columns.

## Photos

- A picked photo is copied into the app's documents folder (`src/lib/photo-files.ts`). The
  picker's copy sits in a cache the system may clear, and an offline sighting can wait days.
- Uploads go to `<user id>/<sighting id>-<tag>.<ext>` in the `sighting-photos` bucket. The tag
  comes from the file, so a retry reuses the path and a replaced photo gets a new URL rather than
  a cached old one.
- Replacing or removing a photo deletes the old file after the row is updated. Deleting a
  sighting deletes its photo first. Only files in the diver's own folder are ever removed.
- If a queued photo has vanished from the device, the sighting syncs without it instead of
  waiting forever.
- Another diver's photo is shown only from their own folder in ScubaGo's bucket, never from an
  arbitrary URL.

## When syncs run

One pass at a time. A change made during a pass triggers one more pass. A failed pass (offline,
or any change refused) is retried after 5 s, 10 s, 20 s … up to 5 minutes, with jitter. Returning
to the app retries at once and resets the backoff. The outbox lives in SQLite, so closing the app
loses nothing.

## Upgrading the local database

Schema version 3 adds the columns above to `sightings`. Existing rows keep everything. Rows
already synced are marked as known to the server, with their current photo URL, so a later edit
updates them instead of inserting. The upgrade is tested from a version-2 database.
