/**
 * A photo for every species from iNaturalist, under a licence that lets the app use it anywhere,
 * commercial use included: CC0 or CC BY, else CC BY-SA. Writes src/data/species-photos.json, one
 * `{ url, attribution, license, source }` per species (`source` is the photo's iNaturalist page,
 * where its licence is stated).
 *
 * For each species: the iNaturalist taxon named exactly as the catalogue (or as one of its known
 * synonyms), then the first of that taxon's own curated photos under an allowed licence, else the
 * first photo of its most-favoured research-grade observation under one. A species with neither
 * gets no photo; the app shows its painting instead.
 *
 * Run:  npx tsx scripts/fetch-species-photos.ts             fill in missing photos, replace any not allowed
 *       npx tsx scripts/fetch-species-photos.ts --dry-run   say what would change, write nothing
 * A photo already allowed is kept. OVERRIDES pins a photo where the automatic choice showed the wrong
 * thing (each one checked by eye). One request a second.
 *
 * Relative imports on purpose: tsx doesn't get the app's `@/` alias in scripts.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { SPECIES } from '../src/data/species';
import { SYNONYMS } from '../src/lib/external-sightings/synonyms';

const OUT = join(__dirname, '../src/data/species-photos.json');
const API = 'https://api.inaturalist.org/v1';
const HEADERS = { 'User-Agent': 'ScubaGo/1.0 (species photo script; https://github.com/OmarOzalp/scubago)' };

/** iNaturalist licence codes the app may use, best first (CC0 and CC BY ask the same: credit). */
const ALLOWED: Record<string, { rank: number; label: string; url: string }> = {
  cc0: { rank: 0, label: 'CC0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  'cc-by': { rank: 0, label: 'CC BY', url: 'https://creativecommons.org/licenses/by/4.0/' },
  'cc-by-sa': { rank: 1, label: 'CC BY-SA', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
};

/**
 * Photos chosen by hand (an iNaturalist observation and the photo in it), where the automatic one showed the wrong thing: a dead
 * or landed animal, one held in a hand or a net, one too hidden or far to see, a tank's window, or
 * another animal altogether (the garibaldi's was an osprey carrying one). Each one checked by eye.
 */
const OVERRIDES: Record<string, [observation: number, photo: number]> = {
  'banded-sea-krait': [270171562, 485849676],
  'bull-shark': [329634698, 597561973],
  garibaldi: [178795972, 311184478],
  'giant-grouper': [19499390, 30003719],
  'giant-guitarfish': [78334040, 128183924],
  'great-barracuda': [175948514, 305835829],
  'great-white-shark': [47358736, 75109887],
  'harbor-seal': [344894030, 628462029],
  'hawksbill-turtle': [146001991, 250912581],
  'mimic-octopus': [167943882, 290986957],
  'olive-ridley-turtle': [95712236, 158927228],
  sailfish: [180055721, 313572447],
  'sand-tiger-shark': [329650348, 597593028],
  'silky-shark': [333997667, 606440062],
  'tasselled-wobbegong': [329192241, 596668754],
  'thresher-shark': [327336174, 593010301],
};

interface PhotoEntry {
  url: string;
  attribution: string;
  /** "CC0", "CC BY" or "CC BY-SA". */
  license: string;
  /** The photo's page on iNaturalist. */
  source: string;
}

interface InatPhoto {
  id: number;
  license_code: string | null;
  attribution: string;
  medium_url?: string;
  url?: string;
}

const dryRun = process.argv.includes('--dry-run');
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let lastRequest = 0;

async function get(path: string): Promise<any> {
  const wait = lastRequest + 1000 - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequest = Date.now();
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${API}${path}`, { headers: HEADERS });
    if (res.ok) return res.json();
    if (attempt >= 3 || (res.status < 500 && res.status !== 429)) throw new Error(`${path}: HTTP ${res.status}`);
    await sleep(5000 * attempt);
  }
}

const mediumUrl = (photo: InatPhoto) => photo.medium_url ?? photo.url?.replace('/square.', '/medium.');

function entryOf(photo: InatPhoto): PhotoEntry | null {
  const licence = photo.license_code ? ALLOWED[photo.license_code] : undefined;
  const url = mediumUrl(photo);
  if (!licence || !url) return null;
  // iNaturalist credits a CC0 photo as just "no rights reserved"; say which licence that is.
  const attribution = photo.attribution.includes(`(${licence.label})`) ? photo.attribution : `${photo.attribution} (${licence.label})`;
  return { url, attribution, license: licence.label, source: `https://www.inaturalist.org/photos/${photo.id}` };
}

/** The best allowed photo in a list: the first at the best licence rank. */
function best(photos: InatPhoto[]): PhotoEntry | null {
  let pick: { photo: InatPhoto; rank: number } | null = null;
  for (const photo of photos) {
    const rank = photo.license_code ? ALLOWED[photo.license_code]?.rank : undefined;
    if (rank !== undefined && (!pick || rank < pick.rank)) pick = { photo, rank };
  }
  return pick ? entryOf(pick.photo) : null;
}

/**
 * The species named exactly `name`, else the one whose search matched exactly `name` (an older name it
 * now goes by: "Sepia latimanus" is Ascarosepion latimanus). Only species and subspecies: a search for
 * "Amphiprion ocellaris" also finds the "Amphiprion percula" complex, which holds both clownfish.
 */
async function taxonNamed(name: string): Promise<{ id: number; name: string } | null> {
  const json = await get(`/taxa?q=${encodeURIComponent(name)}&is_active=true&per_page=30`);
  const wanted = name.toLowerCase();
  const species = (json.results as any[]).filter((t) => t.rank === 'species' || t.rank === 'subspecies');
  const hit = species.find((t) => t.name.toLowerCase() === wanted) ?? species.find((t) => t.matched_term?.toLowerCase() === wanted);
  return hit ? { id: hit.id, name: hit.name } : null;
}

async function photoFor(id: string, scientificName: string): Promise<{ entry: PhotoEntry | null; taxon: string | null; from: string }> {
  if (OVERRIDES[id]) {
    const [observation, photo] = OVERRIDES[id];
    const json = await get(`/observations/${observation}`);
    const found = (json.results?.[0]?.photos as InatPhoto[] | undefined)?.find((p) => p.id === photo);
    return { entry: found ? entryOf(found) : null, taxon: json.results?.[0]?.taxon?.name ?? null, from: 'chosen by hand' };
  }
  const names = [scientificName, ...Object.entries(SYNONYMS).filter(([, to]) => to === id).map(([from]) => from)];
  let taxon: { id: number; name: string } | null = null;
  for (const name of names) if ((taxon = await taxonNamed(name))) break;
  if (!taxon) return { entry: null, taxon: null, from: 'no taxon' };

  const detail = await get(`/taxa/${taxon.id}`);
  const curated = best(((detail.results?.[0]?.taxon_photos ?? []) as { photo: InatPhoto }[]).map((t) => t.photo));
  // A curated CC0 or CC BY photo is the best there is; a curated CC BY-SA one waits for an observation's CC0 or CC BY.
  if (curated && curated.license !== 'CC BY-SA') return { entry: curated, taxon: taxon.name, from: 'taxon photo' };

  // The most-favoured research-grade observation whose first photo is allowed: of a wild animal marked
  // alive first (the most-favoured are often strandings and catches), then of any wild one.
  const ALIVE = '&term_id=17&term_value_id=18';
  for (const [licences, filter] of [['cc0,cc-by', ALIVE], ['cc0,cc-by', ''], ['cc-by-sa', '']]) {
    const obs = await get(`/observations?taxon_id=${taxon.id}&quality_grade=research&captive=false${filter}&photo_license=${licences}&order_by=votes&order=desc&per_page=10`);
    for (const o of obs.results as { photos: InatPhoto[] }[]) {
      const first = o.photos?.[0];
      const entry = first ? entryOf(first) : null;
      if (entry) return { entry, taxon: taxon.name, from: `observation (${licences}${filter ? ', alive' : ''})` };
    }
    if (curated && licences === 'cc-by-sa') break;
  }
  if (curated) return { entry: curated, taxon: taxon.name, from: 'taxon photo' };
  return { entry: null, taxon: taxon.name, from: 'no allowed photo' };
}

/** An entry written before licences were recorded: its licence from the attribution, its page from the URL. */
function upgrade(entry: Partial<PhotoEntry> & { url: string; attribution: string }): PhotoEntry | null {
  if (entry.license && entry.source) {
    const { attribution, license } = entry;
    return { ...(entry as PhotoEntry), attribution: attribution.includes(`(${license})`) ? attribution : `${attribution} (${license})` };
  }
  const code = /\((CC0|CC BY-SA|CC BY)\)/.exec(entry.attribution)?.[1];
  const photoId = /\/photos\/(\d+)\//.exec(entry.url)?.[1];
  if (!code || !photoId) return null;
  return { ...entry, license: code, source: `https://www.inaturalist.org/photos/${photoId}` };
}

async function main() {
  const existing = JSON.parse(readFileSync(OUT, 'utf8')) as Record<string, Partial<PhotoEntry> & { url: string; attribution: string }>;
  const result: Record<string, PhotoEntry> = {};
  const changed: string[] = [];
  const none: string[] = [];
  for (const s of SPECIES) {
    const kept = existing[s.id] ? upgrade(existing[s.id]) : null;
    if (kept && !OVERRIDES[s.id]) {
      result[s.id] = kept;
      continue;
    }
    const { entry, taxon, from } = await photoFor(s.id, s.scientificName);
    const before = existing[s.id];
    const was = !before ? 'none' : (before.license ?? /\((CC[^)]*)\)/.exec(before.attribution)?.[1] ?? (/all rights reserved/.test(before.attribution) ? 'all rights reserved' : '?'));
    if (entry) {
      result[s.id] = entry;
      changed.push(`${s.id.padEnd(28)} ${String(was).padEnd(22)} -> ${entry.license.padEnd(9)} ${from}${taxon && taxon.toLowerCase() !== s.scientificName.toLowerCase() ? ` (iNaturalist: ${taxon})` : ''}`);
    } else {
      none.push(`${s.id} (${s.scientificName}): ${from}`);
    }
    console.log(entry ? `ok   ${s.id}` : `none ${s.id}: ${from}`);
  }
  console.log(`\nReplaced or added ${changed.length}:\n  ${changed.join('\n  ')}`);
  if (none.length) console.log(`\nNo allowed photo for ${none.length} (they show their painting):\n  ${none.join('\n  ')}`);
  console.log(`\n${Object.keys(result).length} of ${SPECIES.length} species have a photo.`);
  if (dryRun) return console.log('Dry run: nothing written.');
  writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Wrote ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
