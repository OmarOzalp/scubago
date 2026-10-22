import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import bundledJson from '@/data/real-rarity.json';
import { SPECIES } from '@/data/species';
import { UNLISTED_ID } from '@/lib/catalog';
import { HttpError, ParseError } from '@/lib/external-sightings/errors';
import { SYNONYMS } from '@/lib/external-sightings/synonyms';
import { RARITY_ORDER, rarityRank } from '@/lib/rarity';
import {
  MIN_SPECIES_FOR_TIERS,
  OBIS_LOG_CAP,
  RARITY_BANDS,
  REAL_RARITY,
  bandCounts,
  buildRealRarityData,
  parseRealRarityData,
  rarityDifferences,
  readRawCounts,
  realRarity,
  scoreSpecies,
  tierCounts,
  tiersFromScores,
  type RealRarityData,
  type SpeciesCounts,
} from '@/lib/real-rarity';
import { effectiveRarity } from '@/lib/rewards/effective-rarity';
import type { Rarity, Species } from '@/lib/types';
import { MAX_ATTEMPTS, USER_AGENT, createPoliteClient, type PoliteClient } from '../../../scripts/real-rarity/client';
import { DEFAULT_OUT, fetchSpecies, parseArgs, partialPathFor, runCli } from '../../../scripts/real-rarity/cli';
import {
  displayName,
  inatObservationsUrl,
  inatObserversUrl,
  inatTaxaUrl,
  namesForSpecies,
  obisCountUrl,
  parseInatTotal,
  parseObisTotal,
  pickTaxon,
} from '../../../scripts/real-rarity/requests';

// Every count in this file is HAND-WRITTEN to exercise the code. None of it is iNaturalist or OBIS
// data, and none of it is written to src/data/real-rarity.json: the script runs only against
// scratch folders here.

const REPO_ROOT = resolve(__dirname, '../../..');
const RAW_FIXTURE = join(REPO_ROOT, 'scripts/real-rarity/fixtures/raw-sample.json');

const inat = (observations: number, observers?: number): SpeciesCounts['inaturalist'] => ({ observations, ...(observers !== undefined && { observers }) });

describe('scoring a species', () => {
  it('is 0 with no evidence at all', () => {
    expect(scoreSpecies(undefined)).toBe(0);
    expect(scoreSpecies({})).toBe(0);
    expect(scoreSpecies({ inaturalist: inat(0, 0), obis: { records: 0 } })).toBe(0);
  });

  it('follows the documented formula', () => {
    // 99 observers and observations: log10(100) = 2. 999 records: log10(1000) = 3.
    expect(scoreSpecies({ inaturalist: inat(99, 99), obis: { records: 999 } })).toBeCloseTo(0.4 * 2 + 0.25 * 2 + 0.35 * 3, 3);
    expect(scoreSpecies({ inaturalist: inat(99, 99) })).toBeCloseTo(1.3, 3);
    expect(scoreSpecies({ obis: { records: 999 } })).toBeCloseTo(1.05, 3);
  });

  it('never goes down when any count goes up', () => {
    const ladder = [0, 1, 2, 5, 10, 100, 1_000, 10_000, 100_000, 1_000_000];
    for (const make of [
      (n: number): SpeciesCounts => ({ inaturalist: inat(n, 0), obis: { records: 50 } }),
      (n: number): SpeciesCounts => ({ inaturalist: inat(1_000_000, n), obis: { records: 50 } }),
      (n: number): SpeciesCounts => ({ inaturalist: inat(10, 1), obis: { records: n } }),
    ]) {
      const scores = ladder.map((n) => scoreSpecies(make(n)));
      for (let i = 1; i < scores.length; i++) expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
    }
    // And a tenfold increase of an uncapped count is a real step up.
    expect(scoreSpecies({ inaturalist: inat(1000, 100) })).toBeGreaterThan(scoreSpecies({ inaturalist: inat(100, 100) }));
    expect(scoreSpecies({ obis: { records: 1000 } })).toBeGreaterThan(scoreSpecies({ obis: { records: 100 } }));
  });

  it('stops counting OBIS records past the cap, where survey and tracking rows pile up', () => {
    const cap = Math.round(10 ** OBIS_LOG_CAP);
    expect(scoreSpecies({ obis: { records: cap * 100 } })).toBe(scoreSpecies({ obis: { records: cap * 10 } }));
    expect(scoreSpecies({ obis: { records: cap } })).toBeLessThan(scoreSpecies({ obis: { records: cap * 10 } }) + 1e-9);
  });

  it('does not let OBIS alone outscore moderate iNaturalist evidence', () => {
    const surveyedFish = scoreSpecies({ obis: { records: 5_000_000 } });
    const photographed = scoreSpecies({ inaturalist: inat(1000, 500) });
    expect(photographed).toBeGreaterThan(surveyedFish);
  });

  it('lets the observations carry the observers weight when observers were not fetched, and clamps a larger observers figure', () => {
    expect(scoreSpecies({ inaturalist: inat(999) })).toBeCloseTo(0.65 * 3, 3);
    expect(scoreSpecies({ inaturalist: inat(99, 5000) })).toBe(scoreSpecies({ inaturalist: inat(99, 99) }));
  });

  it('ignores counts that are not usable numbers', () => {
    const odd = { inaturalist: { observations: Number.NaN, observers: -5 }, obis: { records: Number.POSITIVE_INFINITY } };
    expect(scoreSpecies(odd)).toBe(0);
  });
});

