import bundledEncounters from '@/data/encounter-rarity.json';
import bundledWorldwide from '@/data/real-rarity.json';
import {
  BASINS_BY_ID,
  encounterTiersApplied,
  parseEncounterData,
  type BasinId,
  type EncounterEntry,
  type UnresolvedSpecies,
} from '@/lib/encounter-rarity';
import { INATURALIST_CREDIT, OBIS_CITATION, OBIS_CREDIT } from '@/lib/external-sightings/attribution';
import { RARITY_LABEL, rarityRank } from '@/lib/rarity';
import type { Rarity, Species } from '@/lib/types';

export type { UnresolvedSpecies } from '@/lib/encounter-rarity';

/** The catalogue's id for "something else" (UNLISTED_ID in catalog.ts, which reads this module's tiers, so it is not imported from there). */
const UNLISTED_ID = 'unlisted';

/**
 * Rarity from real data (docs/real-rarity.md). Two files, built at build time and bundled, so
 * nothing depends on what a phone happens to have cached:
 *
 * - `src/data/encounter-rarity.json` (`scripts/real-rarity/encounters.ts`, the library in
 *   `encounter-rarity.ts`): how often each animal is recorded at dive sites in its own waters. This
 *   is what sets the **tiers**: `REAL_RARITY`, and so `CATALOG`, read it.
 * - `src/data/real-rarity.json` (`scripts/real-rarity/fetch.ts`): how often each animal is recorded
 *   worldwide on iNaturalist and in OBIS. That measures how much an animal is photographed, not how
 *   likely a diver is to meet it (ranked by these counts the whale shark and the orca come out
 *   common), so it sets **no tier**. It is shown beside the encounter tier as supporting evidence.
 *
 * Everything here is pure. Nothing reads the network.
 */

// ── The data ─────────────────────────────────────────────────────────────────

/** What iNaturalist holds for a species: research-grade observations, worldwide (or in one region). */
export interface InatCounts {
  observations: number;
  /** Distinct people who made them. Left out when it could not be asked. */
  observers?: number;
  /** The iNaturalist taxon the catalogue name resolved to. */
  taxonId?: number;
  /** Every taxon counted, when the catalogue entry lumps more than one (see synonyms.ts). */
  taxonIds?: number[];
}

/** What OBIS holds for a species: occurrence records, worldwide (or in one region). */
export interface ObisCounts {
  records: number;
}

export interface SpeciesCounts {
  inaturalist?: InatCounts;
  obis?: ObisCounts;
}

/**
 * The worldwide counts of one species and their log score. The score ranks how much the animal is
 * recorded (photographed, surveyed, tracked) and sets no tier: see the header above.
 */
export interface WorldwideEntry extends SpeciesCounts {
  /** From `scoreSpecies`. Higher means recorded more. */
  score: number;
}

/** Regions the script can count in (docs/real-rarity.md). Without one, the counts are worldwide. */
export const REAL_RARITY_REGIONS = ['gbr', 'red-sea'] as const;
export type RealRarityRegion = (typeof REAL_RARITY_REGIONS)[number];

export interface RealRarityData {
  version?: 1;
  /** When the counts were fetched or recomputed. `null` in the file that is checked in empty. */
  generatedAt: string | null;
  /** Set when the counts were taken inside a region instead of worldwide. */
  region?: RealRarityRegion | null;
  /** The saved file the counts were read from instead of the network, if any. */
  input?: string | null;
  sources?: Record<string, unknown>;
  method?: Record<string, unknown>;
  species: Record<string, WorldwideEntry>;
  unresolved?: UnresolvedSpecies[];
}

// ── Scoring ──────────────────────────────────────────────────────────────────

/**
 * How much each count adds to a species' score, each on a log scale (see `scoreSpecies`).
 * The weights sum to 1, so a species at the cap of every count scores about 5.
 */
export const SCORE_WEIGHTS = { observers: 0.4, observations: 0.25, records: 0.35 } as const;

/**
 * OBIS records stop counting beyond 10^5 (a log10 of 5). Past that a species is either a surveyed
 * reef fish or a tracked animal, and more rows say nothing more about how often a diver meets it.
 */
export const OBIS_LOG_CAP = 5;

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;
const asCount = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);
const log = (count: number) => Math.log10(1 + count);
const round3 = (value: number) => Math.round(value * 1000) / 1000;

