# ScubaGo Supabase Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire ScubaGo to a real hosted Supabase backend — email-OTP auth, per-user sighting sync with photo upload, and pull-based restore — so a user's log survives reinstall and community sightings are real.

**Architecture:** The app stays local-first: SQLite remains the source of truth for the user's own sightings, written synchronously with `synced=0`. A sync service (new `src/lib/sync-service.ts`) pushes the outbox (user sites first, then sightings, uploading photos to Supabase Storage) and pulls community + own sightings back into SQLite. Auth is Supabase email OTP (6-digit code — no OAuth app registrations, no Apple Developer account needed). All remote access goes through one nullable client factory (`src/lib/supabase.ts`); when env vars are absent the app behaves exactly as today (fully local), which also keeps Jest green.

**Tech Stack:** Expo SDK 57 (React Native 0.86, TypeScript), expo-sqlite, zustand, `@supabase/supabase-js` v2, `@react-native-async-storage/async-storage` (session persistence), `expo-file-system` (new SDK-57 `File` API for photo bytes), `tsx` (dev-only, runs the TypeScript seed script).

**Spec:** `docs/superpowers/specs/2026-08-24-scubago-design.md`

## Global Constraints

- **Expo docs rule (AGENTS.md):** Expo has changed — before writing code that touches an Expo API, read the exact versioned docs at `https://docs.expo.dev/versions/v57.0.0/`. Already verified for this plan: `expo-file-system` SDK 57 uses `new File(uri).bytes(): Promise<Uint8Array>` (legacy API lives at `expo-file-system/legacy`).
- Install React Native deps with `npx expo install <pkg>` (version-pinned to SDK 57), pure JS deps with `npm install`.
- Every task ends with `npx tsc --noEmit` and `npm test` green before committing.
- Path alias `@/*` → `./src/*` (tsconfig + jest moduleNameMapper). The seed script must NOT rely on the alias at runtime — it runs under `tsx`, so it uses relative imports (the data files' own `@/lib/types` imports are `import type` and erase at runtime).
- Demo sightings (`is_demo=1`) and logged-out sightings (`user_id='local'`) are NEVER pushed to Supabase.
- The app must keep working with no `.env` configured (supabase client is `null` → local-only mode, current behavior).
- Env var names: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (client); `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (seed script only, never committed, never shipped in the app).
- Storage bucket name: `sighting-photos`. Photo path convention: `<auth-uid>/<sighting-id>.<ext>`.
- Commit after every task with a conventional-commit message ending in the Claude co-author trailer.

---

### Task 1: Dependencies, env plumbing, and the nullable Supabase client factory

**Files:**
- Modify: `package.json` (deps via install commands, plus jest moduleNameMapper entry)
- Modify: `.gitignore`
- Create: `.env.example`
- Create: `src/lib/supabase.ts`
- Test: `src/lib/__tests__/supabase.test.ts`

**Interfaces:**
- Consumes: nothing (foundation task).
- Produces: `getSupabase(): SupabaseClient | null` — memoized factory; returns `null` when `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` are unset. Also exported for tests: `createSupabaseForEnv(url?: string, anonKey?: string): SupabaseClient | null`. Every later task checks `getSupabase()` for null before doing remote work.

- [ ] **Step 1: Install dependencies**

```bash
npx expo install @react-native-async-storage/async-storage expo-file-system
npm install @supabase/supabase-js
npm install -D tsx
```

- [ ] **Step 2: Add the AsyncStorage jest mock mapping**

In `package.json`, extend the existing `jest.moduleNameMapper` (keep the two `@/` entries that are already there):

```json
"moduleNameMapper": {
  "^@react-native-async-storage/async-storage$": "@react-native-async-storage/async-storage/jest/async-storage-mock",
  "^@/assets/(.*)$": "<rootDir>/assets/$1",
  "^@/(.*)$": "<rootDir>/src/$1"
}
```

- [ ] **Step 3: Env files.** Append to `.gitignore` (under the existing `# local env files` section):

```
.env
```

Create `.env.example` (committed):

```
# Copy to .env and fill in from Supabase dashboard → Project Settings → API.
# Without these the app runs fully local (no auth, no sync).
EXPO_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-OR-PUBLISHABLE-KEY
```

- [ ] **Step 4: Write the failing test** — `src/lib/__tests__/supabase.test.ts`:

```ts
import { createSupabaseForEnv } from '@/lib/supabase';

describe('createSupabaseForEnv', () => {
  it('returns null when env is missing', () => {
    expect(createSupabaseForEnv(undefined, undefined)).toBeNull();
    expect(createSupabaseForEnv('https://x.supabase.co', undefined)).toBeNull();
    expect(createSupabaseForEnv(undefined, 'key')).toBeNull();
  });

  it('returns a client when both env vars are set', () => {
    const client = createSupabaseForEnv('https://x.supabase.co', 'anon-key');
    expect(client).not.toBeNull();
    expect(client!.auth).toBeDefined();
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npm test -- supabase.test`
Expected: FAIL — cannot find module `@/lib/supabase`.

- [ ] **Step 6: Implement `src/lib/supabase.ts`**

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

/**
 * Nullable Supabase client: null when env is unconfigured, in which case the app
 * runs fully local (the vertical-slice behavior). Session persists via AsyncStorage.
 */
export function createSupabaseForEnv(url?: string, anonKey?: string): SupabaseClient | null {
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
}

let client: SupabaseClient | null | undefined;

export function getSupabase(): SupabaseClient | null {
  if (client === undefined) {
    client = createSupabaseForEnv(
      process.env.EXPO_PUBLIC_SUPABASE_URL,
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    );
    if (client) {
      // Supabase's recommended Expo pattern: refresh tokens only while foregrounded.
      const c = client;
      AppState.addEventListener('change', (state) => {
        if (state === 'active') c.auth.startAutoRefresh();
        else c.auth.stopAutoRefresh();
      });
    }
  }
  return client;
}
```

- [ ] **Step 7: Run tests + typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all suites PASS, tsc clean.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json .gitignore .env.example src/lib/supabase.ts src/lib/__tests__/supabase.test.ts
git commit -m "feat: add nullable Supabase client factory + env plumbing"
```

---

### Task 2: Remote schema rework + seed script

The committed migration has never been applied anywhere (its own header says so), so edit `0001_init.sql` in place rather than stacking a migration on an unapplied one.

Schema changes vs. current file:
1. `profiles` moves first; `sightings.user_id` and `dive_sites.created_by` reference `profiles(user_id)` instead of `auth.users` directly — this is what lets PostgREST embed `profiles(username)` when pulling sightings.
2. `dive_sites` gets plain `lat`/`lng` double columns (what supabase-js reads/writes); `location` becomes a stored generated PostGIS column so the spatial index still works.
3. Storage bucket `sighting-photos` (public read) + owner-folder insert/update policies.

**Files:**
- Modify: `supabase/migrations/0001_init.sql` (full rewrite below)
- Create: `scripts/seed-supabase.ts`
- Modify: `package.json` (add `"seed:supabase"` script)

**Interfaces:**
- Consumes: `SPECIES` from `src/data/species.ts`, `SITES` from `src/data/sites.ts`, photo map from `src/data/species-photos.json` (all via relative imports).
- Produces: remote tables `profiles`, `species`, `dive_sites`, `sightings`; bucket `sighting-photos`. Column names later tasks rely on: `sightings(id, user_id, species_id, site_id, sighted_on, notes, photo_url, created_at)`, `dive_sites(id, name, lat, lng, region, country, blurb, notable_species, source, created_by)`, `profiles(user_id, username)`.

- [ ] **Step 1: Rewrite `supabase/migrations/0001_init.sql`** with exactly:

```sql
-- ScubaGo initial schema (mirrors src/lib/types.ts).
-- Apply with the Supabase CLI (`supabase db push`) or paste into the SQL editor.

create extension if not exists postgis;

-- Public profile names (minimal social: username + derived species count).
-- sightings/dive_sites FK to profiles (not auth.users) so PostgREST can embed
-- profiles(username) when the app pulls sightings.
create table profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null check (char_length(username) between 3 and 24),
  created_at timestamptz not null default now()
);

-- Curated species catalog (seeded by scripts/seed-supabase.ts).
create table species (
  id text primary key,
  common_name text not null,
  scientific_name text not null,
  category text not null check (category in
    ('shark','ray','turtle','mammal','fish','cephalopod','macro','reptile','other')),
  rarity text not null check (rarity in
    ('common','uncommon','rare','epic','legendary')),
  blurb text not null default '',
  emoji text,
  photo_url text,
  photo_attribution text
);

-- Dive sites: seeded + user-added. lat/lng are what the app reads/writes;
-- location is generated from them so spatial queries stay possible.
create table dive_sites (
  id text primary key,
  name text not null,
  lat double precision not null,
  lng double precision not null,
  location geography(point, 4326) generated always as
    (st_setsrid(st_makepoint(lng, lat), 4326)::geography) stored,
  region text not null default '',
  country text not null default '',
  blurb text not null default '',
  notable_species text[] not null default '{}',
  source text not null default 'user' check (source in ('seed', 'user')),
  created_by uuid references profiles (user_id),
  created_at timestamptz not null default now()
);

create index dive_sites_location_idx on dive_sites using gist (location);

create table sightings (
  id text primary key,
  user_id uuid not null references profiles (user_id),
  species_id text not null references species (id),
  site_id text not null references dive_sites (id),
  sighted_on date not null,
  notes text,
  photo_url text, -- public URL in the sighting-photos bucket
  created_at timestamptz not null default now()
);

create index sightings_site_idx on sightings (site_id);
create index sightings_species_idx on sightings (species_id);
create index sightings_user_idx on sightings (user_id);

-- Row-level security: everything publicly readable, owners write their own rows.
alter table species enable row level security;
alter table dive_sites enable row level security;
alter table sightings enable row level security;
alter table profiles enable row level security;

create policy "species are public" on species for select using (true);
create policy "sites are public" on dive_sites for select using (true);
create policy "sightings are public" on sightings for select using (true);
create policy "profiles are public" on profiles for select using (true);

create policy "users add sites" on dive_sites
  for insert with check (auth.uid() = created_by and source = 'user');

create policy "users log own sightings" on sightings
  for insert with check (auth.uid() = user_id);
create policy "users edit own sightings" on sightings
  for update using (auth.uid() = user_id);
create policy "users delete own sightings" on sightings
  for delete using (auth.uid() = user_id);

create policy "users manage own profile" on profiles
  for insert with check (auth.uid() = user_id);
create policy "users update own profile" on profiles
  for update using (auth.uid() = user_id);

-- Sighting photos: public-read bucket; users write only inside their own
-- <uid>/ folder (photo paths are <uid>/<sighting-id>.<ext>).
insert into storage.buckets (id, name, public)
values ('sighting-photos', 'sighting-photos', true);

create policy "photos are public" on storage.objects
  for select using (bucket_id = 'sighting-photos');
create policy "users upload own photos" on storage.objects
  for insert with check (
    bucket_id = 'sighting-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
create policy "users replace own photos" on storage.objects
  for update using (
    bucket_id = 'sighting-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
```

- [ ] **Step 2: Create `scripts/seed-supabase.ts`**

```ts
/**
 * Seed the remote species catalog and curated dive sites.
 * Run: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed:supabase
 * (service-role key bypasses RLS; never commit it, never use it in the app.)
 *
 * Relative imports on purpose: tsx doesn't get the app's `@/` alias here, and the
 * data files' own `@/lib/types` imports are type-only so they erase at runtime.
 */
import { createClient } from '@supabase/supabase-js';

import { SITES } from '../src/data/sites';
import photos from '../src/data/species-photos.json';
import { SPECIES } from '../src/data/species';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const photoMap = photos as Record<string, { url: string; attribution: string }>;
const db = createClient(url, serviceKey);

async function main() {
  const speciesRows = SPECIES.map((s) => ({
    id: s.id,
    common_name: s.commonName,
    scientific_name: s.scientificName,
    category: s.category,
    rarity: s.rarity,
    blurb: s.blurb,
    emoji: s.emoji ?? null,
    photo_url: photoMap[s.id]?.url ?? null,
    photo_attribution: photoMap[s.id]?.attribution ?? null,
  }));
  const { error: speciesError } = await db
    .from('species')
    .upsert(speciesRows, { onConflict: 'id' });
  if (speciesError) throw speciesError;
  console.log(`Seeded ${speciesRows.length} species`);

  const siteRows = SITES.map((s) => ({
    id: s.id,
    name: s.name,
    lat: s.lat,
    lng: s.lng,
    region: s.region,
    country: s.country,
    blurb: s.blurb,
    notable_species: s.notableSpecies,
    source: 'seed',
    created_by: null,
  }));
  const { error: sitesError } = await db
    .from('dive_sites')
    .upsert(siteRows, { onConflict: 'id' });
  if (sitesError) throw sitesError;
  console.log(`Seeded ${siteRows.length} dive sites`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 3: Add the npm script.** In `package.json` scripts:

```json
"seed:supabase": "tsx scripts/seed-supabase.ts"
```

- [ ] **Step 4: Verify** — `npx tsc --noEmit && npm test` (scripts/ is outside `src`, but tsc includes it if tsconfig `include` covers it; if tsc complains about `scripts/seed-supabase.ts` imports under the app's config, add the file to tsconfig `exclude` — it is typechecked by tsx at run time instead). Also sanity-run without env: `npm run seed:supabase` → expected: exits 1 with "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY".

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0001_init.sql scripts/seed-supabase.ts package.json
git commit -m "feat: rework remote schema (profiles FK, lat/lng, storage) + seed script"
```

---

### Task 3: Provision the Supabase project (HUMAN-IN-THE-LOOP), push schema, seed

**Files:**
- Create: `.env` (NOT committed — gitignored in Task 1)
- Create: `supabase/config.toml` (generated by `npx supabase init`; commit it)

**Interfaces:**
- Consumes: migration + seed script from Task 2, `.env.example` from Task 1.
- Produces: a live project whose URL/anon key are in `.env`; remote tables populated (≈119 species, ≈65 sites); Magic Link email template emits a 6-digit code.

- [ ] **Step 1 (HUMAN):** Create a free account at supabase.com → New project (any name, e.g. `scubago`; pick the closest region; note the database password). Free tier is fine.
- [ ] **Step 2 (HUMAN):** Dashboard → Project Settings → API: copy the Project URL and the anon/publishable key into `.env` (copy `.env.example` first). Also copy the `service_role` secret key somewhere temporary for Step 5 — do not put it in `.env`.
- [ ] **Step 3:** Link and push the schema:

```bash
npx supabase login          # opens browser
npx supabase init           # creates supabase/config.toml
npx supabase link --project-ref <PROJECT-REF>   # ref is in the dashboard URL
npx supabase db push
```

Expected: `0001_init.sql` applied without error. (Fallback if CLI fights: paste the migration into Dashboard → SQL Editor and run it.)

- [ ] **Step 4 (HUMAN):** Dashboard → Authentication → Email Templates → **Magic Link**: make the body include the token, e.g. `<h2>Your ScubaGo code</h2><p>{{ .Token }}</p>`. Without this, `signInWithOtp` emails a link instead of the 6-digit code the app asks for.
- [ ] **Step 5:** Seed:

```bash
SUPABASE_URL=<project-url> SUPABASE_SERVICE_ROLE_KEY=<service-role-key> npm run seed:supabase
```

Expected output: `Seeded 119 species` (or current count) and `Seeded 65 dive sites`.

- [ ] **Step 6: Verify** in Dashboard → Table Editor: `species` and `dive_sites` row counts match the seed output; `sighting-photos` bucket exists under Storage.
- [ ] **Step 7: Commit**

```bash
git add supabase/config.toml
git commit -m "chore: link Supabase project config"
```

---

### Task 4: Pure sync helpers — outbox filtering and local↔remote mapping (TDD)

**Files:**
- Modify: `src/lib/sync.ts` (keep `drainOutbox` + `PushFn` + `DrainResult` exactly as-is; add below them)
- Test: `src/lib/__tests__/sync.test.ts` (append new describe blocks; do not touch existing `drainOutbox` tests)

**Interfaces:**
- Consumes: `Sighting`, `DiveSite` from `@/lib/types`.
- Produces (later tasks call these with exactly these signatures):
  - `pushableSightings(all: Sighting[], userId: string): Sighting[]`
  - `pushableSites(all: DiveSite[]): DiveSite[]` *(placeholder note: user sites carry no synced flag in the type — see below, the flag lives in SQLite; this helper only filters `source === 'user'`. The db layer (Task 5) returns only unsynced ones.)*
  - `interface RemoteSightingRow { id: string; user_id: string; species_id: string; site_id: string; sighted_on: string; notes: string | null; photo_url: string | null; created_at: string; profiles: { username: string } | null }`
  - `sightingToRemoteRow(s: Sighting, photoUrl: string | null): Omit<RemoteSightingRow, 'profiles'>`
  - `remoteRowToSighting(row: RemoteSightingRow): Sighting` (`synced: true`, `isDemo: false`, `createdAt` normalized to ISO-Z, `username` falls back to `'diver'`)
  - `interface RemoteSiteRow { id: string; name: string; lat: number; lng: number; region: string; country: string; blurb: string; notable_species: string[]; source: 'seed' | 'user' }`
  - `siteToRemoteRow(site: DiveSite, createdBy: string): RemoteSiteRow & { created_by: string }`
  - `remoteSiteRowToSite(row: RemoteSiteRow): DiveSite`

- [ ] **Step 1: Write the failing tests** — append to `src/lib/__tests__/sync.test.ts`:

```ts
import {
  drainOutbox,
  pushableSightings,
  remoteRowToSighting,
  remoteSiteRowToSite,
  sightingToRemoteRow,
  siteToRemoteRow,
} from '@/lib/sync';
import type { DiveSite, Sighting } from '@/lib/types';

function sighting(overrides: Partial<Sighting>): Sighting {
  return {
    id: 's-1',
    userId: 'uid-1',
    username: 'you',
    speciesId: 'whale-shark',
    siteId: 'richelieu-rock',
    sightedOn: '2026-08-20',
    isDemo: false,
    synced: false,
    createdAt: '2026-08-20T10:00:00.000Z',
    ...overrides,
  };
}

describe('pushableSightings', () => {
  it('keeps only own, unsynced, non-demo sightings', () => {
    const all = [
      sighting({ id: 'keep' }),
      sighting({ id: 'demo', isDemo: true }),
      sighting({ id: 'synced', synced: true }),
      sighting({ id: 'other-user', userId: 'uid-2' }),
      sighting({ id: 'local-unclaimed', userId: 'local' }),
    ];
    expect(pushableSightings(all, 'uid-1').map((s) => s.id)).toEqual(['keep']);
  });
});

describe('sighting mapping', () => {
  it('maps to a remote row, preferring the uploaded photo url', () => {
    const row = sightingToRemoteRow(
      sighting({ notes: 'huge!', photoUri: 'file:///tmp/p.jpg' }),
      'https://cdn/x.jpg',
    );
    expect(row).toEqual({
      id: 's-1',
      user_id: 'uid-1',
      species_id: 'whale-shark',
      site_id: 'richelieu-rock',
      sighted_on: '2026-08-20',
      notes: 'huge!',
      photo_url: 'https://cdn/x.jpg',
      created_at: '2026-08-20T10:00:00.000Z',
    });
  });

  it('never sends a local file uri as photo_url', () => {
    const row = sightingToRemoteRow(sighting({ photoUri: 'file:///tmp/p.jpg' }), null);
    expect(row.photo_url).toBeNull();
  });

  it('passes through an already-remote photo url', () => {
    const row = sightingToRemoteRow(sighting({ photoUri: 'https://cdn/old.jpg' }), null);
    expect(row.photo_url).toBe('https://cdn/old.jpg');
  });

  it('maps a remote row back, normalizing created_at and defaulting username', () => {
    const s = remoteRowToSighting({
      id: 'r-1',
      user_id: 'uid-9',
      species_id: 'manta',
      site_id: 'blue-corner',
      sighted_on: '2026-08-01',
      notes: null,
      photo_url: 'https://cdn/m.jpg',
      created_at: '2026-08-01T09:00:00+00:00',
      profiles: null,
    });
    expect(s).toEqual({
      id: 'r-1',
      userId: 'uid-9',
      username: 'diver',
      speciesId: 'manta',
      siteId: 'blue-corner',
      sightedOn: '2026-08-01',
      notes: undefined,
      photoUri: 'https://cdn/m.jpg',
      isDemo: false,
      synced: true,
      createdAt: '2026-08-01T09:00:00.000Z',
    });
  });
});

describe('site mapping', () => {
  const site: DiveSite = {
    id: 'site-abc',
    name: 'Secret Reef',
    lat: 1.5,
    lng: 100.2,
    region: 'Andaman',
    country: 'Thailand',
    blurb: '',
    notableSpecies: [],
    source: 'user',
  };

  it('round-trips a user site', () => {
    const row = siteToRemoteRow(site, 'uid-1');
    expect(row.created_by).toBe('uid-1');
    expect(row.source).toBe('user');
    expect(remoteSiteRowToSite(row)).toEqual(site);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- sync.test`
Expected: FAIL — `pushableSightings` etc. are not exported.

- [ ] **Step 3: Implement** — append to `src/lib/sync.ts`:

```ts
import type { DiveSite } from '@/lib/types';

/** Own, unsynced, non-demo sightings — the only rows that ever leave the device. */
export function pushableSightings(all: Sighting[], userId: string): Sighting[] {
  return all.filter((s) => !s.synced && !s.isDemo && s.userId === userId);
}

export interface RemoteSightingRow {
  id: string;
  user_id: string;
  species_id: string;
  site_id: string;
  sighted_on: string;
  notes: string | null;
  photo_url: string | null;
  created_at: string;
  profiles: { username: string } | null;
}

export function sightingToRemoteRow(
  s: Sighting,
  photoUrl: string | null,
): Omit<RemoteSightingRow, 'profiles'> {
  const existingRemotePhoto = s.photoUri?.startsWith('http') ? s.photoUri : null;
  return {
    id: s.id,
    user_id: s.userId,
    species_id: s.speciesId,
    site_id: s.siteId,
    sighted_on: s.sightedOn,
    notes: s.notes ?? null,
    photo_url: photoUrl ?? existingRemotePhoto,
    created_at: s.createdAt,
  };
}

export function remoteRowToSighting(row: RemoteSightingRow): Sighting {
  return {
    id: row.id,
    userId: row.user_id,
    username: row.profiles?.username ?? 'diver',
    speciesId: row.species_id,
    siteId: row.site_id,
    sightedOn: row.sighted_on,
    notes: row.notes ?? undefined,
    photoUri: row.photo_url ?? undefined,
    isDemo: false,
    synced: true,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export interface RemoteSiteRow {
  id: string;
  name: string;
  lat: number;
  lng: number;
  region: string;
  country: string;
  blurb: string;
  notable_species: string[];
  source: 'seed' | 'user';
}

export function siteToRemoteRow(
  site: DiveSite,
  createdBy: string,
): RemoteSiteRow & { created_by: string } {
  return {
    id: site.id,
    name: site.name,
    lat: site.lat,
    lng: site.lng,
    region: site.region,
    country: site.country,
    blurb: site.blurb,
    notable_species: site.notableSpecies,
    source: 'user',
    created_by: createdBy,
  };
}

export function remoteSiteRowToSite(row: RemoteSiteRow): DiveSite {
  return {
    id: row.id,
    name: row.name,
    lat: row.lat,
    lng: row.lng,
    region: row.region,
    country: row.country,
    blurb: row.blurb,
    notableSpecies: row.notable_species,
    source: row.source,
  };
}
```

Note: the top of the file already has `import type { Sighting } from '@/lib/types';` — merge into one import: `import type { DiveSite, Sighting } from '@/lib/types';`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test && npx tsc --noEmit`
Expected: PASS (including the pre-existing drainOutbox tests), tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync.ts src/lib/__tests__/sync.test.ts
git commit -m "feat: pure sync mapping + outbox filtering helpers"
```

---

### Task 5: SQLite layer — outbox reads, claim-on-login, remote upserts

Native SQLite doesn't run under jest-expo, so this task keeps every function a thin, obviously-correct wrapper; verification is `tsc` + existing tests + the Task 10 end-to-end pass.

**Files:**
- Modify: `src/lib/db.ts`

**Interfaces:**
- Consumes: `Sighting`, `DiveSite` types; existing `getDb`, `insertSightingRow`, `rowToSighting` internals.
- Produces (exact signatures Task 7/8 call):
  - `loadAll(): Promise<{ sightings: Sighting[]; userSites: DiveSite[] }>` (extracted from `initDb`; `initDb` now seeds demo data then delegates to it)
  - `getUnsyncedUserSites(): Promise<DiveSite[]>`
  - `markSitesSynced(ids: string[]): Promise<void>`
  - `claimLocalSightings(userId: string, username: string): Promise<void>`
  - `upsertSightings(sightings: Sighting[]): Promise<void>`
  - `upsertUserSites(sites: DiveSite[]): Promise<void>`

- [ ] **Step 1: Schema migration for the `user_sites.synced` flag.** Inside `getDb()`, add `synced INTEGER NOT NULL DEFAULT 0` to the `CREATE TABLE IF NOT EXISTS user_sites` column list (fresh installs), and after the `execAsync` block add a guarded ALTER for existing dev databases:

```ts
const ver = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
if ((ver?.user_version ?? 0) < 2) {
  try {
    await db.execAsync('ALTER TABLE user_sites ADD COLUMN synced INTEGER NOT NULL DEFAULT 0');
  } catch {
    // fresh install: column already in CREATE TABLE
  }
  await db.execAsync('PRAGMA user_version = 2');
}
```

- [ ] **Step 2: Extract `loadAll` and add the new functions** — in `src/lib/db.ts`:

```ts
/** Read everything the store needs (no seeding). */
export async function loadAll(): Promise<{ sightings: Sighting[]; userSites: DiveSite[] }> {
  const d = await getDb();
  const sightingRows = await d.getAllAsync<any>(`SELECT * FROM sightings`);
  const siteRows = await d.getAllAsync<any>(`SELECT * FROM user_sites`);
  return {
    sightings: sightingRows.map(rowToSighting),
    userSites: siteRows.map((row) => ({
      id: row.id,
      name: row.name,
      lat: row.lat,
      lng: row.lng,
      region: row.region,
      country: row.country,
      blurb: row.blurb,
      notableSpecies: [],
      source: 'user' as const,
    })),
  };
}

export async function getUnsyncedUserSites(): Promise<DiveSite[]> {
  const d = await getDb();
  const rows = await d.getAllAsync<any>(`SELECT * FROM user_sites WHERE synced = 0`);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    lat: row.lat,
    lng: row.lng,
    region: row.region,
    country: row.country,
    blurb: row.blurb,
    notableSpecies: [],
    source: 'user' as const,
  }));
}

export async function markSitesSynced(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const d = await getDb();
  const placeholders = ids.map(() => '?').join(',');
  await d.runAsync(`UPDATE user_sites SET synced = 1 WHERE id IN (${placeholders})`, ...ids);
}

/** On first sign-in, hand the device-local log to the authenticated user. */
export async function claimLocalSightings(userId: string, username: string): Promise<void> {
  const d = await getDb();
  await d.runAsync(
    `UPDATE sightings SET user_id = ?, username = ?, synced = 0 WHERE user_id = 'local'`,
    userId,
    username,
  );
}

/** Upsert pulled remote sightings (and re-mark own pushed rows as synced). */
export async function upsertSightings(sightings: Sighting[]): Promise<void> {
  if (sightings.length === 0) return;
  const d = await getDb();
  await d.withTransactionAsync(async () => {
    for (const s of sightings) await insertSightingRow(d, s);
  });
}

export async function upsertUserSites(sites: DiveSite[]): Promise<void> {
  if (sites.length === 0) return;
  const d = await getDb();
  await d.withTransactionAsync(async () => {
    for (const site of sites) {
      await d.runAsync(
        `INSERT OR REPLACE INTO user_sites (id, name, lat, lng, region, country, blurb, synced, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        site.id, site.name, site.lat, site.lng, site.region, site.country, site.blurb,
        new Date().toISOString(),
      );
    }
  });
}
```

Then shrink `initDb` so its final read is `return loadAll();` (keep its demo-seeding block unchanged). Also update `insertUserSite` to write `synced = 0` explicitly in its column list.

- [ ] **Step 3: Verify** — `npx tsc --noEmit && npm test` → clean/green.
- [ ] **Step 4: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat: sqlite outbox reads, claim-on-login, remote upserts"
```

