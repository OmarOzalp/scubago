/**
 * The encounter-rarity script’s logic (docs/real-rarity.md), apart from the entry point in
 * encounters.ts so tests can run it in-process, with a stand-in for the network and the files in a
 * scratch folder.
 *
 * Relative imports on purpose, as in cli.ts. Run from the repository root.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

import { SPECIES } from '../../src/data/species';
import { SITES } from '../../src/data/sites';
import {
  BASINS,
  DEFAULT_ENCOUNTER_OPTIONS,
  PRESENCE_SOURCES,
  buildEncounterData,
  tierCounts,
  type EncounterData,
  type PresenceSource,
} from '../../src/lib/encounter-rarity';
import { REAL_RARITY_SOURCES, rarityDifferences } from '../../src/lib/real-rarity';
import { RARITY_ORDER } from '../../src/lib/rarity';
import type { DiveSite, Species } from '../../src/lib/types';
import { createPoliteClient, REQUEST_INTERVAL_MS, type PoliteClient } from './client';
import { DEFAULT_MAX_PAGES, DEFAULT_RADIUS_KM, collectSite, encounterMatcher, parseSitesFile, sitesToJson, type SitesFile } from './encounter-sites';
import { sanityLines, sanityReport } from './sanity';

const DATA_DIR = join(__dirname, '../../src/data');
export const DEFAULT_OUT = join(DATA_DIR, 'encounter-rarity.json');
/** After this many sites in a row fail, the run stops: the network is almost certainly down. */
const MAX_CONSECUTIVE_FAILURES = 5;

export const HELP = `Rarity from encounters (docs/real-rarity.md).

  NODE_USE_ENV_PROXY=1 npx tsx scripts/real-rarity/encounters.ts                      ask iNaturalist and OBIS about every dive site
  npx tsx scripts/real-rarity/encounters.ts --input src/data/encounter-rarity.sites.json   recompute from saved sites (no network)

For every dive site in src/data/sites.ts it asks iNaturalist (species_counts, research grade, marine groups)
and the OBIS checklist what is recorded within ${DEFAULT_RADIUS_KM} km, matches the taxa to the catalogue, and works out for each
animal the share of the dive sites in its waters that have it recorded. It writes the per-site records
(src/data/encounter-rarity.sites.json) and the tiers (src/data/encounter-rarity.json). One request at a
time, at least ${REQUEST_INTERVAL_MS / 1000} s apart: about 2 to 4 requests a site, a few minutes for 69 sites. Run it from the
repository root. It never writes to Supabase and needs no key.

Node’s fetch only uses a proxy with NODE_USE_ENV_PROXY=1; set it where one is needed.

Options:
  --input <file>        Saved per-site records (this script’s .sites.json, or a checkpoint). Skips the network.
  --out <file>          Where to write the tiers. Default src/data/encounter-rarity.json. The per-site records go
                        beside it (<out>.sites.json) and the checkpoint is <out>.partial.json.
  --dry-run             Print the summary and write nothing, not even a checkpoint.
  --fresh               Ignore a checkpoint from an interrupted run and start over.
  --radius <km>         Search radius around each site. Default ${DEFAULT_RADIUS_KM}.
  --no-obis             Ask iNaturalist only.
  --presence <source>   Which records make an animal "recorded" at a site: either (default), inaturalist or obis.
                        Offline, this chooses among the sources the saved records hold.
  --min-records <n>     Records near a site that make an animal "recorded" there, from one source. Default
                        ${DEFAULT_ENCOUNTER_OPTIONS.minRecords}. Offline, 1 reproduces the first version of the method.
  --min-site-taxa <n>   A site is used only if its sources list at least n taxa. Default ${DEFAULT_ENCOUNTER_OPTIONS.minSiteTaxa}.
  --min-sites <n>       Fewest used sites in an animal’s waters. Default ${DEFAULT_ENCOUNTER_OPTIONS.minSites}.
  --max-pages <n>       Pages of 200 iNaturalist taxa read per site. Default ${DEFAULT_MAX_PAGES}.
  --only <ids>          Ask about just these site ids (comma-separated), as a dry run unless --out is given.
  --allow-incomplete    Write the files even if some sites could not be asked; they are left out.
  --contact <text>      An email or URL added to the User-Agent (or set REAL_RARITY_CONTACT).
  --help                This text.
`;