describe('tiers from scores', () => {
  const ranked = (count: number) => new Map<string, number>(Array.from({ length: count }, (_, i) => [`s${i + 1}`, i + 1] as const));

  it('keeps the shape of the hand-assigned catalogue', () => {
    expect(RARITY_BANDS.map((b) => b.tier)).toEqual(RARITY_ORDER);
    expect(RARITY_BANDS.reduce((sum, b) => sum + b.percent, 0)).toBe(100);
    const by = tierCounts(SPECIES.map((s) => s.rarity));
    expect(by).toEqual({ common: 33, uncommon: 25, rare: 31, epic: 19, legendary: 12 });
    const bands = bandCounts(SPECIES.length);
    for (const tier of RARITY_ORDER) expect(Math.abs(bands[tier] - by[tier])).toBeLessThanOrEqual(1);
    expect(bands.legendary).toBe(12);
  });

  it('cuts 100 species at exactly 28, 49, 75 and 90', () => {
    const tiers = tiersFromScores(ranked(100)); // s100 is the most recorded, s1 the least
    expect(tierCounts(tiers.values())).toEqual({ common: 28, uncommon: 21, rare: 26, epic: 15, legendary: 10 });
    const at = (n: number) => tiers.get(`s${n}`);
    expect([at(100), at(73)]).toEqual(['common', 'common']);
    expect([at(72), at(52)]).toEqual(['uncommon', 'uncommon']);
    expect([at(51), at(26)]).toEqual(['rare', 'rare']);
    expect([at(25), at(11)]).toEqual(['epic', 'epic']);
    expect([at(10), at(1)]).toEqual(['legendary', 'legendary']);
  });

  it('gives the catalogue-sized split of 34, 25, 31, 18 and 12', () => {
    expect(bandCounts(120)).toEqual({ common: 34, uncommon: 25, rare: 31, epic: 18, legendary: 12 });
    expect(tierCounts(tiersFromScores(ranked(120)).values())).toEqual(bandCounts(120));
  });

  it('always places every scored species, whatever the number', () => {
    for (let n = MIN_SPECIES_FOR_TIERS; n <= 140; n++) {
      const counts = bandCounts(n);
      expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(n);
      expect(tiersFromScores(ranked(n)).size).toBe(n);
    }
  });

  it('never ranks a higher score in a rarer tier, and gives equal scores one tier', () => {
    let seed = 12345;
    const random = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    // 300 scores from a coarse grid, so there are plenty of ties.
    const scores = new Map(Array.from({ length: 300 }, (_, i) => [`x${i}`, 0.5 + Math.floor(random() * 80) / 10] as const));
    const tiers = tiersFromScores(scores);
    expect(tiers.size).toBe(300);
    for (const [a, scoreA] of scores) {
      for (const [b, scoreB] of scores) {
        const [tierA, tierB] = [tiers.get(a) as Rarity, tiers.get(b) as Rarity];
        if (scoreA > scoreB) expect(rarityRank(tierA)).toBeLessThanOrEqual(rarityRank(tierB));
        if (scoreA === scoreB) expect(tierA).toBe(tierB);
      }
    }
  });

  it('puts a tie that straddles an edge in the more common tier, so legendary cannot grow by ties', () => {
    // 30 species; the bottom ten all tie, starting at position 20 (before the rare band ends at 23).
    const scores = new Map<string, number>();
    for (let i = 0; i < 20; i++) scores.set(`a${i}`, 10 + i);
    for (let i = 0; i < 10; i++) scores.set(`z${i}`, 1);
    const tiers = tiersFromScores(scores);
    expect(tiers.get('z0')).toBe('rare');
    expect(tierCounts(tiers.values()).legendary).toBe(0);
  });

  it('leaves out species with no evidence, and the unlisted id', () => {
    const scores = ranked(40);
    scores.set('no-data', 0);
    scores.set('negative', -3);
    scores.set('nan', Number.NaN);
    scores.set(UNLISTED_ID, 999);
    const tiers = tiersFromScores(scores);
    expect(tiers.size).toBe(40);
    for (const id of ['no-data', 'negative', 'nan', UNLISTED_ID]) expect(tiers.has(id)).toBe(false);
  });

  it('gives no tiers when there are too few species for percentiles to mean anything', () => {
    expect(tiersFromScores(ranked(MIN_SPECIES_FOR_TIERS - 1)).size).toBe(0);
    expect(tiersFromScores(ranked(MIN_SPECIES_FOR_TIERS)).size).toBe(MIN_SPECIES_FOR_TIERS);
    expect(tiersFromScores(new Map()).size).toBe(0);
    expect(tiersFromScores(ranked(5), { minSpecies: 5 }).size).toBe(5);
  });

  it('takes a plain object as well as a map', () => {
    const record = Object.fromEntries(ranked(25));
    expect(tiersFromScores(record).size).toBe(25);
  });
});

