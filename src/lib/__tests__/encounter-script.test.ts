import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import bundledEncounters from '@/data/encounter-rarity.json';
import { SITES } from '@/data/sites';
import { SPECIES } from '@/data/species';
import { BASIN_IDS, parseEncounterData, type EncounterData, type SiteEncounters } from '@/lib/encounter-rarity';
import { HttpError } from '@/lib/external-sightings/errors';
import { createNameMatcher } from '@/lib/external-sightings/names';
import { SYNONYMS } from '@/lib/external-sightings/synonyms';
import type { DiveSite, Species } from '@/lib/types';
import type { PoliteClient } from '../../../scripts/real-rarity/client';
import {
  CURRENT_INATURALIST_NAMES,
  DEFAULT_MAX_PAGES,
  DEFAULT_RADIUS_KM,
  collectSite,
  encounterMatcher,
  parseSitesFile,
  sitesToJson,
  type SitesFile,
} from '../../../scripts/real-rarity/encounter-sites';
import { DEFAULT_OUT, HELP, parseArgs, partialPathFor, runEncountersCli, sitesPathFor, toJson } from '../../../scripts/real-rarity/encounters-cli';
import { ICONIC_SPECIES, STAPLE_SPECIES, sanityLines, sanityReport } from '../../../scripts/real-rarity/sanity';

// Every site, count and animal in this file is HAND-WRITTEN to exercise the script offline, against
// a stand-in for the network and files in a scratch folder. None of it is iNaturalist or OBIS data,
// and nothing here writes to src/data.

const REPO_ROOT = resolve(__dirname, '../../..');
const NOW = () => new Date('2026-10-22T12:00:00.000Z');

// Twelve hand-written dive sites in the Indo-Pacific (lat 9.00 to 9.11) and 24 hand-written animals.
// Animal i (0 to 21) is recorded at the first (i mod 12) + 1 sites; sp22 is recorded nowhere and
// listed as notable at the first site; sp23 is recorded nowhere and listed nowhere.
const letter = (i: number) => String.fromCharCode(97 + i); // scientific names have no digits
const mini: Species[] = Array.from({ length: 24 }, (_, i) => ({ id: `sp${i}`, commonName: `Animal ${i}`, scientificName: `Genus species${letter(i)}`, category: 'fish', rarity: 'common', blurb: '' }));
const diveSites: DiveSite[] = Array.from({ length: 12 }, (_, k) => ({
  id: `site${k}`,
  name: `Site ${k}`,
  lat: 9 + k / 100,
  lng: 98,
  region: 'Hand-written',
  country: 'Nowhere',
  blurb: '',
  notableSpecies: k === 0 ? ['sp22'] : [],
  source: 'seed',
}));

const siteIndex = (lat: number) => Math.round((lat - 9) * 100);