---

### Task 6: Auth helpers (email OTP + profile ensure)

**Files:**
- Create: `src/lib/auth.ts`
- Test: `src/lib/__tests__/auth.test.ts`

**Interfaces:**
- Consumes: `getSupabase()` — but every function takes the client as a parameter (`SupabaseClient`) so tests inject fakes; only the UI passes `getSupabase()!`.
- Produces:
  - `usernameForUser(userId: string): string` — pure; `'diver-' + first 8 chars of the uid with dashes stripped`
  - `sendLoginCode(client: SupabaseClient, email: string): Promise<void>`
  - `verifyLoginCode(client: SupabaseClient, email: string, code: string): Promise<{ id: string }>` — resolves with the auth user id, throws on bad code
  - `ensureProfile(client: SupabaseClient, userId: string): Promise<string>` — returns the username (existing or newly created)
  - `getSessionUserId(client: SupabaseClient): Promise<string | null>`
  - `signOut(client: SupabaseClient): Promise<void>`

- [ ] **Step 1: Write failing tests** — `src/lib/__tests__/auth.test.ts`:

```ts
import { usernameForUser } from '@/lib/auth';

describe('usernameForUser', () => {
  it('derives a stable, valid username from the auth uid', () => {
    expect(usernameForUser('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe('diver-a1b2c3d4');
  });
  it('always fits the 3..24 char DB constraint', () => {
    const name = usernameForUser('xy');
    expect(name.length).toBeGreaterThanOrEqual(3);
    expect(name.length).toBeLessThanOrEqual(24);
  });
});
```