export class UsageError extends Error {}

export interface Options {
  input: string | null;
  out: string | null;
  dryRun: boolean;
  fresh: boolean;
  radiusKm: number | null;
  obis: boolean | null;
  presence: PresenceSource | null;
  minRecords: number | undefined;
  minSiteTaxa: number | undefined;
  minSites: number | undefined;
  maxPages: number | null;
  only: string[] | null;
  allowIncomplete: boolean;
  contact: string | undefined;
  help: boolean;
}

export function parseArgs(argv: readonly string[]): Options {
  const options: Options = {
    input: null,
    out: null,
    dryRun: false,
    fresh: false,
    radiusKm: null,
    obis: null,
    presence: null,
    minRecords: undefined,
    minSiteTaxa: undefined,
    minSites: undefined,
    maxPages: null,
    only: null,
    allowIncomplete: false,
    contact: undefined,
    help: false,
  };
  const value = (i: number, flag: string) => {
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) throw new UsageError(`${flag} needs a value.`);
    return v;
  };
  const whole = (i: number, flag: string, min: number) => {
    const n = Number(value(i, flag));
    if (!Number.isInteger(n) || n < min) throw new UsageError(`${flag} must be a whole number of ${min} or more.`);
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--input') options.input = resolve(value(i++, arg));
    else if (arg === '--out') options.out = resolve(value(i++, arg));
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--fresh') options.fresh = true;
    else if (arg === '--no-obis') options.obis = false;
    else if (arg === '--allow-incomplete') options.allowIncomplete = true;
    else if (arg === '--radius') {
      const km = Number(value(i++, arg));
      if (!Number.isFinite(km) || km < 0.5 || km > 50) throw new UsageError('--radius must be between 0.5 and 50 km.');
      options.radiusKm = km;
    } else if (arg === '--presence') {
      const presence = value(i++, arg);
      if (!(PRESENCE_SOURCES as readonly string[]).includes(presence)) throw new UsageError(`--presence must be one of ${PRESENCE_SOURCES.join(', ')}.`);
      options.presence = presence as PresenceSource;
    } else if (arg === '--min-records') options.minRecords = whole(i++, arg, 1);
    else if (arg === '--min-site-taxa') options.minSiteTaxa = whole(i++, arg, 0);
    else if (arg === '--min-sites') options.minSites = whole(i++, arg, 1);
    else if (arg === '--max-pages') options.maxPages = whole(i++, arg, 1);
    else if (arg === '--only') options.only = value(i++, arg).split(',').map((id) => id.trim()).filter(Boolean);
    else if (arg === '--contact') options.contact = value(i++, arg);
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new UsageError(`Unknown option ${arg}. Try --help.`);
  }
  if (options.input && options.only) throw new UsageError('--only fetches from the network; it cannot be used with --input.');
  if (options.input && (options.radiusKm !== null || options.maxPages !== null || options.obis !== null)) {
    throw new UsageError('--radius, --max-pages and --no-obis say what to ask the network; they cannot be used with --input.');
  }
  return options;
}

// ── Files ────────────────────────────────────────────────────────────────────────

const outPathFor = (options: Options) => options.out ?? DEFAULT_OUT;
const withSuffix = (out: string, suffix: string) => (out.endsWith('.json') ? `${out.slice(0, -5)}${suffix}` : `${out}${suffix}`);
/** `x.json` becomes `x.partial.json`: the checkpoint that lets an interrupted run carry on (gitignored in src/data). */
export const partialPathFor = (out: string) => withSuffix(out, '.partial.json');
/** `x.json` becomes `x.sites.json`: the per-site records the tiers were worked out from. */
export const sitesPathFor = (out: string) => withSuffix(out, '.sites.json');

/** --only looks at a few sites; it must not overwrite the real files with a nearly empty result. */
const isDryRun = (options: Options) => options.dryRun || (options.only !== null && options.out === null);

