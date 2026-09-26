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