- [ ] **Step 2: Run to verify FAIL** — `npm test -- auth.test` → cannot find `@/lib/auth`.
- [ ] **Step 3: Implement `src/lib/auth.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

/** Default username derived from the auth uid; user-editable someday. */
export function usernameForUser(userId: string): string {
  return `diver-${userId.replace(/-/g, '').slice(0, 8)}`;
}

/** Email a 6-digit login code (requires the Magic Link template to include {{ .Token }}). */
export async function sendLoginCode(client: SupabaseClient, email: string): Promise<void> {
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
}

export async function verifyLoginCode(
  client: SupabaseClient,
  email: string,
  code: string,
): Promise<{ id: string }> {
  const { data, error } = await client.auth.verifyOtp({ email, token: code, type: 'email' });
  if (error) throw error;
  if (!data.user) throw new Error('No user returned from verifyOtp');
  return { id: data.user.id };
}

/** Create the public profile row on first login; return the username either way. */
export async function ensureProfile(client: SupabaseClient, userId: string): Promise<string> {
  const { data } = await client
    .from('profiles')
    .select('username')
    .eq('user_id', userId)
    .maybeSingle();
  if (data?.username) return data.username;

  const username = usernameForUser(userId);
  const { error } = await client.from('profiles').insert({ user_id: userId, username });
  if (error && error.code !== '23505') throw error; // 23505 = raced with ourselves; fine
  return username;
}

export async function getSessionUserId(client: SupabaseClient): Promise<string | null> {
  const { data } = await client.auth.getSession();
  return data.session?.user.id ?? null;
}

export async function signOut(client: SupabaseClient): Promise<void> {
  await client.auth.signOut();
}
```