/** Written to a temporary name first, so a run stopped half-way never leaves half a file. */
function writeFileAtomic(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, text);
  renameSync(temporary, path);
}

/** One species per line, so a re-run shows up as a small diff. */
export function toJson(data: EncounterData): string {
  const species = Object.entries(data.species).map(([id, entry]) => `    ${JSON.stringify(id)}: ${JSON.stringify(entry)}`);
  const unresolved = data.unresolved && data.unresolved.length > 0 ? `[\n${data.unresolved.map((u) => `    ${JSON.stringify(u)}`).join(',\n')}\n  ]` : '[]';
  const text = JSON.stringify({ ...data, species: '@@species@@', unresolved: data.unresolved ? '@@unresolved@@' : undefined }, null, 2);
  return `${text
    .replace('"@@species@@"', () => (species.length ? `{\n${species.join(',\n')}\n  }` : '{}'))
    .replace('"@@unresolved@@"', () => unresolved)}\n`;
}

// ── The run ────────────────────────────────────────────────────────────────────────────

export interface CliDeps {
  /** The network, or a stand-in for it. Default: a polite client over the platform’s fetch. */
  client?: PoliteClient;
  catalog?: readonly Species[];
  sites?: readonly DiveSite[];
  now?: () => Date;
  log?: (line: string) => void;
  warn?: (line: string) => void;
}

const isoDay = (date: Date) => date.toISOString().slice(0, 10);
const describeError = (error: unknown) => (error instanceof Error ? error.message : String(error));

interface Gathered {
  file: SitesFile;
  failed: Map<string, string>;
  /** Set when the run gave up early. */
  aborted?: string;
}

