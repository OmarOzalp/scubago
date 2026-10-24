import { describe, expect, it } from '@jest/globals';

import {
  boundsToRegion,
  cellLatRange,
  cellWidth,
  CLOSE_ZOOM_LNG_DELTA,
  clusterSites,
  gridLevel,
  hasImportedSites,
  isImportedSite,
  MERGE_DISTANCE,
  spreadStackedSites,
  STACK_SPACING,
  type ClusterableSite,
  type MapRegion,
  type SiteCluster,
} from '@/lib/site-clusters';
import { seededRandom } from '@/lib/wash';

/**
 * Sites for these tests are generated here, never added to the app's data: dense knots like the
 * Red Sea's (Hurghada, Sharm el-Sheikh, Dahab) and the Great Barrier Reef's, and a thin scatter
 * round the world.
 */
function generateSites(count: number, seed = 7): ClusterableSite[] {
  const random = seededRandom(seed);
  // [lat, lng, spread in degrees, share of the sites]
  const knots: [string, number, number, number, number][] = [
    ['Hurghada', 27.2, 33.85, 0.35, 0.18],
    ['Sharm el-Sheikh', 27.85, 34.3, 0.3, 0.18],
    ['Dahab', 28.5, 34.5, 0.2, 0.12],
    ['Marsa Alam', 25.1, 34.9, 0.4, 0.07],
    ['Cairns', -16.7, 146.0, 0.8, 0.15],
    ['Whitsundays', -20.1, 148.9, 0.8, 0.12],
  ];
  const sites: ClusterableSite[] = [];
  for (let i = 0; i < count; i++) {
    const pick = random();
    let share = 0;
    const knot = knots.find(([, , , , s]) => (share += s) > pick);
    if (knot) {
      const [region, lat, lng, spread] = knot;
      sites.push({ id: `gen-${i}`, lat: lat + (random() - 0.5) * 2 * spread, lng: lng + (random() - 0.5) * 2 * spread, region });
    } else {
      sites.push({ id: `gen-${i}`, lat: (random() - 0.5) * 120, lng: (random() - 0.5) * 360, region: 'Elsewhere' });
    }
  }
  return sites;
}

const WORLD: MapRegion = { latitude: 0, longitude: 0, latitudeDelta: 180, longitudeDelta: 360 };
const region = (latitude: number, longitude: number, longitudeDelta: number, latitudeDelta = longitudeDelta * 1.5): MapRegion => ({
  latitude, longitude, latitudeDelta, longitudeDelta,
});
const ids = (clusters: SiteCluster[]) => clusters.flatMap((c) => c.siteIds).sort();
/** The region as a plain box, for the sites a diver can see in it. */
const inView = (s: ClusterableSite, r: MapRegion) =>
  Math.abs(s.lat - r.latitude) <= r.latitudeDelta / 2 && Math.abs(s.lng - r.longitude) <= r.longitudeDelta / 2;

describe('gridLevel and cellWidth', () => {
  it('sizes the cells from the width of the region, in steps that halve', () => {
    expect(gridLevel(360)).toBe(2);
    expect(gridLevel(80)).toBe(4);
    expect(gridLevel(10)).toBe(7);
    expect(gridLevel(0.1)).toBe(14);
    expect(cellWidth(gridLevel(80))).toBeCloseTo(22.5, 6);
    // Each cell is between 1/5 and 2/5 of the region's width, so on a phone about 70–140 pt.
    for (const delta of [0.05, 0.3, 1, 7, 33, 80, 200, 360]) {
      const cell = cellWidth(gridLevel(delta));
      expect(cell).toBeGreaterThanOrEqual(delta / 5 - 1e-12);
      expect(cell).toBeLessThan((delta * 2) / 5 + 1e-12);
    }
  });

  it('survives a region that makes no sense', () => {
    expect(gridLevel(NaN)).toBe(gridLevel(360));
    expect(gridLevel(0)).toBeGreaterThan(20);
    expect(gridLevel(1e9)).toBe(gridLevel(360));
  });
});

