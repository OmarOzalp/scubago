import { describe, expect, it } from '@jest/globals';

import { SITES } from '@/data/sites';
import { SPECIES } from '@/data/species';
import { UNLISTED_ID } from '@/lib/catalog';
import {
  BASINS,
  BASIN_IDS,
  DEFAULT_CELL_KM,
  DEFAULT_ENCOUNTER_OPTIONS,
  MIN_RECORDS_PER_SITE,
  MIN_SITES_IN_WATERS,
  MIN_SITE_TAXA,
  MIN_SPECIES_FOR_BANDS,
  RARITY_BANDS,
  bandCounts,
  basinOf,
  buildEncounterData,
  distanceKm,
  encounterShares,
  groupIntoCells,
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
    // Tropical Indo-Pacific, without the Red Sea (the Coral Triangle among it)
    ['Richelieu Rock, Thailand', 9.36, 98.02, 'tropical-indo-pacific'],
    ['Maaya Thila, Maldives', 3.94, 72.87, 'tropical-indo-pacific'],
    ['Raja Ampat, Indonesia', -0.56, 130.69, 'tropical-indo-pacific'],
    ['Sipadan, Malaysia', 4.11, 118.63, 'tropical-indo-pacific'],
    ['Palau', 7.13, 134.22, 'tropical-indo-pacific'],
    ['Lembeh Strait, Indonesia (Coral Triangle)', 1.45, 125.24, 'tropical-indo-pacific'],
    ['Anilao, Philippines (Coral Triangle)', 13.69, 120.88, 'tropical-indo-pacific'],
    ['Komodo, Indonesia (Coral Triangle)', -8.53, 119.6, 'tropical-indo-pacific'],
    ['Maaya Thila, Maldives (Western Indian Ocean)', 3.94, 72.87, 'tropical-indo-pacific'],
    ['Djibouti, Gulf of Aden', 11.6, 43.15, 'tropical-indo-pacific'],
    ['Aden, Yemen, Gulf of Aden', 12.8, 45, 'tropical-indo-pacific'],
    ['Socotra, Yemen', 12.5, 54, 'tropical-indo-pacific'],
    ['Salalah, Oman', 17, 54.1, 'tropical-indo-pacific'],
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
    // Red Sea, with the Gulfs of Suez and Aqaba
    ['Ras Mohammed, Sinai', 27.72, 34.26, 'red-sea'],
    ['Sharm el-Sheikh, Sinai', 27.85, 34.3, 'red-sea'],
    ['Dahab Blue Hole, Gulf of Aqaba', 28.57, 34.54, 'red-sea'],
    ['Eilat, Gulf of Aqaba', 29.5, 34.93, 'red-sea'],
    ['Aqaba, Jordan', 29.52, 35, 'red-sea'],
    ['Suez, Gulf of Suez', 29.97, 32.55, 'red-sea'],
    ['Ras Gharib, Gulf of Suez', 28.35, 33.1, 'red-sea'],
    ['Hurghada, Egypt', 27.2, 33.9, 'red-sea'],
    ['Safaga, Egypt', 26.75, 33.97, 'red-sea'],
    ['Elphinstone Reef, Egypt', 25.3, 34.86, 'red-sea'],
    ['Marsa Alam, Egypt', 25.07, 34.9, 'red-sea'],
    ['Daedalus Reef, Egypt', 24.93, 35.87, 'red-sea'],
    ['Brothers Islands, Egypt', 26.31, 34.85, 'red-sea'],
    ['St Johns Reef, Egypt', 23.25, 36.2, 'red-sea'],
    ['Sanganeb, Port Sudan', 19.73, 37.44, 'red-sea'],
    ['Dahlak Archipelago, Eritrea', 15.7, 40.2, 'red-sea'],
    ['Duba, Saudi Arabia', 27.35, 35.7, 'red-sea'],
    ['Jeddah, Saudi Arabia', 21.5, 39.17, 'red-sea'],
    ['Farasan Islands, Saudi Arabia', 16.7, 41.9, 'red-sea'],
    ['Perim Island, Bab-el-Mandeb', 12.65, 43.4, 'red-sea'],
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

  describe('the Red Sea, its own province', () => {
    it('keeps the land and the neighbouring seas out of it', () => {
      const notRedSea: [string, number, number, BasinId][] = [
        ['Luxor, on the Nile', 25.7, 32.65, 'tropical-indo-pacific'],
        ['Lake Nasser', 22.3, 31.9, 'tropical-indo-pacific'],
        ['Cairo', 30.04, 31.24, 'temperate-north-atlantic'],
        ['Medina, Saudi Arabia', 24.5, 39.6, 'tropical-indo-pacific'],
        ['Asmara, Eritrea', 15.3, 38.9, 'tropical-indo-pacific'],
        ['Obock, Gulf of Aden', 11.97, 43.3, 'tropical-indo-pacific'],
        ['Port Said, Mediterranean', 31.26, 32.3, 'temperate-north-atlantic'],
        ['Dead Sea', 31.5, 35.5, 'temperate-north-atlantic'],
      ];
      for (const [, lat, lng, basin] of notRedSea) expect(basinOf(lat, lng)).toBe(basin);
    });

    it('stops at Bab-el-Mandeb (12.5 N): just north is the Red Sea, just south is the Gulf of Aden', () => {
      expect(basinOf(12.51, 43.4)).toBe('red-sea');
      expect(basinOf(12.49, 43.4)).toBe('tropical-indo-pacific');
    });

    it('stops at 30.2 N: Suez and the head of the Gulf of Aqaba are in, the Mediterranean coast is out', () => {
      expect(basinOf(30.1, 32.5)).toBe('red-sea');
      expect(basinOf(30.3, 32.5)).toBe('temperate-north-atlantic');
    });

    it('holds every Egyptian dive site we have (SITES, seeds and imported), and no site of any other country', () => {
      const egypt = SITES.filter((site) => site.country === 'Egypt');
      expect(egypt.length).toBeGreaterThan(200);
      for (const site of egypt) expect(basinOf(site.lat, site.lng)).toBe('red-sea');
      for (const site of SITES.filter((other) => other.country !== 'Egypt')) expect(basinOf(site.lat, site.lng)).not.toBe('red-sea');
    });

    it('names itself so the species page can say "Red Sea dive sites"', () => {
      const redSea = BASINS.find((basin) => basin.id === 'red-sea');
      expect(redSea?.short).toBe('Red Sea');
      expect(redSea?.rule).toMatch(/Gulf of Aden is not in it/);
      expect(BASINS.find((basin) => basin.id === 'tropical-indo-pacific')?.name).toMatch(/without the Red Sea/);
    });
  });
});

