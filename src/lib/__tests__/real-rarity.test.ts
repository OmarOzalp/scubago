import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import bundledEncounters from '@/data/encounter-rarity.json';
import bundledJson from '@/data/real-rarity.json';
import { SPECIES } from '@/data/species';
import { CATALOG, CATALOG_BY_ID, UNLISTED_ID } from '@/lib/catalog';
import { HttpError, ParseError } from '@/lib/external-sightings/errors';
import { SYNONYMS } from '@/lib/external-sightings/synonyms';
import { encounterTiersApplied, parseEncounterData, type EncounterEntry } from '@/lib/encounter-rarity';
import {
  OBIS_LOG_CAP,
  REAL_RARITY,
  OBSERVED_NOTE_MAX,
  buildRealRarityData,
  describeRarityEvidence,
  describeWorldwideCounts,
  parseRealRarityData,
  rarityDifferences,
  rarityObservedNote,
  readRawCounts,
  realRarity,
  realRarityEntry,
  scoreSpecies,
  type RarityEntry,
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

// HAND-WRITTEN encounter entries to exercise the code. None of it is iNaturalist or OBIS data.
const encounter = (tier: Rarity, extra: Partial<EncounterEntry> = {}): EncounterEntry => ({
  share: 0.1463,
  sites: 41,
  recordedAt: 6,
  basins: ['tropical-indo-pacific'],
  tier,
  ...extra,
});
const encounterFile = (overrides: Record<string, unknown> = {}) => ({
  version: 1,
  generatedAt: '2026-10-22T00:00:00.000Z',
  species: { 'whale-shark': encounter('rare'), orca: encounter('epic') },
  unresolved: [{ id: 'sawfish', scientificName: 'Pristis pristis', reason: 'No dive site records it and none lists it as notable, so there is no way to say where its waters are.' }],
  ...overrides,
});

describe('the tiers the app applies', () => {
  it('are empty until the data has been generated, so the catalogue tiers stand', () => {
    expect(realRarity({ generatedAt: null, species: {} }).size).toBe(0);
    // Species present but never generated: still nothing.
    expect(realRarity({ generatedAt: null, species: { 'whale-shark': encounter('rare') } }).size).toBe(0);
  });

  it('come from the encounter file, never from the worldwide counts', () => {
    // The worldwide file is not even a valid encounter file, and carries no tier.
    expect(realRarity(bundledJson).size).toBe(0);
    const worldwide = parseRealRarityData(bundledJson);
    expect(worldwide && Object.values(worldwide.species).some((entry) => 'tier' in entry)).toBeFalsy();
    for (const entry of Object.values(bundledJson.species as Record<string, Record<string, unknown>>)) expect(entry).not.toHaveProperty('tier');
  });

  it('match the checked-in encounter file, which is always valid', () => {
    const parsed = parseEncounterData(bundledEncounters);
    expect(parsed).not.toBeNull();
    const applied = parsed !== null && encounterTiersApplied(parsed);
    expect(realRarity().size).toBe(applied && parsed ? Object.keys(parsed.species).length : 0);
    expect(REAL_RARITY.size).toBe(realRarity().size);
    // Whatever it holds, it holds only catalogue animals, and the catalogue shows exactly these tiers.
    const ids = new Set(SPECIES.map((s) => s.id));
    for (const [id, tier] of REAL_RARITY) {
      expect(ids.has(id)).toBe(true);
      expect(CATALOG_BY_ID.get(id)?.rarity).toBe(tier);
    }
    for (const species of CATALOG) if (!REAL_RARITY.has(species.id)) expect(species.rarity).toBe(SPECIES.find((s) => s.id === species.id)?.rarity);
  });

  it('map each species to its tier', () => {
    const tiers = realRarity(encounterFile());
    expect(tiers.get('whale-shark')).toBe('rare');
    expect(tiers.get('orca')).toBe('epic');
    expect(tiers.has('sawfish')).toBe(false); // listed as unresolved: no data is absent, not common
    expect(tiers.size).toBe(2);
  });

  it('stay empty while the tiers are switched off, so the app keeps the catalogue tiers', () => {
    const off = encounterFile({ applied: false, notApplied: 'The sanity check failed.' });
    expect(parseEncounterData(off)).not.toBeNull();
    expect(realRarity(off).size).toBe(0);
    expect(realRarityEntry('whale-shark', off)).toBeUndefined();
    expect(realRarity(encounterFile({ applied: true })).size).toBe(2);
  });

  it('never include the unlisted id', () => {
    expect(realRarity(encounterFile({ species: { [UNLISTED_ID]: encounter('legendary'), orca: encounter('epic') } })).has(UNLISTED_ID)).toBe(false);
  });

  it('turn corrupt input into an empty map without throwing', () => {
    // (Nothing at all, `undefined`, is not corrupt input: it asks for the bundled file.)
    const throwing = {};
    Object.defineProperty(throwing, 'species', { get() { throw new Error('boom'); }, enumerable: true });
    const corrupt: unknown[] = [
      null,
      42,
      'text',
      [],
      {},
      { generatedAt: null },
      { species: {} },
      { generatedAt: 'not a date', species: {} },
      { generatedAt: 12345, species: {} },
      encounterFile({ species: [] }),
      encounterFile({ species: { orca: encounter('mythic' as Rarity) } }),
      encounterFile({ species: { orca: encounter('epic', { share: Number.NaN }) } }),
      encounterFile({ species: { orca: encounter('epic', { share: 1.5 }) } }),
      encounterFile({ species: { orca: encounter('epic', { share: -0.1 }) } }),
      encounterFile({ species: { orca: encounter('epic', { sites: 0 }) } }),
      encounterFile({ species: { orca: encounter('epic', { recordedAt: 42, sites: 41 }) } }),
      encounterFile({ species: { orca: encounter('epic', { recordedAt: 1.5 }) } }),
      encounterFile({ species: { orca: encounter('epic', { basins: [] }) } }),
      encounterFile({ species: { orca: encounter('epic', { basins: ['atlantis' as never] }) } }),
      encounterFile({ species: { orca: encounter('epic', { basins: ['tropical-indo-pacific', 'tropical-indo-pacific'] }) } }),
      encounterFile({ species: { orca: null, 'whale-shark': encounter('rare') } }),
      encounterFile({ version: 2 }),
      encounterFile({ applied: 'yes' }),
      encounterFile({ sources: [] }),
      encounterFile({ unresolved: {} }),
      encounterFile({ unresolved: [{ id: 'sawfish' }] }),
      throwing,
    ];
    for (const input of corrupt) {
      expect(() => realRarity(input)).not.toThrow();
      expect(realRarity(input).size).toBe(0);
      expect(parseEncounterData(input)).toBeNull();
    }
  });

  it('are accepted whole or not at all: one bad species rejects the file', () => {
    expect(realRarity(encounterFile({ species: { orca: encounter('epic'), 'whale-shark': { share: 0.5, tier: 'nope' } } })).size).toBe(0);
  });

  it('feed effectiveRarity: the real tier where there is one, the catalogue tier otherwise', () => {
    const tiers = realRarity(encounterFile());
    expect(effectiveRarity({ id: 'whale-shark', rarity: 'legendary' }, tiers)).toBe('rare');
    expect(effectiveRarity({ id: 'dugong', rarity: 'legendary' }, tiers)).toBe('legendary');
    expect(effectiveRarity({ id: 'dugong', rarity: 'legendary' }, realRarity({ generatedAt: null, species: {} }))).toBe('legendary');
  });
});

describe('the worldwide counts file', () => {
  const sample = (extra: Partial<RealRarityData['species'][string]> = {}) => ({
    inaturalist: { observations: 10, observers: 4, taxonId: 7 },
    obis: { records: 20 },
    score: 1.5,
    ...extra,
  });
  const file = (overrides: Record<string, unknown> = {}) => ({
    version: 1,
    generatedAt: '2026-10-22T00:00:00.000Z',
    region: null,
    species: { 'whale-shark': sample(), orca: sample() },
    unresolved: [{ id: 'sawfish', scientificName: 'Pristis pristis', reason: 'No iNaturalist taxon matched its name.' }],
    ...overrides,
  });

  it('is valid as checked in, and its counts set no tier', () => {
    const parsed = parseRealRarityData(bundledJson);
    expect(parsed).not.toBeNull();
    const ids = new Set(SPECIES.map((s) => s.id));
    for (const id of Object.keys(parsed?.species ?? {})) expect(ids.has(id)).toBe(true);
  });

  it('accepts the empty shape, the full shape and a region file', () => {
    expect(parseRealRarityData({ generatedAt: null, species: {} })).not.toBeNull();
    expect(parseRealRarityData(file())).not.toBeNull();
    expect(parseRealRarityData(file({ region: 'gbr' }))?.region).toBe('gbr');
  });

  it('drops a tier that an earlier version of the script wrote', () => {
    const parsed = parseRealRarityData(file({ species: { orca: sample({ tier: 'common' } as never) } }));
    expect(parsed?.species.orca).toEqual(sample());
    expect(parsed?.species.orca).not.toHaveProperty('tier');
  });

  it('rejects damage whole: a bad score, bad counts, an unknown region', () => {
    const corrupt: unknown[] = [
      file({ species: { orca: sample({ score: Number.NaN }) } }),
      file({ species: { orca: sample({ score: -1 }) } }),
      file({ species: { orca: sample({ inaturalist: { observations: -4 } }) } }),
      file({ species: { orca: sample({ inaturalist: { observations: 1.5 } }) } }),
      file({ species: { orca: sample({ obis: { records: '7' as unknown as number } }) } }),
      file({ species: { orca: sample({ inaturalist: { observations: 3, taxonId: 0 } }) } }),
      file({ species: { orca: null, 'whale-shark': sample() } }),
      file({ region: 'atlantis' }),
      file({ version: 2 }),
      file({ sources: [] }),
      file({ unresolved: {} }),
      file({ unresolved: [{ id: 'sawfish' }] }),
      { generatedAt: 'not a date', species: {} },
    ];
    for (const input of corrupt) expect(parseRealRarityData(input)).toBeNull();
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

  it('keeps or lists every catalogue species, never both and never neither, and sets no tier', () => {
    const reasons = new Map([['sp22', 'No active iNaturalist species matched Genus species22.']]);
    const data = buildRealRarityData({ catalog, counts, reasons, generatedAt: '2026-10-22T00:00:00.000Z' });
    const tiered = Object.keys(data.species);
    const listed = (data.unresolved ?? []).map((u) => u.id);
    expect(tiered).toHaveLength(22);
    for (const entry of Object.values(data.species)) {
      expect(entry).not.toHaveProperty('tier');
      expect(entry.score).toBeGreaterThan(0);
    }
    expect([...tiered, ...listed].sort()).toEqual(catalog.map((s) => s.id).sort());
    expect(data.unresolved?.find((u) => u.id === 'sp22')?.reason).toBe(reasons.get('sp22'));
    expect(data.unresolved?.find((u) => u.id === 'sp23')?.reason).toMatch(/Nothing was fetched/);
    expect(parseRealRarityData(JSON.parse(JSON.stringify(data)))).not.toBeNull();
    expect(data.sources).toBeDefined();
    expect(JSON.stringify(data.sources)).toMatch(/iNaturalist/);
    expect(JSON.stringify(data.sources)).toMatch(/OBIS/);
  });

  it('lists a species with zero records everywhere instead of keeping it', () => {
    const withZero = new Map(counts).set('sp0', { inaturalist: inat(0, 0), obis: { records: 0 } });
    const data = buildRealRarityData({ catalog, counts: withZero, generatedAt: '2026-10-22T00:00:00.000Z' });
    expect(data.species.sp0).toBeUndefined();
    expect(data.unresolved?.find((u) => u.id === 'sp0')?.reason).toMatch(/No research-grade/);
  });

  it('says in a region that a species with no record there has no counts', () => {
    const data = buildRealRarityData({ catalog, counts: new Map(counts).set('sp1', { inaturalist: inat(0, 0), obis: { records: 0 } }), generatedAt: '2026-10-22T00:00:00.000Z', region: 'gbr' });
    expect(data.region).toBe('gbr');
    expect(data.unresolved?.find((u) => u.id === 'sp1')?.reason).toMatch(/this region \(gbr\)/);
  });

  it('reads its own output back as raw counts, ignoring the score', () => {
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
    expect(parseArgs(['--region', 'gbr', '--only', 'orca, dugong']).only).toEqual(['orca', 'dugong']);
    expect(() => parseArgs(['--region', 'atlantic'])).toThrow(/--region must be one of/);
    expect(() => parseArgs(['--out'])).toThrow(/needs a value/);
    expect(() => parseArgs(['--min-species', '5'])).toThrow(/Unknown option/); // worldwide counts set no tier, so there is no band to fill
    expect(() => parseArgs(['--input', 'x.json', '--only', 'orca'])).toThrow(/cannot be used with --input/);
    expect(() => parseArgs(['--bogus'])).toThrow(/Unknown option/);
    expect(partialPathFor('/a/real-rarity.json')).toBe('/a/real-rarity.partial.json');
    expect(DEFAULT_OUT).toMatch(/src\/data\/real-rarity\.json$/);
  });

  it('recomputes the scores offline from a hand-written raw file, into a scratch file', async () => {
    const before = readFileSync(join(REPO_ROOT, 'src/data/real-rarity.json'), 'utf8');
    const out = join(scratch, 'offline', 'real-rarity.json');
    const { lines, warnings, deps } = capture();
    const code = await runCli(['--input', RAW_FIXTURE, '--out', out], { ...deps, now: NOW });
    expect(code).toBe(0);
    expect(readFileSync(join(REPO_ROOT, 'src/data/real-rarity.json'), 'utf8')).toBe(before); // never the real file

    const data = read(out);
    expect(parseRealRarityData(data)).not.toBeNull();
    expect(data.generatedAt).toBe('2026-10-22T12:00:00.000Z');
    expect(data.input).toBe('raw-sample.json');
    expect(Object.keys(data.species)).toHaveLength(15);
    expect(data.species['great-barracuda'].score).toBeGreaterThan(data.species.sawfish.score);
    for (const entry of Object.values(data.species)) expect(entry).not.toHaveProperty('tier');
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
    expect(lines.join('\n')).toMatch(/With counts: 15/);
    expect(lines.join('\n')).toMatch(/No tier is set/);
    expect(realRarity(data).size).toBe(0); // not an encounter file: worldwide counts set no tier
  });

  it('gives the same scores when its own output is fed back in', async () => {
    const first = join(scratch, 'again', 'first.json');
    const second = join(scratch, 'again', 'second.json');
    await runCli(['--input', RAW_FIXTURE, '--out', first], { ...capture().deps, now: NOW });
    await runCli(['--input', first, '--out', second], { ...capture().deps, now: NOW });
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
    expect(await runCli(['--input', RAW_FIXTURE, '--out', dry, '--dry-run'], capture().deps)).toBe(0);
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
      const args = ['--out', out];

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
      // Counts as the stand-ins gave them, and scores that rank them, with no tier.
      expect(data.species.alpha.inaturalist).toEqual({ observations: 5000, observers: 500, taxonId: 11 });
      expect(data.species.alpha.obis).toEqual({ records: 15000 });
      const scores = Object.fromEntries(Object.entries(data.species).map(([id, e]) => [id, e.score]));
      expect(scores.alpha).toBeGreaterThan(scores.beta);
      expect(scores.beta).toBeGreaterThan(scores.gamma);
      expect(scores.gamma).toBeGreaterThan(scores.delta);
      expect(JSON.stringify(data)).not.toMatch(/"tier"/);
      expect(data.unresolved).toEqual([]);
    });

    it('with --allow-incomplete writes what it has and lists the failed species', async () => {
      const out = join(scratch, 'incomplete', 'out.json');
      const broken = fakeNetwork((url) => (url.includes('/occurrence') && url.includes('Genus%20delta') ? (() => { throw new HttpError(500); })() : undefined));
      const code = await runCli(['--out', out, '--allow-incomplete'], { ...capture().deps, client: broken, catalog: mini, now: NOW });
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
      const code = await runCli(['--only', 'beta'], { ...run.deps, client: network, catalog: mini, now: NOW });
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
      const code = await runCli(['--region', 'gbr', '--out', out], { ...run.deps, client: fakeNetwork(), catalog: mini, now: NOW });
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
    const output = execFileSync(tsx, ['scripts/real-rarity/fetch.ts', '--input', RAW_FIXTURE, '--out', out], { cwd: REPO_ROOT, encoding: 'utf8' });
    expect(output).toMatch(/With counts: 15/);
    expect(parseRealRarityData(read(out))).not.toBeNull();
    expect(readFileSync(join(REPO_ROOT, 'src/data/real-rarity.json'), 'utf8')).toBe(before);
  }, 60_000);
});

// ── What the species page says about where a tier comes from ─────────────────

// HAND-WRITTEN entries to exercise the wording. These counts are not iNaturalist or OBIS data.
describe('the evidence behind one species’ tier', () => {
  const INDO = 'tropical-indo-pacific' as const;
  const CARIBBEAN = 'tropical-west-atlantic' as const;
  const PACIFIC = 'tropical-east-pacific' as const;
  const entry = (tier: Rarity, recordedAt: number, sites: number, basins: EncounterEntry['basins'] = [INDO], worldwide?: SpeciesCounts): RarityEntry => ({
    share: recordedAt / sites,
    sites,
    recordedAt,
    basins,
    tier,
    ...(worldwide && { worldwide }),
  });
  const rare = entry('rare', 6, 41);

  describe('describeRarityEvidence', () => {
    it('names the tier, how many dive sites record it and the basin', () => {
      expect(describeRarityEvidence(rare)).toBe('Rare: recorded near 6 of 41 Indo-Pacific dive sites');
      expect(describeRarityEvidence(entry('common', 30, 48))).toBe('Common: recorded near 30 of 48 Indo-Pacific dive sites');
      expect(describeRarityEvidence(entry('uncommon', 7, 11, [CARIBBEAN]))).toBe('Uncommon: recorded near 7 of 11 Caribbean dive sites');
      expect(describeRarityEvidence(entry('epic', 2, 6, [PACIFIC]))).toBe('Epic: recorded near 2 of 6 Eastern Pacific dive sites');
    });

    it('names two basins', () => {
      expect(describeRarityEvidence(entry('rare', 11, 53, [INDO, CARIBBEAN]))).toBe('Rare: recorded near 11 of 53 Indo-Pacific and Caribbean dive sites');
    });

    it('says "in its waters" and names three or more basins in brackets', () => {
      expect(describeRarityEvidence(entry('rare', 14, 67, [INDO, CARIBBEAN, PACIFIC]))).toBe(
        'Rare: recorded near 14 of 67 dive sites in its waters (Indo-Pacific, Caribbean, Eastern Pacific)',
      );
    });

    it('uses thousands separators and says plainly when it is recorded at none', () => {
      expect(describeRarityEvidence(entry('common', 1_234, 2_345))).toBe('Common: recorded near 1,234 of 2,345 Indo-Pacific dive sites');
      expect(describeRarityEvidence(entry('legendary', 0, 6, [PACIFIC]))).toBe('Legendary: not recorded near any of the 6 Eastern Pacific dive sites');
      expect(describeRarityEvidence(entry('legendary', 1, 42))).toBe('Legendary: recorded near 1 of 42 Indo-Pacific dive sites');
    });
  });

  describe('describeWorldwideCounts', () => {
    it('gives the worldwide counts as a second line, with thousands separators', () => {
      expect(describeWorldwideCounts(entry('rare', 6, 41, [INDO], { inaturalist: { observations: 2654, observers: 1668 } }))).toBe('2,654 iNaturalist observations worldwide');
      expect(describeWorldwideCounts(entry('rare', 6, 41, [INDO], { inaturalist: { observations: 2654 }, obis: { records: 17_225 } }))).toBe(
        '2,654 iNaturalist observations and 17,225 OBIS records worldwide',
      );
    });

    it('uses the singular for one, and leaves out a source that held nothing', () => {
      expect(describeWorldwideCounts(entry('rare', 6, 41, [INDO], { inaturalist: { observations: 1 }, obis: { records: 0 } }))).toBe('1 iNaturalist observation worldwide');
      expect(describeWorldwideCounts(entry('rare', 6, 41, [INDO], { obis: { records: 1 } }))).toBe('1 OBIS record worldwide');
    });

    it('is undefined when there are no worldwide counts to show, never a zero', () => {
      expect(describeWorldwideCounts(rare)).toBeUndefined();
      expect(describeWorldwideCounts(entry('rare', 6, 41, [INDO], {}))).toBeUndefined();
      expect(describeWorldwideCounts(entry('rare', 6, 41, [INDO], { inaturalist: { observations: 0 }, obis: { records: 0 } }))).toBeUndefined();
    });
  });

  describe('realRarityEntry', () => {
    const worldwide = (overrides: Record<string, unknown> = {}) => ({
      version: 1,
      generatedAt: '2026-10-22T00:00:00.000Z',
      region: null,
      species: { 'whale-shark': { inaturalist: { observations: 2654, observers: 1668, taxonId: 52188 }, obis: { records: 845 }, score: 3.6 } },
      ...overrides,
    });
    const encounters = (overrides: Record<string, unknown> = {}) => encounterFile({ species: { 'whale-shark': encounter('rare'), orca: encounter('epic') }, ...overrides });

    it('is undefined for every species while the checked-in encounter file is not applied, so the page claims no data', () => {
      const applied = (() => {
        const parsed = parseEncounterData(bundledEncounters);
        return parsed !== null && encounterTiersApplied(parsed);
      })();
      for (const species of SPECIES) expect(realRarityEntry(species.id) !== undefined).toBe(applied && REAL_RARITY.has(species.id));
      // Not-generated data with species in it is still not data.
      expect(realRarityEntry('whale-shark', { generatedAt: null, species: { 'whale-shark': encounter('rare') } })).toBeUndefined();
    });

    it('gives the encounter tier with the worldwide counts beside it', () => {
      const found = realRarityEntry('whale-shark', encounters(), worldwide());
      expect(found?.tier).toBe('rare');
      expect(found).toMatchObject({ share: 0.1463, sites: 41, recordedAt: 6, basins: [INDO] });
      expect(found?.worldwide?.inaturalist).toEqual({ observations: 2654, observers: 1668, taxonId: 52188 });
      expect(found?.worldwide?.obis).toEqual({ records: 845 });
      expect(describeRarityEvidence(found as RarityEntry)).toBe('Rare: recorded near 6 of 41 Indo-Pacific dive sites');
      expect(describeWorldwideCounts(found as RarityEntry)).toBe('2,654 iNaturalist observations and 845 OBIS records worldwide');
    });

    it('works without worldwide counts: the tier and its evidence stand on their own', () => {
      for (const missing of [{ generatedAt: null, species: {} }, worldwide({ region: 'gbr' }), 'nonsense', null, worldwide({ species: {} })]) {
        const found = realRarityEntry('whale-shark', encounters(), missing);
        expect(found?.tier).toBe('rare');
        expect(found?.worldwide).toBeUndefined();
      }
      expect(realRarityEntry('orca', encounters(), worldwide())?.worldwide).toBeUndefined(); // no counts for it
    });

    it('is undefined for a species the file has no entry for, which keeps its hand-assigned tier', () => {
      const data = encounters();
      expect(realRarityEntry('sawfish', data)).toBeUndefined();
      expect(realRarityEntry('not-a-species', data)).toBeUndefined();
      // Inherited object keys are not species.
      expect(realRarityEntry('constructor', data)).toBeUndefined();
      expect(realRarityEntry('__proto__', data)).toBeUndefined();
    });

    it('is undefined for the unlisted id, for damaged data and for the worldwide file', () => {
      expect(realRarityEntry(UNLISTED_ID, encounters({ species: { [UNLISTED_ID]: encounter('legendary') } }))).toBeUndefined();
      expect(realRarityEntry('whale-shark', encounters({ species: { 'whale-shark': { ...encounter('rare'), tier: 'mythic' } } }))).toBeUndefined();
      expect(realRarityEntry('whale-shark', 'nonsense')).toBeUndefined();
      expect(realRarityEntry('whale-shark', null)).toBeUndefined();
      expect(realRarityEntry('whale-shark', worldwide())).toBeUndefined(); // worldwide counts are not a tier
    });

    it('agrees with realRarity about which species have a tier', () => {
      const data = encounters();
      for (const id of ['whale-shark', 'orca', 'sawfish']) expect(realRarityEntry(id, data)?.tier).toBe(realRarity(data).get(id));
    });
  });

  describe('rarityObservedNote (the line on the share card)', () => {
    it('is short and says how many dive sites record it', () => {
      expect(rarityObservedNote(rare)).toBe('Recorded near 6 of 41 Indo-Pacific dive sites');
      expect(rarityObservedNote(entry('legendary', 0, 6, [PACIFIC]))).toBe('Not recorded near any of the 6 Eastern Pacific dive sites');
    });

    it('never runs past the card’s slot, whatever the numbers and basins, and never invents a number', () => {
      const basinSets: EncounterEntry['basins'][] = [
        [INDO],
        [CARIBBEAN],
        ['temperate-southern'],
        ['temperate-north-atlantic'],
        [INDO, CARIBBEAN],
        [INDO, 'temperate-north-pacific'],
        [INDO, 'temperate-southern'],
        [INDO, CARIBBEAN, PACIFIC],
        ['tropical-indo-pacific', 'tropical-west-atlantic', 'tropical-east-pacific', 'tropical-east-atlantic', 'temperate-north-pacific', 'temperate-north-atlantic', 'temperate-southern'],
      ];
      for (const basins of basinSets) {
        for (const [recordedAt, sites] of [[0, 5], [1, 5], [6, 41], [99, 100], [1_234, 2_345], [123_456, 234_567], [9_999_999, 99_999_999]] as const) {
          const note = rarityObservedNote(entry('rare', recordedAt, sites, basins));
          expect(note.length).toBeLessThanOrEqual(OBSERVED_NOTE_MAX);
          // Every number in it is one of the two counts themselves.
          const numbers = note.replace(/,/g, '').match(/\d+/g) ?? [];
          for (const n of numbers) expect([String(recordedAt), String(sites)]).toContain(n);
        }
      }
    });

    it('drops the basin name, then the waters, before it would overrun', () => {
      const long = entry('rare', 1_234, 2_345, [INDO, 'temperate-southern']);
      expect(describeRarityEvidence(long)).toBe('Rare: recorded near 1,234 of 2,345 Indo-Pacific and Southern temperate dive sites');
      expect(rarityObservedNote(long)).toBe('Recorded near 1,234 of 2,345 dive sites in its waters');
      expect(rarityObservedNote(entry('rare', 123_456_789, 234_567_890, [INDO, 'temperate-southern']))).toBe('Recorded near 123,456,789 of 234,567,890 dive sites');
    });

    it('says what is true for three basins', () => {
      expect(rarityObservedNote(entry('rare', 14, 67, [INDO, CARIBBEAN, PACIFIC]))).toBe('Recorded near 14 of 67 dive sites in its waters');
    });
  });
});