describe('the bundled tiers', () => {
  const sample = (tier: Rarity, extra: Partial<RealRarityData['species'][string]> = {}) => ({
    inaturalist: { observations: 10, observers: 4, taxonId: 7 },
    obis: { records: 20 },
    score: 1.5,
    tier,
    ...extra,
  });
  const file = (overrides: Record<string, unknown> = {}) => ({
    version: 1,
    generatedAt: '2026-10-22T00:00:00.000Z',
    region: null,
    species: { 'whale-shark': sample('rare'), orca: sample('epic') },
    unresolved: [{ id: 'sawfish', scientificName: 'Pristis pristis', reason: 'No iNaturalist taxon matched its name.' }],
    ...overrides,
  });

  it('are empty until the data has been generated, so the catalogue tiers stand', () => {
    expect(realRarity({ generatedAt: null, species: {} }).size).toBe(0);
    // Species present but never generated: still nothing.
    expect(realRarity({ generatedAt: null, species: { 'whale-shark': sample('rare') } }).size).toBe(0);
  });

  it('match the checked-in file, which is always valid', () => {
    const parsed = parseRealRarityData(bundledJson);
    expect(parsed).not.toBeNull();
    expect(realRarity().size).toBe(parsed && parsed.generatedAt !== null ? Object.keys(parsed.species).length : 0);
    expect(REAL_RARITY.size).toBe(realRarity().size);
    // Whatever it holds, it holds only catalogue species.
    const ids = new Set(SPECIES.map((s) => s.id));
    for (const id of REAL_RARITY.keys()) expect(ids.has(id)).toBe(true);
  });

  it('map each species to its tier', () => {
    const tiers = realRarity(file());
    expect(tiers.get('whale-shark')).toBe('rare');
    expect(tiers.get('orca')).toBe('epic');
    expect(tiers.has('sawfish')).toBe(false); // listed as unresolved: no data is absent, not common
    expect(tiers.size).toBe(2);
  });

  it('never include the unlisted id', () => {
    expect(realRarity(file({ species: { [UNLISTED_ID]: sample('legendary'), orca: sample('epic') } })).has(UNLISTED_ID)).toBe(false);
  });

  it('turn corrupt input into an empty map without throwing', () => {
    const throwing = {};
    Object.defineProperty(throwing, 'species', { get() { throw new Error('boom'); }, enumerable: true });
    const corrupt: unknown[] = [
      undefined,
      null,
      42,
      'text',
      [],
      {},
      { generatedAt: null },
      { species: {} },
      { generatedAt: 'not a date', species: {} },
      { generatedAt: 12345, species: {} },
      file({ species: [] }),
      file({ species: { orca: sample('mythic' as Rarity) } }),
      file({ species: { orca: sample('epic', { score: Number.NaN }) } }),
      file({ species: { orca: sample('epic', { score: -1 }) } }),
      file({ species: { orca: sample('epic', { inaturalist: { observations: -4 } }) } }),
      file({ species: { orca: sample('epic', { inaturalist: { observations: 1.5 } }) } }),
      file({ species: { orca: sample('epic', { obis: { records: '7' as unknown as number } }) } }),
      file({ species: { orca: sample('epic', { inaturalist: { observations: 3, taxonId: 0 } }) } }),
      file({ species: { orca: null, 'whale-shark': sample('rare') } }),
      file({ region: 'atlantis' }),
      file({ version: 2 }),
      file({ sources: [] }),
      file({ unresolved: {} }),
      file({ unresolved: [{ id: 'sawfish' }] }),
      throwing,
    ];
    for (const input of corrupt) {
      expect(() => realRarity(input)).not.toThrow();
      expect(realRarity(input).size).toBe(0);
      expect(parseRealRarityData(input)).toBeNull();
    }
  });

  it('are accepted whole or not at all: one bad species rejects the file', () => {
    expect(realRarity(file({ species: { orca: sample('epic'), 'whale-shark': { score: 1, tier: 'nope' } } })).size).toBe(0);
  });

  it('accept the empty shape, the full shape and a region file', () => {
    expect(parseRealRarityData({ generatedAt: null, species: {} })).not.toBeNull();
    expect(parseRealRarityData(file())).not.toBeNull();
    expect(parseRealRarityData(file({ region: 'gbr' }))?.region).toBe('gbr');
  });

  it('feed effectiveRarity: the real tier where there is one, the catalogue tier otherwise', () => {
    const tiers = realRarity(file());
    expect(effectiveRarity({ id: 'whale-shark', rarity: 'legendary' }, tiers)).toBe('rare');
    expect(effectiveRarity({ id: 'dugong', rarity: 'legendary' }, tiers)).toBe('legendary');
    expect(effectiveRarity({ id: 'dugong', rarity: 'legendary' }, realRarity({ generatedAt: null, species: {} }))).toBe('legendary');
  });
});

describe('where real data disagrees with the catalogue', () => {
  const catalog = [
    { id: 'a', commonName: 'A', rarity: 'common' as Rarity },
    { id: 'b', commonName: 'B', rarity: 'legendary' as Rarity },
    { id: 'c', commonName: 'C', rarity: 'rare' as Rarity },
    { id: 'd', commonName: 'D', rarity: 'epic' as Rarity },
    { id: 'e', commonName: 'E', rarity: 'uncommon' as Rarity },
    { id: UNLISTED_ID, commonName: 'Something else', rarity: 'common' as Rarity },
  ];

  it('lists only differences, biggest first, then in catalogue order', () => {
    const tiers = new Map<string, Rarity>([
      ['a', 'common'], // same
      ['b', 'common'], // four tiers more common
      ['c', 'epic'], // one tier rarer
      ['d', 'rare'], // one tier more common
      [UNLISTED_ID, 'legendary'],
    ]);
    const differences = rarityDifferences(catalog, tiers);
    expect(differences.map((d) => d.id)).toEqual(['b', 'c', 'd']);
    expect(differences.map((d) => d.steps)).toEqual([-4, 1, -1]);
    expect(differences[1]).toEqual({ id: 'c', commonName: 'C', catalog: 'rare', real: 'epic', steps: 1 });
  });

  it('does not count a species with no real tier as a difference', () => {
    expect(rarityDifferences(catalog, new Map())).toEqual([]);
  });
});

describe('building the file', () => {
  const catalog = Array.from({ length: 24 }, (_, i) => ({ id: `sp${i}`, scientificName: `Genus species${i}` }));
  const counts = new Map<string, SpeciesCounts>();
  catalog.slice(0, 22).forEach((s, i) => counts.set(s.id, { inaturalist: inat(10 ** ((i % 5) + 1), 10 ** (i % 4)), obis: { records: 100 * (i + 1) } }));
  counts.set('sp22', { obis: { records: 5000 } }); // no iNaturalist taxon
  // sp23: nothing at all

  it('tiers or lists every catalogue species, never both and never neither', () => {
    const reasons = new Map([['sp22', 'No active iNaturalist species matched Genus species22.']]);
    const data = buildRealRarityData({ catalog, counts, reasons, generatedAt: '2026-10-22T00:00:00.000Z' });
    const tiered = Object.keys(data.species);
    const listed = (data.unresolved ?? []).map((u) => u.id);
    expect(tiered).toHaveLength(22);
    expect([...tiered, ...listed].sort()).toEqual(catalog.map((s) => s.id).sort());
    expect(data.unresolved?.find((u) => u.id === 'sp22')?.reason).toBe(reasons.get('sp22'));
    expect(data.unresolved?.find((u) => u.id === 'sp23')?.reason).toMatch(/Nothing was fetched/);
    expect(parseRealRarityData(JSON.parse(JSON.stringify(data)))).not.toBeNull();
    expect(data.sources).toBeDefined();
    expect(JSON.stringify(data.sources)).toMatch(/iNaturalist/);
    expect(JSON.stringify(data.sources)).toMatch(/OBIS/);
  });

  it('lists a species with zero records everywhere instead of calling it legendary', () => {
    const withZero = new Map(counts).set('sp0', { inaturalist: inat(0, 0), obis: { records: 0 } });
    const data = buildRealRarityData({ catalog, counts: withZero, generatedAt: '2026-10-22T00:00:00.000Z' });
    expect(data.species.sp0).toBeUndefined();
    expect(data.unresolved?.find((u) => u.id === 'sp0')?.reason).toMatch(/No research-grade/);
  });

  it('tiers nothing, and says why, when too few species have data', () => {
    const few = new Map([...counts].slice(0, 5));
    const data = buildRealRarityData({ catalog, counts: few, generatedAt: '2026-10-22T00:00:00.000Z' });
    expect(Object.keys(data.species)).toEqual([]);
    expect(data.unresolved?.find((u) => u.id === 'sp0')?.reason).toMatch(/Only 5 species could be scored/);
  });

  it('says in a region that a species with no record there has no tier', () => {
    const data = buildRealRarityData({ catalog, counts: new Map(counts).set('sp1', { inaturalist: inat(0, 0), obis: { records: 0 } }), generatedAt: '2026-10-22T00:00:00.000Z', region: 'gbr' });
    expect(data.region).toBe('gbr');
    expect(data.unresolved?.find((u) => u.id === 'sp1')?.reason).toMatch(/this region \(gbr\)/);
  });

  it('reads its own output back as raw counts, ignoring the score and tier', () => {
    const data = buildRealRarityData({ catalog, counts, generatedAt: '2026-10-22T00:00:00.000Z' });
    const raw = readRawCounts(JSON.parse(JSON.stringify(data)));
    expect(raw?.species.size).toBe(22);
    expect(raw?.species.get('sp3')).toEqual(counts.get('sp3'));
    expect(readRawCounts({ species: [] })).toBeNull();
    expect(readRawCounts('x')).toBeNull();
    expect(readRawCounts({ species: { a: { inaturalist: { observations: 'many' } }, b: {} } })?.ignored).toEqual(['a']);
  });
});

