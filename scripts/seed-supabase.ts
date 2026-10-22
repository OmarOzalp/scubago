/**
 * Seed the remote species catalog and curated dive sites.
 * Run: SUPABASE_URL=... SUPABASE_SECRET_KEY=... npm run seed:supabase
 *   or put those two lines in .env.seed.local (gitignored, and never read by Expo) and run
 *   npm run seed:supabase; delete the file afterwards. The terminal's own settings win, then
 *   .env.seed.local, then .env (where the app's EXPO_PUBLIC_SUPABASE_URL already is).
 * The secret key (sb_secret_…, or the legacy service_role key as SUPABASE_SERVICE_ROLE_KEY)
 * bypasses RLS: never commit it, never use it in the app.
 *
 * Relative imports on purpose: tsx doesn't get the app's `@/` alias here, and the
 * data files' own `@/lib/types` imports are type-only so they erase at runtime.
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { REGIONS } from '../src/data/regions';
import { SITES, SITES_BY_ID } from '../src/data/sites';
import photos from '../src/data/species-photos.json';
import { SPECIES } from '../src/data/species';
import { REAL_RARITY } from '../src/lib/real-rarity';
import { classifySupabaseKey, isPrivilegedKey } from '../src/lib/supabase-env';
import { parseEnvFile } from './lib/env-files';
import { EXTERNAL_ID_CONFLICT, externalIdRows } from './lib/seed-rows';

const root = join(__dirname, '..');
const ENV_FILES = ['.env.seed.local', '.env'];
const files = ENV_FILES.filter((name) => existsSync(join(root, name))).map((name) => ({
  name,
  values: parseEnvFile(readFileSync(join(root, name), 'utf8')),
}));
/** A setting and where it came from: this terminal first, then the files in order. */
function setting(...names: string[]): { value: string; from: string } | null {
  for (const name of names) if (process.env[name]) return { value: process.env[name], from: 'this terminal' };
  for (const file of files) for (const name of names) if (file.values[name]) return { value: file.values[name], from: file.name };
  return null;
}

const urlSetting = setting('SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_URL');
const keySetting = setting('SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY');
if (!urlSetting || !keySetting) {
  const missing = [!urlSetting && 'SUPABASE_URL', !keySetting && 'SUPABASE_SECRET_KEY'].filter(Boolean).join(' and ');
  const looked = ['this terminal', ...files.map((f) => f.name)].join(', ');
  const lines = [
    `Missing ${missing}. Looked in: ${looked}.`,
    '',
    'Easiest: make a file named .env.seed.local in this folder (git ignores it) with these two lines,',
    'then run npm run seed:supabase again, and delete the file when it is done:',
    '',
    '  SUPABASE_URL=https://<your-project-ref>.supabase.co',
    '  SUPABASE_SECRET_KEY=sb_secret_...',
  ];
  // Notepad and TextEdit like to add their own extension.
  for (const name of ['.env.seed.local.txt', '.env.seed.local.rtf', 'env.seed.local']) {
    if (existsSync(join(root, name))) lines.push('', `There is a file named ${name} here: rename it to exactly .env.seed.local.`);
  }
  console.error(lines.join('\n'));
  process.exit(1);
}
const url = urlSetting.value;
const serviceKey = keySetting.value;
console.log(`Project ${url} (from ${urlSetting.from}); secret key from ${keySetting.from}.`);
if (!isPrivilegedKey(classifySupabaseKey(serviceKey))) {
  console.error('Seeding writes the catalog, which only the secret (or legacy service_role) key may do; the publishable key is read-only here.');
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
    // The tier from encounters at dive sites once fetched (docs/real-rarity.md), as the app's catalogue shows it.
    rarity: REAL_RARITY.get(s.id) ?? s.rarity,
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

  // Regions first: sites point at them.
  const { error: regionsError } = await db.from('regions').upsert(
    REGIONS.map((r) => ({ id: r.id, name: r.name, parent_id: r.parentId ?? null, country: r.country ?? null, mrgid: r.mrgid ?? null, source: r.source })),
    { onConflict: 'id' },
  );
  if (regionsError) throw regionsError;
  console.log(`Seeded ${REGIONS.length} regions`);

  // Every site the app can still resolve, listed or not: one retired, or found to be a seed's duplicate,
  // may have dives and sightings logged at it from before, which need its row to sync. Only the listed
  // sites send sources and external ids below (a duplicate's OSM id now belongs to its seed).
  const siteRows = [...SITES_BY_ID.values()].map((s) => ({
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
    region_id: s.regionId ?? null,
    depth_min_m: s.depthMinM ?? null,
    depth_max_m: s.depthMaxM ?? null,
    difficulty: s.difficulty ?? null,
    dive_types: s.diveTypes ?? [],
    access: s.access ?? [],
    conditions: s.conditions ?? '',
  }));
  const { error: sitesError } = await db
    .from('dive_sites')
    .upsert(siteRows, { onConflict: 'id' });
  if (sitesError) throw sitesError;
  console.log(`Seeded ${siteRows.length} dive sites`);

  // Where each detail came from, and the same places in other datasets.
  const sourceRows = SITES.flatMap((s) => (s.sources ?? []).flatMap((src) => src.fields.map((field) => ({
    site_id: s.id, field, source: src.source, url: src.url ?? null, license: src.license ?? null, retrieved_at: src.retrieved ?? null,
  }))));
  if (sourceRows.length) {
    const { error } = await db.from('site_field_sources').upsert(sourceRows, { onConflict: 'site_id,field,source' });
    if (error) throw error;
  }
  const idRows = externalIdRows(SITES);
  if (idRows.length) {
    const { error } = await db.from('site_external_ids').upsert(idRows, { onConflict: EXTERNAL_ID_CONFLICT });
    if (error) throw error;
  }
  console.log(`Seeded ${sourceRows.length} site sources and ${idRows.length} external ids`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
