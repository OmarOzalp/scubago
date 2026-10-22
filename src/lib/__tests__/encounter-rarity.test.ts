import { describe, expect, it } from '@jest/globals';

import { SPECIES } from '@/data/species';
import { UNLISTED_ID } from '@/lib/catalog';
import {
  BASINS,
  BASIN_IDS,
  DEFAULT_ENCOUNTER_OPTIONS,
  MIN_RECORDS_PER_SITE,
  MIN_SITES_IN_WATERS,
  MIN_SITE_TAXA,
  MIN_SPECIES_FOR_BANDS,
  RARITY_BANDS,
  bandCounts,
  basinOf,
  buildEncounterData,
  encounterShares,
  encounterTiersApplied,
  isRecordedAt,
  parseEncounterData,
  siteEffort,
  tierCounts,
  tiersFromShares,
  type BasinId,
  type NotableSite,
  type SiteEncounters,
} from '@/lib/encounter-rarity';
import { RARITY_ORDER, rarityRank } from '@/lib/rarity';
import type { Rarity } from '@/lib/types';

// Every site, count and species below is HAND-WRITTEN to exercise the code. None of it is
// iNaturalist or OBIS data, and none of it is written to src/data/encounter-rarity.json.

describe('assigning a site to an ocean basin', () => {
  // Real places, by their well-known coordinates, so the rules are checked against geography and not
  // against themselves.
  const places: [string, number, number, BasinId][] = [
    // Tropical Indo-Pacific, Red Sea included
    ['Richelieu Rock, Thailand', 9.36, 98.02, 'tropical-indo-pacific'],
    ['Maaya Thila, Maldives', 3.94, 72.87, 'tropical-indo-pacific'],
    ['Raja Ampat, Indonesia', -0.56, 130.69, 'tropical-indo-pacific'],
    ['Sipadan, Malaysia', 4.11, 118.63, 'tropical-indo-pacific'],
    ['Palau', 7.13, 134.22, 'tropical-indo-pacific'],
    ['Ras Mohammed, Red Sea', 27.72, 34.26, 'tropical-indo-pacific'],
    ['Dahab Blue Hole, Red Sea', 28.57, 34.54, 'tropical-indo-pacific'],
    ['Eilat, Gulf of Aqaba', 29.5, 34.93, 'tropical-indo-pacific'],
    ['Daedalus Reef, Red Sea', 24.93, 35.87, 'tropical-indo-pacific'],
    ['Okinawa', 26.2, 127.7, 'tropical-indo-pacific'],
    ['Great Barrier Reef, Cod Hole', -14.66, 145.64, 'tropical-indo-pacific'],
    ['Julian Rocks, Byron Bay', -28.61, 153.63, 'tropical-indo-pacific'],
    ['Aliwal Shoal, South Africa', -30.26, 30.84, 'tropical-indo-pacific'],
    ['Protea Banks, South Africa', -30.83, 30.45, 'tropical-indo-pacific'],
    ['Mauritius', -20.3, 57.5, 'tropical-indo-pacific'],
    ['Hawaii, Kona', 19.6, -156, 'tropical-indo-pacific'],
    ['Fakarava, French Polynesia', -16.51, -145.47, 'tropical-indo-pacific'],
    ['Fiji', -17.7, 177.4, 'tropical-indo-pacific'],
    ['Oman', 23.6, 58.6, 'tropical-indo-pacific'],
    // Tropical West Atlantic and Caribbean
    ['Cozumel, Mexico', 20.34, -87.06, 'tropical-west-atlantic'],
    ['Great Blue Hole, Belize', 17.32, -87.54, 'tropical-west-atlantic'],
    ['Bonaire', 12.1, -68.29, 'tropical-west-atlantic'],
    ['Grand Cayman', 19.39, -81.3, 'tropical-west-atlantic'],
    ['Tiger Beach, Bahamas', 26.86, -79.04, 'tropical-west-atlantic'],
    ['Key Largo, Florida', 25.07, -80.3, 'tropical-west-atlantic'],
    ['Flower Garden Banks, Gulf of Mexico', 27.9, -93.8, 'tropical-west-atlantic'],
    ['Bermuda', 32.3, -64.8, 'tropical-west-atlantic'],
    ['Roatan, Honduras', 16.3, -86.5, 'tropical-west-atlantic'],
    ['Bocas del Toro, Panama (Caribbean side)', 9.35, -82.2, 'tropical-west-atlantic'],
    ['Portobelo, Panama (Caribbean side)', 9.55, -79.65, 'tropical-west-atlantic'],
    ['Los Roques, Venezuela', 11.9, -66.7, 'tropical-west-atlantic'],
    ['Fernando de Noronha, Brazil', -3.85, -32.4, 'tropical-west-atlantic'],
    ['Abrolhos, Brazil', -17.9, -39, 'tropical-west-atlantic'],
    // Tropical Eastern Pacific
    ['Darwin’s Arch, Galapagos', 1.68, -92, 'tropical-east-pacific'],
    ['Cocos Island, Costa Rica', 5.52, -87.07, 'tropical-east-pacific'],
    ['Roca Partida, Revillagigedo', 19.01, -112.07, 'tropical-east-pacific'],
    ['Cabo Pulmo, Gulf of California', 23.44, -109.42, 'tropical-east-pacific'],
    ['La Paz, Gulf of California', 24.6, -110.4, 'tropical-east-pacific'],
    ['Puerto Vallarta, Mexico', 20.6, -105.3, 'tropical-east-pacific'],
    ['Playas del Coco, Costa Rica (Pacific side)', 10.55, -85.7, 'tropical-east-pacific'],
    ['Coiba, Panama (Pacific side)', 7.4, -81.7, 'tropical-east-pacific'],
    ['Panama City (Pacific side)', 8.95, -79.5, 'tropical-east-pacific'],
    ['Pearl Islands, Panama', 8.4, -79, 'tropical-east-pacific'],
    ['Malpelo, Colombia', 4, -81.6, 'tropical-east-pacific'],
    ['Mancora, Peru', -4.1, -81, 'tropical-east-pacific'],
    // Tropical Eastern Atlantic
    ['Cape Verde, Sal', 16.7, -22.9, 'tropical-east-atlantic'],
    ['Dakar, Senegal', 14.7, -17.5, 'tropical-east-atlantic'],
    ['Sao Tome', 0.3, 6.7, 'tropical-east-atlantic'],
    ['St Helena', -15.95, -5.7, 'tropical-east-atlantic'],
    // Temperate and cold North Pacific
    ['Casino Point, Catalina', 33.35, -118.33, 'temperate-north-pacific'],
    ['La Jolla Cove, California', 32.85, -117.27, 'temperate-north-pacific'],
    ['Point Lobos, California', 36.52, -121.94, 'temperate-north-pacific'],
    ['Browning Wall, British Columbia', 50.87, -127.65, 'temperate-north-pacific'],
    ['Puget Sound, Washington', 47.6, -122.4, 'temperate-north-pacific'],
    ['Guadalupe Island, Mexico', 29, -118.3, 'temperate-north-pacific'],
    ['Izu Peninsula, Japan', 34.9, 139.1, 'temperate-north-pacific'],
    ['Jeju, Korea', 33.5, 126.5, 'temperate-north-pacific'],
    ['Vladivostok, Russia', 43.1, 131.9, 'temperate-north-pacific'],
    ['Sitka, Alaska', 57.05, -135.3, 'temperate-north-pacific'],
    // Temperate and cold North Atlantic, with the Mediterranean
    ['Silfra, Iceland', 64.26, -21.12, 'temperate-north-atlantic'],
    ['Skjervoy, Norway', 70.03, 20.97, 'temperate-north-atlantic'],
    ['Farne Islands, England', 55.6, -1.65, 'temperate-north-atlantic'],
    ['Malta', 35.9, 14.5, 'temperate-north-atlantic'],
    ['Medes Islands, Spain', 42.05, 3.22, 'temperate-north-atlantic'],
    ['Kas, Turkey', 36.2, 29.6, 'temperate-north-atlantic'],
    ['Alexandria, Egypt (Mediterranean)', 31.2, 29.9, 'temperate-north-atlantic'],
    ['Canary Islands, Tenerife', 28.1, -16.7, 'temperate-north-atlantic'],
    ['Azores', 38.5, -28.6, 'temperate-north-atlantic'],
    ['Halifax, Nova Scotia', 44.6, -63.6, 'temperate-north-atlantic'],
    ['Charleston, South Carolina', 32.7, -79.9, 'temperate-north-atlantic'],
    // Temperate and cold southern waters
    ['Rapid Bay Jetty, South Australia', -35.52, 138.18, 'temperate-southern'],
    ['Poor Knights, New Zealand', -35.47, 174.74, 'temperate-southern'],
    ['Sydney, Australia', -33.9, 151.3, 'temperate-southern'],
    ['Hobart, Tasmania', -43, 147.3, 'temperate-southern'],
    ['Cape Town, South Africa', -33.9, 18.4, 'temperate-southern'],
    ['Port Elizabeth, South Africa', -34, 25.7, 'temperate-southern'],
    ['Valparaiso, Chile', -33, -71.6, 'temperate-southern'],
    ['Lima, Peru', -12.1, -77.1, 'temperate-southern'],
    ['Antofagasta, Chile', -23.6, -70.4, 'temperate-southern'],
    ['Swakopmund, Namibia', -22.7, 14.5, 'temperate-southern'],
    ['Santa Catarina, Brazil', -27.4, -48.5, 'temperate-southern'],
    ['Falkland Islands', -51.7, -57.8, 'temperate-southern'],
    ['Easter Island', -27.1, -109.4, 'temperate-southern'],
  ];

  it.each(places)('puts %s (%f, %f) in %s', (_name, lat, lng, basin) => {
    expect(basinOf(lat, lng)).toBe(basin);
  });

  it('covers every basin it names, with a rule in words for each', () => {
    expect(new Set(places.map((place) => place[3]))).toEqual(new Set(BASIN_IDS));
    expect(BASINS.map((basin) => basin.id)).toEqual([...BASIN_IDS]);
    for (const basin of BASINS) {
      expect(basin.rule.length).toBeGreaterThan(40);
      expect(basin.short.length).toBeLessThanOrEqual(20);
    }
  });

  it('answers null for coordinates that are not on Earth', () => {
    for (const [lat, lng] of [[91, 0], [0, 181], [-91, 0], [Number.NaN, 10], [10, Number.POSITIVE_INFINITY]]) expect(basinOf(lat, lng)).toBeNull();
    expect(basinOf('9' as unknown as number, 98)).toBeNull();
  });

  it('puts every point on Earth in some basin', () => {
    for (let lat = -90; lat <= 90; lat += 7.5) {
      for (let lng = -180; lng <= 180; lng += 7.5) expect(BASIN_IDS).toContain(basinOf(lat, lng));
    }
  });

  it('is the same on either side of the antimeridian', () => {
    expect(basinOf(-17, 179.9)).toBe('tropical-indo-pacific');
    expect(basinOf(-17, -179.9)).toBe('tropical-indo-pacific');
  });
});

