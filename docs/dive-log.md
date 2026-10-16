# The dive log

Each dive is a numbered page in the diver's logbook. A page holds the site, the date and time,
what the diver measured and noted, the animals they saw, and any signatures and dive-centre stamp.
Sightings belong to a page: logging a dive writes the page and its sightings together.

The code:

- `src/lib/dives.ts`: the rules (numbering, milestones, checks, past pages from old sightings, totals).
- `src/lib/dive-draft.ts`: the form while it is filled in.
- `src/lib/dive-rows.ts`: the columns, shared by SQLite and the server.
- `src/lib/db.ts` and `src/lib/sync-service.ts`: storage and sync.
- `src/lib/dive-signature-api.ts`: signing from a buddy's phone.
- The screens:
  - `src/app/log/new.tsx`: writing a page.
  - `src/app/dive/[id].tsx`: the page itself.
  - `src/app/dive/edit.tsx`: editing a page.
  - `src/app/dive/sign.tsx`: signing.
  - `src/app/dive/count.tsx`: dives before ScubaGo.
- The server: `supabase/migrations/0009_dive_log.sql`.

## What the diver sees

- **Log a dive** works as before (site, then species, then details), with two differences:
  - Animals are optional. **Nothing to log · next** writes a page without any.
  - The details step is the page itself.
    - Always shown: the dive number, the time in, the date, the bottom time, the maximum depth and
      private notes.
    - **More details** opens the rest:
      - Conditions: water and air temperature, visibility, average depth, current, surface, entry,
        and the kind of dive (reef, wall, wreck, drift, night, muck, cavern, deep, training).
      - Gas and gear: air, nitrox (with its oxygen %) or trimix; tank size and material; start and
        end pressure; weight; suit. The air consumption is worked out as you type.
      - People: the buddy and the dive centre.
      - A rating out of five stars.
  - Numbers are typed as divers write them: `28,5`, `9.30 am` and `0930` all work.
  - The page's gear is carried over from the latest page. The buddy and dive centre are carried
    over too when the latest page was within three days (the same trip). The form says what it
    carried over.
- **The saved screen** stamps the entry ("Entry No. 49") and offers **Open the page**, **Ask your
  buddy to sign** and **Log another dive**. A milestone dive gets its bookplate, and "Two dives to
  your fiftieth" appears when a milestone is close.
- **The page** (`/dive/[id]`) shows:
  - the number, the day, the site, and the time in and out;
  - the main figures (depth, time, water, visibility);
  - every other field that was filled in, the notes, and the animals (each one opens its sighting);
  - the signatures and the centre's stamp;
  - how the page stands with syncing.
  - **Add what you saw** puts more animals on the page, at its site and date. **Edit page** changes any field.
  - The buttons at the foot turn to the previous and next pages.
  - **Delete page** removes the page and the sightings on it.
- **Logbook** lists every page, newest first, under the lifetime totals (dives, time underwater,
  deepest, species). **Begin entry No. N** starts the next page, and **Dives before ScubaGo** sets
  the starting count.
- **Home** shows the next number above the log button ("No. 49 · 2 dives to your fiftieth", then **Begin entry No. 49**).
- **A sighting's page** links to the dive it's on (the diver's own sightings only, since dives are
  private).

## Numbering

- The next page is numbered one after the highest page so far. With an empty log, it is one after
  the dives logged before ScubaGo.
- **Dives before ScubaGo** is kept on the device (`meta` table, `dives_before:<owner>`). Changing
  it moves every page by the difference, and the renumbered pages sync. It never numbers a page
  below No. 1.
- The number is a field like any other: a diver can change it on the form or the page. If it's
  already in use, the form says so but allows it.
- Milestones are 25, 50, 100, 150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000, 2500, 3000,
  4000 and 5000. Each gets a bookplate on its page and on the saved screen.

## Sightings from before the dive log

- On first launch with this version, every sighting that isn't on a page gets one: one page per
  site and day, oldest first, numbered after the existing pages. These pages say they were made
  from earlier sightings, and invite the diver to add the depth and time.
- The same happens after a sync, for sightings logged by an older version of the app on another
  phone.
