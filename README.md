# ScubaGo 🤿

A map of the world's dive sites and the marine life seen at them. Log what you saw,
grow your species collection, and find out where to go to see a whale shark.

Built with Expo (React Native + TypeScript). Design spec:
[docs/superpowers/specs/2026-08-24-scubago-design.md](docs/superpowers/specs/2026-08-24-scubago-design.md).

## Run it

This is Expo SDK 57. The App Store's Expo Go runs SDK 57 projects. On iOS you must be signed in to
the same Expo account in the terminal (`npx expo login`) and in the Expo Go app.

```bash
npm install
npx expo start        # then scan the QR code with Expo Go
npx expo run:ios      # or a local native build (needs Xcode)
```

To put the app on real iPhones (EAS builds, TestFlight) and check the Supabase project, see
**[docs/ios-distribution.md](docs/ios-distribution.md)**. The plan for dive sites, external
sightings, verification and offline logging is in **[docs/roadmap/](docs/roadmap/README.md)**.

Without a backend the app runs fully local: dive sites and species are bundled, and your sightings
live in SQLite on the device. So the map isn't empty, it also shows example community sightings,
each labeled "Example". Builds connected to Supabase never show them.

### Backend (optional)

Without a `.env` file the app runs fully local, exactly as above — no auth, no sync.
To turn on the real backend:

```bash
cp .env.example .env
# fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
# from your Supabase dashboard → Project Settings → API Keys (the publishable key, sb_publishable_…)

npx supabase link --project-ref <ref>
npx supabase db push          # apply supabase/migrations/ (never `db reset --linked`: it wipes the database)

SUPABASE_URL=... SUPABASE_SECRET_KEY=... npm run seed:supabase
                               # seeds the species + dive-site catalog. The secret key bypasses row-level
                               # security: pass it on the command line only, never in the app or a file.

npm run check:env              # nothing secret in anything the app compiles in (EAS runs it on every build)
npm run check:supabase         # the live project, checked from outside with the publishable key
```

