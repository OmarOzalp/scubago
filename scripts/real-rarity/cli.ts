/**
 * The real-rarity script's logic (docs/real-rarity.md), apart from the entry point in fetch.ts so
 * tests can run it in-process, with a stand-in for the network and the files in a scratch folder.
 *
 * Relative imports on purpose, as in scripts/osm-sites/import.ts. Run from the repository root.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

import { SPECIES } from '../../src/data/species';
import { HttpError } from '../../src/lib/external-sightings/errors';
import {
  NOT_FETCHED_REASON,
  REAL_RARITY_REGIONS,
  buildRealRarityData,
  readRawCounts,
  type RealRarityData,
  type RealRarityRegion,
  type SpeciesCounts,
} from '../../src/lib/real-rarity';
import type { Species } from '../../src/lib/types';
import { createPoliteClient, type PoliteClient } from './client';
import {
  REGION_BOXES,
  inatObservationsUrl,
  inatObserversUrl,
  inatTaxaUrl,
  namesForSpecies,
  obisCountUrl,
  parseInatTotal,
  parseObisTotal,
  pickTaxon,
} from './requests';

const DATA_DIR = join(__dirname, '../../src/data');
export const DEFAULT_OUT = join(DATA_DIR, 'real-rarity.json');
/** After this many species in a row fail, the run stops: the network is almost certainly down. */
const MAX_CONSECUTIVE_FAILURES = 5;

export const HELP = `Worldwide record counts (docs/real-rarity.md).

  NODE_USE_ENV_PROXY=1 npx tsx scripts/real-rarity/fetch.ts   ask iNaturalist and OBIS, write src/data/real-rarity.json
  npx tsx scripts/real-rarity/fetch.ts --input saved.json     recompute the scores from saved counts (no network)

These counts say how much each animal is recorded worldwide. They set no tier: the tiers come from
encounters at dive sites (scripts/real-rarity/encounters.ts). The file is kept as supporting evidence.

Fetching needs network access to api.inaturalist.org and api.obis.org, one request at a time, at least
1.1 s apart: about 500 requests, roughly ten minutes. Run it from the repository root. It never writes
to Supabase and needs no key. Node’s fetch only uses a proxy with NODE_USE_ENV_PROXY=1.

Options:
  --input <file>        Saved counts (this script's own output, a checkpoint, or a hand-made file).
                        Skips the network; any score in it is worked out again, and a tier (from an
                        earlier version of the script) is dropped.
  --out <file>          Where to write. Default src/data/real-rarity.json (src/data/real-rarity.<region>.json
                        with --region).
  --region gbr|red-sea  Count only inside a box (gbr: Great Barrier Reef and inner Coral Sea; red-sea: the
                        Red Sea with its gulfs).
  --only <ids>          Fetch just these catalogue ids (comma-separated), as a dry run unless --out is given.
                        Use it for a first look: --only whale-shark --dry-run
  --dry-run             Print the summary and write nothing, not even a checkpoint.
  --fresh               Ignore a checkpoint (<out>.partial.json) from an interrupted run and start over.
  --allow-incomplete    Write the file even if some species could not be fetched; they are listed as unresolved.
  --contact <text>      An email or URL added to the User-Agent (or set REAL_RARITY_CONTACT).
  --help                This text.
`;

export class UsageError extends Error {}

export interface Options {
  input: string | null;
  out: string | null;
  region: RealRarityRegion | null;
  only: string[] | null;
  dryRun: boolean;
  fresh: boolean;
  allowIncomplete: boolean;
  contact: string | undefined;
  help: boolean;
}

export function parseArgs(argv: readonly string[]): Options {
  const options: Options = {
    input: null,
    out: null,
    region: null,
    only: null,
    dryRun: false,
    fresh: false,
    allowIncomplete: false,
    contact: undefined,
    help: false,
  };
  const value = (i: number, flag: string) => {
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) throw new UsageError(`${flag} needs a value.`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--input') options.input = resolve(value(i++, arg));
    else if (arg === '--out') options.out = resolve(value(i++, arg));
    else if (arg === '--region') {
      const region = value(i++, arg);
      if (!(REAL_RARITY_REGIONS as readonly string[]).includes(region)) throw new UsageError(`--region must be one of ${REAL_RARITY_REGIONS.join(', ')}.`);
      options.region = region as RealRarityRegion;
    } else if (arg === '--only') options.only = value(i++, arg).split(',').map((id) => id.trim()).filter(Boolean);
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--fresh') options.fresh = true;
    else if (arg === '--allow-incomplete') options.allowIncomplete = true;
    else if (arg === '--contact') options.contact = value(i++, arg);
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new UsageError(`Unknown option ${arg}. Try --help.`);
  }
  if (options.input && options.only) throw new UsageError('--only fetches from the network; it cannot be used with --input.');
  return options;
}