/**
 * One number for how often a species is recorded: the more it is recorded, the higher.
 *
 *   score = 0.40 * log10(1 + observers) + 0.25 * log10(1 + observations) + 0.35 * min(log10(1 + records), 5)
 *
 * Why this way:
 *
 * - **Logs.** Counts run from a handful to hundreds of thousands. On a log scale each tenfold
 *   increase adds the same amount, so a few huge numbers cannot swamp the rest.
 * - **iNaturalist is biased to charismatic animals.** People photograph whale sharks, mantas and
 *   turtles far more than a goby, so raw observations overstate the showy animals. Distinct
 *   observers is the larger share (0.40): one keen diver posting 400 photos of one reef counts once.
 * - **OBIS is biased to surveys.** Its records are mostly survey and monitoring rows, so reef
 *   fish that a programme counts on every transect pile up hundreds of thousands of records, and
 *   tagged sharks, turtles and whales add a row per position. That is why its log is capped at 5
 *   and its weight (0.35) is below iNaturalist's combined 0.65: each source makes up for the
 *   other's blind spot, and neither can decide the score alone.
 * - **A missing count adds nothing.** A source with no answer scores as if it had 0 records. If
 *   `observers` was not fetched, the observations carry its weight too, so the two files score on
 *   one scale. Observers can never exceed observations; a larger figure is clamped.
 *
 * Rounded to three decimals so a saved file always recomputes to the same tiers. Never negative;
 * 0 means no evidence at all.
 */
export function scoreSpecies(counts: SpeciesCounts | undefined): number {
  if (!counts) return 0;
  const observations = asCount(counts.inaturalist?.observations);
  const observers = counts.inaturalist?.observers === undefined ? undefined : Math.min(asCount(counts.inaturalist.observers), observations);
  const records = asCount(counts.obis?.records);
  const inat =
    observers === undefined
      ? (SCORE_WEIGHTS.observers + SCORE_WEIGHTS.observations) * log(observations)
      : SCORE_WEIGHTS.observers * log(observers) + SCORE_WEIGHTS.observations * log(observations);
  const obis = SCORE_WEIGHTS.records * Math.min(log(records), OBIS_LOG_CAP);
  return round3(inat + obis);
}

// ── Reading the file ─────────────────────────────────────────────────────────

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isRegion = (value: unknown): value is RealRarityRegion => typeof value === 'string' && (REAL_RARITY_REGIONS as readonly string[]).includes(value);
const isTaxonId = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0;

/** The counts of one species, checked and trimmed to the known fields, or null if any is malformed. An empty entry is valid. */
function parseCounts(value: unknown): SpeciesCounts | null {
  if (!isRecord(value)) return null;
  const counts: SpeciesCounts = {};
  const { inaturalist, obis } = value;
  if (inaturalist !== undefined) {
    if (!isRecord(inaturalist) || !isCount(inaturalist.observations)) return null;
    const { observers, taxonId, taxonIds } = inaturalist;
    if (observers !== undefined && !isCount(observers)) return null;
    if (taxonId !== undefined && !isTaxonId(taxonId)) return null;
    if (taxonIds !== undefined && !(Array.isArray(taxonIds) && taxonIds.every(isTaxonId))) return null;
    counts.inaturalist = {
      observations: inaturalist.observations,
      ...(observers !== undefined && { observers }),
      ...(taxonId !== undefined && { taxonId }),
      ...(taxonIds !== undefined && { taxonIds: [...taxonIds] }),
    };
  }
  if (obis !== undefined) {
    if (!isRecord(obis) || !isCount(obis.records)) return null;
    counts.obis = { records: obis.records };
  }
  return counts;
}

function parseUnresolved(value: unknown): UnresolvedSpecies[] | null {
  if (!Array.isArray(value)) return null;
  const list: UnresolvedSpecies[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.scientificName !== 'string' || typeof item.reason !== 'string') return null;
    list.push({ id: item.id, scientificName: item.scientificName, reason: item.reason });
  }
  return list;
}

/** `generatedAt` must be null or a date that can be read. */
const isGeneratedAt = (value: unknown): value is string | null => value === null || (typeof value === 'string' && Number.isFinite(Date.parse(value)));

