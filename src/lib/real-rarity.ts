import bundled from '@/data/real-rarity.json';
import { INATURALIST_CREDIT, OBIS_CITATION, OBIS_CREDIT } from '@/lib/external-sightings/attribution';
import { RARITY_ORDER, rarityRank } from '@/lib/rarity';
import type { Rarity, Species } from '@/lib/types';

/** The catalogue's id for "something else" (UNLISTED_ID in catalog.ts, which reads this module's tiers, so it is not imported from there). */
const UNLISTED_ID = 'unlisted';

/**
 * Rarity from real data, worldwide: how often each catalogue animal is recorded at all, by
 * iNaturalist and OBIS, turned into the five tiers. The counts are fetched at build time by
 * `scripts/real-rarity/fetch.ts` and bundled as `src/data/real-rarity.json`, so the tiers do not
 * depend on what a phone happens to have cached (compare `observed-rarity.ts`, which needs many
 * dive sites summarised on the device). See docs/real-rarity.md.
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

export interface RarityEntry extends SpeciesCounts {
  /** From `scoreSpecies`. Higher means recorded more. */
  score: number;
  tier: Rarity;
}

/** A catalogue species that has no tier, and why. It keeps its catalogue tier in the app. */
export interface UnresolvedSpecies {
  id: string;
  scientificName: string;
  reason: string;
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
  species: Record<string, RarityEntry>;
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

// ── Tiers ────────────────────────────────────────────────────────────────────

/**
 * Percentile bands, from the most recorded species down. The hand-assigned catalogue of 120 has 33
 * common (27.5%), 25 uncommon (20.8%), 31 rare (25.8%), 19 epic (15.8%) and 12 legendary (10.0%);
 * these are those shares rounded to whole percents, so the shape of the collection stays the same
 * and only who sits where changes. Legendary stays the rarest tenth.
 */
export const RARITY_BANDS: readonly { tier: Rarity; percent: number }[] = [
  { tier: 'common', percent: 28 },
  { tier: 'uncommon', percent: 21 },
  { tier: 'rare', percent: 26 },
  { tier: 'epic', percent: 15 },
  { tier: 'legendary', percent: 10 },
];

/** With fewer species than this the bands mean nothing (3 species would be one per tier), so no tiers are given. */
export const MIN_SPECIES_FOR_TIERS = 20;

/** Where each band ends, as a count of species from the top. Whole percents keep the division exact. */
function bandEnds(total: number): { tier: Rarity; end: number }[] {
  let cumulative = 0;
  return RARITY_BANDS.map(({ tier, percent }) => {
    cumulative += percent;
    return { tier, end: Math.round((cumulative * total) / 100) };
  });
}

/** How many of `total` species each band holds, ignoring ties. 120 gives 34, 25, 31, 18, 12. */
export function bandCounts(total: number): Record<Rarity, number> {
  const counts: Record<Rarity, number> = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 };
  if (!Number.isFinite(total) || total <= 0) return counts;
  let previous = 0;
  for (const { tier, end } of bandEnds(Math.floor(total))) {
    counts[tier] = end - previous;
    previous = end;
  }
  return counts;
}

export interface TierOptions {
  /** Override MIN_SPECIES_FOR_TIERS. */
  minSpecies?: number;
}

/**
 * Tiers from scores by percentile across the species given: the highest scores are common, the
 * lowest legendary, in the bands of `RARITY_BANDS`.
 *
 * - Species with a score of 0 (or one that is not a finite number) have no evidence and get no
 *   tier: no records says the data is thin, not that the animal is rare. The "unlisted" id is
 *   never tiered.
 * - Equal scores share a tier, the more common one, so a tie never pushes an animal into a rarer
 *   band than a species it ties with, and legendary cannot grow by ties.
 * - Fewer than `minSpecies` scored species gives an empty map.
 */
export function tiersFromScores(
  scores: ReadonlyMap<string, number> | Readonly<Record<string, number>>,
  options: TierOptions = {},
): Map<string, Rarity> {
  const entries = (scores instanceof Map ? [...scores.entries()] : Object.entries(scores))
    .filter((entry): entry is [string, number] => entry[0] !== UNLISTED_ID && typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] > 0);
  const tiers = new Map<string, Rarity>();
  if (entries.length === 0 || entries.length < (options.minSpecies ?? MIN_SPECIES_FOR_TIERS)) return tiers;

  entries.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const ends = bandEnds(entries.length);
  let groupScore = Number.NaN;
  let groupTier: Rarity = 'legendary';
  entries.forEach(([id, score], position) => {
    if (score !== groupScore) {
      groupScore = score;
      groupTier = (ends.find((band) => position < band.end) ?? ends[ends.length - 1]).tier;
    }
    tiers.set(id, groupTier);
  });
  return tiers;
}

/** How many species hold each tier. */
export function tierCounts(tiers: Iterable<Rarity>): Record<Rarity, number> {
  const counts: Record<Rarity, number> = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 };
  for (const tier of tiers) if (tier in counts) counts[tier] += 1;
  return counts;
}