/** Runs the script. Returns the exit code instead of exiting, so tests can call it. */
export async function runEncountersCli(argv: readonly string[], deps: CliDeps = {}): Promise<number> {
  const log = deps.log ?? ((line: string) => console.log(line));
  const warn = deps.warn ?? ((line: string) => console.error(line));
  const catalog = deps.catalog ?? SPECIES;
  const diveSites = deps.sites ?? SITES;
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
  const siteIds = new Set(diveSites.map((site) => site.id));
  const unknownOnly = (options.only ?? []).filter((id) => !siteIds.has(id));
  if (unknownOnly.length > 0) {
    warn(`--only names ids that are not dive sites: ${unknownOnly.join(', ')}.`);
    return 2;
  }

  // 1. The per-site records: from a saved file, or from the sources, one request at a time.
  const dryRun = isDryRun(options);
  const out = outPathFor(options);
  const generatedAt = now().toISOString();
  let gathered: Gathered;
  let inputName: string | null = null;
  if (options.input) {
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(options.input, 'utf8'));
    } catch (error) {
      warn(`Could not read ${options.input}: ${describeError(error)}`);
      return 1;
    }
    const parsed = parseSitesFile(json);
    if (!parsed) {
      warn(`${basename(options.input)} is not a file of per-site records (a version 1 file with a "sites" object; the tiers file is not one, use its .sites.json).`);
      return 1;
    }
    inputName = basename(options.input);
    gathered = { file: parsed.file, failed: new Map() };
    log(`Read ${Object.keys(parsed.file.sites).length} sites from ${inputName} (radius ${parsed.file.radiusKm} km, ${parsed.file.obis ? 'iNaturalist and OBIS' : 'iNaturalist only'}; no network).`);
    if (parsed.ignored.length > 0) warn(`  Skipped ${parsed.ignored.length} entries that could not be read: ${parsed.ignored.join(', ')}.`);
  } else {
    gathered = await gather(options, diveSites, catalog, deps.client, log, warn, now);
  }
  const { file } = gathered;

  // 2. Work out the shares and tiers.
  const presence = options.presence ?? (file.obis ? DEFAULT_ENCOUNTER_OPTIONS.presence : 'inaturalist');
  if (presence !== 'inaturalist' && !file.obis) {
    warn(`--presence ${presence} needs OBIS records, and these sites were asked without OBIS.`);
    return 2;
  }
  const { data, shares } = buildEncounterData({
    catalog,
    sites: file.sites,
    notableSites: diveSites,
    generatedAt,
    input: inputName,
    radiusKm: file.radiusKm,
    sourcesAsked: file.obis ? ['inaturalist', 'obis'] : ['inaturalist'],
    sources: REAL_RARITY_SOURCES,
    options: { presence, minRecords: options.minRecords, minSiteTaxa: options.minSiteTaxa, minSites: options.minSites },
  });

  // 3. Say what happened.
  const tiers = new Map(Object.entries(data.species).map(([id, entry]) => [id, entry.tier] as const));
  const unresolved = data.unresolved ?? [];
  const fmt = (c: Record<string, number>) => RARITY_ORDER.map((tier) => `${tier} ${c[tier]}`).join(', ');
  log('');
  log(`Encounter rarity, ${isoDay(now())}${dryRun ? ' (dry run: nothing written)' : ''}`);
  log(`  Records from: ${inputName ?? 'iNaturalist and OBIS, live'}; radius ${file.radiusKm} km; an animal is recorded at a site when ${presence === 'either' ? 'either source has' : `${presence} has`} at least ${data.method?.minRecordsPerSite} record${data.method?.minRecordsPerSite === 1 ? '' : 's'} near it.`);
  log(`  Sites: ${Object.keys(file.sites).length} asked, ${shares.usedSites} used, ${shares.skippedSites.length} left out.`);
  for (const skipped of shares.skippedSites) log(`    left out ${skipped.id}: ${skipped.reason}`);
  log(`  Used sites by basin: ${BASINS.filter((b) => shares.basinSites[b.id] > 0).map((b) => `${b.short} ${shares.basinSites[b.id]}`).join(', ')}`);
  log(`  Catalogue: ${catalog.length} species. Tiered: ${tiers.size}. Unresolved: ${unresolved.length}.`);
  log(`  Tiers now:    ${fmt(tierCounts(tiers.values()))}`);
  log(`  Catalogue by hand: ${fmt(tierCounts(catalog.map((s) => s.rarity)))}`);
  for (const u of unresolved) log(`  unresolved ${u.id} (${u.scientificName}): ${u.reason}`);
  const differences = rarityDifferences(catalog, tiers);
  log(`  Different from the catalogue’s tier: ${differences.length} of ${tiers.size}.${differences.length ? ' Biggest first:' : ''}`);
  for (const d of differences.slice(0, 15)) log(`    ${d.id}: catalogue ${d.catalog}, encounters ${d.real} (${d.steps > 0 ? '+' : ''}${d.steps})`);
  if (differences.length > 15) log(`    … and ${differences.length - 15} more`);
  const report = sanityReport(data);
  for (const line of sanityLines(report)) log(line);

  // 4. Write.
  if (gathered.aborted) {
    warn(`Stopped early: ${gathered.aborted}`);
    return 1;
  }
  if (gathered.failed.size > 0 && !options.allowIncomplete) {
    warn(`${gathered.failed.size} sites could not be asked (${[...gathered.failed.keys()].join(', ')}). Nothing was written. Run again to carry on from the checkpoint, or pass --allow-incomplete.`);
    return 1;
  }
  if (tiers.size === 0 && !dryRun) {
    warn('No species could be tiered, so nothing was written (an empty result would hide the catalogue tiers for no reason).');
    return 1;
  }
  if (!dryRun) {
    writeFileAtomic(out, toJson(data));
    if (!options.input) {
      writeFileAtomic(sitesPathFor(out), sitesToJson({ ...file, generatedAt, partial: undefined }));
      rmSync(partialPathFor(out), { force: true });
      log(`  Wrote ${sitesPathFor(out)}`);
    }
    log(`  Wrote ${out}`);
  }
  return 0;
}

