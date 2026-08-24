# ScubaGo — Design Spec

**Date:** 2026-08-24 · **Status:** Approved (lean vertical slice, "Approach A")

## What it is

A cross-platform (iOS + Android) app for scuba divers built around two first-class
experiences:

1. **Map** — a world map of dive sites showing what marine life has been seen where,
   so divers can answer "where do I go to see a whale shark?"
2. **My Log** — a personal record of every sighting you've logged, and a species
   collection ("dex") of everything you've ever seen.

Not monetization-driven. Success = useful to divers, makes finding marine life cooler.

## Decisions (from brainstorming, 2026-08-24)

| Question | Decision |
|---|---|
| Core loop | Equal split: Map tab + My Log tab, both first-class |
| Log unit | **Sightings only** — no dive records. A sighting = species + site + date (+ optional photo/notes) |
| Species ID | **Curated picker** — built-in curated species DB (~100 at launch, growable to ~1,500). No free text, no AI photo ID in v1 |
| Dive sites | **Seeded + user-added** — launch with seeded famous sites; users can add missing sites (name + pin) |
| Trust model | **Public by default, photo optional** — photo-backed sightings get a credibility badge and rank higher |
| Offline | **Offline logging** — sightings write locally first, queue, and sync when connected. Map browsing requires signal |
| Collection | **Light dex + rarity** — species tiers (common → legendary), first-seen info, subtle "new species!" celebration. No badges/leaderboards |
| Stack | **Expo (React Native, TypeScript) + Supabase** (auth, Postgres/PostGIS, storage) |
| Social | **Minimal** — sightings show username; light public profile (species count, recent public sightings). No follow/feed/comments |

## Architecture

```
Expo app (TypeScript, expo-router)
 ├─ UI: Map tab · My Log tab · Log-sighting flow · Site/Species detail
 ├─ Local store: SQLite (expo-sqlite) = source of truth for the user's own sightings
 ├─ Seed data: curated species list + curated dive sites (bundled JSON)
 └─ Sync layer: outbox queue → Supabase when configured/online (no custom API server)

Supabase (added when going multi-user)
 ├─ auth (email + Apple/Google)
 ├─ Postgres + PostGIS: sites, species, sightings (RLS: owner writes, public reads)
 └─ storage: sighting photos
```

**Local-first for writes:** every sighting is inserted into SQLite immediately with a
`synced` flag; a sync service drains the outbox when online. In the vertical slice the
sync service is a stub (no-op without Supabase credentials) so the app runs fully
locally. Supabase schema ships as SQL migrations in `supabase/migrations/`.

## Data model

- **species** — id, common_name, scientific_name, category (shark/ray/turtle/fish/
  macro/cephalopod/mammal/other), rarity (common/uncommon/rare/epic/legendary),
  photo_url + attribution, blurb
- **dive_sites** — id, name, lat, lng, region, country, description, source
  (seed/user), created_by
- **sightings** — id, user_id, species_id, site_id, sighted_on (date), notes,
  photo_url?, is_demo, synced, created_at

Dex = derived: `GROUP BY species_id` over the user's sightings (count, first seen
where/when).

## Screens (vertical slice)

1. **Map tab** — world map, site pins; tap pin → bottom sheet: site info, recent
   community sightings, top species seen there. Search by species → highlights sites
   where it's been seen. "Add site" entry point (long-press map).
2. **My Log tab** — segmented: *Sightings* (reverse-chron list) | *Species*
   (dex grid: seen species in color w/ count, unseen greyed by category, rarity
   shown).
3. **Log flow** (floating + button) — pick site (nearby/search/recent) → pick species
   (search/browse curated list) → date (default today) + optional notes/photo → save.
   First-of-species triggers celebration.
4. **Site detail** / **Species detail** — species detail shows rarity, blurb, sites
   where seen; site detail shows sightings log.

## Seed & demo data

- ~60 curated famous dive sites worldwide (name, coords, region, blurb).
- ~100 curated species with rarity tiers; photos hot-linked from iNaturalist
  (CC-licensed, attribution stored) with graceful fallback to category art.
- Generated demo community sightings (flagged `is_demo`) so the map is alive on first
  run — the cold-start problem is the app's biggest product risk.

## Out of scope for the slice (upgrade paths noted)

Supabase project provisioning + real auth (schema ships now); photo upload; full
offline map regions (→ PowerSync/WatermelonDB later); AI photo ID; seasonality
analytics; moderation/dedup tools; badges/leaderboards.

## Testing

Unit tests (Jest) for pure logic: dex derivation, rarity handling, outbox queue
behavior. Screens verified by running the app (Expo Go / simulator). `tsc --noEmit`
clean.