describe('clusterSites', () => {
  const sites = generateSites(600);

  it('never loses or repeats a site: every site is in exactly one cluster, whatever the zoom', () => {
    expect(sites).toHaveLength(600);
    for (const delta of [360, 120, 40, 9, 2.5]) {
      const clusters = clusterSites(sites, region(0, 0, delta, 180));
      const all = ids(clusters);
      expect(new Set(all).size).toBe(all.length);
      expect(clusters.reduce((n, c) => n + c.count, 0)).toBe(all.length);
      if (delta >= 120) expect(all).toEqual(sites.map((s) => s.id).sort());
    }
    // Where the region is only part of the world, every site in view is in a cluster, once.
    for (const r of [region(27.7, 34.2, 6), region(27.2, 33.85, 0.4), region(-18, 147.5, 9), region(28.5, 34.5, 0.06)]) {
      const clusters = clusterSites(sites, r);
      const all = ids(clusters);
      expect(new Set(all).size).toBe(all.length);
      for (const s of sites.filter((s) => inView(s, r))) expect(all).toContain(s.id);
    }
  });

  it('makes a cluster of a cell with two or more sites, and a lone site stays itself', () => {
    const near = [
      { id: 'a', lat: 27.2001, lng: 33.8001, region: 'Hurghada' },
      { id: 'b', lat: 27.2002, lng: 33.8002, region: 'Hurghada' },
      { id: 'far', lat: 12, lng: 100, region: 'Thai' },
    ];
    const clusters = clusterSites(near, WORLD);
    const group = clusters.find((c) => c.count === 2);
    expect(group).toMatchObject({ siteIds: ['a', 'b'], place: 'Hurghada' });
    expect(group?.lat).toBeCloseTo(27.20015, 6);
    expect(group?.lng).toBeCloseTo(33.80015, 6);
    expect(group?.bounds).toEqual({ south: 27.2001, west: 33.8001, north: 27.2002, east: 33.8002 });
    expect(group?.id).toMatch(/^cluster:\d+:\d+:-?\d+$/);
    const lone = clusters.find((c) => c.siteIds[0] === 'far');
    expect(lone).toMatchObject({ id: 'far', count: 1, lat: 12, lng: 100, place: 'Thai' });
  });

  it('shows every site on its own at close zoom', () => {
    // Forty sites inside about a kilometre (a Hurghada inshore reef), in among the generated ones:
    // clusters from out here, a pin each up close.
    const random = seededRandom(21);
    const dense = Array.from({ length: 40 }, (_, i) => ({ id: `dense-${i}`, lat: 27.2 + (random() - 0.5) * 0.008, lng: 33.85 + (random() - 0.5) * 0.008, region: 'Hurghada' }));
    const knot = [...generateSites(600).filter((s) => Math.abs(s.lat - 27.2) < 0.2 && Math.abs(s.lng - 33.85) < 0.2), ...dense];
    const far = clusterSites(knot, region(27.2, 33.85, 0.1));
    expect(far.some((c) => c.count > 5)).toBe(true);
    const close = clusterSites(knot, region(27.2, 33.85, CLOSE_ZOOM_LNG_DELTA));
    expect(close.every((c) => c.count === 1)).toBe(true);
    for (const c of close) expect(c.id).toBe(c.siteIds[0]);
    // The close pins are every site in the padded view, none lost, none twice.
    const padded = region(27.2, 33.85, CLOSE_ZOOM_LNG_DELTA * 3, CLOSE_ZOOM_LNG_DELTA * 4.5);
    const shown = ids(close);
    expect(new Set(shown).size).toBe(shown.length);
    expect(shown.filter((id) => id.startsWith('dense-'))).toHaveLength(40);
    for (const s of knot.filter((s) => inView(s, padded))) expect(shown).toContain(s.id);
    // Just past the threshold the same sites are grouped again.
    expect(clusterSites(knot, region(27.2, 33.85, CLOSE_ZOOM_LNG_DELTA * 1.3)).some((c) => c.count > 1)).toBe(true);
    // Two sites 30 m apart are still two pins at close zoom, and one cluster from far out.
    const pair = [{ id: 'p', lat: 27.2, lng: 33.8 }, { id: 'q', lat: 27.20027, lng: 33.8 }];
    expect(clusterSites(pair, region(27.2, 33.8, 0.012)).map((c) => c.count)).toEqual([1, 1]);
    expect(clusterSites(pair, region(27.2, 33.8, 20)).map((c) => c.count)).toEqual([2]);
  });

  it('keeps the same cells while the map is panned, so clusters keep their ids, counts and centroids', () => {
    const random = seededRandom(99);
    let compared = 0;
    for (const delta of [20, 5, 1.2, 0.3, 0.08]) {
      const base = region(27.4, 34.0, delta);
      const before = clusterSites(sites, base);
      for (let i = 0; i < 12; i++) {
        // A pan of up to a third of the screen in any direction, at the same zoom.
        const panned = { ...base, latitude: base.latitude + (random() - 0.5) * base.latitudeDelta * 0.66, longitude: base.longitude + (random() - 0.5) * base.longitudeDelta * 0.66 };
        const after = new Map(clusterSites(sites, panned).map((c) => [c.id, c]));
        for (const c of before) {
          // What is in view in both is the same cluster in both.
          if (!inView({ id: c.id, lat: c.lat, lng: c.lng }, base) || !inView({ id: c.id, lat: c.lat, lng: c.lng }, panned)) continue;
          expect(after.get(c.id)).toEqual(c);
          compared++;
        }
      }
    }
    expect(compared).toBeGreaterThan(100);
  });

  it('does not depend on where the sites sit in the list', () => {
    const r = region(27.7, 34.2, 6);
    const reversed = [...sites].reverse();
    const shuffled = [...sites].sort((a, b) => ((a.id.length * 7919 + a.lat) % 13) - ((b.id.length * 7919 + b.lat) % 13));
    const expected = clusterSites(sites, r);
    expect(clusterSites(reversed, r)).toEqual(expected);
    expect(clusterSites(shuffled, r)).toEqual(expected);
  });

  it('puts each site in one cell: a cluster fits inside its cell and its centroid inside its bounds', () => {
    const level = gridLevel(9);
    // (The grid alone: the merge pass below can join cells.)
    for (const c of clusterSites(sites, region(-18, 147.5, 9), { mergeDistance: 0 }).filter((c) => c.count > 1)) {
      const [, l, column, row] = c.id.split(':').map(Number);
      expect(l).toBe(level);
      const west = -180 + column * cellWidth(level);
      const { south, north } = cellLatRange(level, row);
      expect(c.bounds.west).toBeGreaterThanOrEqual(west - 1e-9);
      expect(c.bounds.east).toBeLessThanOrEqual(west + cellWidth(level) + 1e-9);
      expect(c.bounds.south).toBeGreaterThanOrEqual(south - 1e-9);
      expect(c.bounds.north).toBeLessThanOrEqual(north + 1e-9);
      expect(c.lat).toBeGreaterThanOrEqual(c.bounds.south);
      expect(c.lat).toBeLessThanOrEqual(c.bounds.north);
      expect(c.lng).toBeGreaterThanOrEqual(c.bounds.west);
      expect(c.lng).toBeLessThanOrEqual(c.bounds.east);
    }
  });

  it('names a cluster for its commonest region, and ties go to the first alphabetically', () => {
    const mixed = [
      { id: '1', lat: 10, lng: 10, region: 'Zulu Sea' },
      { id: '2', lat: 10.001, lng: 10.001, region: 'Alpha Sea' },
      { id: '3', lat: 10.002, lng: 10.002, region: 'Zulu Sea' },
      { id: '4', lat: 10.003, lng: 10.003 },
    ];
    expect(clusterSites(mixed, WORLD)).toMatchObject([{ count: 4, place: 'Zulu Sea' }]);
    expect(clusterSites(mixed.slice(0, 2), WORLD)).toMatchObject([{ count: 2, place: 'Alpha Sea' }]);
  });

  it('leaves out sites with no usable position and copes with a bad region', () => {
    const bad = [
      { id: 'nan', lat: NaN, lng: 5 },
      { id: 'inf', lat: 5, lng: Infinity },
      { id: 'pole', lat: 95, lng: 5 },
      { id: 'fine', lat: 5, lng: 5 },
    ];
    expect(ids(clusterSites(bad, WORLD))).toEqual(['fine']);
    expect(ids(clusterSites(sites, { latitude: NaN, longitude: NaN, latitudeDelta: 0, longitudeDelta: -3 }))).toBeDefined();
    expect(clusterSites([], WORLD)).toEqual([]);
  });

  describe('the antimeridian', () => {
    const fiji = [
      { id: 'east-1', lat: -16.8, lng: 179.9, region: 'Taveuni' },
      { id: 'east-2', lat: -16.81, lng: 179.95, region: 'Taveuni' },
      { id: 'west-1', lat: -16.82, lng: -179.9, region: 'Taveuni' },
      { id: 'west-2', lat: -16.83, lng: -179.95, region: 'Taveuni' },
      { id: 'tonga', lat: -21.1, lng: -175.2, region: 'Tonga' },
      { id: 'samoa', lat: -13.8, lng: -172.1, region: 'Samoa' },
    ];

    it('never averages the two sides into a cluster on the other side of the world', () => {
      for (const delta of [360, 90, 30, 8, 2, 0.5]) {
        for (const c of clusterSites(fiji, region(-16.8, 180, delta))) {
          if (c.count > 1) expect(Math.abs(c.lng)).toBeGreaterThan(170);
          // A cluster never reaches across the line: its sites are all east of it or all west of it.
          expect(c.bounds.west * c.bounds.east).toBeGreaterThan(0);
          expect(c.bounds.east - c.bounds.west).toBeLessThanOrEqual(cellWidth(gridLevel(delta)));
        }
      }
    });

    it('shows sites on both sides when the region is centred on the line', () => {
      for (const centre of [179, 180, -180, -179.5]) {
        const all = ids(clusterSites(fiji, region(-16.8, centre, 4)));
        expect(all).toEqual(expect.arrayContaining(['east-1', 'east-2', 'west-1', 'west-2']));
      }
      // From the Tongan side as well.
      expect(ids(clusterSites(fiji, region(-18, -178, 12)))).toEqual(expect.arrayContaining(['east-1', 'west-1', 'tonga']));
    });

    it('reads a region from Android across the line, whose width comes out negative', () => {
      // react-native-maps on Android gives longitudeDelta as the east edge minus the west: 6° from 177°E to 177°W is -354.
      const android: MapRegion = { latitude: -16.8, longitude: 180, latitudeDelta: 9, longitudeDelta: -177 - 177 };
      const clusters = clusterSites(fiji, android);
      expect(ids(clusters)).toEqual(expect.arrayContaining(['east-1', 'east-2', 'west-1', 'west-2']));
      expect(clusters).toEqual(clusterSites(fiji, { ...android, longitudeDelta: 6 }));
      // A tap on a cluster there still zooms in: to at most half the view's real width.
      expect(boundsToRegion({ south: -17, west: 170, north: -16, east: 179.9 }, { within: android }).longitudeDelta).toBe(3);
    });

    it('does not show the far side of the world', () => {
      // A 4° region is padded by 4° each side: Tonga (4.8° over the line) is in, Samoa (7.9°) is not.
      const all = ids(clusterSites([...fiji, { id: 'red-sea', lat: 27, lng: 34 }], region(-16.8, 180, 4)));
      expect(all).not.toContain('red-sea');
      expect(all).not.toContain('samoa');
      expect(all).toContain('tonga');
    });
  });

  it('clusters 600 sites in a fraction of a frame', () => {
    expect(sites).toHaveLength(600);
    const regions = [WORLD, region(12, 100, 80), region(27.7, 34.2, 6), region(-18, 147.5, 9), region(27.2, 33.85, 0.3), region(28.5, 34.5, 0.02)];
    for (const r of regions) clusterSites(sites, r); // warm up
    const runs = 300;
    const start = performance.now();
    for (let i = 0; i < runs; i++) clusterSites(sites, regions[i % regions.length]);
    const each = (performance.now() - start) / runs;
    // About 0.1 ms here; the bar is 10× that, so a slow CI machine passes and a quadratic version doesn't.
    expect(each).toBeLessThan(2);
    // And a few thousand sites are no different in kind.
    const many = generateSites(5000, 11);
    const t = performance.now();
    clusterSites(many, WORLD);
    expect(performance.now() - t).toBeLessThan(100);
  });
});