/**
 * The generated file, checked. Returns null for anything that is not exactly the shape the script
 * writes (or the empty shape that is checked in): not an object, a species without a valid score
 * or valid counts, a region that is not known, and so on. A damaged file is never half-used. A
 * `tier` that an earlier version of the script wrote is accepted and dropped: worldwide counts set
 * no tier. Never throws.
 */
export function parseRealRarityData(json: unknown): RealRarityData | null {
  try {
    if (!isRecord(json) || !isRecord(json.species) || !isGeneratedAt(json.generatedAt)) return null;
    if (json.version !== undefined && json.version !== 1) return null;
    if (json.region !== undefined && json.region !== null && !isRegion(json.region)) return null;
    if (json.input !== undefined && json.input !== null && typeof json.input !== 'string') return null;
    for (const key of ['sources', 'method'] as const) {
      if (json[key] !== undefined && !isRecord(json[key])) return null;
    }
    const species: Record<string, WorldwideEntry> = {};
    for (const [id, entry] of Object.entries(json.species)) {
      const counts = parseCounts(entry);
      if (!counts || !isRecord(entry) || typeof entry.score !== 'number' || !Number.isFinite(entry.score) || entry.score < 0) return null;
      species[id] = { ...counts, score: entry.score };
    }
    const unresolved = json.unresolved === undefined ? undefined : parseUnresolved(json.unresolved);
    if (unresolved === null) return null;
    return {
      ...(json.version === 1 && { version: 1 as const }),
      generatedAt: json.generatedAt,
      ...(json.region !== undefined && { region: json.region as RealRarityRegion | null }),
      ...(json.input !== undefined && { input: json.input as string | null }),
      ...(json.sources !== undefined && { sources: json.sources as Record<string, unknown> }),
      ...(json.method !== undefined && { method: json.method as Record<string, unknown> }),
      species,
      ...(unresolved !== undefined && { unresolved }),
    };
  } catch {
    return null;
  }
}

// ── The tiers the app uses ──────────────────────────────────────────────────

/**
 * The real tier of each species, as the rewards engine takes it (`observed` in
 * `effectiveRarity`): species id to tier. These are the encounter tiers (how often the animal is
 * recorded at dive sites in its own waters), never the worldwide counts.
 *
 * Returns an empty map when the encounter data has not been generated (`generatedAt` is null), has
 * been switched off (`applied` is false: the result did not pass the sanity check) or is damaged, so
 * every species keeps its catalogue tier. A species with no tier is absent from the map. The
 * "unlisted" id is never in it. Never throws.
 *
 * Call it once and keep the result (see `REAL_RARITY`): a new map on every render would make a
 * hook that depends on it recompute.
 */
export function realRarity(data: unknown = bundledEncounters): ReadonlyMap<string, Rarity> {
  const tiers = new Map<string, Rarity>();
  const parsed = parseEncounterData(data);
  if (!parsed || !encounterTiersApplied(parsed)) return tiers;
  for (const [id, entry] of Object.entries(parsed.species)) {
    if (id !== UNLISTED_ID) tiers.set(id, entry.tier);
  }
  return tiers;
}

/** The tiers from the bundled encounter file: empty until `scripts/real-rarity/encounters.ts` has really run, or while its tiers are switched off. */
export const REAL_RARITY: ReadonlyMap<string, Rarity> = realRarity();

// ── The evidence behind one species' tier ────────────────────────────────────

/** The encounter tier of one species with the worldwide counts beside it. */
export interface RarityEntry extends EncounterEntry {
  /** What iNaturalist and OBIS hold for it worldwide: supporting evidence, never the tier. */
  worldwide?: SpeciesCounts;
}

/** The bundled files, checked once: `realRarityEntry` reads them for every species page. */
const BUNDLED_ENCOUNTERS = parseEncounterData(bundledEncounters);
const BUNDLED_WORLDWIDE = parseRealRarityData(bundledWorldwide);

/**
 * The evidence behind one species' real tier: how many dive sites in its waters record it, and, if
 * the worldwide file has them, what iNaturalist and OBIS hold for it worldwide. Undefined when
 * there is nothing true to say: the encounter data has not been generated, is switched off or
 * damaged, or has no entry for the species (it keeps its hand-assigned tier). The "unlisted" id
 * never has one. A worldwide file that is missing, damaged or regional only leaves out the
 * worldwide line. Never throws.
 */