// ── The script ───────────────────────────────────────────────────────────────

describe('the names asked about, with synonyms', () => {
  const byId = (id: string) => SPECIES.find((s) => s.id === id) as Species;

  it('starts with the catalogue name and adds the renames from the synonym table', () => {
    expect(namesForSpecies(byId('reef-manta'), SPECIES)).toEqual(['Mobula alfredi', 'Manta alfredi']);
    expect(namesForSpecies(byId('mola-mola'), SPECIES)).toEqual(['Mola mola', 'Mola ramsayi', 'Mola alexandrini', 'Mola tecta']);
    expect(namesForSpecies(byId('whale-shark'), SPECIES)).toEqual(['Rhincodon typus']);
  });

  it('covers every synonym in the table for exactly the species it belongs to', () => {
    for (const [name, id] of Object.entries(SYNONYMS)) {
      expect(namesForSpecies(byId(id), SPECIES)).toContain(displayName(name));
    }
    expect(Object.values(SYNONYMS).length).toBeGreaterThan(0);
  });

  it('leaves out a synonym that is another species own name, as the app matching does', () => {
    const catalog = [
      { id: 'a', scientificName: 'Genus one' },
      { id: 'b', scientificName: 'Genus two' },
    ];
    const synonyms = { 'genus two': 'a', 'genus old': 'a' };
    expect(namesForSpecies(catalog[0], catalog, synonyms)).toEqual(['Genus one', 'Genus old']);
    expect(namesForSpecies(catalog[1], catalog, synonyms)).toEqual(['Genus two']);
  });

  it('sends every name in the one OBIS request, so a lumped record is counted once', () => {
    const url = obisCountUrl(namesForSpecies(byId('reef-manta'), SPECIES));
    expect(url).toBe('https://api.obis.org/v3/occurrence?scientificname=Mobula%20alfredi,Manta%20alfredi&size=0');
  });
});

describe('the requests for one species', () => {
  it('are these URLs for Rhincodon typus', () => {
    expect(inatTaxaUrl('Rhincodon typus')).toBe('https://api.inaturalist.org/v1/taxa?q=Rhincodon%20typus&rank=species&is_active=true&per_page=10');
    expect(inatObservationsUrl([123])).toBe('https://api.inaturalist.org/v1/observations?taxon_id=123&quality_grade=research&verifiable=true&per_page=0');
    expect(inatObserversUrl([123])).toBe('https://api.inaturalist.org/v1/observations/observers?taxon_id=123&quality_grade=research&verifiable=true&per_page=0');
    expect(obisCountUrl(['Rhincodon typus'])).toBe('https://api.obis.org/v3/occurrence?scientificname=Rhincodon%20typus&size=0');
  });

  it('count several taxa together, and fall back to a page size of 1', () => {
    expect(inatObservationsUrl([5, 9], undefined, 1)).toContain('taxon_id=5,9&');
    expect(inatObservationsUrl([5], undefined, 1)).toMatch(/per_page=1$/);
    expect(obisCountUrl(['A b'], undefined, 1)).toMatch(/size=1$/);
  });

  it('narrow to a box for --region', () => {
    const url = inatObservationsUrl([123], 'gbr');
    expect(url).toContain('nelat=-10.7&nelng=154.5&swlat=-24.5&swlng=142.2');
    expect(inatObserversUrl([123], 'red-sea')).toContain('nelat=30.2');
    const obis = obisCountUrl(['Rhincodon typus'], 'gbr');
    expect(obis).toContain('geometry=POLYGON((142.2%20-24.5,154.5%20-24.5,154.5%20-10.7,142.2%20-10.7,142.2%20-24.5))');
    expect(obis).toContain('scientificname=Rhincodon%20typus');
  });

  describe('reading the answers', () => {
    // Hand-written responses shaped like the documented ones.
    const row = (id: number, name: string, extra: Record<string, unknown> = {}) => ({ id, name, rank: 'species', is_active: true, observations_count: 10, ...extra });

    it('picks the taxon with the name asked for, and a synonym match only when nothing is called that', () => {
      const json = { results: [row(2, 'Mobula birostris', { matched_term: 'Manta birostris' }), row(1, 'Manta birostris', { is_active: false })] };
      expect(pickTaxon(json, 'Manta birostris')).toEqual({ id: 2, name: 'Mobula birostris', via: 'synonym' });
      expect(pickTaxon({ results: [row(3, 'Mobula birostris'), row(4, 'Mobula birostris', { observations_count: 50 })] }, 'Mobula birostris')).toEqual({ id: 4, name: 'Mobula birostris', via: 'name' });
      expect(pickTaxon({ results: [row(2, 'Mobula birostris', { matched_term: 'Manta birostris' }), row(3, 'Manta birostris')] }, 'Manta birostris')?.via).toBe('name');
    });

    it('trusts nothing fuzzy: other names, other ranks, inactive taxa', () => {
      expect(pickTaxon({ results: [row(1, 'Mobula tarapacana')] }, 'Mobula alfredi')).toBeNull();
      expect(pickTaxon({ results: [row(1, 'Mobula alfredi', { rank: 'genus' })] }, 'Mobula alfredi')).toBeNull();
      expect(pickTaxon({ results: [row(1, 'Mobula alfredi', { is_active: false })] }, 'Mobula alfredi')).toBeNull();
      expect(pickTaxon({ results: [] }, 'Mobula alfredi')).toBeNull();
      expect(pickTaxon({ results: [row(1, 'Mobula alfredi')] }, 'Mobula')).toBeNull();
      expect(() => pickTaxon({}, 'Mobula alfredi')).toThrow(ParseError);
    });

    it('reads the totals', () => {
      expect(parseInatTotal({ total_results: 1234, page: 1, per_page: 0, results: [] })).toBe(1234);
      expect(parseObisTotal({ total: 5678, results: [] })).toBe(5678);
      expect(() => parseInatTotal({ results: [] })).toThrow(ParseError);
      expect(() => parseObisTotal({ total: -1 })).toThrow(ParseError);
      expect(() => parseObisTotal(null)).toThrow(ParseError);
    });
  });
});

