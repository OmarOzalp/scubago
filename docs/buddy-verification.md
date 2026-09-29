# Ask a buddy (buddy verification)

A diver asks someone who was on the dive to confirm a sighting. The buddy signs in, enters a code,
sees exactly what they're confirming, and answers. If they saw it too, the sighting reads **Buddy
verified**. Migration `0006_buddy_verification.sql` holds everything that decides anything; the app
only asks it.

## The flow

1. **The owner** opens one of their synced sightings. The **Ask a buddy** card creates a code
   such as `2JV0Z-26MM1`, which lasts 7 days and takes up to 3 answers. **Share code** sends it
   with a link (`scubago://verify?code=…`). **Make a new code** replaces it, and the old code stops
   working at once.
2. **The buddy** follows the link, or goes to My Log → **Confirm a buddy's sighting** and types the
   code. They must be signed in.
   - Typing is forgiving: capitals, spaces and the dash are handled, and O, I and L read as 0, 1
     and 1.
   - They see the species, site, date, notes and photo, and who logged it.
   - They say what they were on the dive (dive buddy, instructor, divemaster, other), then choose
     one of three answers:
     - **Yes, I saw it too**
     - **No, I didn't see it**
     - **I wasn't on this dive**
3. **The owner** sees the new status, and each answer with the answerer's username. The status
   reaches their phone on the next sync (opening the app, or any change). Opening the sighting also
   checks straight away.

## States