export function realRarityEntry(id: string, data: unknown = bundledEncounters, worldwide: unknown = bundledWorldwide): RarityEntry | undefined {
  const parsed = data === bundledEncounters ? BUNDLED_ENCOUNTERS : parseEncounterData(data);
  if (!parsed || !encounterTiersApplied(parsed) || id === UNLISTED_ID) return undefined;
  if (!Object.prototype.hasOwnProperty.call(parsed.species, id)) return undefined;
  const counts = parsed.species[id];
  const wide = worldwide === bundledWorldwide ? BUNDLED_WORLDWIDE : parseRealRarityData(worldwide);
  const held = wide && wide.generatedAt !== null && !wide.region && Object.prototype.hasOwnProperty.call(wide.species, id) ? wide.species[id] : undefined;
  const worldwideCounts: SpeciesCounts | undefined = held && (held.inaturalist || held.obis) ? { ...(held.inaturalist && { inaturalist: held.inaturalist }), ...(held.obis && { obis: held.obis }) } : undefined;
  return { ...counts, ...(worldwideCounts && { worldwide: worldwideCounts }) };
}

const countText = (n: number) => n.toLocaleString('en-US');
const plural = (n: number, one: string, many: string) => `${countText(n)} ${n === 1 ? one : many}`;

/** "Indo-Pacific", "Indo-Pacific and Caribbean"; undefined for three or more basins (the waters are then "its waters"). */
function basinPhrase(basins: readonly BasinId[]): string | undefined {
  const names = basins.map((basin) => BASINS_BY_ID.get(basin)?.short).filter((name): name is string => !!name);
  if (names.length === 0 || names.length > 2) return undefined;
  return names.join(' and ');
}

/** "6 of 41 Indo-Pacific dive sites", "any of the 41 Indo-Pacific dive sites" (for "not recorded near ..."), "14 of 67 dive sites in its waters". */
function sitesPhrase(entry: Pick<EncounterEntry, 'recordedAt' | 'sites' | 'basins'>, where: 'named' | 'waters' | 'plain'): string {
  const area = where === 'named' ? basinPhrase(entry.basins) : undefined;
  const sites = area ? `${area} dive sites` : where === 'plain' ? 'dive sites' : 'dive sites in its waters';
  if (entry.recordedAt === 0) return `any of the ${countText(entry.sites)} ${sites}`;
  return `${countText(entry.recordedAt)} of ${countText(entry.sites)} ${sites}`;
}

/**
 * One sentence saying where a species' tier comes from, in numbers:
 * "Rare: recorded near 6 of 41 Indo-Pacific dive sites". An animal in the waters of three or more
 * basins says "dive sites in its waters" and names them in brackets; one recorded nowhere says
 * "not recorded near any of the 41 ... dive sites". Counts are written with thousands separators.
 */
export function describeRarityEvidence(entry: RarityEntry): string {
  const tier = RARITY_LABEL[entry.tier];
  const where = sitesPhrase(entry, 'named');
  const basins = basinPhrase(entry.basins) ? '' : ` (${entry.basins.map((basin) => BASINS_BY_ID.get(basin)?.short ?? basin).join(', ')})`;
  return entry.recordedAt === 0 ? `${tier}: not recorded near ${where}${basins}` : `${tier}: recorded near ${where}${basins}`;
}

/**
 * The worldwide counts as a second line: "2,654 iNaturalist observations and 845 OBIS records
 * worldwide". Undefined when the worldwide file has nothing for the species. A source that was asked
 * and held nothing is left out; the line says what is recorded, not what is missing.
 */
export function describeWorldwideCounts(entry: RarityEntry): string | undefined {
  const inat = entry.worldwide?.inaturalist && entry.worldwide.inaturalist.observations > 0 ? plural(entry.worldwide.inaturalist.observations, 'iNaturalist observation', 'iNaturalist observations') : undefined;
  const obis = entry.worldwide?.obis && entry.worldwide.obis.records > 0 ? plural(entry.worldwide.obis.records, 'OBIS record', 'OBIS records') : undefined;
  const parts = [inat, obis].filter((part): part is string => part !== undefined);
  return parts.length > 0 ? `${parts.join(' and ')} worldwide` : undefined;
}