// ── Files ────────────────────────────────────────────────────────────────────

/** Where the result goes: --out, else the bundled file (or the region's own beside it). */
const outPathFor = (options: Options, region: RealRarityRegion | null) =>
  options.out ?? (region ? join(DATA_DIR, `real-rarity.${region}.json`) : DEFAULT_OUT);

/** --only without --out looks at a few species; it must not overwrite the real file with a nearly empty one. */
const isDryRun = (options: Options) => options.dryRun || (options.only !== null && options.out === null);

/** `x.json` becomes `x.partial.json`: the checkpoint that lets an interrupted run carry on. */
export const partialPathFor = (out: string) => (out.endsWith('.json') ? `${out.slice(0, -5)}.partial.json` : `${out}.partial.json`);

/** Written to a temporary name first, so a run stopped half-way never leaves half a file. */
function writeFileAtomic(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, text);
  renameSync(temporary, path);
}

/** One species per line, so a re-run shows up as a small diff. */
export function toJson(data: RealRarityData): string {
  const block = (items: string[], close: string) => (items.length ? `{\n${items.join(',\n')}\n${close}}` : '{}');
  const species = block(
    Object.entries(data.species).map(([id, entry]) => `    ${JSON.stringify(id)}: ${JSON.stringify(entry)}`),
    '  ',
  );
  const unresolved = data.unresolved && data.unresolved.length > 0 ? `[\n${data.unresolved.map((u) => `    ${JSON.stringify(u)}`).join(',\n')}\n  ]` : '[]';
  const text = JSON.stringify({ ...data, species: '@@species@@', unresolved: data.unresolved ? '@@unresolved@@' : undefined }, null, 2);
  return `${text.replace('"@@species@@"', () => species).replace('"@@unresolved@@"', () => unresolved)}\n`;
}

// ── Asking the sources ───────────────────────────────────────────────────────

export interface FetchedSpecies {
  counts: SpeciesCounts;
  /** Why there is nothing to count, when a name matched nothing. */
  reason?: string;
  /** Notes worth a line in the log. */
  notes: string[];
}

const isRefusal = (error: unknown): error is HttpError => error instanceof HttpError && (error.status === 400 || error.status === 422);
const isClientError = (error: unknown): error is HttpError => error instanceof HttpError && error.status >= 400 && error.status < 500 && error.status !== 429;

/** A total asked for with no rows (page size 0); a server that refuses 0 is asked again with 1. */
async function totalOnly(client: PoliteClient, urlFor: (pageSize: number) => string, parse: (json: unknown) => number): Promise<number> {
  try {
    return parse(await client.getJson(urlFor(0)));
  } catch (error) {
    if (!isRefusal(error)) throw error;
    return parse(await client.getJson(urlFor(1)));
  }
}

/**
 * Ask both sources about one catalogue species, under all of its names (docs/real-rarity.md):
 * resolve each name to an iNaturalist taxon, count the research-grade observations and observers of
 * those taxa together, and count the OBIS records under every name in one request. A request that
 * still fails after its retries throws, and the species is not counted.
 */
export async function fetchSpecies(
  client: PoliteClient,
  species: Pick<Species, 'id' | 'scientificName'>,
  catalog: readonly Pick<Species, 'id' | 'scientificName'>[],
  region?: RealRarityRegion,
): Promise<FetchedSpecies> {
  const names = namesForSpecies(species, catalog);
  const notes: string[] = [];
  const taxonIds: number[] = [];
  const unmatched: string[] = [];
  for (const name of names) {
    const taxon = pickTaxon(await client.getJson(inatTaxaUrl(name)), name);
    if (!taxon) unmatched.push(name);
    else if (!taxonIds.includes(taxon.id)) taxonIds.push(taxon.id);
  }
  if (taxonIds.length === 0) {
    return { counts: {}, reason: `No active iNaturalist species matched ${names.join(', ')}.`, notes };
  }
  if (unmatched.length > 0) notes.push(`no iNaturalist species for ${unmatched.join(', ')}`);

  const observations = await totalOnly(client, (n) => inatObservationsUrl(taxonIds, region, n), parseInatTotal);
  let observers: number | undefined;
  try {
    observers = await totalOnly(client, (n) => inatObserversUrl(taxonIds, region, n), parseInatTotal);
  } catch (error) {
    // The observers count is a bonus: a server that refuses it costs the figure, not the species.
    if (!isClientError(error)) throw error;
    notes.push(`observers not available (${error.message})`);
  }
  const records = await totalOnly(client, (n) => obisCountUrl(names, region, n), parseObisTotal);

  return {
    counts: {
      inaturalist: {
        observations,
        ...(observers !== undefined && { observers }),
        taxonId: taxonIds[0],
        ...(taxonIds.length > 1 && { taxonIds }),
      },
      obis: { records },
    },
    notes,
  };
}