- [ ] **Step 4: Run tests + typecheck** — `npm test && npx tsc --noEmit` → green/clean.
- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts src/lib/__tests__/auth.test.ts
git commit -m "feat: email-OTP auth helpers + profile ensure"
```

---

### Task 7: Sync service — push (with photo upload) then pull (TDD via dependency injection)

**Files:**
- Create: `src/lib/sync-service.ts`
- Test: `src/lib/__tests__/sync-service.test.ts`

**Interfaces:**
- Consumes: Task 4 mappers, Task 5 db functions, `drainOutbox`, `File` from `expo-file-system`.
- Produces: `syncNow(client: SupabaseClient, userId: string, deps?: Partial<SyncDeps>): Promise<{ pushedSites: number; pushedSightings: number; pulled: number }>` — Task 8's store calls this fire-and-forget. `SyncDeps` bundles the db functions + photo uploader so tests inject fakes.

- [ ] **Step 1: Write failing tests** — `src/lib/__tests__/sync-service.test.ts`:

```ts
import { syncNow, type SyncDeps } from '@/lib/sync-service';
import type { DiveSite, Sighting } from '@/lib/types';

const UID = 'uid-1';

function sighting(overrides: Partial<Sighting>): Sighting {
  return {
    id: 's-1', userId: UID, username: 'diver-uid1', speciesId: 'manta',
    siteId: 'site-new', sightedOn: '2026-08-20', isDemo: false, synced: false,
    createdAt: '2026-08-20T10:00:00.000Z', ...overrides,
  };
}