/** The latitude a request asks about: iNaturalist's `lat`, or the middle of OBIS's WKT box. */
function latOf(url: string): number {
  const parameters = new URL(url).searchParams;
  const lat = parameters.get('lat');
  if (lat !== null) return Number(lat);
  const lats = [...(parameters.get('geometry') ?? '').matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map((m) => Number(m[2]));
  return (Math.min(...lats) + Math.max(...lats)) / 2;
}

/** What the stand-in iNaturalist says for a site: its recorded animals, 25 others, and (optionally) a subspecies row. */
function inatResponse(k: number) {
  const rows: unknown[] = [];
  for (let i = 0; i < 22; i++) if (k <= i % 12) rows.push({ count: 4, taxon: { id: 100 + i, name: `Genus species${letter(i)}`, rank: 'species' } });
  for (let n = 0; n < 25; n++) rows.push({ count: 2, taxon: { id: 900 + n, name: `Filler taxon${letter(n)}`, rank: 'species' } });
  if (k === 0) rows.push({ count: 1, taxon: { id: 500, name: 'Genus speciesa var', rank: 'subspecies' } }); // repeats sp0, recorded here
  return { total_results: rows.length, results: rows };
}

function obisResponse(k: number) {
  const results: unknown[] = [];
  for (let i = 0; i < 22; i++) if (k <= i % 12) results.push({ scientificName: `Genus species${letter(i)}`, taxonRank: 'Species', records: 7 });
  for (let n = 0; n < 25; n++) results.push({ scientificName: `Filler taxon${letter(n)}`, taxonRank: 'Species', records: 3 });
  return { total: results.length, results };
}

interface FakeNetwork extends PoliteClient {
  urls: string[];
}

function fakeNetwork(onRequest?: (url: string) => void): FakeNetwork {
  const urls: string[] = [];
  return {
    urls,
    requests: () => urls.length,
    async getJson(url) {
      urls.push(url);
      onRequest?.(url);
      if (url.includes('/observations/species_counts')) return inatResponse(siteIndex(latOf(url)));
      if (url.includes('/checklist')) return obisResponse(siteIndex(latOf(url)));
      throw new Error(`unexpected request ${url}`);
    },
  };
}

describe('the options', () => {
  it('has defaults that match the documented method', () => {
    const options = parseArgs([]);
    expect(options).toMatchObject({ input: null, out: null, dryRun: false, fresh: false, radiusKm: null, obis: null, presence: null, only: null, allowIncomplete: false, help: false });
    expect(DEFAULT_RADIUS_KM).toBe(5);
    expect(DEFAULT_MAX_PAGES).toBeGreaterThanOrEqual(10);
    expect(DEFAULT_OUT).toMatch(/src\/data\/encounter-rarity\.json$/);
  });

  it('reads every option', () => {
    const options = parseArgs(['--out', 'x.json', '--radius', '3', '--no-obis', '--presence', 'inaturalist', '--min-site-taxa', '10', '--min-sites', '6', '--max-pages', '4', '--only', 'a, b', '--dry-run', '--fresh', '--allow-incomplete', '--contact', 'me@example.org']);
    expect(options).toMatchObject({ radiusKm: 3, obis: false, presence: 'inaturalist', minSiteTaxa: 10, minSites: 6, maxPages: 4, only: ['a', 'b'], dryRun: true, fresh: true, allowIncomplete: true, contact: 'me@example.org' });
    expect(options.out).toMatch(/x\.json$/);
    expect(parseArgs(['--input', 'saved.sites.json']).input).toMatch(/saved\.sites\.json$/);
  });

  it('refuses what makes no sense', () => {
    expect(() => parseArgs(['--bogus'])).toThrow(/Unknown option/);
    expect(() => parseArgs(['--out'])).toThrow(/needs a value/);
    expect(() => parseArgs(['--radius', '0'])).toThrow(/between 0.5 and 50/);
    expect(() => parseArgs(['--radius', '500'])).toThrow(/between 0.5 and 50/);
    expect(() => parseArgs(['--presence', 'both'])).toThrow(/--presence must be one of/);
    expect(() => parseArgs(['--min-sites', '0'])).toThrow(/whole number of 1 or more/);
    expect(() => parseArgs(['--max-pages', '2.5'])).toThrow(/whole number/);
    expect(() => parseArgs(['--input', 'x.json', '--only', 'a'])).toThrow(/cannot be used with --input/);
    expect(() => parseArgs(['--input', 'x.json', '--radius', '3'])).toThrow(/cannot be used with --input/);
    expect(() => parseArgs(['--input', 'x.json', '--no-obis'])).toThrow(/cannot be used with --input/);
  });

  it('puts the per-site file and the checkpoint beside the tiers file', () => {
    expect(partialPathFor('/a/encounter-rarity.json')).toBe('/a/encounter-rarity.partial.json');
    expect(sitesPathFor('/a/encounter-rarity.json')).toBe('/a/encounter-rarity.sites.json');
    expect(sitesPathFor('/a/odd-name')).toBe('/a/odd-name.sites.json');
  });

  it('documents the proxy variable and every option in --help', () => {
    for (const word of ['NODE_USE_ENV_PROXY=1', '--input', '--out', '--dry-run', '--radius', '--no-obis', '--presence', '--min-site-taxa', '--min-sites', '--only', '--allow-incomplete']) expect(HELP).toContain(word);
  });
});

describe('asking about one site', () => {
  const at = (id: string, lat: number, lng = 98) => ({ id, lat, lng });
  const matcher = createNameMatcher(mini, {});

  it('asks iNaturalist species_counts and the OBIS checklist, one request each when the lists fit', async () => {
    const network = fakeNetwork();
    const { record } = await collectSite(network, at('site3', 9.03), { radiusKm: 5, obis: true, maxPages: 20, matcher });
    expect(network.urls).toHaveLength(2);
    const [inatUrl, obisUrl] = network.urls;
    expect(inatUrl).toContain('/observations/species_counts?lat=9.03&lng=98&radius=5&quality_grade=research&verifiable=true&iconic_taxa=Actinopterygii,Animalia,Mammalia,Mollusca,Reptilia&per_page=200');
    expect(obisUrl).toContain('api.obis.org/v3/checklist?geometry=');
    expect(obisUrl).toContain('&size=1000');
    // Animal i is recorded here when 3 <= i mod 12.
    expect(Object.keys(record.species).sort()).toEqual(
      Array.from({ length: 22 }, (_, i) => i).filter((i) => 3 <= i % 12).map((i) => `sp${i}`).sort(),
    );
    expect(record.species.sp5).toEqual({ inaturalist: 4, obis: 7 });
  });

  it('keeps only the counts, the effort and the place: no observation, name or coordinate beyond the site’s', async () => {
    const { record } = await collectSite(fakeNetwork(), at('site0', 9), { radiusKm: 5, obis: true, maxPages: 20, matcher });
    expect(record.lat).toBe(9);
    expect(record.lng).toBe(98);
    // Species-level taxa the sources listed: 22 animals and 25 others (the subspecies row is not counted twice).
    expect(record.inaturalist).toEqual({ taxa: 47, truncated: false });
    expect(record.obis).toEqual({ taxa: 47, truncated: false });
    expect(JSON.stringify(record)).not.toMatch(/Filler|Genus/);
    // The subspecies row repeats its species: sp0 is 4 observations, not 5.
    expect(record.species.sp0.inaturalist).toBe(4);
  });

  it('can leave OBIS out, and then says nothing about it', async () => {
    const network = fakeNetwork();
    const { record } = await collectSite(network, at('site0', 9), { radiusKm: 3, obis: false, maxPages: 20, matcher });
    expect(network.urls).toHaveLength(1);
    expect(network.urls[0]).toContain('radius=3');
    expect(record.obis).toBeUndefined();
    expect(record.species.sp5).toEqual({ inaturalist: 4 });
  });

  it('reads more pages when a busy coast lists more than 200 taxa, and says when it had to stop', async () => {
    const page = (n: number, rows = 200) => ({ total_results: 450, results: Array.from({ length: rows }, (_, i) => ({ count: 1, taxon: { id: n * 1000 + i, name: `Busy taxon${n}-${i}`, rank: 'species' } })) });
    const served: string[] = [];
    const busy: PoliteClient = {
      requests: () => served.length,
      async getJson(url) {
        served.push(url);
        const pageNumber = Number(new URL(url).searchParams.get('page') ?? 1);
        return page(pageNumber, pageNumber === 3 ? 50 : 200);
      },
    };
    const whole = await collectSite(busy, at('busy', 9), { radiusKm: 5, obis: false, maxPages: 20, matcher });
    expect(served).toHaveLength(3);
    expect(whole.record.inaturalist).toEqual({ taxa: 450, truncated: false });

    served.length = 0;
    const cut = await collectSite(busy, at('busy', 9), { radiusKm: 5, obis: false, maxPages: 2, matcher });
    expect(served).toHaveLength(2);
    expect(cut.record.inaturalist).toEqual({ taxa: 400, truncated: true });
  });

  it('flags an OBIS checklist cut at 1000 taxa', async () => {
    const full: PoliteClient = {
      requests: () => 0,
      async getJson(url) {
        if (url.includes('/checklist')) return { total: 2249, results: Array.from({ length: 1000 }, (_, i) => ({ scientificName: `Obis taxon${i}`, taxonRank: 'Species', records: 5 })) };
        return { total_results: 0, results: [] };
      },
    };
    const { record } = await collectSite(full, at('hot', 9), { radiusKm: 5, obis: true, maxPages: 20, matcher });
    expect(record.obis).toEqual({ taxa: 1000, truncated: true });
  });

  it('lets a failure through, so the site is asked again on the next run', async () => {
    const down = fakeNetwork(() => {
      throw new HttpError(503);
    });
    await expect(collectSite(down, at('site0', 9), { radiusKm: 5, obis: true, maxPages: 20, matcher })).rejects.toBeInstanceOf(HttpError);
  });

  describe('the names', () => {
    it('knows the three cuttlefish iNaturalist has renamed, as the app’s synonym table now does too', () => {
      const appMatcher = createNameMatcher(SPECIES, SYNONYMS);
      const scriptMatcher = encounterMatcher();
      for (const [name, id] of Object.entries(CURRENT_INATURALIST_NAMES)) {
        expect(SPECIES.some((s) => s.id === id)).toBe(true);
        expect(scriptMatcher.match(name)).toBe(id);
        expect(appMatcher.match(name)).toBe(id);
      }
      // Everything else is the app’s matching, unchanged.
      expect(scriptMatcher.match('Rhincodon typus')).toBe('whale-shark');
      expect(scriptMatcher.match('Metasepia pfefferi')).toBe(appMatcher.match('Metasepia pfefferi'));
    });

    it('only adds names for animals in the catalogue it is given', () => {
      expect(encounterMatcher(mini).match('Ascarosepion pfefferi')).toBeUndefined();
    });
  });
});

describe('the per-site file', () => {
  const file: SitesFile = {
    version: 1,
    generatedAt: '2026-10-22T12:00:00.000Z',
    radiusKm: 5,
    obis: true,
    maxPages: 20,
    sites: {
      a: { lat: 9.36, lng: 98.02, inaturalist: { taxa: 187, truncated: false }, obis: { taxa: 196, truncated: true }, species: { 'whale-shark': { obis: 13 }, 'giant-moray': { inaturalist: 11, obis: 7 } } },
      b: { lat: -0.3, lng: 73.43, inaturalist: { taxa: 5, truncated: false }, species: {} },
    },
  };

  it('writes one site per line and reads back what it wrote', () => {
    const text = sitesToJson(file);
    expect(text.split('\n').filter((line) => line.startsWith('    "')).length).toBe(2);
    const parsed = parseSitesFile(JSON.parse(text));
    expect(parsed?.file).toEqual(file);
    expect(parsed?.ignored).toEqual([]);
    expect(sitesToJson({ ...file, sites: {} })).toContain('"sites": {}');
  });

  it('skips an entry that is malformed, and names it', () => {
    const json = JSON.parse(sitesToJson(file));
    json.sites.broken = { lat: 'north', lng: 1, species: {} };
    json.sites.badcount = { lat: 1, lng: 1, species: { x: { inaturalist: -2 } } };
    json.sites.offearth = { lat: 100, lng: 1, species: {} };
    json.sites.badtally = { lat: 1, lng: 1, inaturalist: { taxa: 'many', truncated: false }, species: {} };
    const parsed = parseSitesFile(json);
    expect(Object.keys(parsed?.file.sites ?? {})).toEqual(['a', 'b']);
    expect(parsed?.ignored.sort()).toEqual(['badcount', 'badtally', 'broken', 'offearth']);
  });

  it('refuses what is not a per-site file, and never throws', () => {
    const tiers = JSON.parse(readFileSync(join(REPO_ROOT, 'src/data/encounter-rarity.json'), 'utf8'));
    for (const input of [undefined, null, 1, 'x', [], {}, tiers, { version: 2, radiusKm: 5, obis: true, sites: {} }, { version: 1, radiusKm: 0, obis: true, sites: {} }, { version: 1, radiusKm: 5, obis: 'yes', sites: {} }, { version: 1, radiusKm: 5, obis: true, sites: [] }, { version: 1, radiusKm: 5, obis: true, generatedAt: 'never', sites: {} }]) {
      expect(parseSitesFile(input)).toBeNull();
    }
    const throwing = { version: 1, radiusKm: 5, obis: true };
    Object.defineProperty(throwing, 'sites', { get() { throw new Error('boom'); }, enumerable: true });
    expect(parseSitesFile(throwing)).toBeNull();
  });

  it('reads a checkpoint, which is the same file marked partial', () => {
    const parsed = parseSitesFile({ ...file, generatedAt: null, partial: true });
    expect(parsed?.file.partial).toBe(true);
    expect(parsed?.file.generatedAt).toBeNull();
  });
});

describe('running the script', () => {
  let scratch: string;
  beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), 'encounter-rarity-test-'));
  });
  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  const read = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as EncounterData;
  const capture = () => {
    const lines: string[] = [];
    const warnings: string[] = [];
    return { lines, warnings, deps: { log: (l: string) => lines.push(l), warn: (l: string) => warnings.push(l), now: NOW, catalog: mini, sites: diveSites } };
  };
  const realFiles = () => ['encounter-rarity.json', 'encounter-rarity.sites.json', 'real-rarity.json'].map((name) => {
    const path = join(REPO_ROOT, 'src/data', name);
    return existsSync(path) ? readFileSync(path, 'utf8') : null;
  });

  /** A hand-written per-site file in the shape the script writes: the stand-in network's answers, for 12 sites. */
  const handWrittenSites = (): SitesFile => {
    const sites: Record<string, SiteEncounters> = {};
    for (let k = 0; k < 12; k++) {
      const species: SiteEncounters['species'] = {};
      for (let i = 0; i < 22; i++) if (k <= i % 12) species[`sp${i}`] = { inaturalist: 4, obis: 7 };
      sites[`site${k}`] = { lat: 9 + k / 100, lng: 98, inaturalist: { taxa: 47, truncated: false }, obis: { taxa: 47, truncated: false }, species };
    }
    return { version: 1, generatedAt: '2026-10-22T10:00:00.000Z', radiusKm: 5, obis: true, maxPages: 20, sites };
  };

  describe('offline, from a per-site file', () => {
    it('recomputes the tiers into a scratch file, and never touches the real files', async () => {
      const before = realFiles();
      const input = join(scratch, 'offline', 'sample.sites.json');
      mkdirSync(join(scratch, 'offline'), { recursive: true });
      writeFileSync(input, sitesToJson(handWrittenSites()));
      const out = join(scratch, 'offline', 'tiers.json');
      const run = capture();
      expect(await runEncountersCli(['--input', input, '--out', out], run.deps)).toBe(0);
      expect(realFiles()).toEqual(before);

      const data = read(out);
      expect(parseEncounterData(data)).not.toBeNull();
      expect(data.generatedAt).toBe('2026-10-22T12:00:00.000Z');
      expect(data.input).toBe('sample.sites.json');
      expect(data.method).toMatchObject({ radiusKm: 5, sitesUsed: 12, presence: 'either', minRecordsPerSite: 3 });
      // Every catalogue animal is accounted for exactly once.
      const listed = (data.unresolved ?? []).map((u) => u.id);
      expect([...Object.keys(data.species), ...listed].sort()).toEqual(mini.map((s) => s.id).sort());
      expect(data.species.sp11).toMatchObject({ share: 1, sites: 12, recordedAt: 12, tier: 'common' });
      expect(data.species.sp22).toMatchObject({ share: 0, recordedAt: 0, tier: 'legendary' }); // notable at site0, recorded nowhere
      expect(listed).toEqual(['sp23']);
      expect(data.species.sp0.basins).toEqual(['tropical-indo-pacific']);
      // It writes no per-site file in offline mode: the input is the evidence.
      expect(existsSync(sitesPathFor(out))).toBe(false);
      expect(existsSync(partialPathFor(out))).toBe(false);
      expect(run.lines.join('\n')).toMatch(/Read 12 sites from sample\.sites\.json \(radius 5 km, iNaturalist and OBIS; no network\)/);
      expect(run.lines.join('\n')).toMatch(/Sites: 12 asked, 12 used, 0 left out/);
      expect(run.lines.join('\n')).toMatch(/Used sites by basin: Indo-Pacific 12/);
      expect(run.lines.join('\n')).toMatch(/Catalogue: 24 species\. Tiered: 23\. Unresolved: 1\./);
      expect(run.lines.join('\n')).toMatch(/Sanity check/);
    });

    it('gives the same tiers when run again, and when it reads the checkpoint of a run that finished', async () => {
      const input = join(scratch, 'again', 'sample.sites.json');
      mkdirSync(join(scratch, 'again'), { recursive: true });
      const sites = handWrittenSites();
      writeFileSync(input, sitesToJson(sites));
      const [first, second] = [join(scratch, 'again', 'first.json'), join(scratch, 'again', 'second.json')];
      await runEncountersCli(['--input', input, '--out', first], capture().deps);
      await runEncountersCli(['--input', input, '--out', second], capture().deps);
      expect(read(second).species).toEqual(read(first).species);
      const checkpoint = join(scratch, 'again', 'checkpoint.partial.json');
      writeFileSync(checkpoint, sitesToJson({ ...sites, generatedAt: null, partial: true }));
      const third = join(scratch, 'again', 'third.json');
      expect(await runEncountersCli(['--input', checkpoint, '--out', third], capture().deps)).toBe(0);
      expect(read(third).species).toEqual(read(first).species);
    });

    it('changes with the options that say what counts: the presence source, the minimum sites', async () => {
      const input = join(scratch, 'options', 'sample.sites.json');
      mkdirSync(join(scratch, 'options'), { recursive: true });
      const sites = handWrittenSites();
      // Make the OBIS records strays (1 each) so only iNaturalist reaches the minimum.
      for (const site of Object.values(sites.sites)) for (const counts of Object.values(site.species)) counts.obis = 1;
      writeFileSync(input, sitesToJson(sites));
      const [either, obis, strict] = ['either', 'obis', 'strict'].map((name) => join(scratch, 'options', `${name}.json`));
      expect(await runEncountersCli(['--input', input, '--out', either], capture().deps)).toBe(0);
      expect(await runEncountersCli(['--input', input, '--out', obis, '--presence', 'obis'], capture().deps)).toBe(1); // nothing is recorded by OBIS alone: no tiers
      expect(await runEncountersCli(['--input', input, '--out', strict, '--min-sites', '13'], capture().deps)).toBe(1); // 12 sites, 13 needed
      expect(existsSync(obis)).toBe(false);
      expect(existsSync(strict)).toBe(false);
      expect(Object.keys(read(either).species).length).toBe(23);
    });

    it('writes nothing in a dry run', async () => {
      const input = join(scratch, 'dry', 'sample.sites.json');
      mkdirSync(join(scratch, 'dry'), { recursive: true });
      writeFileSync(input, sitesToJson(handWrittenSites()));
      const out = join(scratch, 'dry', 'out.json');
      const run = capture();
      expect(await runEncountersCli(['--input', input, '--out', out, '--dry-run'], run.deps)).toBe(0);
      expect(existsSync(out)).toBe(false);
      expect(run.lines.join('\n')).toMatch(/dry run: nothing written/);
    });

    it('reports bad input instead of throwing', async () => {
      const run = capture();
      const notJson = join(scratch, 'not-json.txt');
      writeFileSync(notJson, 'this is not json');
      expect(await runEncountersCli(['--input', notJson], run.deps)).toBe(1);
      expect(await runEncountersCli(['--input', join(scratch, 'missing.json')], run.deps)).toBe(1);
      // The tiers file is not the per-site file, and the message says which to use.
      expect(await runEncountersCli(['--input', join(REPO_ROOT, 'src/data/encounter-rarity.json')], run.deps)).toBe(1);
      expect(run.warnings.join('\n')).toMatch(/use its \.sites\.json/);
      expect(await runEncountersCli(['--bogus'], run.deps)).toBe(2);
      expect(await runEncountersCli(['--only', 'not-a-site'], run.deps)).toBe(2);
      expect(run.warnings.join('\n')).toMatch(/not dive sites: not-a-site/);
      expect(run.warnings).toHaveLength(5);
    });

    it('refuses --presence obis for records asked without OBIS', async () => {
      const input = join(scratch, 'noobis', 'sample.sites.json');
      mkdirSync(join(scratch, 'noobis'), { recursive: true });
      const sites = handWrittenSites();
      for (const site of Object.values(sites.sites)) delete site.obis;
      writeFileSync(input, sitesToJson({ ...sites, obis: false }));
      const run = capture();
      expect(await runEncountersCli(['--input', input, '--out', join(scratch, 'noobis', 'out.json'), '--presence', 'obis'], run.deps)).toBe(2);
      expect(run.warnings.join('\n')).toMatch(/needs OBIS records/);
      // Without the option it uses iNaturalist alone.
      expect(await runEncountersCli(['--input', input, '--out', join(scratch, 'noobis', 'out.json')], run.deps)).toBe(0);
      expect(read(join(scratch, 'noobis', 'out.json')).method?.presence).toBe('inaturalist');
    });

    it('leaves out a site that listed too few taxa, and says so', async () => {
      const input = join(scratch, 'thin', 'sample.sites.json');
      mkdirSync(join(scratch, 'thin'), { recursive: true });
      const sites = handWrittenSites();
      sites.sites.remote = { lat: 9.5, lng: 98, inaturalist: { taxa: 4, truncated: false }, obis: { taxa: 6, truncated: false }, species: { sp0: { inaturalist: 9 } } };
      writeFileSync(input, sitesToJson(sites));
      const run = capture();
      expect(await runEncountersCli(['--input', input, '--out', join(scratch, 'thin', 'out.json')], run.deps)).toBe(0);
      expect(run.lines.join('\n')).toMatch(/Sites: 13 asked, 12 used, 1 left out/);
      expect(run.lines.join('\n')).toMatch(/left out remote: Only 6 taxa/);
      expect(read(join(scratch, 'thin', 'out.json')).method).toMatchObject({ sitesAsked: 13, sitesUsed: 12 });
    });
  });

  describe('against stand-in sources', () => {
    it('asks, writes the tiers and the per-site records, and carries on from its checkpoint after a failure', async () => {
      const out = join(scratch, 'live', 'out.json');
      const checkpoint = partialPathFor(out);

      // First run: the OBIS checklist of site5 fails (after the client’s own retries).
      const broken = fakeNetwork((url) => {
        if (url.includes('/checklist') && siteIndex(latOf(url)) === 5) throw new HttpError(503);
      });
      const first = capture();
      expect(await runEncountersCli(['--out', out], { ...first.deps, client: broken })).toBe(1);
      expect(existsSync(out)).toBe(false);
      expect(first.warnings.join('\n')).toMatch(/site5/);
      expect(first.warnings.join('\n')).toMatch(/1 sites could not be asked \(site5\)/);
      const saved = JSON.parse(readFileSync(checkpoint, 'utf8')) as SitesFile;
      expect(saved.partial).toBe(true);
      expect(Object.keys(saved.sites)).toHaveLength(11);
      expect(saved.sites.site5).toBeUndefined();

      // Second run: healthy. Only site5 is asked about, and the checkpoint goes away.
      const healthy = fakeNetwork();
      const second = capture();
      expect(await runEncountersCli(['--out', out], { ...second.deps, client: healthy })).toBe(0);
      expect(second.lines.join('\n')).toMatch(/Resuming from out\.partial\.json: 11 sites already asked/);
      expect(healthy.urls).toHaveLength(2);
      expect(healthy.urls.every((u) => siteIndex(latOf(u)) === 5)).toBe(true);
      expect(existsSync(checkpoint)).toBe(false);

      const data = read(out);
      expect(parseEncounterData(data)).not.toBeNull();
      expect(Object.keys(data.species)).toHaveLength(23);
      expect(data.species.sp11).toMatchObject({ share: 1, sites: 12, tier: 'common' });
      const sitesFile = parseSitesFile(JSON.parse(readFileSync(sitesPathFor(out), 'utf8')));
      expect(sitesFile?.file.partial).toBeUndefined();
      expect(sitesFile?.file.generatedAt).toBe('2026-10-22T12:00:00.000Z');
      expect(Object.keys(sitesFile?.file.sites ?? {})).toHaveLength(12);
      expect(sitesFile?.file).toMatchObject({ radiusKm: 5, obis: true });

      // And the offline path reproduces the tiers from the records it wrote.
      const again = join(scratch, 'live', 'again.json');
      expect(await runEncountersCli(['--input', sitesPathFor(out), '--out', again], capture().deps)).toBe(0);
      expect(read(again).species).toEqual(data.species);
    });

    it('spaces nothing itself: it hands every request to the polite client, in order', async () => {
      const network = fakeNetwork();
      const out = join(scratch, 'order', 'out.json');
      expect(await runEncountersCli(['--out', out], { ...capture().deps, client: network })).toBe(0);
      expect(network.urls).toHaveLength(24); // 12 sites, iNaturalist then OBIS, one at a time
      network.urls.forEach((url, i) => expect(url.includes('/species_counts')).toBe(i % 2 === 0));
    });

    it('with --no-obis asks iNaturalist only, and records that', async () => {
      const network = fakeNetwork();
      const out = join(scratch, 'inat-only', 'out.json');
      expect(await runEncountersCli(['--out', out, '--no-obis', '--radius', '3'], { ...capture().deps, client: network })).toBe(0);
      expect(network.urls).toHaveLength(12);
      expect(network.urls.every((url) => url.includes('/species_counts') && url.includes('radius=3'))).toBe(true);
      const data = read(out);
      expect(data.method).toMatchObject({ radiusKm: 3, sources: ['inaturalist'], presence: 'inaturalist' });
      expect(parseSitesFile(JSON.parse(readFileSync(sitesPathFor(out), 'utf8')))?.file).toMatchObject({ obis: false, radiusKm: 3 });
    });

    it('with --allow-incomplete writes what it has and leaves the failed site out', async () => {
      const out = join(scratch, 'incomplete', 'out.json');
      const broken = fakeNetwork((url) => {
        if (siteIndex(latOf(url)) === 11) throw new HttpError(500);
      });
      const code = await runEncountersCli(['--out', out, '--allow-incomplete'], { ...capture().deps, client: broken });
      expect(code).toBe(0);
      expect(read(out).method).toMatchObject({ sitesAsked: 11 });
      expect(Object.keys(parseSitesFile(JSON.parse(readFileSync(sitesPathFor(out), 'utf8')))?.file.sites ?? {})).toHaveLength(11);
    });

    it('stops after several sites in a row fail, keeping the checkpoint', async () => {
      const down = fakeNetwork(() => {
        throw new TypeError('fetch failed');
      });
      const out = join(scratch, 'down', 'out.json');
      const run = capture();
      expect(await runEncountersCli(['--out', out], { ...run.deps, client: down })).toBe(1);
      expect(down.urls).toHaveLength(5); // one request per failed site, then it stopped
      expect(run.warnings.join('\n')).toMatch(/5 sites in a row failed/);
      expect(run.warnings.join('\n')).toMatch(/NODE_USE_ENV_PROXY=1/);
      expect(existsSync(out)).toBe(false);
    });

    it('asked about some sites with --only, prints them and writes nothing', async () => {
      const network = fakeNetwork();
      const run = capture();
      const code = await runEncountersCli(['--only', 'site3,site4'], { ...run.deps, client: network });
      expect(code).toBe(0);
      expect(network.urls).toHaveLength(4);
      expect(run.lines.join('\n')).toMatch(/\[1\/2\] site3: iNaturalist 41 taxa, OBIS 41 taxa; 16 catalogue animals/);
      expect(run.lines.join('\n')).toMatch(/dry run: nothing written/);
      expect(existsSync(DEFAULT_OUT.replace('.json', '.partial.json'))).toBe(false);
    });

    it('refuses a checkpoint made with other settings, and one it cannot read', async () => {
      const out = join(scratch, 'settings', 'out.json');
      mkdirSync(join(scratch, 'settings'), { recursive: true });
      writeFileSync(partialPathFor(out), sitesToJson({ ...handWrittenSites(), generatedAt: null, partial: true, radiusKm: 2 }));
      const run = capture();
      expect(await runEncountersCli(['--out', out], { ...run.deps, client: fakeNetwork() })).toBe(1);
      expect(run.warnings.join('\n')).toMatch(/radius 2 km.*this run is 5 km/);
      writeFileSync(partialPathFor(out), 'not json');
      expect(await runEncountersCli(['--out', out], { ...run.deps, client: fakeNetwork() })).toBe(1);
      expect(run.warnings.join('\n')).toMatch(/could not be read/);
      // --fresh ignores it.
      expect(await runEncountersCli(['--out', out, '--fresh'], { ...run.deps, client: fakeNetwork() })).toBe(0);
    });
  });

  it('works as a real command: npx tsx scripts/real-rarity/encounters.ts --input … --out …', () => {
    const tsx = join(REPO_ROOT, 'node_modules/.bin/tsx');
    if (!existsSync(tsx)) return;
    const dir = join(scratch, 'command');
    mkdirSync(dir, { recursive: true });
    // Real dive sites and the real catalogue, with hand-written records: 12 sites of the 69, recorded for the first 12 catalogue animals.
    const sites: Record<string, SiteEncounters> = {};
    SITES.slice(0, 12).forEach((s, k) => {
      const species: SiteEncounters['species'] = {};
      SPECIES.forEach((animal, i) => {
        if (k <= i % 12) species[animal.id] = { inaturalist: 4 };
      });
      sites[s.id] = { lat: s.lat, lng: s.lng, inaturalist: { taxa: 60, truncated: false }, species };
    });
    const input = join(dir, 'handwritten.sites.json');
    writeFileSync(input, sitesToJson({ version: 1, generatedAt: null, radiusKm: 5, obis: false, maxPages: 20, sites }));
    const out = join(dir, 'encounter-rarity.json');
    const before = realFiles();
    const output = execFileSync(tsx, ['scripts/real-rarity/encounters.ts', '--input', input, '--out', out], { cwd: REPO_ROOT, encoding: 'utf8' });
    expect(output).toMatch(/Read 12 sites from handwritten\.sites\.json/);
    expect(output).toMatch(/Tiered: \d+/);
    expect(parseEncounterData(read(out))).not.toBeNull();
    expect(Object.keys(read(out).species).length).toBeGreaterThan(20);
    expect(realFiles()).toEqual(before);
  }, 60_000);
});

