/**
 * Import OpenStreetMap dive spots as ScubaGo dive sites (docs/osm-sites.md).
 *
 *   npx tsx scripts/osm-sites/import.ts                      fetch from Overpass, merge, write
 *   npx tsx scripts/osm-sites/import.ts --input saved.json   transform a saved Overpass response instead
 *
 * Fetching needs network access to an Overpass server (OVERPASS_URL, default
 * https://overpass-api.de/api/interpreter); --input needs none. It never writes to Supabase: after
 * an import, the owner seeds the sites with `npm run seed:supabase`.
 *
 * Options:
 *   --input <file>      A saved Overpass JSON response; repeat for several. Skips the network.
 *   --out <file>        Where to write the sites. Default src/data/osm-sites.json; the meta file
 *                       goes beside it (osm-sites.meta.json).
 *   --existing <file>   The stored import to merge with. Default: the --out file, if it exists.
 *   --retrieved <date>  yyyy-mm-dd recorded as the retrieval date. Default: today (UTC).
 *   --dry-run           Print the summary and write nothing.
 *   --allow-shrink      Accept an import that finds under half the sites listed last time.
 *
 * Environment: OVERPASS_URL (the server), OVERPASS_CONTACT (an email or URL added to the
 * User-Agent, which the Overpass etiquette asks for).
 *
 * Relative imports on purpose, as in seed-supabase.ts.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

import { SEED_SITES } from '../../src/data/sites';
import {
  IMPORT_AREAS,
  OSM_ATTRIBUTION,
  importElements,
  looksTruncated,
  matchSeeds,
  mergeWithPrevious,
  type ImportArea,
  type OsmSiteRecord,
  type OverpassElement,
  type OverpassResponse,
} from '../../src/lib/site-import';
import { QUERIES, QUERY_TIMEOUT_S, REFERER, USER_AGENT, queryHash } from './query';

const DEFAULT_OUT = join(__dirname, '../../src/data/osm-sites.json');
const DEFAULT_URL = 'https://overpass-api.de/api/interpreter';
/** One request at a time, with a pause between them, as the Overpass usage policy asks. */
const PAUSE_BETWEEN_REQUESTS_MS = 10_000;
const MAX_ATTEMPTS = 3;

interface Options {
  inputs: string[];
  out: string;
  existing: string | null;
  retrievedOn: string;
  dryRun: boolean;
  allowShrink: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    inputs: [],
    out: DEFAULT_OUT,
    existing: null,
    retrievedOn: new Date().toISOString().slice(0, 10),
    dryRun: false,
    allowShrink: false,
  };
  const value = (i: number, flag: string) => {
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) fail(`${flag} needs a value.`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--input') options.inputs.push(resolve(value(i++, arg)));
    else if (arg === '--out') options.out = resolve(value(i++, arg));
    else if (arg === '--existing') options.existing = resolve(value(i++, arg));
    else if (arg === '--retrieved') options.retrievedOn = value(i++, arg);
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--allow-shrink') options.allowShrink = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(readFileSync(__filename, 'utf8').split('*/')[0].replace(/^\/\*\*\n|^ \* ?/gm, ''));
      process.exit(0);
    } else fail(`Unknown option ${arg}. Try --help.`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.retrievedOn)) fail('--retrieved must look like 2026-10-22.');
  return options;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** Reads a saved Overpass response (an object with `elements`, or a bare array of elements). */
function readResponse(path: string): OverpassResponse {
  const json: unknown = JSON.parse(readFileSync(path, 'utf8'));
  const response = Array.isArray(json) ? { elements: json as OverpassElement[] } : (json as OverpassResponse);
  checkResponse(response, basename(path));
  return response;
}

/**
 * Overpass answers a timed-out or out-of-memory query with a normal status, a `remark` and
 * whatever it had found so far. Partial data would retire real sites, so that is an error.
 */
function checkResponse(response: OverpassResponse, from: string): void {
  if (!response || !Array.isArray(response.elements)) throw new Error(`${from}: not an Overpass JSON response (no "elements").`);
  if (response.remark && /runtime error|timed out|out of memory/i.test(response.remark)) {
    throw new Error(`${from}: Overpass reported "${response.remark}". The result may be partial, so nothing was imported.`);
  }
  for (const el of response.elements) {
    if (!el || typeof el.id !== 'number' || !['node', 'way', 'relation'].includes(el.type)) {
      throw new Error(`${from}: an element without a numeric id and a node/way/relation type.`);
    }
  }
}