// ── Per-site records ─────────────────────────────────────────────────────────

const site = (lat: number, lng: number, species: SiteEncounters['species'], taxa = 100, obisTaxa?: number): SiteEncounters => ({
  lat,
  lng,
  inaturalist: { taxa, truncated: false },
  ...(obisTaxa !== undefined && { obis: { taxa: obisTaxa, truncated: false } }),
  species,
});

describe('the records at one site', () => {
  const s = site(9, 98, { orca: { inaturalist: 2, obis: 7 }, dugong: { inaturalist: 5 }, 'sea-otter': { obis: 4 } }, 30, 12);

  it('count an animal as recorded when one source reaches the minimum alone', () => {
    expect(MIN_RECORDS_PER_SITE).toBe(3);
    expect(isRecordedAt(s, 'orca')).toBe(true); // OBIS 7
    expect(isRecordedAt(s, 'orca', 'inaturalist')).toBe(false); // iNaturalist 2
    expect(isRecordedAt(s, 'orca', 'obis')).toBe(true);
    expect(isRecordedAt(s, 'dugong')).toBe(true);
    expect(isRecordedAt(s, 'dugong', 'obis')).toBe(false);
    expect(isRecordedAt(s, 'sea-otter', 'either')).toBe(true);
  });

  it('do not add the two sources together, because OBIS holds iNaturalist observations too', () => {
    const split = site(9, 98, { x: { inaturalist: 2, obis: 2 } });
    expect(isRecordedAt(split, 'x')).toBe(false);
    expect(isRecordedAt(split, 'x', 'either', 2)).toBe(true);
  });

  it('let the minimum change, and ignore animals the site does not list', () => {
    expect(isRecordedAt(s, 'orca', 'inaturalist', 2)).toBe(true);
    expect(isRecordedAt(s, 'orca', 'either', 8)).toBe(false);
    expect(isRecordedAt(s, 'whale-shark')).toBe(false);
    expect(isRecordedAt(s, 'constructor')).toBe(false);
    expect(isRecordedAt(s, '__proto__')).toBe(false);
  });

  it('measure effort as the most taxa any chosen source listed', () => {
    expect(siteEffort(s)).toBe(30);
    expect(siteEffort(s, 'obis')).toBe(12);
    expect(siteEffort(s, 'inaturalist')).toBe(30);
    expect(siteEffort(site(9, 98, {}, 30), 'obis')).toBeUndefined(); // OBIS did not answer
    expect(siteEffort({ lat: 0, lng: 0, species: {} })).toBeUndefined();
  });
});