/** The longest `rarityObservedNote` the discovery card's note slot is meant to hold (it sets two lines of italic type). */
export const OBSERVED_NOTE_MAX = 60;

/**
 * A short line about where a species' tier comes from for the share card:
 * "Recorded near 6 of 41 Indo-Pacific dive sites". It drops the basin name ("... 14 of 67 dive sites in
 * its waters"), then the waters ("... dive sites"), rather than run past `OBSERVED_NOTE_MAX`
 * characters. Always true to the data; never invents a count.
 */
export function rarityObservedNote(entry: RarityEntry): string {
  const lead = entry.recordedAt === 0 ? 'Not recorded near' : 'Recorded near';
  const candidates = [
    `${lead} ${sitesPhrase(entry, 'named')}`,
    `${lead} ${sitesPhrase(entry, 'waters')}`,
    `${lead} ${sitesPhrase(entry, 'plain')}`,
    `${lead} dive sites`,
  ];
  return candidates.find((text) => text.length <= OBSERVED_NOTE_MAX) ?? candidates[candidates.length - 1];
}

// ── Comparing with the hand-assigned tiers ───────────────────────────────────

export interface RarityDifference {
  id: string;
  commonName: string;
  /** The hand-assigned tier in the catalogue. */
  catalog: Rarity;
  /** The tier from real data. */
  real: Rarity;
  /** Tiers apart: positive when real data says the animal is rarer than the catalogue does, negative when more common. */
  steps: number;
}

/**
 * Where the real tier differs from the catalogue's, for review before the real tiers replace the
 * hand-assigned ones. Biggest disagreements first, then catalogue order. Species with no real tier
 * (absent from the map) and the "unlisted" id are left out: no data is not a difference.
 */
export function rarityDifferences(
  catalog: readonly Pick<Species, 'id' | 'commonName' | 'rarity'>[],
  tiers: ReadonlyMap<string, Rarity>,
): RarityDifference[] {
  const differences: (RarityDifference & { order: number })[] = [];
  catalog.forEach((species, order) => {
    if (species.id === UNLISTED_ID) return;
    const real = tiers.get(species.id);
    if (real === undefined || rarityRank(real) < 0 || rarityRank(species.rarity) < 0 || real === species.rarity) return;
    differences.push({
      id: species.id,
      commonName: species.commonName,
      catalog: species.rarity,
      real,
      steps: rarityRank(real) - rarityRank(species.rarity),
      order,
    });
  });
  differences.sort((a, b) => Math.abs(b.steps) - Math.abs(a.steps) || a.order - b.order);
  return differences.map(({ id, commonName, catalog: hand, real, steps }) => ({ id, commonName, catalog: hand, real, steps }));
}

// ── Reading saved raw counts (the script's --input) ──────────────────────────

export interface RawCounts {
  generatedAt: string | null;
  region: RealRarityRegion | null;
  species: Map<string, SpeciesCounts>;
  /** Why a species had no usable counts, from the saved file's `unresolved` list. */
  reasons: Map<string, string>;
  /** Species whose entries could not be read, and were skipped. */
  ignored: string[];
}

/**
 * Counts from a saved file, for recomputing offline: the generated file itself, a checkpoint the
 * script wrote part-way, or a hand-written one. Only the counts are read; any `score` and `tier`
 * are ignored and worked out again. Returns null when the file is not an object with a `species`
 * object. An entry whose counts are malformed is skipped and named in `ignored`. Never throws.
 */
export function readRawCounts(json: unknown): RawCounts | null {
  try {
    if (!isRecord(json) || !isRecord(json.species) || !isGeneratedAt(json.generatedAt ?? null)) return null;
    if (json.region !== undefined && json.region !== null && !isRegion(json.region)) return null;
    const raw: RawCounts = {
      generatedAt: (json.generatedAt as string | null | undefined) ?? null,
      region: (json.region as RealRarityRegion | null | undefined) ?? null,
      species: new Map(),
      reasons: new Map(),
      ignored: [],
    };
    for (const [id, entry] of Object.entries(json.species)) {
      const counts = parseCounts(entry);
      if (counts) raw.species.set(id, counts);
      else raw.ignored.push(id);
    }
    if (Array.isArray(json.unresolved)) {
      for (const item of json.unresolved) {
        if (isRecord(item) && typeof item.id === 'string' && typeof item.reason === 'string') raw.reasons.set(item.id, item.reason);
      }
    }
    return raw;
  } catch {
    return null;
  }
}

