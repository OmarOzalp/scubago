# Offline-first dive logging (redesign)

**Status: planned, not implemented.** This is a starting point for a dedicated design discussion.
None of the UX below is decided.

## 1. The problem

Logging a dive in most apps (PADI's included) feels like paperwork: long forms, many mandatory
fields, and a connection assumed. Divers log at the worst moments: wet, tired, on a rocking boat,
between dives on a liveaboard, or on an island with no signal. A log that is slow to fill in, or
that loses entries when the app closes or the connection drops, doesn't get used. The dives that
matter most (the remote ones) are the ones that go unlogged.

**ScubaGo today** logs *sightings*, not dives: species + site + date, with optional notes and photo.
- Sightings are saved to SQLite on the phone first and queued, then pushed to Supabase when
  possible, with photos uploaded before their row (`src/lib/sync-service.ts`).
- There are no dive records, no editing or deleting of synced entries, no drafts, no conflict
  handling (only one device writes a given row), and uploads are only retried when the next sync
  runs.

## 2. Product goals

- **Fast:** a typical dive with its sightings logged in under 30 seconds, one-handed.
- **Never lose anything:** every keystroke is saved on the device; closing the app, losing signal or
  a dead battery mid-entry loses nothing.
- **Offline by default:** create, edit and delete dives, sightings and photos with no connection.
  Sync happens by itself when it can, and the diver never needs to think about it.
- **Minimal required fields:** a site (or "somewhere new") and a date. Everything else is optional
  and revealed progressively.
- **Better with context:** smart defaults from the last dive, the trip, the site and the buddy.
- **Feeds the rest of ScubaGo:** dives feed the species collection and the island, and are the
  natural place to ask a buddy to confirm what was seen ([sightings-architecture.md](sightings-architecture.md)).

## 3. Possible flows (to explore, not decided)

- **Quick log after a dive:**
  1. Open → "Log dive".
  2. The site is pre-selected (the last site, or the nearest known one if location is available),
     with the date and time filled in and the dive number counted up.
  3. Tap the species seen from a short list (commonly seen here, seen on this trip, your frequent
     ones), with search as a fallback.
  4. Save. Depth, time, temperature, gas, visibility and notes sit behind "more".
- **Same as last dive:** duplicate the previous dive (site, buddy, gear) and change only what
  differs. This suits second and third dives of the day.
- **Trip mode:** a trip (dates, operator or boat, buddy, usual sites) makes its dives one-tap. The
  day view shows dives 1–4 with sensible defaults.
- **Unfinished drafts:** start logging on the boat, finish at dinner. Drafts are clearly marked and
  never synced as final until saved.
- **Buddy on the same dive:** share a dive code. The buddy can confirm sightings (verification) or
  copy the dive into their own log.
- **Later:** import from a dive computer (Shearwater, Garmin, Suunto) through files or partner APIs,
  merging automatically with manually logged sightings.

## 4. Offline-first technical considerations

- **Local database as the source of truth.** Expo SQLite, already used, with tables for
  `dive_logs`, `sightings`, `attachments`, and an **operation outbox**:
  - each create, update or delete is an operation with a client timestamp and a sequence number;
  - writes are transactional and journaled (WAL is on today), and entry drafts are autosaved.
- **Identifiers:** client-generated, sortable IDs (for example ULIDs) for dives, sightings and
  attachments, so offline creation never collides and pushes are idempotent (upserts). Sightings
  already use client IDs.
- **Sync protocol:**
  - push operations in order, then pull changes since the last sync (`updated_at` watermark per
    table);
  - tombstones (`deleted_at`) instead of hard deletes, so deletions sync;
  - one failing item never blocks the rest (as today), with retry and exponential backoff.
- **Conflicts:** mostly one user editing their own data on one or two devices.
  - Per field, the latest edit wins, based on server-assigned `updated_at` plus the client edit
    time.
  - Deletes win over edits.
  - Status fields (verification) always come from the server.
  - Unresolvable cases (rare) keep both versions and ask the diver.
- **Attachments:**
  - Photos are copied into app storage straight away (the photo library can change).
  - They upload in their own queue with retries, resumably for large files (Supabase Storage
    supports resumable TUS uploads).
  - A row that references a photo syncs before or after its upload, never blocked by it. The photo
    is attached when it lands.
- **Connectivity and background work:**
  - Watch network state (expo-network or NetInfo) and sync on regaining a connection, on app
    foreground and after each save.
  - iOS background work is limited and not guaranteed, so treat background sync as a bonus.
  - Show the state quietly (for example "3 dives waiting to sync"), never as an error.
- **Device schema migrations:** a versioned SQLite migration path (today the tables are created in
  `src/lib/db.ts` at start-up); migrations are tested on real data copies.
- **Storage and battery:**
  - Cap cached community data.
  - Compress photos (metadata stripped for public copies, kept for private evidence).
  - Batch network calls.
- **Build or adopt:** extend the existing outbox (small, fully under our control), or adopt a sync
  engine (PowerSync or ElectricSQL with Supabase, or WatermelonDB). The original design already
  named PowerSync / WatermelonDB for offline map regions. Weigh them on conflict handling,
  attachment support, Expo compatibility, cost and lock-in.
- **Offline reference data:** the species catalog and curated sites already ship with the app. An
  offline region download (sites and recent reports for a trip area) belongs here too.

## 5. Open design questions

- What is the smallest thing that counts as a "logged dive"? Can a dive have no sightings, or a
  sighting no dive?
- Dive-first or sighting-first: does "Log" start from the dive or from "I saw…"?
- How much dive-computer data matters to ScubaGo's divers (versus other apps doing it well), and
  when?
- How should trips, liveaboards and multi-dive days appear?
- Do divers want logbook signatures (instructor or buddy stamps, as in paper logbooks)? Would the
  verification codes double as that?
- Which fields do divers actually fill in? Answering this needs a handful of interviews and a timed
  test of current apps before designing screens.
- How visible should sync be? For example: never mention it unless something is stuck for more than
  a day.

## 6. Possible phases

0. **Discovery:** talk to 5–10 divers (including liveaboard and remote-island divers); time logging
   in two or three existing apps; agree the minimum fields and the core flow.
1. **Foundations:** the operation outbox, tombstones, per-table pull watermarks, the attachment
   queue with retries, SQLite migrations. Invisible to users; measurably no data loss (kill the
   app mid-sync, toggle airplane mode, test with two devices).
2. **Dive logs v1:** `dive_logs` (see the draft schema) with offline create, edit and delete, the
   quick-log flow, and sightings attached to dives.
3. **Speed:** smart defaults, "same as last dive", trip mode, drafts.
4. **With buddies:** dive codes for confirmation and shared dives.
5. **Imports:** dive computers and existing logbooks (CSV or UDDF).