- A past page's id comes from the owner, site and date (`pastDiveId`). Two phones binding the same
  old sightings therefore make the same page, not two.

## Signatures and stamps

- **On this phone.** The diver hands the phone over. The buddy writes their name, says what they
  were on the dive (buddy, guide, instructor, divemaster, other) and signs with a finger. A page
  holds one signature made on the diver's phone; removing it lets someone else sign.
- **From their phone.** The diver makes a code for a synced page (`DXXXX-XXXXX`, valid 7 days, up
  to 3 signers) and shares it.
  - The buddy, signed in, enters it under Logbook → **Buddy code**.
  - They see the page's number, site, date, time, depth and the diver's username, then sign.
  - The server checks that the page hasn't changed since they looked. A changed page shows its new
    facts, to sign again.
  - Their signature reaches the diver's page on the next sync.
  - One signature per diver per page.
- Sighting codes are ten random characters, so one in 32 also starts with a D. A D code that
  matches no page is tried as a sighting code, at the cost of one try against the hourly limit.
- A page moved to another site or day loses its signatures, here and on the server: they were
  given for the old facts, as a buddy's confirmation of a sighting is. A new number, notes or
  anything else keeps them, so renumbering never unsigns a log. The edit screen says so before
  saving.
- Signatures are stored as SVG path data in a 300 × 100 box, and only `M`/`L` commands and
  numbers are allowed (`isSignaturePath`, also checked by the server). Anything else is never
  drawn.
- **Dive-centre stamps.** The stamp is drawn by the app from the centre name the diver wrote, at an
  angle and in an ink that depend on the name. It reads **NOT VERIFIED** on its face, and the page
  says it wasn't checked with the centre. Role claims on signatures are shown as written:
  ScubaGo doesn't check certifications.

## Sync

- Pages have their own outbox, with the same rules as sightings ([sighting-sync.md](sighting-sync.md)):
  offline writes, tombstones for deletes, version checks and retries.
- A sync sends pages before sightings, so a sighting's `dive_id` always points at a page the
  server has.
- Deleting a page deletes its sightings first.
- Pulls restore every page, with the signatures buddies sent from their phones. A new phone gets
  the whole log back.

## The server (migration 0009)

**The user applies it to production.** It is additive: it adds new tables, a nullable
`sightings.dive_id` and functions, and changes no existing rows. It can be run again safely.

- `dives`: the diver's own pages only (row-level security). Constraints keep every field to
  sensible ranges: depths 0–350 m, bottom time 1–600 min, known kinds, plain path data for
  signatures.
- `sightings.dive_id`: a sighting can only point at its owner's page (trigger
  `sightings_3_own_dive`). Deleting a page sets the field to null on any sightings left.
- `dive_signature_requests` and `dive_signatures`: written only by the signing functions
  (`create_dive_signature_request`, `preview_dive_signature`, `sign_dive`,
  `revoke_dive_signature_request`).
  - Codes are stored hashed.
  - Wrong codes count towards the same hourly limit as sighting codes.
  - A diver can't sign their own page.
  - Trigger `dives_void_signatures` takes the signatures off a page moved to another site or day.
- Until 0009 is applied:
  - Sightings keep syncing (without a page).
  - Pages wait on the phone with the reason shown.
  - Once it is applied, the pages go up and their sightings are sent again with them, without
    restarting the app.

**Verify after applying:** run `supabase/checks/dive-log-check.sql` in the SQL editor. It creates
throwaway divers, tries everything as each of them, and rolls back. The report is the error message
("Dive log check: 26 passed, 0 failed"). `supabase/checks/audit.sql` lists the new policies and
functions.

## Tests

- `src/lib/__tests__/dives.test.ts`: the rules.
- `dive-draft.test.ts`: the form.
- `dive-signature-api.test.ts`: the signing calls.
- `dive-store.test.ts`: the store's actions on real SQLite, and old sightings becoming pages.
- `dive-sync.test.ts`: offline and across phones, against a fake server with the migration's rules.

## Not yet

- Imperial units (feet, °F, psi): every field is metric today.
- Importing from dive computers or other logbook apps.
- Verified dive-centre stamps: a centre would need its own account to stamp a page.