// ── Shares ───────────────────────────────────────────────────────────────────

describe('the share of dive sites in an animal’s waters that record it', () => {
  // Six Indo-Pacific sites (a, b, c, d, e, f) and five Caribbean ones (g..k). "star" is recorded at
  // three Indo-Pacific sites, "ray" at one Indo-Pacific and two Caribbean ones, "fish" nowhere.
  const rec = (n = 5) => ({ inaturalist: n });
  const sites: Record<string, SiteEncounters> = {
    a: site(9, 98, { star: rec(), ray: rec() }),
    b: site(4, 73, { star: rec() }),
    c: site(-8.5, 119.6, { star: rec() }),
    d: site(7, 134, {}),
    e: site(27, 34, {}),
    f: site(-14, 145, {}),
    g: site(20.3, -87, { ray: rec() }),
    h: site(12, -68, { ray: rec() }),
    i: site(17, -87, {}),
    j: site(19, -81, {}),
    k: site(25, -80, {}),
  };
  const catalog = [{ id: 'star' }, { id: 'ray' }, { id: 'fish' }, { id: 'ghost' }, { id: UNLISTED_ID }];

  it('is the used sites that record it over the used sites in its waters', () => {
    const { shares } = encounterShares(catalog, sites);
    expect(shares.get('star')).toEqual({ share: 0.5, sites: 6, recordedAt: 3, basins: ['tropical-indo-pacific'] });
    // "ray" lives in two basins, so its waters hold all eleven sites.
    expect(shares.get('ray')).toEqual({ share: 3 / 11, sites: 11, recordedAt: 3, basins: ['tropical-indo-pacific', 'tropical-west-atlantic'] });
  });

  it('never gives the unlisted id a share', () => {
    const result = encounterShares(catalog, sites);
    expect(result.shares.has(UNLISTED_ID)).toBe(false);
    expect(result.unresolved.has(UNLISTED_ID)).toBe(false);
  });

  it('takes the basins of the sites that list an animal as notable, even where the data records none', () => {
    const notable: NotableSite[] = [{ lat: 20, lng: -87, notableSpecies: ['star', 'fish'] }];
    const { shares } = encounterShares(catalog, sites, notable);
    // "star" is notable in the Caribbean, so its waters are both basins and it is recorded at 3 of 11.
    expect(shares.get('star')).toMatchObject({ sites: 11, recordedAt: 3, basins: ['tropical-indo-pacific', 'tropical-west-atlantic'] });
    // "fish" is recorded nowhere but notable there: a real share of 0 over the Caribbean sites.
    expect(shares.get('fish')).toEqual({ share: 0, sites: 5, recordedAt: 0, basins: ['tropical-west-atlantic'] });
  });

  it('leaves an animal with no waters unresolved, and says why', () => {
    const { shares, unresolved } = encounterShares(catalog, sites);
    expect(shares.has('ghost')).toBe(false);
    expect(unresolved.get('ghost')).toMatch(/none lists it as notable/);
    expect(unresolved.get('fish')).toMatch(/where its waters are/);
  });

  it('requires a minimum number of used sites in its waters, else keeps the catalogue tier', () => {
    expect(MIN_SITES_IN_WATERS).toBe(5);
    const four = { ...sites };
    for (const id of ['d', 'e']) delete four[id]; // four Indo-Pacific sites left
    const { shares, unresolved } = encounterShares([{ id: 'star' }], four);
    expect(shares.has('star')).toBe(false);
    expect(unresolved.get('star')).toMatch(/Only 4 usable dive sites in its waters \(Indo-Pacific\); at least 5 are needed/);
    // A lower minimum accepts it.
    expect(encounterShares([{ id: 'star' }], four, [], { minSites: 4 }).shares.get('star')).toMatchObject({ sites: 4, recordedAt: 3 });
    expect(encounterShares([{ id: 'star' }], sites, [], { minSites: 6 }).shares.get('star')).toBeDefined();
    expect(encounterShares([{ id: 'star' }], sites, [], { minSites: 7 }).shares.has('star')).toBe(false);
  });

  it('does not count a notable basin that holds no used site', () => {
    const notable: NotableSite[] = [{ lat: 64, lng: -21, notableSpecies: ['fish'] }]; // Iceland: no used site
    const { shares, unresolved } = encounterShares(catalog, sites, notable);
    expect(shares.has('fish')).toBe(false);
    expect(unresolved.get('fish')).toMatch(/North Atlantic.*no dive site with enough records/);
  });

  it('uses only sites that listed enough taxa, and says which it left out', () => {
    expect(MIN_SITE_TAXA).toBe(20);
    const mixed = { ...sites, thin: site(9.2, 98.1, { star: rec() }, 5), none: { lat: 9, lng: 98, species: {} } as SiteEncounters, bad: site(95, 0, {}) };
    const result = encounterShares(catalog, mixed);
    expect(result.usedSites).toBe(11);
    expect(result.skippedSites.map((skipped) => skipped.id).sort()).toEqual(['bad', 'none', 'thin']);
    expect(result.skippedSites.find((skipped) => skipped.id === 'thin')?.reason).toMatch(/Only 5 taxa.*fewer than the 20/);
    expect(result.skippedSites.find((skipped) => skipped.id === 'none')?.reason).toMatch(/did not answer/);
    expect(result.skippedSites.find((skipped) => skipped.id === 'bad')?.reason).toMatch(/not on Earth/);
    // The thin site recorded "star" but is not in its share.
    expect(result.shares.get('star')).toMatchObject({ sites: 6, recordedAt: 3 });
    expect(result.basinSites['tropical-indo-pacific']).toBe(6);
    expect(result.basinSites['tropical-west-atlantic']).toBe(5);
    expect(result.basinSites['temperate-southern']).toBe(0);
    // A lower bar lets it in.
    expect(encounterShares(catalog, mixed, [], { minSiteTaxa: 5 }).shares.get('star')).toMatchObject({ sites: 7, recordedAt: 4 });
  });

  it('follows the presence source', () => {
    const two: Record<string, SiteEncounters> = {};
    for (let i = 0; i < 6; i++) two[`s${i}`] = site(9, 98, { star: i < 2 ? { inaturalist: 4 } : i < 5 ? { obis: 9 } : {} }, 40, 40);
    expect(encounterShares([{ id: 'star' }], two, [], { presence: 'either' }).shares.get('star')?.recordedAt).toBe(5);
    expect(encounterShares([{ id: 'star' }], two, [], { presence: 'inaturalist' }).shares.get('star')?.recordedAt).toBe(2);
    expect(encounterShares([{ id: 'star' }], two, [], { presence: 'obis' }).shares.get('star')?.recordedAt).toBe(3);
  });

  it('takes a map as well as an object, and gives nothing from nothing', () => {
    const asMap = new Map(Object.entries(sites));
    expect(encounterShares(catalog, asMap).shares.get('star')?.share).toBe(0.5);
    const empty = encounterShares(catalog, {});
    expect(empty.shares.size).toBe(0);
    expect(empty.usedSites).toBe(0);
    expect(empty.unresolved.size).toBe(4);
  });

  it('gives its defaults', () => {
    expect(DEFAULT_ENCOUNTER_OPTIONS).toEqual({ presence: 'either', minRecords: 3, minSiteTaxa: 20, minSites: 5 });
  });
});