describe('the polite client', () => {
  /** A fake clock and fake network: no real waiting. */
  function harness(script: { status: number; body?: unknown; retryAfter?: string; throws?: Error }[], options: { contact?: string } = {}) {
    let t = 0;
    let next = 0;
    const calls: { url: string; at: number; headers: Record<string, string> | undefined }[] = [];
    const retries: string[] = [];
    const client = createPoliteClient({
      now: () => t,
      sleep: async (ms) => {
        t += ms;
      },
      backoffBaseMs: 1000,
      onRetry: (message) => retries.push(message),
      contact: options.contact,
      fetchImpl: async (url, init) => {
        calls.push({ url, at: t, headers: init?.headers });
        const step = script[Math.min(next++, script.length - 1)];
        if (step.throws) throw step.throws;
        return {
          ok: step.status >= 200 && step.status < 300,
          status: step.status,
          headers: { get: (name: string) => (name.toLowerCase() === 'retry-after' ? (step.retryAfter ?? null) : null) },
          json: async () => step.body ?? {},
        };
      },
    });
    return { client, calls, retries, now: () => t };
  }

  it('starts requests at least 1.1 s apart, to any host, and names ScubaGo', async () => {
    const { client, calls } = harness([{ status: 200, body: { total_results: 1 } }]);
    await client.getJson('https://api.inaturalist.org/v1/taxa?q=a');
    await client.getJson('https://api.obis.org/v3/occurrence?scientificname=a&size=0');
    await client.getJson('https://api.obis.org/v3/occurrence?scientificname=b&size=0');
    expect(calls).toHaveLength(3);
    expect(calls[1].at - calls[0].at).toBeGreaterThanOrEqual(1100);
    expect(calls[2].at - calls[1].at).toBeGreaterThanOrEqual(1100);
    expect(calls[0].headers?.['User-Agent']).toBe(USER_AGENT);
    expect(USER_AGENT).toMatch(/ScubaGo/);
    expect(calls[0].headers?.Accept).toBe('application/json');
    expect(client.requests()).toBe(3);
  });

  it('adds a contact to the User-Agent when given one', async () => {
    const { client, calls } = harness([{ status: 200 }], { contact: 'dive@example.test' });
    await client.getJson('https://api.obis.org/v3/occurrence');
    expect(calls[0].headers?.['User-Agent']).toBe(`${USER_AGENT} dive@example.test`);
  });

  it('retries a 5xx with a growing back-off, then succeeds', async () => {
    const { client, calls, retries } = harness([{ status: 503 }, { status: 502 }, { status: 200, body: { ok: true } }]);
    await expect(client.getJson('https://api.inaturalist.org/v1/taxa')).resolves.toEqual({ ok: true });
    expect(calls).toHaveLength(3);
    expect(calls[1].at - calls[0].at).toBeGreaterThanOrEqual(1000);
    expect(calls[2].at - calls[1].at).toBeGreaterThanOrEqual(2000);
    expect(retries).toHaveLength(2);
  });

  it('waits out a 429 for as long as Retry-After says', async () => {
    const { client, calls } = harness([{ status: 429, retryAfter: '20' }, { status: 200 }]);
    await client.getJson('https://api.inaturalist.org/v1/taxa');
    expect(calls[1].at - calls[0].at).toBeGreaterThanOrEqual(20_000);
  });

  it('retries a dropped connection', async () => {
    const { client, calls } = harness([{ status: 0, throws: new TypeError('fetch failed') }, { status: 200 }]);
    await client.getJson('https://api.obis.org/v3/occurrence');
    expect(calls).toHaveLength(2);
  });

  it('gives up after the last try, and does not retry what will not change', async () => {
    const down = harness([{ status: 503 }]);
    await expect(down.client.getJson('https://api.obis.org/v3/occurrence')).rejects.toMatchObject({ name: 'HttpError', status: 503 });
    expect(down.calls).toHaveLength(MAX_ATTEMPTS);

    const missing = harness([{ status: 404 }]);
    await expect(missing.client.getJson('https://api.obis.org/v3/occurrence')).rejects.toMatchObject({ status: 404 });
    expect(missing.calls).toHaveLength(1);
  });
});

// Hand-written stand-ins for the two APIs, keyed by the URLs the script builds.
const TAXON_BY_NAME: Record<string, number> = { 'Mobula alfredi': 100, 'Manta alfredi': 100, 'Mola mola': 200, 'Mola tecta': 201 };

interface FakeNetwork extends PoliteClient {
  urls: string[];
}