describe('boundsToRegion', () => {
  it('frames the bounds with a margin, and never closer than the close-zoom width', () => {
    const r = boundsToRegion({ south: 27, west: 33, north: 27.2, east: 33.4 });
    expect(r.latitude).toBeCloseTo(27.1, 9);
    expect(r.longitude).toBeCloseTo(33.2, 9);
    expect(r.latitudeDelta).toBeCloseTo(0.3, 9);
    expect(r.longitudeDelta).toBeCloseTo(0.6, 9);
    const point = boundsToRegion({ south: 27, west: 33, north: 27, east: 33 });
    expect(point.longitudeDelta).toBeLessThan(CLOSE_ZOOM_LNG_DELTA);
    expect(point.latitudeDelta).toBeLessThan(CLOSE_ZOOM_LNG_DELTA);
  });

  it('makes every tap on a cluster land on a finer grid, until its sites stand alone', () => {
    const sites = generateSites(600);
    const start = region(27.7, 34.2, 8);
    for (const tapped of clusterSites(sites, start).filter((c) => c.count > 1).slice(0, 12)) {
      let current = tapped;
      let view = start;
      for (let taps = 0; taps < 30 && current.count > 1; taps++) {
        const zoomed = boundsToRegion(current.bounds, { within: view });
        // At most half the width of the view it came from, so a finer step of the ladder, even for a merged cluster.
        expect(zoomed.longitudeDelta).toBeLessThanOrEqual(view.longitudeDelta / 2 + 1e-12);
        expect(gridLevel(zoomed.longitudeDelta)).toBeGreaterThan(gridLevel(view.longitudeDelta));
        view = zoomed;
        // Follow the same sites into the new view: the biggest cluster that holds any of them.
        const next = clusterSites(sites, zoomed).filter((c) => c.siteIds.some((id) => current.siteIds.includes(id)));
        expect(next.length).toBeGreaterThan(0);
        current = next.reduce((a, b) => (b.count > a.count ? b : a));
      }
      expect(current.count).toBe(1);
    }
  });

  it('frames the cluster when that is already closer than half the view', () => {
    const bounds = { south: 27, west: 33, north: 27.2, east: 33.4 };
    const r = boundsToRegion(bounds, { within: region(27, 33, 20) });
    expect(r.longitudeDelta).toBeCloseTo(0.6, 9);
    expect(boundsToRegion(bounds, { within: region(27, 33, 0.8, 0.8) }).longitudeDelta).toBeCloseTo(0.4, 9);
  });
});