Then run `supabase/checks/audit.sql` and `supabase/checks/rls-isolation.sql` in the SQL editor (see
[docs/ios-distribution.md](docs/ios-distribution.md#6-supabase-after-a-reset)).

Auth is email + password with auto-confirm, which needs email confirmation turned off:
in the Supabase dashboard, go to **Authentication → Providers → Email** and turn off
**"Confirm email"**. This is deliberate: Supabase's free tier can't customize hosted
email templates, and the default templates don't carry a token for an OTP-code flow,
so sign-in avoids the email round-trip entirely.

Do this in the dashboard, not with `npx supabase config push` — `supabase/config.toml`
is the unmodified local-dev CLI default (`site_url = "http://127.0.0.1:3000"`, a
`[auth.rate_limit] email_sent = 2`, etc.), and pushing it would overwrite the live
project's settings with those dev defaults.

## What's in the slice

- **My Home tab** — a stylized 3D sanctuary: a sculpted island, coral lagoon, or rocky
  cove in caustic-lit water, seen from an oblique orthographic camera. Discovered
  sharks, rays, fish, the ocean sunfish and the green sea turtle swim around it as
  rigged, animated models, passing one another in lanes and keeping their own
  species' distance from the island. Tiger, whale and great white sharks, the reef
  manta, the ocean sunfish and the green sea turtle have their own models and
  species-specific swimming; other species use CC0 Quaternius family
  representatives. Unique
  species unlock six growth stages; home name and habitat are saved on this device per
  account. An empty ocean shows a clearly labeled preview shark and manta that never
  count as discoveries, and either can be opened for a closer look. Animation pauses
  when the tab is unfocused, the app is backgrounded, reduced motion is on, or you tap
  Pause. If 3D rendering is unavailable the illustrated SVG island takes over.
- **Map tab** — ~65 famous dive sites worldwide; search "where can I see a…" to
  highlight sites where a species has been spotted; tap a pin for the site card;
  long-press the map to add a missing site.
- **My Log tab** — your sightings, and a species dex of 119 curated species with
  rarity tiers (common → legendary). First-of-species logs get a celebration.
- **Log flow** — site → species → date/notes/photo, designed for speed.
- **Sighting pages** — tap a sighting for its details, verification status and provenance;
  your own can be edited (through the same log flow) or deleted, offline too.
- **Offline-first writes** — sightings, edits and deletions save to SQLite immediately and wait
  in an outbox that syncs with retries once a backend is configured
  ([docs/sighting-sync.md](docs/sighting-sync.md)).
- **Accounts** — email + password sign-in; the account is created automatically on
  first sign-in, no separate signup step. Account → Delete account removes the account,
  its sightings and photos (migration 0004).
- **Cloud sync** — your sightings push to Supabase and restore on a fresh install;
  photos upload to Supabase Storage; writes stay offline-first and drain the outbox
  once you're back online.
- **Community sightings** — other divers' sightings pull into the map and site cards
  alongside your own.

## Project layout

```
src/app/            expo-router screens ((tabs)/index = My Home, (tabs)/map = Map,
                    (tabs)/logbook = My Log,
                    log/new, site/[id], species/[id], add-site)
src/components/     shared UI (species avatar, rarity chip, map w/ web fallback, …)
src/lib/            domain logic: db (SQLite), store (zustand), dex, demo data, sync
src/data/           curated seed data: species, sites, fetched photo map
scripts/            fetch-species-photos.mjs (iNaturalist photo seeding)
supabase/           SQL migrations for the optional Supabase backend (RLS, PostGIS)
```

## Tests

```bash
npm test        # jest: dex derivation, demo generation, sync outbox, seed integrity
npx tsc --noEmit
```

## Species photos

Reference photos are hot-linked from iNaturalist taxon default photos (mostly
CC-licensed; attribution stored per species and shown in the app). Regenerate after
adding species:

```bash
node scripts/fetch-species-photos.mjs
```

## Next steps

The staged plan is in [docs/roadmap/](docs/roadmap/README.md):
- a bigger, properly sourced dive-site database;
- reports from dive operators and marine organizations, labeled by where they came from;
- community sightings verified by a photo or a buddy's confirmation;
- a faster, offline-first dive log.

From the original spec, still open: seasonality, downloadable offline map regions, and
password reset (needs a custom SMTP provider for Supabase).

### My Home development

The 3D scene uses `expo-gl` + `@react-three/fiber` + `three`, with the SVG island as
fallback; rebuild an existing native dev client with `npx expo run:ios` or
`npx expo run:android` after installing dependencies (expo-gl and expo-asset are
native modules). Models live in `assets/models/marine` (see its LICENSE.md). Regenerate
the family representatives from the Blender sources with `scripts/art/prepare-marine.py`
and the species models with `npm run build:species` (no Blender needed); the species
swim procedurally from `src/lib/marine-rigs.ts`, and `npm run verify:marine` checks every
rig. Up to eight animals swim at once; beyond the eight species models (great hammerheads swim as
the scalloped hammerhead and spinner dolphins as the bottlenose), only shark, ray and
fish categories have family rigs today. How the animals find their way around each other and
the island is described, with a tuning guide, in `docs/marine-navigation.md` (set
`EXPO_PUBLIC_MARINE_DEBUG=1` for an overlay of clearances and steering, or
`EXPO_PUBLIC_ISLAND_SHOWCASE=1` to preview all eight species models together).
Dolphins swim in pods of two or three, and now and then one leaps clear of the water; a
scalloped hammerhead sometimes has company, and a few schooling fish come as small shoals. Each
still counts, and opens, as one species. The ocean widens and the camera pulls back as the island
levels up. All of this is in `docs/marine-navigation.md` too (set `EXPO_PUBLIC_DOLPHIN_LEAPS=1` to
see leaps without waiting). A school of tuna swims with them and reacts to the sharks; a great
white occasionally charges through it. The school stands for the tuna in your collection (a logged tuna is never
drawn as a second, generic fish), and tapping it opens the tuna's species page. The school, the
hunt, the tap target and how to tune them are in `docs/tuna-school.md`.
The surrounding ocean is described, with a tuning guide, in `docs/ocean.md`. On the iOS
simulator and Android emulators the scene renders at a lighter "lite" quality with paced frames,
because their GL runs in software (see `docs/island-performance.md`).
For local browser preview, run `npm run web`. Metro includes SQLite WASM support
and the required isolation headers. Production web hosting also needs
`Cross-Origin-Embedder-Policy: credentialless` and
`Cross-Origin-Opener-Policy: same-origin`.