// ── Reading the file ─────────────────────────────────────────────────────────

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isTier = (value: unknown): value is Rarity => typeof value === 'string' && (RARITY_ORDER as string[]).includes(value);
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
 * writes (or the empty shape that is checked in): not an object, a species without a valid tier,
 * score or counts, a region that is not known, and so on. A damaged file is never half-used.
 * Never throws.
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
    const species: Record<string, RarityEntry> = {};
    for (const [id, entry] of Object.entries(json.species)) {
      const counts = parseCounts(entry);
      if (!counts || !isRecord(entry) || typeof entry.score !== 'number' || !Number.isFinite(entry.score) || entry.score < 0 || !isTier(entry.tier)) return null;
      species[id] = { ...counts, score: entry.score, tier: entry.tier };
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

/**
 * The real tier of each species, as the rewards engine takes it (`observed` in
 * `effectiveRarity`): species id to tier.
 *
 * Returns an empty map when the data has not been generated (`generatedAt` is null, as in the file
 * that is checked in) or is damaged, so every species keeps its catalogue tier. A species with no
 * data is absent from the map. The "unlisted" id is never in it. Never throws.
 *
 * Call it once and keep the result (see `REAL_RARITY`): a new map on every render would make a
 * hook that depends on it recompute.
 */
export function realRarity(data: unknown = bundled): ReadonlyMap<string, Rarity> {
  const tiers = new Map<string, Rarity>();
  const parsed = parseRealRarityData(data);
  if (!parsed || parsed.generatedAt === null) return tiers;
  for (const [id, entry] of Object.entries(parsed.species)) {
    if (id !== UNLISTED_ID) tiers.set(id, entry.tier);
  }
  return tiers;
}

/** The tiers from the bundled file: empty until `scripts/real-rarity/fetch.ts` has really run. */
export const REAL_RARITY: ReadonlyMap<string, Rarity> = realRarity();

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
  minSpecies?: number;
}

/**
 * The file the script writes: every catalogue species is either tiered in `species` or listed in
 * `unresolved` with the reason, never both and never neither.
 *
 * A species is tiered only when iNaturalist resolved its name to a taxon and the score is above 0.
 * Without an iNaturalist taxon the name probably did not match (a rename the synonym table lacks),
 * and an OBIS-only score would make it look rare for the wrong reason, so it is listed instead. In a
 * region a species with no record there has no tier either.
 * If fewer than `minSpecies` can be tiered, nothing is tiered and the reason says so.
 */
export function buildRealRarityData(options: BuildOptions): RealRarityData {
  const { catalog, counts, reasons, region = null } = options;
  const unresolved = new Map<string, UnresolvedSpecies>();
  const scored = new Map<string, number>();
  const entries = new Map<string, SpeciesCounts>();

  for (const species of catalog) {
    if (species.id === UNLISTED_ID) continue;
    const known = counts.get(species.id);
    const why = (fallback: string) => reasons?.get(species.id) ?? fallback;
    const skip = (reason: string) => unresolved.set(species.id, { id: species.id, scientificName: species.scientificName, reason });
    if (!known || (!known.inaturalist && !known.obis)) {
      skip(why(NOT_FETCHED_REASON));
    } else if (!known.inaturalist) {
      skip(why('No iNaturalist taxon matched its name.'));
    } else {
      const score = scoreSpecies(known);
      if (score > 0) {
        scored.set(species.id, score);
        entries.set(species.id, known);
      } else {
        skip(region ? `No records of it in this region (${region}).` : 'No research-grade iNaturalist observations and no OBIS records.');
      }
    }
  }

  const minSpecies = options.minSpecies ?? MIN_SPECIES_FOR_TIERS;
  const tiers = tiersFromScores(scored, { minSpecies });
  const species: Record<string, RarityEntry> = {};
  for (const { id, scientificName } of catalog) {
    const tier = tiers.get(id);
    const known = entries.get(id);
    if (tier && known) {
      species[id] = { ...known, score: scored.get(id) as number, tier };
    } else if (known) {
      unresolved.set(id, {
        id,
        scientificName,
        reason: `Only ${scored.size} species could be scored, fewer than the ${minSpecies} needed to place any in percentile bands.`,
      });
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
        'Each species is scored from log-scaled iNaturalist research-grade observations and observers and OBIS occurrence records, ranked across the catalogue, and cut into percentile bands: the most recorded are common, the least recorded legendary.',
      score: 'score = 0.40 * log10(1 + observers) + 0.25 * log10(1 + observations) + 0.35 * min(log10(1 + records), 5)',
      weights: SCORE_WEIGHTS,
      obisLogCap: OBIS_LOG_CAP,
      bands: RARITY_BANDS,
      bandsOrder: 'from the most recorded species down',
      minSpecies,
      ties: 'Species with equal scores share the more common tier.',
      scope: region ? `Counts taken inside the ${region} box only; percentiles are among the species recorded there.` : 'Counts are worldwide; percentiles are across the catalogue.',
    },
    species,
    unresolved: catalog.filter((s) => unresolved.has(s.id)).map((s) => unresolved.get(s.id) as UnresolvedSpecies),
  };
}