/** Distance on the flat map the screen shows: degrees of longitude, and Mercator y in the same degrees. */
const mercatorDegrees = (lat: number) => (Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * 180) / Math.PI;
const apart = (a: SiteCluster, b: SiteCluster) => Math.hypot(a.lng - b.lng, mercatorDegrees(a.lat) - mercatorDegrees(b.lat));
const closestPair = (clusters: SiteCluster[]) => {
  let best = Infinity;
  for (let i = 0; i < clusters.length; i++) for (let j = i + 1; j < clusters.length; j++) best = Math.min(best, apart(clusters[i], clusters[j]));
  return best;
};

describe('the merge pass', () => {
  const sites = generateSites(600);
  // Not at close zoom, where nothing is grouped.
  const views = [
    WORLD, region(12, 100, 80, 60), region(27.4, 34, 12), region(27.4, 34, 3), region(27.4, 34, 1.2), region(27.2, 33.85, 0.4),
    region(27.2, 33.85, 0.1), region(27.2, 33.85, 0.04), region(28.5, 34.5, 0.02), region(-18, 147.5, 9), region(-18, 147.5, 2), region(-16.7, 146, 0.3),
  ];

  it('leaves no two markers closer than a marker apart, which the grid alone does', () => {
    let overlapsBefore = 0;
    for (const view of views) {
      const threshold = MERGE_DISTANCE * cellWidth(gridLevel(view.longitudeDelta));
      expect(closestPair(clusterSites(sites, view))).toBeGreaterThanOrEqual(threshold);
      if (closestPair(clusterSites(sites, view, { mergeDistance: 0 })) < threshold) overlapsBefore++;
    }
    // The check means something: without the pass, most of these views have pairs that close.
    expect(overlapsBefore).toBeGreaterThan(5);
    // And randomly placed views, all of them.
    const random = seededRandom(1234);
    for (let i = 0; i < 80; i++) {
      const at = sites[Math.floor(random() * sites.length)];
      const delta = Math.exp(Math.log(0.02) + random() * (Math.log(120) - Math.log(0.02)));
      const view = region(at.lat, at.lng, delta);
      if (delta <= CLOSE_ZOOM_LNG_DELTA) continue;
      expect(closestPair(clusterSites(sites, view))).toBeGreaterThanOrEqual(MERGE_DISTANCE * cellWidth(gridLevel(delta)));
    }
  });

  it('conserves the counts: the same sites, each once, whether or not clusters were merged', () => {
    for (const view of views) {
      const grid = clusterSites(sites, view, { mergeDistance: 0 });
      const merged = clusterSites(sites, view);
      expect(ids(merged)).toEqual(ids(grid));
      expect(merged.reduce((n, c) => n + c.count, 0)).toBe(grid.reduce((n, c) => n + c.count, 0));
      expect(merged.every((c) => c.count === c.siteIds.length)).toBe(true);
      expect(merged.length).toBeLessThanOrEqual(grid.length);
      expect(new Set(merged.map((c) => c.id)).size).toBe(merged.length);
    }
  });

  it('is deterministic, whatever the order the sites come in', () => {
    for (const view of views) {
      const expected = clusterSites(sites, view);
      expect(clusterSites(sites, view)).toEqual(expected);
      expect(clusterSites([...sites].reverse(), view)).toEqual(expected);
      expect(clusterSites([...sites].sort((a, b) => (a.id < b.id ? -1 : 1)), view)).toEqual(expected);
    }
  });

  it('keeps what is on screen the same while panning', () => {
    const random = seededRandom(77);
    let compared = 0;
    for (const delta of [20, 5, 1.2, 0.3, 0.08]) {
      const base = region(27.4, 34.0, delta);
      const before = clusterSites(sites, base);
      for (let i = 0; i < 12; i++) {
        const panned = { ...base, latitude: base.latitude + (random() - 0.5) * base.latitudeDelta * 0.66, longitude: base.longitude + (random() - 0.5) * base.longitudeDelta * 0.66 };
        const after = new Map(clusterSites(sites, panned).map((c) => [c.id, c]));
        for (const c of before) {
          const there = { id: c.id, lat: c.lat, lng: c.lng };
          if (!inView(there, base) || !inView(there, panned)) continue;
          expect(after.get(c.id)).toEqual(c);
          compared++;
        }
      }
    }
    expect(compared).toBeGreaterThan(100);
  });

  it('joins a lone site to a cluster in the next cell, and the larger one keeps its id', () => {
    // Level 2: cells 90° wide, with a cell edge at 90°E. The cluster is just west of it, the site just east.
    const near = [
      { id: 'a1', lat: 10, lng: 89.9, region: 'West' },
      { id: 'a2', lat: 10.1, lng: 89.8, region: 'West' },
      { id: 'b', lat: 10, lng: 90.3, region: 'East' },
    ];
    const grid = clusterSites(near, WORLD, { mergeDistance: 0 });
    expect(grid.map((c) => c.count).sort()).toEqual([1, 2]);
    const [only] = clusterSites(near, WORLD);
    expect(clusterSites(near, WORLD)).toHaveLength(1);
    expect(only.count).toBe(3);
    expect(only.id).toBe(grid.find((c) => c.count === 2)?.id);
    expect(only.siteIds).toEqual(['a1', 'a2', 'b']);
    expect(only.lat).toBeCloseTo((10 + 10.1 + 10) / 3, 9);
    expect(only.lng).toBeCloseTo((89.9 + 89.8 + 90.3) / 3, 9);
    expect(only.bounds).toEqual({ south: 10, west: 89.8, north: 10.1, east: 90.3 });
    expect(only.place).toBe('West');
  });

  it('merges two lone sites into a cluster named for the one that sorts first', () => {
    const pair = [{ id: 'zeta', lat: 10, lng: 89.9 }, { id: 'alpha', lat: 10, lng: 90.1 }];
    expect(clusterSites(pair, WORLD, { mergeDistance: 0 }).map((c) => c.count)).toEqual([1, 1]);
    const merged = clusterSites(pair, WORLD);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: 'cluster:site:alpha', count: 2, siteIds: ['alpha', 'zeta'] });
  });

  it('merges nothing that is far enough apart, nothing at close zoom, and nothing across the antimeridian', () => {
    const far = [{ id: 'p', lat: 10, lng: 10 }, { id: 'q', lat: 10, lng: -100 }];
    expect(clusterSites(far, WORLD).map((c) => c.count)).toEqual([1, 1]);
    const stacked = [{ id: 'p', lat: 27.2, lng: 33.8 }, { id: 'q', lat: 27.20002, lng: 33.80002 }];
    expect(clusterSites(stacked, region(27.2, 33.8, 0.01)).map((c) => c.count)).toEqual([1, 1]);
    expect(clusterSites(stacked, region(27.2, 33.8, 0.5)).map((c) => c.count)).toEqual([2]);
    // 0.02° apart, but on opposite sides of the line.
    const line = [{ id: 'east', lat: -16.8, lng: 179.99 }, { id: 'west', lat: -16.8, lng: -179.99 }];
    expect(clusterSites(line, region(-16.8, 180, 30)).map((c) => c.count)).toEqual([1, 1]);
    expect(clusterSites(line, WORLD).map((c) => c.count)).toEqual([1, 1]);
  });

  it('goes on until no pair is close: a merge that moves a centroid can bring a third cluster into reach', () => {
    // World view (cells 90°, reach 54°). L: five sites west of 0°. M: three sites 50° east of them.
    // N: four sites 41° south of M, 65° from L, out of reach. L takes M first (N sorts before M, but
    // is out of reach), which pulls L's centroid to 13.75°, 52° from N: the next pass joins N too.
    const at = (prefix: string, count: number, lat: number, lng: number) => Array.from({ length: count }, (_, i) => ({ id: `${prefix}${i}`, lat, lng, region: prefix }));
    const all = [...at('l', 5, 0.05, -5), ...at('m', 3, 0.05, 45), ...at('n', 4, -38, 45)];
    expect(clusterSites(all, WORLD, { mergeDistance: 0 }).map((c) => c.count).sort()).toEqual([3, 4, 5]);
    const merged = clusterSites(all, WORLD);
    expect(merged.map((c) => c.count)).toEqual([12]);
    expect(merged[0].place).toBe('l');
    expect(closestPair(clusterSites(all, WORLD))).toBe(Infinity);
  });

  it('is still quick: 600 sites merged in a fraction of a frame', () => {
    const run = [WORLD, region(12, 100, 80, 60), region(27.4, 34, 12), region(27.2, 33.85, 0.4), region(27.2, 33.85, 0.04), region(-18, 147.5, 9)];
    for (const r of run) clusterSites(sites, r);
    const runs = 300;
    const start = performance.now();
    for (let i = 0; i < runs; i++) clusterSites(sites, run[i % run.length]);
    expect((performance.now() - start) / runs).toBeLessThan(2);
    const many = generateSites(5000, 11);
    const t = performance.now();
    clusterSites(many, WORLD);
    clusterSites(many, region(27.4, 34, 12));
    expect(performance.now() - t).toBeLessThan(200);
  });
});