function fakeNetwork(overrides: (url: string) => unknown | undefined = () => undefined): FakeNetwork {
  const urls: string[] = [];
  return {
    urls,
    requests: () => urls.length,
    async getJson(url: string) {
      urls.push(url);
      const custom = overrides(url);
      if (custom !== undefined) return custom;
      const taxa = /\/taxa\?q=([^&]+)/.exec(url);
      if (taxa) {
        const name = decodeURIComponent(taxa[1]);
        const id = TAXON_BY_NAME[name] ?? genusId(name);
        if (id === undefined) return { total_results: 0, results: [] };
        return { total_results: 1, results: [{ id, name: name.startsWith('Manta') ? 'Mobula alfredi' : name, rank: 'species', is_active: true, observations_count: 1, matched_term: name }] };
      }
      if (url.includes('/observations/observers')) return { total_results: idCount(url) / 10 };
      if (url.includes('/observations?')) return { total_results: idCount(url) };
      if (url.includes('/occurrence')) return { total: 3 * idCountForName(url), results: [] };
      throw new Error(`unexpected request ${url}`);
    },
  };
}

/** Taxon ids for the mini catalogue's names: "Genus alpha" is 11, "Genus beta" 12, and so on. */
const MINI_IDS: Record<string, number> = { alpha: 11, beta: 12, gamma: 13, delta: 14 };
const MINI_OBSERVATIONS: Record<number, number> = { 11: 5000, 12: 300, 13: 40, 14: 2, 100: 800, 200: 600, 201: 400 };
const genusId = (name: string) => MINI_IDS[name.replace('Genus ', '')];
const idCount = (url: string) => (/taxon_id=([\d,]+)/.exec(url)?.[1] ?? '').split(',').reduce((sum, id) => sum + (MINI_OBSERVATIONS[Number(id)] ?? 0), 0);
const idCountForName = (url: string) => {
  const names = decodeURIComponent(/scientificname=([^&]+)/.exec(url)?.[1] ?? '').split(',');
  return names.reduce((sum, name) => sum + (MINI_OBSERVATIONS[TAXON_BY_NAME[name] ?? genusId(name) ?? 0] ?? 0), 0);
};

describe('asking the sources about a species', () => {
  const byId = (id: string) => SPECIES.find((s) => s.id === id) as Species;

  it('resolves every name, counts a taxon once however many names lead to it, and asks OBIS for all names at once', async () => {
    const network = fakeNetwork();
    const fetched = await fetchSpecies(network, byId('reef-manta'), SPECIES);
    expect(network.urls).toEqual([
      'https://api.inaturalist.org/v1/taxa?q=Mobula%20alfredi&rank=species&is_active=true&per_page=10',
      'https://api.inaturalist.org/v1/taxa?q=Manta%20alfredi&rank=species&is_active=true&per_page=10',
      'https://api.inaturalist.org/v1/observations?taxon_id=100&quality_grade=research&verifiable=true&per_page=0',
      'https://api.inaturalist.org/v1/observations/observers?taxon_id=100&quality_grade=research&verifiable=true&per_page=0',
      'https://api.obis.org/v3/occurrence?scientificname=Mobula%20alfredi,Manta%20alfredi&size=0',
    ]);
    expect(fetched.counts).toEqual({ inaturalist: { observations: 800, observers: 80, taxonId: 100 }, obis: { records: 4800 } });
  });

  it('adds up the taxa of a deliberate lump', async () => {
    const network = fakeNetwork((url) => (/q=Mola%20(ramsayi|alexandrini)/.test(url) ? { total_results: 0, results: [] } : undefined));
    const fetched = await fetchSpecies(network, byId('mola-mola'), SPECIES);
    expect(network.urls).toContain('https://api.inaturalist.org/v1/observations?taxon_id=200,201&quality_grade=research&verifiable=true&per_page=0');
    expect(fetched.counts.inaturalist).toMatchObject({ observations: 1000, taxonId: 200, taxonIds: [200, 201] });
    expect(fetched.notes.join(' ')).toMatch(/no iNaturalist species for Mola ramsayi, Mola alexandrini/);
  });

  it('reports a species no name resolves for, without asking for counts', async () => {
    const network = fakeNetwork(() => undefined);
    const fetched = await fetchSpecies(network, { id: 'ghost', scientificName: 'Nowhere imaginarius' }, SPECIES);
    expect(fetched.counts).toEqual({});
    expect(fetched.reason).toMatch(/No active iNaturalist species matched Nowhere imaginarius/);
    expect(network.urls).toHaveLength(1);
  });

  it('asks again with a page size of 1 where 0 is refused, and goes without observers if they are refused', async () => {
    const network = fakeNetwork((url) => {
      if (url.endsWith('per_page=0') && url.includes('/observations?')) throw new HttpError(400);
      if (url.includes('/observations/observers')) throw new HttpError(404);
      if (url.endsWith('size=0')) throw new HttpError(422);
      return undefined;
    });
    const fetched = await fetchSpecies(network, { id: 'alpha', scientificName: 'Genus alpha' }, [{ id: 'alpha', scientificName: 'Genus alpha' }]);
    expect(network.urls.some((u) => u.endsWith('per_page=1') && u.includes('/observations?'))).toBe(true);
    expect(network.urls.some((u) => u.endsWith('size=1'))).toBe(true);
    expect(fetched.counts.inaturalist).toEqual({ observations: 5000, taxonId: 11 });
    expect(fetched.counts.obis).toEqual({ records: 15000 });
    expect(fetched.notes.join(' ')).toMatch(/observers not available/);
  });

  it('lets a server error through, so the species is retried on the next run', async () => {
    const network = fakeNetwork((url) => {
      if (url.includes('/occurrence')) throw new HttpError(503);
      return undefined;
    });
    await expect(fetchSpecies(network, { id: 'alpha', scientificName: 'Genus alpha' }, [{ id: 'alpha', scientificName: 'Genus alpha' }])).rejects.toMatchObject({ status: 503 });
  });

  it('narrows every count to the region', async () => {
    const network = fakeNetwork();
    await fetchSpecies(network, { id: 'alpha', scientificName: 'Genus alpha' }, [{ id: 'alpha', scientificName: 'Genus alpha' }], 'red-sea');
    expect(network.urls.filter((u) => u.includes('/taxa'))[0]).not.toContain('nelat');
    expect(network.urls.filter((u) => !u.includes('/taxa')).every((u) => u.includes('nelat=30.2') || u.includes('geometry='))).toBe(true);
  });
});