const hasBothAnswers = (counts: SpeciesCounts | undefined) => !!counts?.inaturalist && !!counts.obis;

const describeError = (error: unknown) => (error instanceof Error ? error.message : String(error));

// ── The run ──────────────────────────────────────────────────────────────────

export interface CliDeps {
  /** The network, or a stand-in for it. Default: a polite client over the platform's fetch. */
  client?: PoliteClient;
  catalog?: readonly Species[];
  now?: () => Date;
  log?: (line: string) => void;
  warn?: (line: string) => void;
}

interface Gathered {
  counts: Map<string, SpeciesCounts>;
  reasons: Map<string, string>;
  failed: Map<string, string>;
  /** Set when the run gave up early. */
  aborted?: string;
}

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/** Runs the script. Returns the exit code instead of exiting, so tests can call it. */
export async function runCli(argv: readonly string[], deps: CliDeps = {}): Promise<number> {
  const log = deps.log ?? ((line: string) => console.log(line));
  const warn = deps.warn ?? ((line: string) => console.error(line));
  const catalog = deps.catalog ?? SPECIES;
  const now = deps.now ?? (() => new Date());

  let options: Options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    warn(error.message);
    return 2;
  }
  if (options.help) {
    log(HELP);
    return 0;
  }
  const catalogIds = new Set(catalog.map((s) => s.id));
  const unknownOnly = (options.only ?? []).filter((id) => !catalogIds.has(id));
  if (unknownOnly.length > 0) {
    warn(`--only names ids that are not in the catalogue: ${unknownOnly.join(', ')}.`);
    return 2;
  }

  // 1. Counts: from a saved file, or from the sources, one request at a time.
  let region = options.region;
  let gathered: Gathered;
  let inputName: string | null = null;
  const generatedAt = now().toISOString();
  if (options.input) {
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(options.input, 'utf8'));
    } catch (error) {
      warn(`Could not read ${options.input}: ${describeError(error)}`);
      return 1;
    }
    const raw = readRawCounts(json);
    if (!raw) {
      warn(`${basename(options.input)} is not a file of counts (an object with a "species" object).`);
      return 1;
    }
    if (options.region && raw.region && options.region !== raw.region) {
      warn(`--region ${options.region} does not match the ${raw.region} counts in ${basename(options.input)}.`);
      return 1;
    }
    region = options.region ?? raw.region;
    inputName = basename(options.input);
    for (const id of raw.ignored) raw.reasons.set(id, `Its entry in ${inputName} could not be read.`);
    gathered = { counts: raw.species, reasons: raw.reasons, failed: new Map() };
    const strangers = [...raw.species.keys(), ...raw.ignored].filter((id) => !catalogIds.has(id));
    log(`Read counts for ${raw.species.size} species from ${inputName} (no network).`);
    if (strangers.length > 0) warn(`  Ignored ${strangers.length} ids that are not in the catalogue: ${strangers.join(', ')}.`);
  } else {
    gathered = await gather(options, region, catalog, deps.client, log, warn, now);
  }

  // 2. Work out the scores.
  const dryRun = isDryRun(options);
  const out = outPathFor(options, region);
  const reasons = new Map(gathered.reasons);
  for (const [id, message] of gathered.failed) reasons.set(id, `The request failed: ${message}.`);
  const data = buildRealRarityData({
    catalog,
    counts: gathered.counts,
    reasons,
    generatedAt,
    region,
    input: inputName,
  });

  // 3. Say what happened.
  const kept = Object.entries(data.species);
  const unresolved = data.unresolved ?? [];
  log('');
  log(`Worldwide counts, ${isoDay(now())}${region ? `, region ${region} (${REGION_BOXES[region].label})` : ', worldwide'}${dryRun ? ' (dry run: nothing written)' : ''}`);
  log(`  Counts from: ${inputName ?? 'iNaturalist and OBIS, live'}`);
  log(`  Catalogue: ${catalog.length} species. With counts: ${kept.length}. Unresolved: ${unresolved.length}. (No tier is set from these counts.)`);
  const notFetched = unresolved.filter((u) => u.reason === NOT_FETCHED_REASON);
  for (const u of unresolved.filter((entry) => entry.reason !== NOT_FETCHED_REASON)) log(`  unresolved ${u.id} (${u.scientificName}): ${u.reason}`);
  if (notFetched.length > 0) log(`  Not fetched: ${notFetched.length} species${options.only ? ' (only the ids asked for were fetched)' : ''}.`);
  const noObis = kept.filter(([, e]) => e.obis && e.obis.records === 0).map(([id]) => id);
  if (noObis.length > 0) log(`  OBIS holds no records under any name for: ${noObis.join(', ')}. Check their names (src/lib/external-sightings/synonyms.ts).`);

  // 4. Write.
  if (gathered.aborted) {
    warn(`Stopped early: ${gathered.aborted}`);
    return 1;
  }
  if (gathered.failed.size > 0 && !options.allowIncomplete) {
    warn(`${gathered.failed.size} species could not be fetched (${[...gathered.failed.keys()].join(', ')}). Nothing was written. Run again to carry on from the checkpoint, or pass --allow-incomplete.`);
    return 1;
  }
  if (kept.length === 0 && !dryRun) {
    warn('No species had any counts, so nothing was written.');
    return 1;
  }
  if (!dryRun) {
    writeFileAtomic(out, toJson(data));
    rmSync(partialPathFor(out), { force: true });
    log(`  Wrote ${out}`);
  }
  return 0;
}