describe('sites on one spot', () => {
  const spot = { lat: 23.61863, lng: 36.20377 };
  const stacked = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `stack-${String(i).padStart(2, '0')}`, ...spot, region: 'Zabargad' }));
  const view = (longitudeDelta: number) => region(spot.lat, spot.lng, longitudeDelta);
  /** How far apart two drawn positions are on screen, in degrees of longitude. */
  const onScreen = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => Math.hypot(a.lng - b.lng, mercatorDegrees(a.lat) - mercatorDegrees(b.lat));

  it('draws each a pin’s width from the others and from the spot, close round it, at any close zoom', () => {
    for (const n of [2, 5, 12]) {
      for (const delta of [CLOSE_ZOOM_LNG_DELTA, 0.004, 0.0005]) {
        const clusters = clusterSites([...stacked(n), { id: 'alone', lat: spot.lat + delta / 4, lng: spot.lng, region: 'Zabargad' }], view(delta));
        const spread = spreadStackedSites(clusters, view(delta));
        expect([...spread.keys()].sort()).toEqual(stacked(n).map((s) => s.id));
        const at = [...spread.values()];
        const gap = STACK_SPACING * delta;
        for (let i = 0; i < at.length; i++) {
          expect(onScreen(at[i], spot)).toBeGreaterThanOrEqual(gap * 0.999);
          expect(onScreen(at[i], spot)).toBeLessThan(gap * Math.max(1, n / 5) * 1.2);
          for (let j = i + 1; j < at.length; j++) expect(onScreen(at[i], at[j])).toBeGreaterThanOrEqual(gap * 0.999);
        }
      }
    }
  });

  it('leaves lone sites and clusters where they are, whatever order they come in, and reads an Android region', () => {
    const sites = [...stacked(5), { id: 'alone', lat: 23.7, lng: 36.3 }];
    expect(spreadStackedSites(clusterSites(sites, WORLD), WORLD).size).toBe(0);
    const close = view(0.0075);
    const spread = spreadStackedSites(clusterSites(sites, close), close);
    expect(spread.has('alone')).toBe(false);
    expect(spreadStackedSites(clusterSites([...sites].reverse(), close), close)).toEqual(spread);
    // North first, then clockwise.
    expect(spread.get('stack-00')).toMatchObject({ lng: spot.lng });
    expect(spread.get('stack-00')!.lat).toBeGreaterThan(spot.lat);
    expect(spread.get('stack-01')!.lng).toBeGreaterThan(spot.lng);
    // The width as Android reports it across 180° is read as the real one.
    const fiji = stacked(3).map((s) => ({ ...s, lat: -16.8, lng: 179.999 }));
    const across: MapRegion = { latitude: -16.8, longitude: 180, latitudeDelta: 0.01, longitudeDelta: 0.0075 - 360 };
    for (const p of spreadStackedSites(clusterSites(fiji, across), across).values()) expect(Math.abs(p.lng)).toBeGreaterThan(179.99);
  });
});

describe('imported sites', () => {
  const site = (id: string, sources?: { fields: never[]; source: string }[]) => ({ id, sources });

  it('knows a site from the OpenStreetMap import by its id or by its source', () => {
    expect(isImportedSite(site('osm-node-123'))).toBe(true);
    expect(isImportedSite(site('osm-way-9'))).toBe(true);
    expect(isImportedSite(site('named-by-osm', [{ fields: [], source: 'OpenStreetMap contributors' }]))).toBe(true);
    expect(isImportedSite(site('richelieu-rock'))).toBe(false);
    expect(isImportedSite(site('richelieu-rock', [{ fields: [], source: 'Some dive centre' }]))).toBe(false);
    expect(isImportedSite(site('my-osmosis-reef'))).toBe(false);
  });

  it('asks for the credit only when one of the sites is imported', () => {
    expect(hasImportedSites([])).toBe(false);
    expect(hasImportedSites([site('a'), site('site-1234')])).toBe(false);
    expect(hasImportedSites([site('a'), site('osm-node-1')])).toBe(true);
  });
});