const userSite: DiveSite = {
  id: 'site-new', name: 'Secret Reef', lat: 1, lng: 2, region: '', country: '',
  blurb: '', notableSpecies: [], source: 'user',
};

/** Minimal fake PostgREST/storage surface — records writes, replays pulls. */
function makeFakeClient(pullRows: any[] = [], pullSites: any[] = []) {
  const writes: Record<string, any[]> = { dive_sites: [], sightings: [] };
  const client = {
    from(table: string) {
      return {
        upsert: async (row: any) => { writes[table].push(row); return { error: null }; },
        select: () => ({
          eq: () => Promise.resolve({ data: pullSites, error: null }),
          order: () => ({ limit: () => Promise.resolve({ data: pullRows, error: null }) }),
        }),
      };
    },
  };
  return { client: client as any, writes };
}

function makeDeps(unsyncedSightings: Sighting[], unsyncedSites: DiveSite[]) {
  const calls: Record<string, any[]> = {
    markSynced: [], markSitesSynced: [], upsertSightings: [], upsertUserSites: [],
  };
  const deps: SyncDeps = {
    getUnsyncedSightings: async () => unsyncedSightings,
    getUnsyncedUserSites: async () => unsyncedSites,
    markSynced: async (ids) => { calls.markSynced.push(ids); },
    markSitesSynced: async (ids) => { calls.markSitesSynced.push(ids); },
    upsertSightings: async (s) => { calls.upsertSightings.push(s); },
    upsertUserSites: async (s) => { calls.upsertUserSites.push(s); },
    uploadPhoto: async () => 'https://cdn/uploaded.jpg',
  };
  return { deps, calls };
}