// ── Tiers ────────────────────────────────────────────────────────────────────

describe('tiers from shares', () => {
  const ranked = (count: number) => new Map<string, number>(Array.from({ length: count }, (_, i) => [`s${i + 1}`, (i + 1) / count] as const));

  it('keeps the shape of the hand-assigned catalogue', () => {
    expect(RARITY_BANDS.map((b) => b.tier)).toEqual(RARITY_ORDER);
    expect(RARITY_BANDS.reduce((sum, b) => sum + b.percent, 0)).toBe(100);
    const by = tierCounts(SPECIES.map((s) => s.rarity));
    expect(by).toEqual({ common: 33, uncommon: 25, rare: 31, epic: 19, legendary: 12 });
    const bands = bandCounts(SPECIES.length);
    for (const tier of RARITY_ORDER) expect(Math.abs(bands[tier] - by[tier])).toBeLessThanOrEqual(1);
    expect(bands.legendary).toBe(12);
  });

  it('cuts 100 animals at exactly 28, 49, 75 and 90', () => {
    const tiers = tiersFromShares(ranked(100)); // s100 is recorded at the largest share, s1 the least
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
    expect(tierCounts(tiersFromShares(ranked(120)).values())).toEqual(bandCounts(120));
  });

  it('always places every animal given, whatever the number', () => {
    for (let n = MIN_SPECIES_FOR_BANDS; n <= 140; n++) {
      expect(Object.values(bandCounts(n)).reduce((a, b) => a + b, 0)).toBe(n);
      expect(tiersFromShares(ranked(n)).size).toBe(n);
    }
  });

  it('tiers a share of 0, which is a result, but not a share that is not a number or is negative', () => {
    const shares = ranked(40);
    shares.set('zero', 0);
    shares.set('negative', -0.1);
    shares.set('nan', Number.NaN);
    shares.set('infinite', Number.POSITIVE_INFINITY);
    shares.set(UNLISTED_ID, 0.9);
    const tiers = tiersFromShares(shares);
    expect(tiers.get('zero')).toBe('legendary');
    expect(tiers.size).toBe(41);
    for (const id of ['negative', 'nan', 'infinite', UNLISTED_ID]) expect(tiers.has(id)).toBe(false);
  });

  it('gives equal shares one tier, and never ranks a higher share in a rarer tier', () => {
    let seed = 12345;
    const random = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    // 300 shares from a coarse grid, so there are plenty of ties, as there are for counts over a few sites.
    const shares = new Map(Array.from({ length: 300 }, (_, i) => [`x${i}`, Math.floor(random() * 25) / 24] as const));
    const tiers = tiersFromShares(shares);
    expect(tiers.size).toBe(300);
    for (const [a, shareA] of shares) {
      for (const [b, shareB] of shares) {
        const [tierA, tierB] = [tiers.get(a) as Rarity, tiers.get(b) as Rarity];
        if (shareA > shareB) expect(rarityRank(tierA)).toBeLessThanOrEqual(rarityRank(tierB));
        if (shareA === shareB) expect(tierA).toBe(tierB);
      }
    }
  });

  it('puts a block of ties at the tier of its middle, so a block of zeros is legendary however it starts', () => {
    // 30 animals; the bottom 12 all share 0, starting at position 18 of 30 (inside the rare band, which ends at 23).
    const shares = new Map<string, number>();
    for (let i = 0; i < 18; i++) shares.set(`a${i}`, 0.9 - i * 0.01);
    for (let i = 0; i < 12; i++) shares.set(`z${i}`, 0);
    const tiers = tiersFromShares(shares);
    // The block fills positions 18 to 29; its middle is 23.5, which is in the epic band (positions 23 to 26).
    expect(tiers.get('z0')).toBe('epic');
    expect(new Set([...Array(12).keys()].map((i) => tiers.get(`z${i}`))).size).toBe(1);

    // A block of 20 zeros out of 30 has its middle at position 19.5 and is rare; the old "start of the block" rule would have said uncommon.
    const mostlyZero = new Map<string, number>();
    for (let i = 0; i < 10; i++) mostlyZero.set(`a${i}`, 0.9 - i * 0.01);
    for (let i = 0; i < 20; i++) mostlyZero.set(`z${i}`, 0);
    expect(tiersFromShares(mostlyZero).get('z0')).toBe('rare');

    // The same block at the very bottom of a long list is legendary.
    const bottom = new Map<string, number>();
    for (let i = 0; i < 95; i++) bottom.set(`a${i}`, 0.9 - i * 0.005);
    for (let i = 0; i < 5; i++) bottom.set(`z${i}`, 0);
    expect(tiersFromShares(bottom).get('z0')).toBe('legendary');
  });

  it('does not depend on the order the animals are given in', () => {
    const entries = [...ranked(40)];
    const forward = tiersFromShares(new Map(entries));
    const backward = tiersFromShares(new Map([...entries].reverse()));
    expect(Object.fromEntries(backward)).toEqual(Object.fromEntries(forward));
  });

  it('gives no tiers when there are too few animals for percentiles to mean anything', () => {
    expect(tiersFromShares(ranked(MIN_SPECIES_FOR_BANDS - 1)).size).toBe(0);
    expect(tiersFromShares(ranked(MIN_SPECIES_FOR_BANDS)).size).toBe(MIN_SPECIES_FOR_BANDS);
    expect(tiersFromShares(new Map()).size).toBe(0);
    expect(tiersFromShares(ranked(5), { minSpecies: 5 }).size).toBe(5);
  });

  it('takes a plain object as well as a map', () => {
    expect(tiersFromShares(Object.fromEntries(ranked(25))).size).toBe(25);
  });
});