describe('the file as written', () => {
  it('has one animal per line, so a re-run is a small diff', () => {
    const data: EncounterData = {
      version: 1,
      generatedAt: '2026-10-22T12:00:00.000Z',
      species: {
        a: { share: 0.5, sites: 10, recordedAt: 5, basins: ['tropical-indo-pacific'], tier: 'common' },
        b: { share: 0, sites: 10, recordedAt: 0, basins: ['tropical-indo-pacific'], tier: 'legendary' },
      },
      unresolved: [{ id: 'c', scientificName: 'Genus c', reason: 'because' }],
    };
    const text = toJson(data);
    expect(text.split('\n').filter((line) => /^    "[abc]":|^    \{"id"/.test(line))).toHaveLength(3);
    expect(parseEncounterData(JSON.parse(text))).toEqual(data);
    expect(toJson({ generatedAt: null, species: {} })).toContain('"species": {}');
  });
});

describe('the checked-in encounter file', () => {
  it('is valid, covers only catalogue animals and puts them in basins that exist', () => {
    const parsed = parseEncounterData(bundledEncounters);
    expect(parsed).not.toBeNull();
    const ids = new Set(SPECIES.map((s) => s.id));
    for (const [id, entry] of Object.entries(parsed?.species ?? {})) {
      expect(ids.has(id)).toBe(true);
      for (const basin of entry.basins) expect(BASIN_IDS).toContain(basin);
      expect(entry.recordedAt).toBeLessThanOrEqual(entry.sites);
      expect(entry.share).toBeCloseTo(entry.recordedAt / entry.sites, 3);
    }
    // Every catalogue animal is tiered or listed as unresolved once the file has been generated, never both and never neither.
    if (parsed && parsed.generatedAt !== null) {
      const listed = (parsed.unresolved ?? []).map((u) => u.id);
      expect([...Object.keys(parsed.species), ...listed].sort()).toEqual(SPECIES.map((s) => s.id).sort());
    }
  });
});

describe('the sanity check', () => {
  const entry = (tier: EncounterData['species'][string]['tier'], recordedAt = 3, sites = 40) => ({ share: recordedAt / sites, sites, recordedAt, basins: ['tropical-indo-pacific' as const], tier });

  it('lists the animals everyone agrees on, and none twice', () => {
    expect(ICONIC_SPECIES).toHaveLength(10);
    expect(new Set([...ICONIC_SPECIES, ...STAPLE_SPECIES]).size).toBe(ICONIC_SPECIES.length + STAPLE_SPECIES.length);
    const ids = new Set(SPECIES.map((s) => s.id));
    for (const id of [...ICONIC_SPECIES, ...STAPLE_SPECIES]) expect(ids.has(id)).toBe(true);
    for (const id of ['whale-shark', 'humpback-whale', 'sperm-whale', 'orca', 'great-white-shark', 'basking-shark', 'dugong', 'leatherback-turtle', 'oceanic-manta', 'mola-mola']) expect(ICONIC_SPECIES).toContain(id);
    for (const id of ['clownfish', 'blue-tang', 'moorish-idol', 'giant-moray', 'lionfish', 'french-angelfish', 'queen-angelfish']) expect(STAPLE_SPECIES).toContain(id);
  });

  it('passes when iconic animals are rare or rarer and staples common or uncommon', () => {
    const species: EncounterData['species'] = {};
    for (const id of ICONIC_SPECIES) species[id] = entry('epic');
    for (const id of STAPLE_SPECIES) species[id] = entry('common', 30);
    const report = sanityReport({ species });
    expect(report.passes).toBe(true);
    expect(report.iconic).toEqual({ total: 10, met: 10 });
    expect(report.staple).toEqual({ total: 7, met: 7 });
    expect(sanityLines(report).at(-1)).toMatch(/Iconic rare or rarer: 10 of 10\. Staples common or uncommon: 7 of 7\. Passes\./);
  });

  it('fails when most iconic animals come out common, which is what worldwide counts do', () => {
    const species: EncounterData['species'] = {};
    for (const id of ICONIC_SPECIES) species[id] = entry('common', 35);
    for (const id of STAPLE_SPECIES) species[id] = entry('common', 35);
    const report = sanityReport({ species });
    expect(report.passes).toBe(false);
    expect(report.iconic.met).toBe(0);
    expect(sanityLines(report).join('\n')).toMatch(/against expectation/);
    expect(sanityLines(report).at(-1)).toMatch(/Does not pass/);
  });

  it('counts only animals that have a tier, and does not pass on nothing', () => {
    const report = sanityReport({ species: { 'whale-shark': entry('legendary', 0), clownfish: entry('uncommon', 12) } });
    expect(report.iconic).toEqual({ total: 1, met: 1 });
    expect(report.staple).toEqual({ total: 1, met: 1 });
    expect(report.rows.find((row) => row.id === 'orca')).toMatchObject({ tier: null, share: null, expected: null });
    expect(sanityLines(report).join('\n')).toMatch(/orca\s+no tier \(unresolved\)/);
    expect(sanityReport({ species: {} }).passes).toBe(false);
  });

  it('reports the share, the sites and the basins of each row', () => {
    const report = sanityReport({ species: { 'whale-shark': entry('rare', 6, 41) } });
    expect(report.rows.find((row) => row.id === 'whale-shark')).toMatchObject({ group: 'iconic', tier: 'rare', recordedAt: 6, sites: 41, basins: ['Indo-Pacific'], expected: true });
    expect(sanityLines(report).join('\n')).toMatch(/whale-shark\s+rare\s+15%\s+6\/41 sites\s+Indo-Pacific/);
  });
});