describe('syncNow', () => {
  it('pushes sites before sightings and marks both synced', async () => {
    const { client, writes } = makeFakeClient();
    const { deps, calls } = makeDeps([sighting({})], [userSite]);
    const result = await syncNow(client, UID, deps);
    expect(writes.dive_sites).toHaveLength(1);
    expect(writes.sightings).toHaveLength(1);
    expect(calls.markSitesSynced).toEqual([['site-new']]);
    expect(calls.markSynced).toEqual([['s-1']]);
    expect(result.pushedSites).toBe(1);
    expect(result.pushedSightings).toBe(1);
  });

  it('uploads local photos and sends the public url', async () => {
    const { client, writes } = makeFakeClient();
    const { deps } = makeDeps([sighting({ photoUri: 'file:///p.jpg' })], []);
    await syncNow(client, UID, deps);
    expect(writes.sightings[0].photo_url).toBe('https://cdn/uploaded.jpg');
  });

  it('pulls remote sightings and user sites into the local db', async () => {
    const remoteRow = {
      id: 'r-9', user_id: 'uid-2', species_id: 'manta', site_id: 'blue-corner',
      sighted_on: '2026-08-01', notes: null, photo_url: null,
      created_at: '2026-08-01T09:00:00+00:00', profiles: { username: 'nemo' },
    };
    const remoteSite = {
      id: 'site-x', name: 'X', lat: 3, lng: 4, region: '', country: '',
      blurb: '', notable_species: [], source: 'user',
    };
    const { client } = makeFakeClient([remoteRow], [remoteSite]);
    const { deps, calls } = makeDeps([], []);
    const result = await syncNow(client, UID, deps);
    expect(result.pulled).toBe(1);
    expect(calls.upsertSightings[0][0].username).toBe('nemo');
    expect(calls.upsertUserSites[0][0].id).toBe('site-x');
  });

  it('keeps failed pushes queued without blocking the rest', async () => {
    const { deps, calls } = makeDeps([sighting({ id: 'bad' }), sighting({ id: 'good' })], []);
    const client = {
      from: (table: string) => ({
        upsert: async (row: any) =>
          table === 'sightings' && row.id === 'bad'
            ? { error: { message: 'boom' } }
            : { error: null },
        select: () => ({
          eq: () => Promise.resolve({ data: [], error: null }),
          order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
        }),
      }),
    } as any;
    const result = await syncNow(client, UID, deps);
    expect(calls.markSynced).toEqual([['good']]);
    expect(result.pushedSightings).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify FAIL** — `npm test -- sync-service` → module not found.
- [ ] **Step 3: Implement `src/lib/sync-service.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { File } from 'expo-file-system';

import {
  getUnsyncedUserSites,
  loadAll,
  markSitesSynced,
  markSynced,
  upsertSightings,
  upsertUserSites,
} from '@/lib/db';
import {
  drainOutbox,
  pushableSightings,
  remoteRowToSighting,
  remoteSiteRowToSite,
  sightingToRemoteRow,
  siteToRemoteRow,
  type RemoteSightingRow,
  type RemoteSiteRow,
} from '@/lib/sync';
import type { DiveSite, Sighting } from '@/lib/types';

const PULL_LIMIT = 500;

export interface SyncDeps {
  getUnsyncedSightings: () => Promise<Sighting[]>;
  getUnsyncedUserSites: () => Promise<DiveSite[]>;
  markSynced: (ids: string[]) => Promise<void>;
  markSitesSynced: (ids: string[]) => Promise<void>;
  upsertSightings: (sightings: Sighting[]) => Promise<void>;
  upsertUserSites: (sites: DiveSite[]) => Promise<void>;
  uploadPhoto: (client: SupabaseClient, userId: string, sightingId: string, uri: string) => Promise<string>;
}

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic', webp: 'image/webp',
};

async function uploadPhotoImpl(
  client: SupabaseClient,
  userId: string,
  sightingId: string,
  uri: string,
): Promise<string> {
  const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
  const path = `${userId}/${sightingId}.${ext}`;
  const bytes = await new File(uri).bytes();
  const { error } = await client.storage
    .from('sighting-photos')
    .upload(path, bytes, { contentType: CONTENT_TYPES[ext] ?? 'image/jpeg', upsert: true });
  if (error) throw error;
  return client.storage.from('sighting-photos').getPublicUrl(path).data.publicUrl;
}

const defaultDeps: SyncDeps = {
  getUnsyncedSightings: async () => (await loadAll()).sightings.filter((s) => !s.synced),
  getUnsyncedUserSites,
  markSynced,
  markSitesSynced,
  upsertSightings,
  upsertUserSites,
  uploadPhoto: uploadPhotoImpl,
};

/**
 * Push the outbox (user sites first — sightings FK them), then pull the latest
 * community sightings + user-added sites into SQLite. Per-item failures stay
 * queued for the next drain; one bad row never blocks the rest (drainOutbox).
 */
export async function syncNow(
  client: SupabaseClient,
  userId: string,
  overrides?: Partial<SyncDeps>,
): Promise<{ pushedSites: number; pushedSightings: number; pulled: number }> {
  const deps: SyncDeps = { ...defaultDeps, ...overrides };

  // 1. Push user-added sites (ignoreDuplicates: dive_sites has no owner UPDATE
  //    policy, so ON CONFLICT DO NOTHING keeps RLS happy on re-push).
  const sites = await deps.getUnsyncedUserSites();
  const siteResult = await drainOutbox(
    sites.map((site) => ({ ...({} as Sighting), ...site, id: site.id }) as unknown as Sighting),
    async (item) => {
      const site = sites.find((s) => s.id === item.id)!;
      const { error } = await client
        .from('dive_sites')
        .upsert(siteToRemoteRow(site, userId), { onConflict: 'id', ignoreDuplicates: true });
      if (error) throw error;
    },
  );
  await deps.markSitesSynced(siteResult.synced);

  // 2. Push sightings, uploading any local photo first.
  const unsynced = pushableSightings(await deps.getUnsyncedSightings(), userId);
  const sightingResult = await drainOutbox(unsynced, async (s) => {
    let photoUrl: string | null = null;
    if (s.photoUri && !s.photoUri.startsWith('http')) {
      photoUrl = await deps.uploadPhoto(client, userId, s.id, s.photoUri);
    }
    const { error } = await client.from('sightings').upsert(sightingToRemoteRow(s, photoUrl));
    if (error) throw error;
  });
  await deps.markSynced(sightingResult.synced);

  // 3. Pull: community + own sightings (restores the log on a fresh install).
  const { data: siteRows, error: sitesError } = await client
    .from('dive_sites')
    .select('id,name,lat,lng,region,country,blurb,notable_species,source')
    .eq('source', 'user');
  if (sitesError) throw sitesError;
  await deps.upsertUserSites((siteRows as RemoteSiteRow[]).map(remoteSiteRowToSite));

  const { data: rows, error: pullError } = await client
    .from('sightings')
    .select('id,user_id,species_id,site_id,sighted_on,notes,photo_url,created_at,profiles(username)')
    .order('created_at', { ascending: false })
    .limit(PULL_LIMIT);
  if (pullError) throw pullError;
  const pulled = (rows as unknown as RemoteSightingRow[]).map(remoteRowToSighting);
  await deps.upsertSightings(pulled);

  return {
    pushedSites: siteResult.synced.length,
    pushedSightings: sightingResult.synced.length,
    pulled: pulled.length,
  };
}
```

**Implementation note for the site drain:** the `drainOutbox`-for-sites cast above is ugly; prefer a tiny local loop instead of forcing `DiveSite` through `drainOutbox`'s `Sighting` signature:

```ts
const siteResult = { synced: [] as string[], failed: [] as string[] };
for (const site of sites) {
  try {
    const { error } = await client
      .from('dive_sites')
      .upsert(siteToRemoteRow(site, userId), { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw error;
    siteResult.synced.push(site.id);
  } catch {
    siteResult.failed.push(site.id);
  }
}
```

Use the loop version; it's what the tests exercise.

- [ ] **Step 4: Run tests + typecheck** — `npm test && npx tsc --noEmit` → green/clean.
- [ ] **Step 5: Commit**

```bash
git add src/lib/sync-service.ts src/lib/__tests__/sync-service.test.ts
git commit -m "feat: sync service — push outbox with photo upload, pull community data"
```

---

### Task 8: Store wiring — auth state, claim-on-login, background sync

**Files:**
- Modify: `src/lib/store.ts`

**Interfaces:**
- Consumes: `getSupabase`, `getSessionUserId`, `ensureProfile`, `signOut` (Task 6), `syncNow` (Task 7), `claimLocalSightings`, `loadAll` (Task 5).
- Produces (Task 9's UI reads exactly these):
  - `AppState.user: { id: string; username: string } | null`
  - `AppState.backendEnabled: boolean` (whether env is configured — UI hides the account button entirely when false)
  - `AppState.onSignedIn(user: { id: string; username: string }): Promise<void>`
  - `AppState.signOutUser(): Promise<void>`
  - `useMySightings()` now filters by `user?.id ?? 'local'`

- [ ] **Step 1: Update `src/lib/store.ts`.** New imports:

```ts
import { ensureProfile, getSessionUserId, signOut as authSignOut } from '@/lib/auth';
import { claimLocalSightings, initDb, insertSighting, insertUserSite, loadAll } from '@/lib/db';
import { getSupabase } from '@/lib/supabase';
import { syncNow } from '@/lib/sync-service';
```

Extend the state interface:

```ts
interface AppState {
  ready: boolean;
  sightings: Sighting[];
  userSites: DiveSite[];
  user: { id: string; username: string } | null;
  backendEnabled: boolean;
  init: () => Promise<void>;
  addSighting: (input: NewSighting) => Promise<{ sighting: Sighting; isNewSpecies: boolean }>;
  addSite: (input: NewSite) => Promise<DiveSite>;
  onSignedIn: (user: { id: string; username: string }) => Promise<void>;
  signOutUser: () => Promise<void>;
}
```

New/changed implementation (keep `uid`, `NewSighting`, `NewSite`, `LOCAL_USER_ID`, `LOCAL_USERNAME` as-is):

```ts
export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  sightings: [],
  userSites: [],
  user: null,
  backendEnabled: getSupabase() !== null,

  init: async () => {
    if (get().ready) return;
    const { sightings, userSites } = await initDb();
    set({ sightings, userSites, ready: true });

    // Restore a persisted session, then sync in the background.
    const client = getSupabase();
    if (!client) return;
    try {
      const sessionUid = await getSessionUserId(client);
      if (sessionUid) {
        const username = await ensureProfile(client, sessionUid);
        await get().onSignedIn({ id: sessionUid, username });
      }
    } catch (e) {
      console.warn('session restore failed; staying local', e);
    }
  },

  addSighting: async (input) => {
    const owner = get().user;
    const ownerId = owner?.id ?? LOCAL_USER_ID;
    const mine = get().sightings.filter((s) => s.userId === ownerId);
    const isNewSpecies = isFirstOfSpecies(mine, input.speciesId);
    const sighting: Sighting = {
      id: uid('s'),
      userId: ownerId,
      username: owner?.username ?? LOCAL_USERNAME,
      speciesId: input.speciesId,
      siteId: input.siteId,
      sightedOn: input.sightedOn,
      notes: input.notes || undefined,
      photoUri: input.photoUri,
      isDemo: false,
      synced: false,
      createdAt: new Date().toISOString(),
    };
    await insertSighting(sighting);
    set({ sightings: [...get().sightings, sighting] });

    const client = getSupabase();
    if (client && owner) {
      // Fire-and-forget: failures stay queued in the outbox for the next sync.
      syncNow(client, owner.id)
        .then(async () => set(await loadAll()))
        .catch((e) => console.warn('background sync failed', e));
    }
    return { sighting, isNewSpecies };
  },

  onSignedIn: async (user) => {
    set({ user });
    await claimLocalSightings(user.id, user.username);
    const client = getSupabase();
    if (client) {
      try {
        await syncNow(client, user.id);
      } catch (e) {
        console.warn('initial sync failed; outbox will retry', e);
      }
    }
    set(await loadAll());
  },

  signOutUser: async () => {
    const client = getSupabase();
    if (client) await authSignOut(client);
    set({ user: null });
  },
}));
```

And update the selector at the bottom:

```ts
/** The signed-in user's sightings, or the device-local ones before sign-in. */
export function useMySightings(): Sighting[] {
  const sightings = useAppStore((s) => s.sightings);
  const user = useAppStore((s) => s.user);
  const mineId = user?.id ?? LOCAL_USER_ID;
  return sightings.filter((s) => s.userId === mineId);
}
```

Keep `addSite` unchanged except: after `insertUserSite(site)`, add the same fire-and-forget sync block as `addSighting` (sites are pushed by `syncNow` step 1).

Behavioral note (documented, intentional): after sign-out, previously synced sightings are hidden locally (they belong to the signed-out identity and are safe in the cloud); signing back in shows them again. Pre-sign-in logs always show.

- [ ] **Step 2: Verify** — `npx tsc --noEmit && npm test` → clean/green (existing store-independent tests unaffected).
- [ ] **Step 3: Commit**

```bash
git add src/lib/store.ts
git commit -m "feat: store auth state, claim-on-login, background sync"
```

---

### Task 9: Auth UI — account modal + logbook entry point

**Files:**
- Create: `src/app/auth.tsx`
- Modify: `src/app/_layout.tsx` (register the modal route)
- Modify: `src/app/(tabs)/logbook.tsx` (account button in the header row)

**Interfaces:**
- Consumes: `sendLoginCode`, `verifyLoginCode`, `ensureProfile` (Task 6), `getSupabase`, store's `user` / `backendEnabled` / `onSignedIn` / `signOutUser` (Task 8). Reuses existing components `ThemedText`, `ThemedView`, `OceanButton`, `Spacing`.
- Produces: route `/auth`.

- [ ] **Step 1: Register the route.** In `src/app/_layout.tsx`, inside the `<Stack>` after the `add-site` screen:

```tsx
<Stack.Screen name="auth" options={{ presentation: 'modal', title: 'Account' }} />
```

- [ ] **Step 2: Create `src/app/auth.tsx`.** Before writing, skim `src/app/add-site.tsx` and match its TextInput/form styling conventions (theme colors, spacing). Functional shape:

```tsx
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';

import { OceanButton } from '@/components/ocean-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { ensureProfile, sendLoginCode, verifyLoginCode } from '@/lib/auth';
import { useAppStore } from '@/lib/store';
import { getSupabase } from '@/lib/supabase';

type Step = 'email' | 'code';

export default function AuthScreen() {
  const user = useAppStore((s) => s.user);
  const onSignedIn = useAppStore((s) => s.onSignedIn);
  const signOutUser = useAppStore((s) => s.signOutUser);
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const client = getSupabase();

  if (!client) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Sync isn't configured in this build.</ThemedText>
      </ThemedView>
    );
  }

  if (user) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText type="subtitle">@{user.username}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Your sightings back up automatically and follow you to any device.
        </ThemedText>
        <OceanButton
          title="Sign out"
          onPress={async () => {
            await signOutUser();
            router.back();
          }}
        />
      </ThemedView>
    );
  }

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    try {
      await sendLoginCode(client, email.trim().toLowerCase());
      setStep('code');
    } catch (e: any) {
      setError(e.message ?? 'Could not send the code');
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      const { id } = await verifyLoginCode(client, email.trim().toLowerCase(), code.trim());
      const username = await ensureProfile(client, id);
      await onSignedIn({ id, username });
      router.back();
    } catch (e: any) {
      setError(e.message ?? 'Wrong code — try again');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="subtitle">
        {step === 'email' ? 'Sign in to sync your log' : `Enter the code sent to ${email}`}
      </ThemedText>
      {step === 'email' ? (
        <TextInput
          style={styles.input}
          placeholder="you@example.com"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
      ) : (
        <TextInput
          style={styles.input}
          placeholder="123456"
          keyboardType="number-pad"
          maxLength={6}
          value={code}
          onChangeText={setCode}
        />
      )}
      {error ? (
        <ThemedText type="small" style={{ color: '#c0392b' }}>
          {error}
        </ThemedText>
      ) : null}
      {busy ? (
        <ActivityIndicator />
      ) : step === 'email' ? (
        <OceanButton title="Email me a code" onPress={sendCode} disabled={!email.includes('@')} />
      ) : (
        <View style={{ gap: Spacing.two }}>
          <OceanButton title="Verify" onPress={verify} disabled={code.length !== 6} />
          <OceanButton title="Use a different email" onPress={() => setStep('email')} />
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Spacing.four, gap: Spacing.three },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#8886',
    borderRadius: 10,
    padding: Spacing.two,
    fontSize: 16,
  },
});
```

(If `OceanButton` has no `disabled` prop, check its source and either add one or gate with early-return in the handler — match whatever `add-site.tsx` does for its save button.)

- [ ] **Step 3: Logbook entry point.** In `src/app/(tabs)/logbook.tsx`, replace the bare `<ThemedText type="subtitle">My Log</ThemedText>` with a header row:

```tsx
<View style={styles.titleRow}>
  <ThemedText type="subtitle">My Log</ThemedText>
  {backendEnabled ? (
    <Pressable onPress={() => router.push('/auth')} hitSlop={8}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {user ? `@${user.username}` : 'Sign in to sync'}
      </ThemedText>
    </Pressable>
  ) : null}
</View>
```

with, at the top of the component:

```tsx
const user = useAppStore((s) => s.user);
const backendEnabled = useAppStore((s) => s.backendEnabled);
```

(add `useAppStore` to the existing `@/lib/store` import), and in `styles`:

```tsx
titleRow: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'baseline',
},
```

- [ ] **Step 4: Verify** — `npx tsc --noEmit && npm test` → clean/green.
- [ ] **Step 5: Commit**

```bash
git add src/app/auth.tsx src/app/_layout.tsx "src/app/(tabs)/logbook.tsx"
git commit -m "feat: email-code sign-in screen + logbook account entry point"
```

---

### Task 10: End-to-end verification on the simulator + docs

**Files:**
- Modify: `README.md` (backend section)
- Modify: `docs/superpowers/specs/2026-08-24-scubago-design.md` (move backend items out of "Out of scope")

**Interfaces:** consumes everything; produces a verified, documented feature.

- [ ] **Step 1: Rebuild and launch** — `npx expo run:ios` (native deps were added in Task 1, so a dev-client rebuild is required, not just a Metro reload).
- [ ] **Step 2: Sign-in flow** — My Log → "Sign in to sync" → enter a real email → check inbox for the 6-digit code → verify. Expected: modal shows `@diver-xxxxxxxx`, Supabase Dashboard → Table Editor → `profiles` has 1 row.
- [ ] **Step 3: Push** — log a sighting with a photo. Expected within seconds: `sightings` row in the dashboard with `photo_url` populated, and the object under `sighting-photos/<uid>/` in Storage. Also verify pre-sign-in local sightings were claimed and pushed (they carry your uid now).
- [ ] **Step 4: The reinstall test (the user's headline requirement)** — delete the app from the simulator (long-press → Remove App), `npx expo run:ios` again, sign in with the same email. Expected: your sightings and dex reappear (pulled from Supabase); demo data regenerates as demo.
- [ ] **Step 5: Offline outbox** — enable Airplane-mode-equivalent (turn off Mac network or use simulator network conditioner), log a sighting (saves instantly, no error), restore network, log another or relaunch. Expected: both rows reach Supabase.
- [ ] **Step 6: Second-user visibility** — sign out, sign in with a different email, confirm the first user's sighting appears on the site's card on the map (community pull), and the first user's own log does NOT appear under My Log.
- [ ] **Step 7: Full suite** — `npm test && npx tsc --noEmit` → green/clean.
- [ ] **Step 8: Update docs.** README "Run it" section: add a "Backend (optional)" subsection — copy `.env.example` → `.env`, the four provisioning steps from Task 3, and note the app runs local-only without it. Spec: move "Supabase project provisioning + real auth" and "photo upload" and "sighting sync" from *Out of scope* to a "Shipped since" note.
- [ ] **Step 9: Commit**

```bash
git add README.md docs/superpowers/specs/2026-08-24-scubago-design.md
git commit -m "docs: backend setup instructions; mark auth/sync/photos shipped"
```

---

## Self-review notes

- **Spec coverage:** auth (email OTP — spec's Apple/Google deferred deliberately: needs paid Apple dev account the user doesn't have), sightings RLS (owner writes / public reads ✓), photo upload ✓, offline outbox preserved ✓, user-added sites synced ✓, minimal social (username on sightings via profiles embed ✓). Not covered on purpose: moderation/dedup, seasonality, offline map regions — spec lists them as later work.
- **Type consistency check:** `syncNow(client, userId, overrides?)` matches Task 8's calls (`syncNow(client, owner.id)`); `onSignedIn({id, username})` matches Task 9; `loadAll()` return shape matches `set(...)` usage; `RemoteSightingRow.profiles` matches the PostgREST embed enabled by the profiles FK in Task 2.
- **Known sharp edges for the executor:** (1) `getSupabase()` is memoized at first call — `backendEnabled` in the store reads it at store-creation time, which is fine since env is inlined at build time. (2) Jest must never import `src/lib/supabase.ts` transitively except in its own test — Task 7's tests import `sync-service`, which imports `expo-file-system`; jest-expo mocks expo modules, and `File` is only touched inside `uploadPhotoImpl`, which tests override. If jest still trips on the `expo-file-system` import, move `uploadPhotoImpl` into `src/lib/photo-upload.ts` and lazy-import it in `defaultDeps`.
