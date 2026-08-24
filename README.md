# ScubaGo 🤿

A map of the world's dive sites and the marine life seen at them. Log what you saw,
grow your species collection, and find out where to go to see a whale shark.

Built with Expo (React Native + TypeScript). Design spec:
[docs/superpowers/specs/2026-08-24-scubago-design.md](docs/superpowers/specs/2026-08-24-scubago-design.md).

## Run it

```bash
npm install
npx expo start
```

- **Phone:** install the Expo Go app (App Store / Play Store) and scan the QR code.
- **iOS simulator:** press `i` (needs Xcode).
- **Android emulator:** press `a` (needs Android Studio).

The app runs fully local: dive sites and species are bundled, your sightings live in
SQLite on device, and demo community sightings are generated on first launch so the
map is alive.

## What's in the slice

- **Map tab** — ~65 famous dive sites worldwide; search "where can I see a…" to
  highlight sites where a species has been spotted; tap a pin for the site card;
  long-press the map to add a missing site.
- **My Log tab** — your sightings, and a species dex of 119 curated species with
  rarity tiers (common → legendary). First-of-species logs get a celebration.
- **Log flow** — site → species → date/notes/photo, designed for speed.
- **Offline-first writes** — sightings save to SQLite immediately with a sync flag;
  `src/lib/sync.ts` drains the outbox once a backend is configured.

## Project layout

```
src/app/            expo-router screens ((tabs)/index = Map, (tabs)/logbook = My Log,
                    log/new, site/[id], species/[id], add-site)
src/components/     shared UI (species avatar, rarity chip, map w/ web fallback, …)
src/lib/            domain logic: db (SQLite), store (zustand), dex, demo data, sync
src/data/           curated seed data: species, sites, fetched photo map
scripts/            fetch-species-photos.mjs (iNaturalist photo seeding)
supabase/           SQL migrations for the future multi-user backend (RLS, PostGIS)
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

## Next steps (per spec)

Supabase project + auth (schema in `supabase/migrations/`), photo upload, sighting
sync, site dedup/moderation, seasonality, downloadable offline map regions.