/** Ask about every site not already held by the checkpoint, saving the checkpoint after each. */
async function gather(
  options: Options,
  diveSites: readonly DiveSite[],
  catalog: readonly Species[],
  injected: PoliteClient | undefined,
  log: (line: string) => void,
  warn: (line: string) => void,
  now: () => Date,
): Promise<Gathered> {
  const dryRun = isDryRun(options);
  const checkpoint = partialPathFor(outPathFor(options));
  const radiusKm = options.radiusKm ?? DEFAULT_RADIUS_KM;
  const obis = options.obis ?? true;
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const file: SitesFile = { version: 1, generatedAt: null, partial: true, radiusKm, obis, maxPages, sites: {} };
  const gathered: Gathered = { file, failed: new Map() };

  if (!options.fresh && existsSync(checkpoint)) {
    let parsed: ReturnType<typeof parseSitesFile> = null;
    try {
      parsed = parseSitesFile(JSON.parse(readFileSync(checkpoint, 'utf8')));
    } catch {
      parsed = null;
    }
    if (!parsed) {
      warn(`${checkpoint} could not be read. Remove it or pass --fresh.`);
      gathered.aborted = 'the checkpoint is unreadable.';
      return gathered;
    }
    if (parsed.file.radiusKm !== radiusKm || parsed.file.obis !== obis || parsed.file.maxPages !== maxPages) {
      warn(`${checkpoint} was made with radius ${parsed.file.radiusKm} km, ${parsed.file.obis ? 'with' : 'without'} OBIS, ${parsed.file.maxPages} pages; this run is ${radiusKm} km, ${obis ? 'with' : 'without'} OBIS, ${maxPages} pages. Remove it or pass --fresh.`);
      gathered.aborted = 'the checkpoint was made with different settings.';
      return gathered;
    }
    Object.assign(file.sites, parsed.file.sites);
    log(`Resuming from ${basename(checkpoint)}: ${Object.keys(file.sites).length} sites already asked.`);
  }

  const wanted = new Set(options.only ?? diveSites.map((site) => site.id));
  const todo = diveSites.filter((site) => wanted.has(site.id) && !file.sites[site.id]);
  const requests = todo.length * (obis ? 3 : 2);
  log(`Asking ${obis ? 'iNaturalist and OBIS' : 'iNaturalist'} about ${todo.length} dive sites within ${radiusKm} km: about ${requests} requests, one at a time, ${REQUEST_INTERVAL_MS / 1000} s apart (roughly ${Math.ceil((requests * REQUEST_INTERVAL_MS) / 60_000)} minutes).`);
  if (todo.length === 0) return gathered;

  const client = injected ?? createPoliteClient({
    contact: options.contact ?? process.env.REAL_RARITY_CONTACT,
    onRetry: (message) => log(`    retrying: ${message}`),
  });
  const save = () => {
    if (dryRun) return;
    writeFileAtomic(checkpoint, sitesToJson({ ...file, generatedAt: null, partial: true }));
  };

  const matcher = encounterMatcher(catalog);
  let consecutiveFailures = 0;
  for (const [index, site] of todo.entries()) {
    const label = `[${index + 1}/${todo.length}] ${site.id}`;
    try {
      const { record, unmatched } = await collectSite(client, site, { radiusKm, obis, maxPages, matcher });
      consecutiveFailures = 0;
      file.sites[site.id] = record;
      const flags = [record.inaturalist?.truncated ? 'iNaturalist list cut at the page limit' : '', record.obis?.truncated ? 'OBIS list cut at 1000 taxa' : ''].filter(Boolean);
      log(`${label}: iNaturalist ${record.inaturalist?.taxa} taxa${record.obis ? `, OBIS ${record.obis.taxa} taxa` : ''}; ${Object.keys(record.species).length} catalogue animals (${unmatched.inaturalist} other taxa unmatched)${flags.length ? ` [${flags.join('; ')}]` : ''}`);
      save();
    } catch (error) {
      gathered.failed.set(site.id, describeError(error));
      consecutiveFailures += 1;
      warn(`${label}: failed, ${describeError(error)}`);
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        gathered.aborted = `${MAX_CONSECUTIVE_FAILURES} sites in a row failed, so the network or the sources are probably down. Check that api.inaturalist.org and api.obis.org are reachable from here (Node needs NODE_USE_ENV_PROXY=1 behind a proxy); the checkpoint was kept, so run again to carry on.`;
        break;
      }
    }
  }
  return gathered;
}