// ── Building the file ────────────────────────────────────────────────────────

/** Credit and licence notes written into the file. The counts are facts; the sources still get credit. */
export const REAL_RARITY_SOURCES = {
  inaturalist: {
    name: 'iNaturalist',
    url: 'https://www.inaturalist.org',
    api: 'https://api.inaturalist.org/v1',
    credit: INATURALIST_CREDIT.attribution,
    licence:
      'Counts of research-grade observations are facts, so they carry no licence of their own; they are credited to iNaturalist and the people who made the observations. No observation, photo or observer name is stored.',
    terms: INATURALIST_CREDIT.termsUrl,
  },
  obis: {
    name: 'OBIS',
    url: 'https://obis.org',
    api: 'https://api.obis.org/v3',
    credit: OBIS_CREDIT.attribution,
    citation: OBIS_CITATION,
    licence:
      'Counts of occurrence records are facts, credited to OBIS and its data providers. OBIS datasets carry their own licences (CC0, CC BY or CC BY-NC); only a total is stored, never a record or a dataset.',
    terms: OBIS_CREDIT.termsUrl,
  },
} as const;

/** The reason given for a catalogue species that has no counts at all and no better reason. */
export const NOT_FETCHED_REASON = 'Nothing was fetched for it.';

export interface BuildOptions {
  catalog: readonly Pick<Species, 'id' | 'scientificName'>[];
  /** Counts by species id. */
  counts: ReadonlyMap<string, SpeciesCounts>;
  /** Why a species has no usable counts (a request that failed, a name nothing matched). */
  reasons?: ReadonlyMap<string, string>;
  generatedAt: string;
  region?: RealRarityRegion | null;
  /** The saved file the counts came from, if not the network. */
  input?: string | null;
}

/**
 * The file the script writes: every catalogue species is either in `species` with its counts and
 * score or listed in `unresolved` with the reason, never both and never neither. **No tier**:
 * worldwide counts say how much an animal is photographed, not how likely a diver is to meet it
 * (docs/real-rarity.md).
 *
 * A species is kept only when iNaturalist resolved its name to a taxon and the score is above 0.
 * Without an iNaturalist taxon the name probably did not match (a rename the synonym table lacks),
 * and an OBIS-only score would mislead, so it is listed instead. In a region a species with no
 * record there is listed too.
 */
export function buildRealRarityData(options: BuildOptions): RealRarityData {
  const { catalog, counts, reasons, region = null } = options;
  const unresolved: UnresolvedSpecies[] = [];
  const species: Record<string, WorldwideEntry> = {};

  for (const { id, scientificName } of catalog) {
    if (id === UNLISTED_ID) continue;
    const known = counts.get(id);
    const why = (fallback: string) => reasons?.get(id) ?? fallback;
    const skip = (reason: string) => unresolved.push({ id, scientificName, reason });
    if (!known || (!known.inaturalist && !known.obis)) {
      skip(why(NOT_FETCHED_REASON));
    } else if (!known.inaturalist) {
      skip(why('No iNaturalist taxon matched its name.'));
    } else {
      const score = scoreSpecies(known);
      if (score > 0) species[id] = { ...known, score };
      else skip(region ? `No records of it in this region (${region}).` : 'No research-grade iNaturalist observations and no OBIS records.');
    }
  }

  return {
    version: 1,
    generatedAt: options.generatedAt,
    region,
    input: options.input ?? null,
    sources: REAL_RARITY_SOURCES,
    method: {
      summary:
        'Research-grade iNaturalist observations and observers and OBIS occurrence records of each species, worldwide, with a log-scaled score. Supporting evidence for the encounter tiers (src/data/encounter-rarity.json); it sets no tier, because it measures how much an animal is photographed, not how likely a diver is to meet it.',
      score: 'score = 0.40 * log10(1 + observers) + 0.25 * log10(1 + observations) + 0.35 * min(log10(1 + records), 5)',
      weights: SCORE_WEIGHTS,
      obisLogCap: OBIS_LOG_CAP,
      scope: region ? `Counts taken inside the ${region} box only.` : 'Counts are worldwide.',
    },
    species,
    unresolved,
  };
}