// ── The file ─────────────────────────────────────────────────────────────────

describe('building and reading the encounter file', () => {
  // 24 hand-written animals over 12 Indo-Pacific sites. Animal i (0 to 21) is recorded at the first
  // (i mod 12) + 1 sites, so sp11 is recorded at all 12. sp22 is recorded nowhere but listed as
  // notable at one site; sp23 is recorded nowhere and listed nowhere.
  const catalog = Array.from({ length: 24 }, (_, i) => ({ id: `sp${i}`, scientificName: `Genus species${i}` }));
  const sites: Record<string, SiteEncounters> = {};
  for (let s = 0; s < 12; s++) {
    const species: SiteEncounters['species'] = {};
    for (let i = 0; i < 22; i++) if (s <= i % 12) species[`sp${i}`] = { inaturalist: 4 };
    sites[`site${s}`] = site(9 + s * 0.01, 98, species, 60, 60);
  }
  const notableSites: NotableSite[] = [{ lat: 9, lng: 98, notableSpecies: ['sp22'] }];
  const base = { catalog, sites, notableSites, generatedAt: '2026-10-22T12:00:00.000Z', radiusKm: 5 };

  it('tiers or lists every catalogue animal, never both and never neither', () => {
    const { data } = buildEncounterData(base);
    const tiered = Object.keys(data.species);
    const listed = (data.unresolved ?? []).map((u) => u.id);
    expect([...tiered, ...listed].sort()).toEqual(catalog.map((s) => s.id).sort());
    expect(tiered).toHaveLength(23);
    // sp23 is recorded nowhere and listed nowhere as notable: unresolved, with the reason.
    expect(listed).toEqual(['sp23']);
    expect(data.unresolved?.find((u) => u.id === 'sp23')?.reason).toMatch(/none lists it as notable/);
    // sp22 is notable at a site and recorded nowhere: a real share of 0, the rarest.
    expect(data.species.sp22).toMatchObject({ share: 0, recordedAt: 0, sites: 12, tier: 'legendary' });
    expect(data.species.sp11).toMatchObject({ recordedAt: 12, sites: 12, share: 1, tier: 'common' });
    expect(data.species.sp0).toMatchObject({ recordedAt: 1, sites: 12 });
    expect(rarityRank(data.species.sp0.tier)).toBeGreaterThan(rarityRank(data.species.sp11.tier));
  });

  it('writes every field the app and the docs rely on', () => {
    const { data } = buildEncounterData({ ...base, input: 'saved.sites.json', sources: { inaturalist: { name: 'iNaturalist' } }, sourcesAsked: ['inaturalist', 'obis'] });
    expect(data).toMatchObject({ version: 1, generatedAt: '2026-10-22T12:00:00.000Z', input: 'saved.sites.json' });
    expect(data.sources).toEqual({ inaturalist: { name: 'iNaturalist' } });
    expect(data.method).toMatchObject({
      radiusKm: 5,
      sources: ['inaturalist', 'obis'],
      presence: 'either',
      minRecordsPerSite: 3,
      minSiteTaxa: 20,
      minSitesInWaters: 5,
      sitesAsked: 12,
      sitesUsed: 12,
      minSpecies: MIN_SPECIES_FOR_BANDS,
    });
    expect((data.method?.basins as { id: string }[]).map((basin) => basin.id)).toEqual([...BASIN_IDS]);
    expect(data.method?.bands).toEqual(RARITY_BANDS);
    expect((data.method?.sitesPerBasin as Record<string, number>)['tropical-indo-pacific']).toBe(12);
  });

  it('rounds the share to four places', () => {
    const odd: Record<string, SiteEncounters> = {};
    for (let s = 0; s < 7; s++) odd[`o${s}`] = site(9, 98, s < 3 ? { sp0: { inaturalist: 9 } } : {}, 60);
    const { data, shares } = buildEncounterData({ ...base, sites: odd, options: { minSites: 5 } });
    expect(shares.shares.get('sp0')?.share).toBe(3 / 7);
    // Fewer than 20 animals have a share here, so nothing is tiered; check the rounding on a bigger list.
    expect(data.species.sp0).toBeUndefined();
    const big = Array.from({ length: 30 }, (_, i) => ({ id: `b${i}`, scientificName: `Genus b${i}` }));
    const sevenSites: Record<string, SiteEncounters> = {};
    for (let s = 0; s < 7; s++) {
      const species: SiteEncounters['species'] = {};
      for (let i = 0; i < 30; i++) if (i === 0 ? s < 3 : s <= i % 7) species[`b${i}`] = { inaturalist: 9 };
      sevenSites[`o${s}`] = site(9, 98, species, 60);
    }
    expect(buildEncounterData({ ...base, catalog: big, sites: sevenSites }).data.species.b0.share).toBe(0.4286);
  });

  it('tiers nothing, and says why, when too few animals have a share', () => {
    const { data } = buildEncounterData({ ...base, catalog: catalog.slice(0, 10) });
    expect(Object.keys(data.species)).toEqual([]);
    expect(data.unresolved).toHaveLength(10);
    expect(data.unresolved?.[0].reason).toMatch(/Only 10 animals could be given a share, fewer than the 20/);
  });

  it('can be written with its tiers switched off, and says why', () => {
    const { data } = buildEncounterData({ ...base, notApplied: 'The sanity check failed.' });
    expect(data.applied).toBe(false);
    expect(data.notApplied).toBe('The sanity check failed.');
    const parsed = parseEncounterData(JSON.parse(JSON.stringify(data)));
    expect(parsed).not.toBeNull();
    expect(parsed && encounterTiersApplied(parsed)).toBe(false);
    expect(buildEncounterData(base).data.applied).toBeUndefined();
  });

  it('reads its own output back, whole', () => {
    const { data } = buildEncounterData(base);
    const parsed = parseEncounterData(JSON.parse(JSON.stringify(data)));
    expect(parsed).not.toBeNull();
    expect(parsed?.species).toEqual(data.species);
    expect(parsed && encounterTiersApplied(parsed)).toBe(true);
    expect(parsed?.unresolved).toEqual(data.unresolved);
  });

  it('applies a file only when it was generated and not switched off', () => {
    expect(encounterTiersApplied({ generatedAt: null, species: {} })).toBe(false);
    expect(encounterTiersApplied({ generatedAt: '2026-10-22T00:00:00.000Z', species: {} })).toBe(true);
    expect(encounterTiersApplied({ generatedAt: '2026-10-22T00:00:00.000Z', applied: false, species: {} })).toBe(false);
    expect(encounterTiersApplied({ generatedAt: null, applied: true, species: {} })).toBe(false);
  });

  it('accepts the empty shape that is checked in before the script has run', () => {
    expect(parseEncounterData({ generatedAt: null, species: {} })).toEqual({ generatedAt: null, species: {} });
    expect(parseEncounterData({ version: 1, generatedAt: null, species: {} })).not.toBeNull();
  });
});