// ── Cells ────────────────────────────────────────────────────────────────────

describe('grouping dive sites into cells (the optional analysis)', () => {
  // The cell of each point, as "same" or "different" for a pair.
  const sameCell = (a: [number, number], b: [number, number], cellKm?: number) => {
    const cells = groupIntoCells([{ lat: a[0], lng: a[1] }, { lat: b[0], lng: b[1] }], cellKm);
    return cells[0] === cells[1];
  };
  const hurghada: [number, number] = [27.22, 33.83];

  it('links sites within 10 km, twice the 5 km search radius', () => {
    expect(DEFAULT_CELL_KM).toBe(10);
  });

  it('puts two sites 3 km apart in one cell, wherever they are', () => {
    expect(distanceKm(27.22, 33.83, 27.247, 33.83)).toBeCloseTo(3, 0);
    expect(sameCell(hurghada, [27.247, 33.83])).toBe(true); // 3 km north
    expect(sameCell(hurghada, [27.22, 33.86])).toBe(true); // 3 km east
    expect(sameCell([-14.66, 145.64], [-14.66, 145.66])).toBe(true); // the Cod Hole and its neighbour
    expect(sameCell([0.02, 100.02], [0.02, 100.047])).toBe(true); // on the equator
    expect(sameCell([60.02, 10.02], [60.02, 10.075])).toBe(true); // at 60 N
    expect(sameCell([-17, 179.99], [-17, -179.99])).toBe(true); // 2 km apart across the antimeridian
  });

  it('puts two sites 30 km apart in two cells', () => {
    expect(distanceKm(27.22, 33.83, 27.49, 33.83)).toBeCloseTo(30, 0);
    expect(sameCell(hurghada, [27.49, 33.83])).toBe(false);
    expect(sameCell(hurghada, [27.22, 34.13])).toBe(false);
    expect(sameCell([60.02, 10.02], [60.02, 10.56])).toBe(false);
  });

  it('never splits a pair within 10 km, and never joins two points more than 10 km from every other, at any bearing or latitude', () => {
    let seed = 7;
    const random = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    let split = 0;
    let joined = 0;
    for (let i = 0; i < 2000; i++) {
      const lat = -70 + random() * 140;
      const lng = -180 + random() * 360;
      const bearing = random() * 2 * Math.PI;
      const at = (km: number): [number, number] => [lat + (km * Math.cos(bearing)) / 111.195, lng + (km * Math.sin(bearing)) / (111.195 * Math.cos((lat * Math.PI) / 180))];
      if (!sameCell([lat, lng], at(9.5))) split += 1;
      if (sameCell([lat, lng], at(10.5))) joined += 1;
    }
    expect(split).toBe(0);
    expect(joined).toBe(0);
  });

  it('chains: sites each 8 km from the next are one cell however long the line, and a 11 km gap breaks it', () => {
    // Along a meridian: 0.072 degrees of latitude is 8.0 km.
    const line = Array.from({ length: 12 }, (_, i) => ({ lat: 10 + i * 0.072, lng: 120 }));
    expect(new Set(groupIntoCells(line)).size).toBe(1); // 11 steps, 88 km, one cell
    const broken = [...line.slice(0, 6), ...line.slice(6).map((point) => ({ ...point, lat: point.lat + 0.03 }))]; // 8 km + 3.3 km = 11.3 km at the break
    expect(new Set(groupIntoCells(broken)).size).toBe(2);
    expect(new Set(groupIntoCells(line, 5)).size).toBe(12); // with a 5 km reach none of them link
  });

  it('does not depend on the order of the points, and gives equal numbers to one cell', () => {
    const points = [
      { lat: 27.22, lng: 33.83 }, { lat: 27.25, lng: 33.83 }, { lat: 27.31, lng: 33.83 }, // a chain of 3 km and 6.7 km steps
      { lat: 28.5, lng: 34.5 }, { lat: 28.52, lng: 34.5 },
      { lat: -8.5, lng: 119.6 },
    ];
    const cells = groupIntoCells(points);
    expect(new Set(cells).size).toBe(3);
    expect(cells[0]).toBe(cells[2]);
    expect(cells[3]).toBe(cells[4]);
    expect(cells[0]).not.toBe(cells[3]);
    const order = [5, 3, 0, 4, 2, 1];
    const shuffled = groupIntoCells(order.map((i) => points[i]));
    // The same partition: two points share a cell in one if and only if they do in the other.
    for (let a = 0; a < order.length; a++) for (let b = 0; b < order.length; b++) expect(shuffled[a] === shuffled[b]).toBe(cells[order[a]] === cells[order[b]]);
  });

  it('takes a reach in km, and handles no points and one point', () => {
    expect(sameCell(hurghada, [27.49, 33.83], 50)).toBe(true); // 30 km apart, 50 km reach
    expect(sameCell(hurghada, [27.247, 33.83], 1)).toBe(false); // 3 km apart, 1 km reach
    expect(groupIntoCells([])).toEqual([]);
    expect(groupIntoCells([{ lat: 1, lng: 2 }])).toEqual([0]);
  });

  it('measures great-circle distance, across the antimeridian and the poles as well', () => {
    expect(distanceKm(0, 0, 0, 1)).toBeCloseTo(111.2, 0);
    expect(distanceKm(-17, 179.9, -17, -179.9)).toBeCloseTo(21.3, 0);
    expect(distanceKm(89.9, 0, 89.9, 180)).toBeCloseTo(22.2, 0);
    expect(distanceKm(10, 20, 10, 20)).toBe(0);
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

describe('the share of the dive sites in an animal’s waters that record it', () => {
  // Six Indo-Pacific places (a, b, c, d, e, f: each far from the rest) and five Caribbean ones (g..k).
  // "star" is recorded at three Indo-Pacific places, "ray" at one Indo-Pacific and two Caribbean ones,
  // "fish" nowhere. Each site counts (the default); `cells` turns the cell grouping on.
  const rec = (n = 5) => ({ inaturalist: n });
  const small = {};
  const cells = { cellKm: DEFAULT_CELL_KM };
  const sites: Record<string, SiteEncounters> = {
    a: site(9, 98, { star: rec(), ray: rec() }),
    b: site(4, 73, { star: rec() }),
    c: site(-8.5, 119.6, { star: rec() }),
    d: site(7, 134, {}),
    e: site(23.6, 58.6, {}),
    f: site(-14, 145, {}),
    g: site(20.3, -87, { ray: rec() }),
    h: site(12, -68, { ray: rec() }),
    i: site(17, -87, {}),
    j: site(19, -81, {}),
    k: site(25, -80, {}),
  };
  const catalog = [{ id: 'star' }, { id: 'ray' }, { id: 'fish' }, { id: 'ghost' }, { id: UNLISTED_ID }];

  it('is the used sites that record it over the used sites in its waters', () => {
    const { shares } = encounterShares(catalog, sites, [], small);
    expect(shares.get('star')).toEqual({ share: 0.5, sites: 6, recordedAt: 3, basins: ['tropical-indo-pacific'] });
    // "ray" lives in two basins, so its waters hold all eleven sites.
    expect(shares.get('ray')).toEqual({ share: 3 / 11, sites: 11, recordedAt: 3, basins: ['tropical-indo-pacific', 'tropical-west-atlantic'] });
  });

  it('counts every dive site by default, and a place once however many dive sites it holds with cells on', () => {
    // Hurghada-style: ten dive sites within 3 km of each other, three of which record "star", beside three lone places.
    const crowded: Record<string, SiteEncounters> = { ...sites };
    for (let i = 0; i < 10; i++) crowded[`hurghada${i}`] = site(-30.3 + i * 0.002, 153.1, i < 3 ? { star: rec() } : {});
    for (const id of ['a', 'b', 'c']) delete crowded[id]; // star is now recorded only at the crowded place
    const result = encounterShares(catalog, crowded, [], small);
    expect(result.usedSites).toBe(18);
    expect(result.basinSites['tropical-indo-pacific']).toBe(13);
    // Sites are the unit: 3 of 13, and the crowded place weighs ten times a lone one.
    expect(result.shares.get('star')).toEqual({ share: 3 / 13, sites: 13, recordedAt: 3, basins: ['tropical-indo-pacific'] });
    expect(result.usedCells).toBe(18); // off: every site is a cell of its own

    // With cells, the crowded place is one: 1 of 4. Four cells are below the minimum of 5, so say so first.
    const grouped = encounterShares(catalog, crowded, [], cells);
    expect(grouped.basinCells['tropical-indo-pacific']).toBe(4); // d, e, f and the crowded place
    expect(grouped.usedCells).toBe(9);
    expect(grouped.shares.has('star')).toBe(false);
    expect(grouped.unresolved.get('star')).toMatch(/Only 4 usable dive areas \(cells of sites within 10 km\) in its waters \(Indo-Pacific\); at least 5 are needed/);
    expect(encounterShares(catalog, crowded, [], { ...cells, minSites: 4 }).shares.get('star')).toEqual({ share: 0.25, sites: 4, recordedAt: 1, basins: ['tropical-indo-pacific'] });
    // Spread the same ten sites 30 km apart and each is its own place again, with cells on or off.
    const spread: Record<string, SiteEncounters> = { ...crowded };
    for (let i = 0; i < 10; i++) spread[`hurghada${i}`] = site(-30.3 + i * 0.3, 153.1, i < 3 ? { star: rec() } : {});
    expect(encounterShares(catalog, spread, [], cells).shares.get('star')).toMatchObject({ sites: 13, recordedAt: 3 });
    expect(encounterShares(catalog, spread, [], small).shares.get('star')).toMatchObject({ sites: 13, recordedAt: 3 });
  });

  it('with cells on, counts an animal in a cell when any used site in it records it', () => {
    const shared: Record<string, SiteEncounters> = { ...sites };
    // Two more sites 2 km from "d", neither of which records "star", and one that does.
    shared.d2 = site(7.01, 134, {});
    shared.d3 = site(7.0, 134.015, { star: rec() });
    const { shares, usedSites } = encounterShares(catalog, shared, [], cells);
    expect(usedSites).toBe(13);
    // d, d2 and d3 are one place, and it records star through d3: 4 recorded of 6.
    expect(shares.get('star')).toMatchObject({ sites: 6, recordedAt: 4 });
    // Counted by site, the same records are 4 of 8.
    expect(encounterShares(catalog, shared, [], small).shares.get('star')).toMatchObject({ sites: 8, recordedAt: 4 });
  });

  it('does not let a site that was left out make or break a cell', () => {
    const thin: Record<string, SiteEncounters> = { ...sites, thin: site(9.01, 98.01, { star: rec(), fish: rec() }, 5) };
    const base = encounterShares(catalog, sites, [], small).shares.get('star');
    expect(encounterShares(catalog, thin, [], small).shares.get('star')).toEqual(base);
    // And a thin site alone in a place does not make a cell.
    const alone: Record<string, SiteEncounters> = { ...sites, lonely: site(-40, 20, {}, 5) };
    expect(encounterShares(catalog, alone, [], small).basinCells['temperate-southern']).toBe(0);
  });

  it('never gives the unlisted id a share', () => {
    const result = encounterShares(catalog, sites, [], small);
    expect(result.shares.has(UNLISTED_ID)).toBe(false);
    expect(result.unresolved.has(UNLISTED_ID)).toBe(false);
  });

  it('takes the basins of the sites that list an animal as notable, even where the data records none', () => {
    const notable: NotableSite[] = [{ lat: 20, lng: -87, notableSpecies: ['star', 'fish'] }];
    const { shares } = encounterShares(catalog, sites, notable, small);
    // "star" is notable in the Caribbean, so its waters are both basins and it is recorded in 3 of 11 places.
    expect(shares.get('star')).toMatchObject({ sites: 11, recordedAt: 3, basins: ['tropical-indo-pacific', 'tropical-west-atlantic'] });
    // "fish" is recorded nowhere but notable there: a real share of 0 over the Caribbean places.
    expect(shares.get('fish')).toEqual({ share: 0, sites: 5, recordedAt: 0, basins: ['tropical-west-atlantic'] });
  });

  it('leaves an animal with no waters unresolved, and says why', () => {
    const { shares, unresolved } = encounterShares(catalog, sites, [], small);
    expect(shares.has('ghost')).toBe(false);
    expect(unresolved.get('ghost')).toMatch(/none lists it as notable/);
    expect(unresolved.get('fish')).toMatch(/where its waters are/);
  });

  it('requires a minimum number of sites in its waters, else keeps the catalogue tier', () => {
    expect(MIN_SITES_IN_WATERS).toBe(5);
    expect(DEFAULT_ENCOUNTER_OPTIONS.minSites).toBe(MIN_SITES_IN_WATERS);
    const four = { ...sites };
    for (const id of ['d', 'e']) delete four[id]; // four Indo-Pacific sites left
    const { shares, unresolved } = encounterShares([{ id: 'star' }], four);
    expect(shares.has('star')).toBe(false);
    expect(unresolved.get('star')).toMatch(/Only 4 usable dive sites in its waters \(Indo-Pacific\); at least 5 are needed/);
    // A lower minimum accepts it, a higher one rejects six.
    expect(encounterShares([{ id: 'star' }], four, [], { minSites: 4 }).shares.get('star')).toMatchObject({ sites: 4, recordedAt: 3 });
    expect(encounterShares([{ id: 'star' }], sites, [], { minSites: 6 }).shares.get('star')).toBeDefined();
    expect(encounterShares([{ id: 'star' }], sites, [], { minSites: 7 }).shares.has('star')).toBe(false);
  });

  it('accepts exactly the minimum, in sites or in cells', () => {
    const places = (count: number) => {
      const many: Record<string, SiteEncounters> = {};
      for (let i = 0; i < count; i++) many[`p${i}`] = site(-10 + i * 0.5, 120, i < 2 ? { star: rec() } : {}); // 0.5 degrees = 55 km apart
      return many;
    };
    expect(encounterShares([{ id: 'star' }], places(4)).unresolved.get('star')).toMatch(/Only 4 usable dive sites/);
    expect(encounterShares([{ id: 'star' }], places(5)).shares.get('star')).toEqual({ share: 2 / 5, sites: 5, recordedAt: 2, basins: ['tropical-indo-pacific'] });
    // Twenty dive sites in four places are four places with cells on, twenty sites without.
    const clustered: Record<string, SiteEncounters> = {};
    for (let i = 0; i < 20; i++) clustered[`c${i}`] = site(-10 + Math.floor(i / 5) * 0.5 + (i % 5) * 0.003, 120, { star: rec() });
    expect(encounterShares([{ id: 'star' }], clustered).shares.get('star')).toMatchObject({ sites: 20, recordedAt: 20 });
    expect(encounterShares([{ id: 'star' }], clustered, [], cells).unresolved.get('star')).toMatch(/Only 4 usable dive areas/);
    // Five places of four are five cells, enough.
    const five: Record<string, SiteEncounters> = {};
    for (let i = 0; i < 20; i++) five[`c${i}`] = site(-10 + Math.floor(i / 4) * 0.5 + (i % 4) * 0.003, 120, { star: rec() });
    expect(encounterShares([{ id: 'star' }], five, [], cells).shares.get('star')).toMatchObject({ sites: 5, recordedAt: 5 });
  });

  it('does not count a notable basin that holds no used site', () => {
    const notable: NotableSite[] = [{ lat: 64, lng: -21, notableSpecies: ['fish'] }]; // Iceland: no used site
    const { shares, unresolved } = encounterShares(catalog, sites, notable, small);
    expect(shares.has('fish')).toBe(false);
    expect(unresolved.get('fish')).toMatch(/North Atlantic.*no dive site with enough records/);
  });

  it('uses only sites that listed enough taxa, and says which it left out', () => {
    expect(MIN_SITE_TAXA).toBe(20);
    const mixed = { ...sites, thin: site(9.2, 98.1, { star: rec() }, 5), none: { lat: 9, lng: 98, species: {} } as SiteEncounters, bad: site(95, 0, {}) };
    const result = encounterShares(catalog, mixed, [], small);
    expect(result.usedSites).toBe(11);
    expect(result.skippedSites.map((skipped) => skipped.id).sort()).toEqual(['bad', 'none', 'thin']);
    expect(result.skippedSites.find((skipped) => skipped.id === 'thin')?.reason).toMatch(/Only 5 taxa.*fewer than the 20/);
    expect(result.skippedSites.find((skipped) => skipped.id === 'none')?.reason).toMatch(/did not answer/);
    expect(result.skippedSites.find((skipped) => skipped.id === 'bad')?.reason).toMatch(/not on Earth/);
    // The thin site recorded "star" but is not in its share.
    expect(result.shares.get('star')).toMatchObject({ sites: 6, recordedAt: 3 });
    expect(result.basinSites['tropical-indo-pacific']).toBe(6);
    expect(result.basinSites['tropical-west-atlantic']).toBe(5);
    expect(result.basinCells['tropical-west-atlantic']).toBe(5);
    expect(result.basinSites['temperate-southern']).toBe(0);
    expect(result.usedCells).toBe(11);
    // A lower bar lets it in. It is 22 km from "a", a place of its own, and it records "star".
    const lowBar = encounterShares(catalog, mixed, [], { ...small, minSiteTaxa: 5 });
    expect(lowBar.usedSites).toBe(12);
    expect(lowBar.shares.get('star')).toMatchObject({ sites: 7, recordedAt: 4 });
  });

  it('follows the presence source', () => {
    const two: Record<string, SiteEncounters> = {};
    for (let i = 0; i < 6; i++) two[`s${i}`] = site(9 + i * 0.5, 98, { star: i < 2 ? { inaturalist: 4 } : i < 5 ? { obis: 9 } : {} }, 40, 40);
    expect(encounterShares([{ id: 'star' }], two, [], { ...small, presence: 'either' }).shares.get('star')?.recordedAt).toBe(5);
    expect(encounterShares([{ id: 'star' }], two, [], { ...small, presence: 'inaturalist' }).shares.get('star')?.recordedAt).toBe(2);
    expect(encounterShares([{ id: 'star' }], two, [], { ...small, presence: 'obis' }).shares.get('star')?.recordedAt).toBe(3);
  });

  it('takes a map as well as an object, and gives nothing from nothing', () => {
    const asMap = new Map(Object.entries(sites));
    expect(encounterShares(catalog, asMap, [], small).shares.get('star')?.share).toBe(0.5);
    const empty = encounterShares(catalog, {});
    expect(empty.shares.size).toBe(0);
    expect(empty.usedSites).toBe(0);
    expect(empty.usedCells).toBe(0);
    expect(empty.unresolved.size).toBe(4);
  });

  it('gives its defaults', () => {
    expect(DEFAULT_ENCOUNTER_OPTIONS).toEqual({ presence: 'either', minRecords: 3, minSiteTaxa: 20, minSites: 5, cellKm: 0 }); // cells are off
  });

  describe('with the Red Sea as its own province', () => {
    // Eight Indo-Pacific places, and ten Red Sea places (Hurghada to the Brothers: far enough apart to be ten cells).
    // "tang" lives in the Indo-Pacific only, as the palette surgeonfish does: recorded at 4 of the 8 places
    // and at none of the Red Sea ones. "idol" lives in both and is recorded at 4 Indo-Pacific and 4 Red Sea places.
    const indoPacific = [[9, 98], [4, 73], [-8.5, 119.6], [7, 134], [-14, 145], [1.45, 125.24], [13.69, 120.88], [-0.56, 130.69]];
    const redSea = Array.from({ length: 10 }, (_, i) => [28.4 - i * 0.35, 33.5 + i * 0.3]);
    const world: Record<string, SiteEncounters> = {};
    indoPacific.forEach(([lat, lng], i) => (world[`ip${i}`] = site(lat, lng, { ...(i < 4 ? { tang: rec() } : {}), ...(i < 4 ? { idol: rec() } : {}) })));
    redSea.forEach(([lat, lng], i) => (world[`rs${i}`] = site(lat, lng, i < 4 ? { idol: rec() } : {})));
    const animals = [{ id: 'tang' }, { id: 'idol' }];
    const options = { minSites: 8 };

    it('puts those sites in the Red Sea and the rest in the Indo-Pacific', () => {
      const result = encounterShares(animals, world, [], options);
      expect(result.basinCells['red-sea']).toBe(10);
      expect(result.basinCells['tropical-indo-pacific']).toBe(8);
    });

    it('leaves an animal that is not recorded in the Red Sea out of its waters, so the Red Sea does not make it look rare', () => {
      const { shares } = encounterShares(animals, world, [], options);
      // Half of the eight Indo-Pacific places. With the Red Sea's ten places in its waters (the old rule, one
      // Indo-Pacific province) it would be 4 of 18 and read as rare.
      expect(shares.get('tang')).toEqual({ share: 0.5, sites: 8, recordedAt: 4, basins: ['tropical-indo-pacific'] });
    });

    it('counts the Red Sea in the waters of an animal recorded there', () => {
      const { shares } = encounterShares(animals, world, [], options);
      expect(shares.get('idol')).toEqual({ share: 8 / 18, sites: 18, recordedAt: 8, basins: ['tropical-indo-pacific', 'red-sea'] });
    });

    it('counts a cell cut by the province line once in each province', () => {
      // 2 km apart, one each side of the Red Sea’s north edge (30.2 N): one cell by distance, two provinces.
      const edge: Record<string, SiteEncounters> = {
        red: site(30.19, 32.5, { tang: rec() }),
        med: site(30.21, 32.5, {}),
      };
      expect(basinOf(30.19, 32.5)).toBe('red-sea');
      expect(basinOf(30.21, 32.5)).toBe('temperate-north-atlantic');
      expect(groupIntoCells([{ lat: 30.19, lng: 32.5 }, { lat: 30.21, lng: 32.5 }])).toEqual([0, 0]);
      const result = encounterShares(animals, edge, [], { minSites: 1, cellKm: 10 });
      expect(result.basinCells['red-sea']).toBe(1);
      expect(result.basinCells['temperate-north-atlantic']).toBe(1);
      expect(result.usedCells).toBe(2);
    });

    it('does not let a chain of sites cross a province line', () => {
      // Sites 6 km apart from the Gulf of Aden into the Red Sea (12.5 N): the chain is cut in two by the province.
      const chain: Record<string, SiteEncounters> = {};
      for (let i = 0; i < 6; i++) chain[`c${i}`] = site(12.3 + i * 0.054, 43.4, {});
      const result = encounterShares(animals, chain, [], { minSites: 1, cellKm: 10 });
      expect(result.basinSites['tropical-indo-pacific'] + result.basinSites['red-sea']).toBe(6);
      expect(result.basinCells['tropical-indo-pacific']).toBe(1);
      expect(result.basinCells['red-sea']).toBe(1);
    });
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
  // 24 hand-written animals over 12 Indo-Pacific places, half a degree (55 km) apart so each is its own
  // cell. Animal i (0 to 21) is recorded at the first (i mod 12) + 1 places, so sp11 is recorded at all
  // 12. sp22 is recorded nowhere but listed as notable at one site; sp23 is recorded nowhere and listed
  // nowhere.
  const catalog = Array.from({ length: 24 }, (_, i) => ({ id: `sp${i}`, scientificName: `Genus species${i}` }));
  const sites: Record<string, SiteEncounters> = {};
  for (let s = 0; s < 12; s++) {
    const species: SiteEncounters['species'] = {};
    for (let i = 0; i < 22; i++) if (s <= i % 12) species[`sp${i}`] = { inaturalist: 4 };
    sites[`site${s}`] = site(9 + s * 0.5, 98, species, 60, 60);
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
      cellKm: 0,
      sitesAsked: 12,
      sitesUsed: 12,
      minSpecies: MIN_SPECIES_FOR_BANDS,
    });
    expect(data.method).not.toHaveProperty('cellsUsed'); // cells are off
    expect((data.method?.basins as { id: string }[]).map((basin) => basin.id)).toEqual([...BASIN_IDS]);
    expect(data.method?.bands).toEqual(RARITY_BANDS);
    expect((data.method?.sitesPerBasin as Record<string, number>)['tropical-indo-pacific']).toBe(12);
    expect((data.method?.sitesPerBasin as Record<string, number>)['red-sea']).toBe(0);
    expect(data.method?.summary).toMatch(/used sites in its waters/);
  });

  it('counts sites by default, and places with cells on: many sites in one cell are one', () => {
    // The same 12 places, each with three more dive sites within 3.4 km in a line (1.1 km apart): 12 + 36 = 48 sites, 12 places.
    const dense: Record<string, SiteEncounters> = { ...sites };
    for (let s = 0; s < 12; s++) for (let extra = 1; extra <= 3; extra++) dense[`site${s}x${extra}`] = site(9 + s * 0.5 + extra * 0.01, 98, sites[`site${s}`].species, 60, 60);
    const bySite = buildEncounterData({ ...base, sites: dense });
    expect(bySite.data.method).toMatchObject({ sitesAsked: 48, sitesUsed: 48, cellKm: 0 });
    expect(bySite.data.species.sp0).toMatchObject({ sites: 48, recordedAt: 4 });

    const byCell = buildEncounterData({ ...base, sites: dense, options: { cellKm: 10 } });
    expect(byCell.data.method).toMatchObject({ sitesAsked: 48, sitesUsed: 48, cellKm: 10, cellsUsed: 12, minSitesInWaters: 5 });
    expect(byCell.data.species.sp11).toMatchObject({ share: 1, sites: 12, recordedAt: 12 }); // `sites` and `recordedAt` count cells now
    expect(byCell.data.species.sp0).toMatchObject({ sites: 12, recordedAt: 1 });
    expect(byCell.data.method?.largestCell).toEqual({ sites: 4, spanKm: 3 }); // the biggest cell holds 4 sites over 3.3 km
    expect(byCell.data.method?.widestCell).toEqual({ sites: 4, spanKm: 3 });
    expect((byCell.data.method?.cellsPerBasin as Record<string, number>)['tropical-indo-pacific']).toBe(12);
    expect(byCell.data.species).toEqual(buildEncounterData(base).data.species); // the same file as with one site per place
    expect(byCell.data.method?.summary).toMatch(/cells of sites within cellKm/);
  });

  it('lists every animal as unresolved, with the count, when the minimum is higher than the sites it has', () => {
    const { data } = buildEncounterData({ ...base, options: { minSites: 13 } });
    expect(data.method).toMatchObject({ minSitesInWaters: 13 });
    expect(Object.keys(data.species)).toEqual([]);
    expect(data.unresolved).toHaveLength(24);
    expect(data.unresolved?.find((u) => u.id === 'sp3')?.reason).toMatch(/Only 12 usable dive sites in its waters \(Indo-Pacific\); at least 13 are needed/);
  });

  it('rounds the share to four places', () => {
    const odd: Record<string, SiteEncounters> = {};
    for (let s = 0; s < 7; s++) odd[`o${s}`] = site(9 + s * 0.5, 98, s < 3 ? { sp0: { inaturalist: 9 } } : {}, 60);
    const { data, shares } = buildEncounterData({ ...base, sites: odd });
    expect(shares.shares.get('sp0')?.share).toBe(3 / 7);
    // Fewer than 20 animals have a share here, so nothing is tiered; check the rounding on a bigger list.
    expect(data.species.sp0).toBeUndefined();
    const big = Array.from({ length: 30 }, (_, i) => ({ id: `b${i}`, scientificName: `Genus b${i}` }));
    const sevenSites: Record<string, SiteEncounters> = {};
    for (let s = 0; s < 7; s++) {
      const species: SiteEncounters['species'] = {};
      for (let i = 0; i < 30; i++) if (i === 0 ? s < 3 : s <= i % 7) species[`b${i}`] = { inaturalist: 9 };
      sevenSites[`o${s}`] = site(9 + s * 0.5, 98, species, 60);
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