describe('running the script', () => {
  let scratch: string;
  beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), 'real-rarity-test-'));
  });
  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  const read = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as RealRarityData;
  const capture = () => {
    const lines: string[] = [];
    const warnings: string[] = [];
    return { lines, warnings, deps: { log: (l: string) => lines.push(l), warn: (l: string) => warnings.push(l) } };
  };
  const NOW = () => new Date('2026-10-22T12:00:00.000Z');

  it('reads its options', () => {
    expect(parseArgs([]).out).toBeNull();
    expect(parseArgs(['--region', 'gbr', '--only', 'orca, dugong', '--min-species', '5']).only).toEqual(['orca', 'dugong']);
    expect(() => parseArgs(['--region', 'atlantic'])).toThrow(/--region must be one of/);
    expect(() => parseArgs(['--out'])).toThrow(/needs a value/);
    expect(() => parseArgs(['--min-species', '0'])).toThrow(/whole number/);
    expect(() => parseArgs(['--input', 'x.json', '--only', 'orca'])).toThrow(/cannot be used with --input/);
    expect(() => parseArgs(['--bogus'])).toThrow(/Unknown option/);
    expect(partialPathFor('/a/real-rarity.json')).toBe('/a/real-rarity.partial.json');
    expect(DEFAULT_OUT).toMatch(/src\/data\/real-rarity\.json$/);
  });

  it('recomputes tiers offline from a hand-written raw file, into a scratch file', async () => {
    const before = readFileSync(join(REPO_ROOT, 'src/data/real-rarity.json'), 'utf8');
    const out = join(scratch, 'offline', 'real-rarity.json');
    const { lines, warnings, deps } = capture();
    const code = await runCli(['--input', RAW_FIXTURE, '--out', out, '--min-species', '10'], { ...deps, now: NOW });
    expect(code).toBe(0);
    expect(readFileSync(join(REPO_ROOT, 'src/data/real-rarity.json'), 'utf8')).toBe(before); // never the real file

    const data = read(out);
    expect(parseRealRarityData(data)).not.toBeNull();
    expect(data.generatedAt).toBe('2026-10-22T12:00:00.000Z');
    expect(data.input).toBe('raw-sample.json');
    expect(Object.keys(data.species)).toHaveLength(15);
    expect(data.species['great-barracuda'].tier).toBe('common');
    expect(data.species.sawfish.tier).toBe('legendary');
    expect(data.species['mola-mola'].inaturalist?.taxonIds).toEqual([9, 10]);
    // Every catalogue species is accounted for exactly once.
    const listed = (data.unresolved ?? []).map((u) => u.id);
    expect([...Object.keys(data.species), ...listed].sort()).toEqual(SPECIES.map((s) => s.id).sort());
    const reason = (id: string) => data.unresolved?.find((u) => u.id === id)?.reason;
    expect(reason('sailfish')).toMatch(/No active iNaturalist species matched/); // carried over from the input
    expect(reason('leatherback-turtle')).toMatch(/No research-grade/);
    expect(reason('orca')).toMatch(/could not be read/); // a malformed entry
    expect(reason('dugong')).toBeUndefined();
    expect(data.species[UNLISTED_ID]).toBeUndefined();
    expect(warnings.join('\n')).toMatch(/unlisted, not-in-the-catalogue/);
    expect(lines.join('\n')).toMatch(/Tiered: 15/);
    expect(realRarity(data).size).toBe(15);
    expect(realRarity(data).get('whale-shark')).toBe(data.species['whale-shark'].tier);
  });

  it('gives the same tiers when its own output is fed back in', async () => {
    const first = join(scratch, 'again', 'first.json');
    const second = join(scratch, 'again', 'second.json');
    await runCli(['--input', RAW_FIXTURE, '--out', first, '--min-species', '10'], { ...capture().deps, now: NOW });
    await runCli(['--input', first, '--out', second, '--min-species', '10'], { ...capture().deps, now: NOW });
    const [a, b] = [read(first), read(second)];
    expect(b.species).toEqual(a.species);
    expect(b.input).toBe('first.json');
  });

  it('refuses to write an empty result, and a dry run writes nothing', async () => {
    const out = join(scratch, 'empty', 'out.json');
    const emptyInput = join(scratch, 'empty-input.json');
    writeFileSync(emptyInput, JSON.stringify({ species: {} }));
    expect(await runCli(['--input', emptyInput, '--out', out], capture().deps)).toBe(1);
    expect(existsSync(out)).toBe(false);

    const dry = join(scratch, 'dry', 'out.json');
    expect(await runCli(['--input', RAW_FIXTURE, '--out', dry, '--min-species', '10', '--dry-run'], capture().deps)).toBe(0);
    expect(existsSync(dry)).toBe(false);
  });

  it('reports bad input instead of throwing', async () => {
    const { warnings, deps } = capture();
    const notJson = join(scratch, 'not-json.txt');
    writeFileSync(notJson, 'this is not json');
    expect(await runCli(['--input', notJson], deps)).toBe(1);
    expect(await runCli(['--input', join(scratch, 'missing.json')], deps)).toBe(1);
    writeFileSync(notJson, '[]');
    expect(await runCli(['--input', notJson], deps)).toBe(1);
    expect(await runCli(['--bogus'], deps)).toBe(2);
    expect(await runCli(['--only', 'not-a-species'], deps)).toBe(2);
    expect(warnings).toHaveLength(5);
  });

  describe('against stand-in sources', () => {
    const mini: Species[] = ['alpha', 'beta', 'gamma', 'delta'].map((id) => ({ id, commonName: id, scientificName: `Genus ${id}`, category: 'fish', rarity: 'common', blurb: '' }));

    it('fetches, tiers, writes, and carries on from its checkpoint after a failure', async () => {
      const out = join(scratch, 'live', 'out.json');
      const checkpoint = partialPathFor(out);
      const args = ['--out', out, '--min-species', '3'];

      // First run: the OBIS count for gamma fails (after the client's own retries).
      const broken = fakeNetwork((url) => {
        if (url.includes('/occurrence') && url.includes('Genus%20gamma')) throw new HttpError(503);
        return undefined;
      });
      const first = capture();
      expect(await runCli(args, { ...first.deps, client: broken, catalog: mini, now: NOW })).toBe(1);
      expect(existsSync(out)).toBe(false);
      expect(first.warnings.join('\n')).toMatch(/gamma/);
      const saved = read(checkpoint) as unknown as { species: Record<string, unknown>; partial: boolean };
      expect(Object.keys(saved.species).sort()).toEqual(['alpha', 'beta', 'delta']);
      expect(saved.partial).toBe(true);

      // Second run: healthy. Only gamma is asked about, and the checkpoint goes away.
      const healthy = fakeNetwork();
      const second = capture();
      expect(await runCli(args, { ...second.deps, client: healthy, catalog: mini, now: NOW })).toBe(0);
      expect(second.lines.join('\n')).toMatch(/Resuming from out\.partial\.json: 3 species already fetched/);
      expect(healthy.urls.length).toBeGreaterThan(0);
      expect(healthy.urls.every((u) => /gamma|taxon_id=13/.test(u))).toBe(true);
      expect(existsSync(checkpoint)).toBe(false);

      const data = read(out);
      expect(Object.keys(data.species)).toEqual(['alpha', 'beta', 'gamma', 'delta']);
      // Counts as the stand-ins gave them, tiers by percentile of the score.
      expect(data.species.alpha.inaturalist).toEqual({ observations: 5000, observers: 500, taxonId: 11 });
      expect(data.species.alpha.obis).toEqual({ records: 15000 });
      const tiers = Object.fromEntries(Object.entries(data.species).map(([id, e]) => [id, e.tier]));
      expect(tiers).toEqual({ alpha: 'common', beta: 'uncommon', gamma: 'rare', delta: 'epic' });
      expect(data.unresolved).toEqual([]);
    });

    it('with --allow-incomplete writes what it has and lists the failed species', async () => {
      const out = join(scratch, 'incomplete', 'out.json');
      const broken = fakeNetwork((url) => (url.includes('/occurrence') && url.includes('Genus%20delta') ? (() => { throw new HttpError(500); })() : undefined));
      const code = await runCli(['--out', out, '--min-species', '3', '--allow-incomplete'], { ...capture().deps, client: broken, catalog: mini, now: NOW });
      expect(code).toBe(0);
      const data = read(out);
      expect(Object.keys(data.species)).toEqual(['alpha', 'beta', 'gamma']);
      expect(data.unresolved?.map((u) => u.id)).toEqual(['delta']);
      expect(data.unresolved?.[0].reason).toMatch(/request failed: HTTP 500/);
    });

    it('stops after several species in a row fail, keeping the checkpoint', async () => {
      const many: Species[] = 'abcdefgh'.split('').map((letter) => ({ ...mini[0], id: `many-${letter}`, scientificName: `Genus many${letter}` }));
      const down = fakeNetwork(() => {
        throw new TypeError('fetch failed');
      });
      const out = join(scratch, 'down', 'out.json');
      const run = capture();
      expect(await runCli(['--out', out], { ...run.deps, client: down, catalog: many, now: NOW })).toBe(1);
      expect(down.urls).toHaveLength(5); // one request per failed species, then it stopped
      expect(run.warnings.join('\n')).toMatch(/5 species in a row failed/);
      expect(existsSync(out)).toBe(false);
    });

    it('asked for one species with --only, prints the counts and writes nothing', async () => {
      const network = fakeNetwork();
      const run = capture();
      const code = await runCli(['--only', 'beta', '--min-species', '1'], { ...run.deps, client: network, catalog: mini, now: NOW });
      expect(code).toBe(0);
      expect(run.lines.join('\n')).toMatch(/\[1\/1\] beta \(Genus beta\): iNaturalist 300 observations by 30 observers, OBIS 900 records/);
      expect(run.lines.join('\n')).toMatch(/dry run: nothing written/);
      expect(existsSync(DEFAULT_OUT.replace('.json', '.partial.json'))).toBe(false);
    });

    it('refuses a checkpoint from a different region', async () => {
      const out = join(scratch, 'region', 'out.json');
      mkdirSync(join(scratch, 'region'), { recursive: true });
      writeFileSync(partialPathFor(out), JSON.stringify({ region: 'gbr', species: {} }));
      const run = capture();
      expect(await runCli(['--out', out], { ...run.deps, client: fakeNetwork(), catalog: mini })).toBe(1);
      expect(run.warnings.join('\n')).toMatch(/different region|for gbr/);
    });

    it('writes a region file with its own default name beside the bundled one', async () => {
      const out = join(scratch, 'gbr', 'out.json');
      const run = capture();
      const code = await runCli(['--region', 'gbr', '--out', out, '--min-species', '3'], { ...run.deps, client: fakeNetwork(), catalog: mini, now: NOW });
      expect(code).toBe(0);
      expect(read(out).region).toBe('gbr');
      expect(run.lines.join('\n')).toMatch(/region gbr \(Great Barrier Reef/);
    });
  });

  it('works as a real command: npx tsx scripts/real-rarity/fetch.ts --input … --out …', () => {
    const tsx = join(REPO_ROOT, 'node_modules/.bin/tsx');
    if (!existsSync(tsx)) return;
    const out = join(scratch, 'command', 'real-rarity.json');
    const before = readFileSync(join(REPO_ROOT, 'src/data/real-rarity.json'), 'utf8');
    const output = execFileSync(tsx, ['scripts/real-rarity/fetch.ts', '--input', RAW_FIXTURE, '--out', out, '--min-species', '10'], { cwd: REPO_ROOT, encoding: 'utf8' });
    expect(output).toMatch(/Tiered: 15/);
    expect(parseRealRarityData(read(out))).not.toBeNull();
    expect(readFileSync(join(REPO_ROOT, 'src/data/real-rarity.json'), 'utf8')).toBe(before);
  }, 60_000);
});
