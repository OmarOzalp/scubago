# ScubaGo 🤿

A map of the world's dive sites and the marine life seen at them. Log what you saw,
grow your species collection, and find out where to go to see a whale shark.

Built with Expo (React Native + TypeScript). Design spec:
[docs/superpowers/specs/2026-08-24-scubago-design.md](docs/superpowers/specs/2026-08-24-scubago-design.md).

## Run it

This is Expo SDK 57. Expo Go from the App Store/Play Store only supports SDK 54, so
Expo Go does **not** work here — the app runs via a dev build instead.

```bash
npm install
npx expo run:ios      # needs Xcode
npx expo run:android  # needs Android Studio
```

The app runs fully local: dive sites and species are bundled, your sightings live in
SQLite on device, and demo community sightings are generated on first launch so the
map is alive.

### Backend (optional)

Without a `.env` file the app runs fully local, exactly as above — no auth, no sync.
To turn on the real backend:

```bash
cp .env.example .env
# fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY
# from your Supabase dashboard → Project Settings → API

npx supabase link --project-ref <ref>
npx supabase db push          # apply supabase/migrations/

SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed:supabase
                               # seeds the species + dive-site catalog (service-role key,
                               # never put this in the app or commit it)
```

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

- **Map tab** — ~65 famous dive sites worldwide; search "where can I see a…" to
  highlight sites where a species has been spotted; tap a pin for the site card;
  long-press the map to add a missing site.
- **My Log tab** — your sightings, and a species dex of 119 curated species with
  rarity tiers (common → legendary). First-of-species logs get a celebration.
- **Log flow** — site → species → date/notes/photo, designed for speed.
- **Offline-first writes** — sightings save to SQLite immediately with a sync flag;
  `src/lib/sync.ts` drains the outbox once a backend is configured.
- **Accounts** — email + password sign-in; the account is created automatically on
  first sign-in, no separate signup step.
- **Cloud sync** — your sightings push to Supabase and restore on a fresh install;
  photos upload to Supabase Storage; writes stay offline-first and drain the outbox
  once you're back online.
- **Community sightings** — other divers' sightings pull into the map and site cards
  alongside your own.

## Project layout

```
src/app/            expo-router screens ((tabs)/index = Map, (tabs)/logbook = My Log,
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

## Next steps (per spec)

Site dedup/moderation, seasonality, downloadable offline map regions, magic-link or
social sign-in (needs custom SMTP or a paid plan), account recovery / password reset
(same email constraint).
