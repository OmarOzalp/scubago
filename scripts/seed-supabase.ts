/**
 * Seed the remote species catalog and curated dive sites.
 * Run: SUPABASE_URL=... SUPABASE_SECRET_KEY=... npm run seed:supabase
 * The secret key (sb_secret_…, or the legacy service_role key as SUPABASE_SERVICE_ROLE_KEY)
 * bypasses RLS: pass it only on the command line, never commit it, never use it in the app.
 *
 * Relative imports on purpose: tsx doesn't get the app's `@/` alias here, and the
 * data files' own `@/lib/types` imports are type-only so they erase at runtime.
 */
import { createClient } from '@supabase/supabase-js';

import { REGIONS } from '../src/data/regions';
import { SITES } from '../src/data/sites';
import photos from '../src/data/species-photos.json';
import { SPECIES } from '../src/data/species';
import { classifySupabaseKey, isPrivilegedKey } from '../src/lib/supabase-env';

const url = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SECRET_KEY (or the legacy SUPABASE_SERVICE_ROLE_KEY)');
  process.exit(1);
}
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

  // Regions first: sites point at them.
  const { error: regionsError } = await db.from('regions').upsert(
    REGIONS.map((r) => ({ id: r.id, name: r.name, parent_id: r.parentId ?? null, country: r.country ?? null, mrgid: r.mrgid ?? null, source: r.source })),
    { onConflict: 'id' },
  );
  if (regionsError) throw regionsError;
  console.log(`Seeded ${REGIONS.length} regions`);

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
  const idRows = SITES.flatMap((s) => (s.externalIds ?? []).map((ext) => ({
    site_id: s.id, scheme: ext.scheme, external_id: ext.id, relation: ext.relation ?? 'same_as',
  })));
  if (idRows.length) {
    const { error } = await db.from('site_external_ids').upsert(idRows, { onConflict: 'site_id,scheme,external_id' });
    if (error) throw error;
  }
  console.log(`Seeded ${sourceRows.length} site sources and ${idRows.length} external ids`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