async function fetchResponse(url: string, query: string, userAgent: string, label: string): Promise<OverpassResponse> {
  for (let attempt = 1; ; attempt++) {
    console.log(`Asking ${url} for ${label} (attempt ${attempt} of ${MAX_ATTEMPTS})…`);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
        'user-agent': userAgent,
        referer: REFERER,
      },
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.timeout((QUERY_TIMEOUT_S + 30) * 1000),
    });
    if (res.ok) {
      const response = (await res.json()) as OverpassResponse;
      checkResponse(response, label);
      return response;
    }
    // 429: too many requests; 502-504: the server is busy or the query ran out of time. Wait, then try again.
    if ([429, 502, 503, 504].includes(res.status) && attempt < MAX_ATTEMPTS) {
      const retryAfter = Number(res.headers.get('retry-after'));
      const waitS = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 300) : 30 * attempt;
      console.log(`  Overpass answered ${res.status}; waiting ${waitS} s.`);
      await sleep(waitS * 1000);
      continue;
    }
    throw new Error(`${label}: Overpass answered ${res.status} ${res.statusText}: ${(await res.text()).slice(0, 300)}`);
  }
}

function readRecords(path: string): OsmSiteRecord[] {
  if (!existsSync(path)) return [];
  const json: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(json)) throw new Error(`${path} is not a JSON array of sites.`);
  for (const r of json as OsmSiteRecord[]) {
    if (typeof r?.id !== 'string' || !r.id.startsWith('osm-')) throw new Error(`${path}: a record without an osm- id.`);
  }
  return json as OsmSiteRecord[];
}

/** One site per line, so a re-import shows up as a small diff. */
function recordsToJson(records: OsmSiteRecord[]): string {
  return records.length === 0 ? '[]\n' : `[\n${records.map((r) => `  ${JSON.stringify(r)}`).join(',\n')}\n]\n`;
}

const metaPathFor = (out: string) => (out.endsWith('.json') ? `${out.slice(0, -5)}.meta.json` : `${out}.meta.json`);