| Status | Label | When |
| --- | --- | --- |
| `unverified` | Unverified | Every sighting starts here. It returns here when the confirmations go (an edit, a confirmer's account deleted). |
| `confirmed` | Buddy verified | At least one diver answered "Yes, I saw it too". |
| `evidence_submitted`, `accepted`, `rejected`, `disputed` | (reserved) | Photo evidence and moderation (roadmap 5b). Nothing sets them yet. |

"No, I didn't see it" and "I wasn't on this dive" are recorded and shown to the owner, but they
don't dispute a sighting: buddies miss things.

## What the server enforces

| Rule | How |
| --- | --- |
| Codes are hard to guess | 10 characters of Crockford base32 (50 random bits from `pgcrypto`). Only the SHA-256 hash is stored. |
| Codes expire | After 7 days, after 3 answers, or when replaced. |
| One sighting per code | Each request row points at one sighting. |
| No verifying your own sighting | The owner's own code is refused on look-up and on answering. |
| One answer per diver per sighting | A unique index; a second try gets "already answered". |
| Checked on the server | The app can call only four functions, all signed-in only, `SECURITY DEFINER` with an empty `search_path`: `create_verification_request`, `revoke_verification_request`, `preview_verification`, `attest`. The tables are read-only to the app, and the helper and trigger functions can't be called. |
| Who can read what | Owners see their own codes and every answer on their sightings. A verifier sees only their own answers. |
| Rate limits | 10 wrong or stale codes an hour per account; 30 answers a day; at most 20 open codes and 30 new codes a day per diver. |
| No setting your own status | A trigger makes every new sighting `unverified`, and refuses any status change from the app (error 42501). Older app builds never send a status, so they keep syncing. |
| The code alone isn't proof | The buddy must be signed in, sees the facts first, and answers explicitly. The answer names the species, site and date they were shown. If the sighting changed in between, it's refused as "changed", and they see the new facts. |
| Edits void confirmations | Changing the species, site or date deletes the answers and resets the status. Notes and photo edits keep them. |
| Roles are claims | The role is stored and shown as "says they were the instructor (not checked)". Nothing presents it as a certification. |

## Offline

- **Viewing works offline.** The card shows the last answers and code this phone saw, with
  "Showing what was known on …".
- **Online-only actions say so.** Creating, looking up or answering a code offline gives: "You're
  offline. Codes need a connection…". **Share code** still works offline.
- **Edits made offline.** Changing the species, site or date resets the status to Unverified
  straight away, and hides the old answers ("earlier confirmations no longer apply"). When the edit
  syncs, the server removes the answers too. If a pull arrives before the edit has synced, it
  never brings back the old status.

## Where the code is

| Piece | File |
| --- | --- |
| Schema, triggers, functions | `supabase/migrations/0006_buddy_verification.sql` |
| The app's calls and messages (pure, tested) | `src/lib/verification-api.ts` |
| Ask a buddy card (owner) | `src/components/buddy-verification.tsx` |
| Enter a code (buddy) | `src/app/verify.tsx` |
| Status in the pull (with a fallback for projects without 0006) | `pullSightings` in `src/lib/sync-service.ts` |
| Status chip on rows | `src/components/sighting-row.tsx` |

## Turning it on (migration 0006)

It only adds: two columns on `sightings` (existing rows become `unverified`), three tables,
functions and triggers. Until it's applied:

- the app still syncs;
- **Ask a buddy** explains that buddy verification "isn't switched on for this ScubaGo server yet".

To apply it:

1. **Confirm the target project.** Run `npx supabase projects list`: the linked project is marked.
   Check that its ref is the one in `EXPO_PUBLIC_SUPABASE_URL`.
2. **Apply the migration.** Run `npx supabase db push`, which applies only the migrations the
   project doesn't have. See [ios-distribution.md](ios-distribution.md#6-supabase-after-a-reset)
   if earlier migrations were pasted into the SQL editor. **Never** run `db reset --linked`.
3. **Run the SQL checks** in the SQL editor:
   - `supabase/checks/audit.sql`: the "buddy verification (0006)" row should be `ok`.
   - `supabase/checks/verification-check.sql`: it ends in an intentional error reading
     "Verification check: 26 passed, 0 failed". The error rolls the check back, so nothing is
     saved.
   - `supabase/checks/rls-isolation.sql`: "17 passed, 0 failed".
4. **Run the two-account check.** It uses two test accounts and only the publishable key, and
   deletes its test sighting at the end:

   ```bash
   CHECK_OWNER_EMAIL=… CHECK_OWNER_PASSWORD=… CHECK_BUDDY_EMAIL=… CHECK_BUDDY_PASSWORD=… npm run check:buddy
   ```

## Tests

- `src/lib/__tests__/verification-api.test.ts` covers the app's side:
  - codes as typed;
  - errors in words (offline, not switched on, refused);
  - every outcome;
  - which codes still work;
  - the share message.
- `src/lib/__tests__/sync-service.test.ts` covers the status pull, with and without 0006.
- `supabase/checks/verification-check.sql` has 26 database checks:
  - creating codes, and looking them up;
  - valid, invalid, expired, used and withdrawn codes;
  - self-verification;
  - answering twice;
  - the guessing limit;
  - forged statuses and answers;
  - edits;
  - deleted accounts.
- `npm run check:buddy` runs the whole flow on a live project.

## Limits, for now

- **A code shows only on the phone that created it**, because the server keeps only its hash. On
  another phone, make a new code.
- **Links need an installed build.** `scubago://` links open a development or store build. Expo Go
  uses its own `exp://` links, so there the buddy types the code.
- **No instructor identity system yet.** Roles are what people say, and are labeled as such.
- **No notifications.** The owner sees a new answer the next time their app syncs, or when they
  open the sighting.
- **Sightings are still public.** They stay readable by anyone until roadmap 5c switches reads to
  `public_sightings`.

### Differences from the design

These differ from the design in [roadmap/sightings-architecture.md](roadmap/sightings-architecture.md):

- **Link format:** it's `scubago://verify?code=…`.
- **Answers per code:** a code takes 3 answers (a group dive), not 1.
- **New accounts:** the rule that accounts less than a day old can't confirm was dropped, so a buddy
  who signs up on the boat can answer straight away. The 30-answers-a-day limit covers abuse
  instead.
