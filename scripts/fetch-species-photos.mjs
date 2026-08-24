#!/usr/bin/env node
/**
 * Fetch a reference photo URL + attribution for every species from the iNaturalist API
 * (CC-licensed taxon default photos) and write src/data/species-photos.json.
 *
 * Usage: node scripts/fetch-species-photos.mjs
 * Re-run whenever species are added. Polite to the API: 1 request/second.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const speciesSource = readFileSync(join(root, 'src/data/species.ts'), 'utf8');
const outPath = join(root, 'src/data/species-photos.json');

// Pull id + scientificName pairs out of the TS source (entries are single-line literals).
const entries = [...speciesSource.matchAll(/id:\s*'([^']+)'[^\n]*?scientificName:\s*'([^']+)'/g)]
  .map((m) => ({ id: m[1], scientificName: m[2] }));

if (entries.length === 0) {
  console.error('No species parsed from src/data/species.ts');
  process.exit(1);
}

let existing = {};
try {
  existing = JSON.parse(readFileSync(outPath, 'utf8'));
} catch {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const result = { ...existing };
let fetched = 0;
let failed = 0;

for (const { id, scientificName } of entries) {
  if (result[id]?.url) continue; // already have it
  try {
    const res = await fetch(
      `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(scientificName)}&limit=1`,
      { headers: { 'User-Agent': 'ScubaGo/0.1 (species photo seeding script)' } },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const photo = json.results?.[0]?.default_photo;
    if (photo?.medium_url) {
      result[id] = { url: photo.medium_url, attribution: photo.attribution ?? 'iNaturalist' };
      fetched++;
      console.log(`ok   ${id}`);
    } else {
      failed++;
      console.log(`none ${id}`);
    }
  } catch (err) {
    failed++;
    console.log(`fail ${id}: ${err.message}`);
  }
  await sleep(1000);
}

writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n');
console.log(`\nDone: ${fetched} fetched, ${failed} missing, ${Object.keys(result).length} total → ${outPath}`);