function listCounts(counts: Record<string, number | undefined>): string {
  const entries = Object.entries(counts).filter(([, n]) => n);
  return entries.length === 0 ? 'none' : entries.map(([k, n]) => `${k} ${n}`).join(', ');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const existingPath = options.existing ?? options.out;
  const previous = readRecords(existingPath);
  const previousLive = previous.filter((r) => !r.retired);

  // 1. Elements: from saved responses, or from Overpass, one request at a time.
  const elements: OverpassElement[] = [];
  const fetched: Record<ImportArea, number | null> = { gbr: null, egypt: null };
  const timestamps: string[] = [];
  const url = process.env.OVERPASS_URL || DEFAULT_URL;
  if (options.inputs.length > 0) {
    for (const path of options.inputs) {
      const response = readResponse(path);
      elements.push(...response.elements);
      if (response.osm3s?.timestamp_osm_base) timestamps.push(response.osm3s.timestamp_osm_base);
    }
    console.log(`Read ${elements.length} elements from ${options.inputs.map((p) => basename(p)).join(', ')} (no network).`);
  } else {
    const contact = process.env.OVERPASS_CONTACT;
    const userAgent = contact ? `${USER_AGENT} ${contact}` : USER_AGENT;
    for (const [index, { area, query }] of QUERIES.entries()) {
      if (index > 0) await sleep(PAUSE_BETWEEN_REQUESTS_MS);
      const response = await fetchResponse(url, query, userAgent, area.label);
      fetched[area.id] = response.elements.length;
      elements.push(...response.elements);
      if (response.osm3s?.timestamp_osm_base) timestamps.push(response.osm3s.timestamp_osm_base);
      console.log(`  ${response.elements.length} elements.`);
    }
  }

  // 2. Transform, dedupe, then merge with what was imported before (nothing is ever removed).
  const result = importElements(elements, { retrievedOn: options.retrievedOn, preferIds: new Set(previousLive.map((r) => r.id)) });
  if (looksTruncated(previousLive.length, result.sites.length) && !options.allowShrink) {
    fail(
      `This import found ${result.sites.length} sites but ${previousLive.length} were listed last time. ` +
        'That looks like a cut-short or wrong response, and would retire most of the file. Nothing was written. Pass --allow-shrink if it is right.',
    );
  }
  const { records, stats } = mergeWithPrevious(previous, result.sites, { retiredOn: options.retrievedOn });
  const seedMatches = matchSeeds(result.sites, SEED_SITES);
  const seedDuplicateIds = new Set(seedMatches.map((m) => m.importedId));
  const live = records.filter((r) => !r.retired);

  // 3. Write the sites and the meta file.
  const regionCounts: Record<string, number> = {};
  for (const r of live) if (r.regionId) regionCounts[r.regionId] = (regionCounts[r.regionId] ?? 0) + 1;
  const meta = {
    generatedAt: new Date().toISOString(),
    source: 'OpenStreetMap contributors, via the Overpass API',
    licence: 'ODbL-1.0',
    licenceUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
    attribution: OSM_ATTRIBUTION,
    copyrightUrl: 'https://www.openstreetmap.org/copyright',
    overpassUrl: options.inputs.length > 0 ? null : url,
    inputFiles: options.inputs.length > 0 ? options.inputs.map((p) => basename(p)) : null,
    osmBaseTimestamp: timestamps.length > 0 ? timestamps.sort()[0] : null,
    queryHash: queryHash(),
    retrievedOn: options.retrievedOn,
    count: records.length,
    active: live.length,
    retired: records.length - live.length,
    seedDuplicates: seedMatches.length,
    elements: Object.fromEntries(IMPORT_AREAS.map((a) => [a.id, { fetched: fetched[a.id], accepted: result.acceptedByArea[a.id] }])),
    regions: Object.fromEntries(Object.entries(regionCounts).sort(([a], [b]) => (a < b ? -1 : 1))),
    skipped: result.skippedByReason,
  };
  if (!options.dryRun) {
    mkdirSync(dirname(options.out), { recursive: true });
    writeFileSync(options.out, recordsToJson(records));
    writeFileSync(metaPathFor(options.out), `${JSON.stringify(meta, null, 2)}\n`);
  }

  // 4. Say what happened.
  const listed = live.filter((r) => !seedDuplicateIds.has(r.id)).length;
  console.log('');
  console.log(`OpenStreetMap dive-site import, ${options.retrievedOn}${options.dryRun ? ' (dry run: nothing written)' : ''}`);
  console.log(`  Elements read: ${elements.length}`);
  console.log(`  Accepted as dive spots, per area: ${listCounts(result.acceptedByArea)}`);
  console.log(`  Merged as the same place mapped twice: ${result.merged.length} (${result.merged.map((g) => `${g.kept} <- ${g.dropped.join(', ')}`).join('; ') || 'none'})`);
  console.log(`  Sites from this run: ${result.sites.length}. By region: ${listCounts(result.byRegion)}`);
  console.log(`  Skipped: ${result.skipped.length} (${listCounts(result.skippedByReason)})`);
  for (const reason of Object.keys(result.skippedByReason)) {
    const examples = result.skipped.filter((s) => s.reason === reason).slice(0, 5);
    console.log(`    ${reason}: ${examples.map((s) => (s.name ? `${s.ref} "${s.name}"` : s.ref)).join(', ')}${(result.skippedByReason[reason as keyof typeof result.skippedByReason] ?? 0) > 5 ? ', …' : ''}`);
  }
  console.log(`  Duplicates of seed sites (not listed again; the seed gets the OSM id): ${seedMatches.length}`);
  for (const m of seedMatches) console.log(`    ${m.importedId} = ${m.seedId} (${m.distanceM} m, ${m.basis})`);
  console.log(`  Against ${previous.length ? basename(existingPath) : 'no earlier file'}: ${stats.added.length} added, ${stats.updated.length} updated, ${stats.unchanged} unchanged, ${stats.retired.length} retired, ${stats.revived.length} listed again`);
  for (const id of stats.retired) console.log(`    retired: ${id}`);
  console.log(`  In the file: ${records.length} sites (${live.length} live, ${records.length - live.length} retired). New in the app: ${listed}.`);
  if (listed < 400) console.log(`  OSM has fewer than the ~400 sites hoped for. Nothing was added to make up the number.`);
  if (!options.dryRun) console.log(`  Wrote ${options.out} and ${metaPathFor(options.out)}`);
}

main().catch((e) => {
  // fetch reports a network failure as just "fetch failed"; the reason is in `cause`.
  const cause = e instanceof Error && e.cause instanceof Error ? ` (${e.cause.message})` : '';
  console.error(`${e instanceof Error ? e.message : e}${cause}`);
  if (cause) console.error('Could not reach the Overpass server. Nothing was written. Check OVERPASS_URL and that the host is allowed on this network, or use --input with a saved response.');
  process.exit(1);
});