/** Fetch every species not already held by the checkpoint, saving the checkpoint after each. */
async function gather(
  options: Options,
  region: RealRarityRegion | null,
  catalog: readonly Species[],
  injected: PoliteClient | undefined,
  log: (line: string) => void,
  warn: (line: string) => void,
  now: () => Date,
): Promise<Gathered> {
  const dryRun = isDryRun(options);
  const checkpoint = partialPathFor(outPathFor(options, region));
  const gathered: Gathered = { counts: new Map(), reasons: new Map(), failed: new Map() };

  if (!options.fresh && existsSync(checkpoint)) {
    let raw: ReturnType<typeof readRawCounts> = null;
    try {
      raw = readRawCounts(JSON.parse(readFileSync(checkpoint, 'utf8')));
    } catch {
      raw = null;
    }
    if (!raw) {
      warn(`${checkpoint} could not be read. Remove it or pass --fresh.`);
      gathered.aborted = 'the checkpoint is unreadable.';
      return gathered;
    }
    if (raw.region !== region) {
      warn(`${checkpoint} is for ${raw.region ?? 'the whole world'}, but this run is for ${region ?? 'the whole world'}. Remove it or pass --fresh.`);
      gathered.aborted = 'the checkpoint is for a different region.';
      return gathered;
    }
    for (const [id, counts] of raw.species) if (hasBothAnswers(counts)) gathered.counts.set(id, counts);
    log(`Resuming from ${basename(checkpoint)}: ${gathered.counts.size} species already fetched.`);
  }

  const wanted = new Set(options.only ?? catalog.map((s) => s.id));
  const todo = catalog.filter((s) => wanted.has(s.id) && !gathered.counts.has(s.id));
  const requests = todo.reduce((sum, s) => sum + namesForSpecies(s, catalog).length + 3, 0);
  log(`Asking iNaturalist and OBIS about ${todo.length} species: about ${requests} requests, one at a time, 1.1 s apart (roughly ${Math.ceil((requests * 1.1) / 60)} minutes).`);
  if (todo.length === 0) return gathered;

  const client = injected ?? createPoliteClient({
    contact: options.contact ?? process.env.REAL_RARITY_CONTACT,
    onRetry: (message) => log(`    retrying: ${message}`),
  });
  const startedAt = now().toISOString();
  const save = () => {
    if (dryRun) return;
    const species = Object.fromEntries(gathered.counts);
    writeFileAtomic(checkpoint, `${JSON.stringify({ version: 1, partial: true, generatedAt: null, region, startedAt, species }, null, 2)}\n`);
  };

  let consecutiveFailures = 0;
  for (const [index, species] of todo.entries()) {
    const label = `[${index + 1}/${todo.length}] ${species.id} (${species.scientificName})`;
    try {
      const fetched = await fetchSpecies(client, species, catalog, region ?? undefined);
      consecutiveFailures = 0;
      if (fetched.reason) {
        gathered.reasons.set(species.id, fetched.reason);
        log(`${label}: ${fetched.reason}`);
        continue;
      }
      gathered.counts.set(species.id, fetched.counts);
      const { inaturalist: inat, obis } = fetched.counts;
      log(`${label}: iNaturalist ${inat?.observations} observations by ${inat?.observers ?? '?'} observers, OBIS ${obis?.records} records${fetched.notes.length ? ` (${fetched.notes.join('; ')})` : ''}`);
      save();
    } catch (error) {
      gathered.failed.set(species.id, describeError(error));
      consecutiveFailures += 1;
      warn(`${label}: failed, ${describeError(error)}`);
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        gathered.aborted = `${MAX_CONSECUTIVE_FAILURES} species in a row failed, so the network or the sources are probably down. Check that api.inaturalist.org and api.obis.org are reachable from here; the checkpoint was kept, so run again to carry on.`;
        break;
      }
    }
  }
  return gathered;
}
