import { OSM_SOURCE_NAME } from '@/lib/site-import';
import type { DiveSite } from '@/lib/types';

/**
 * Grouping dive sites into clusters for the map (components/site-map.tsx).
 *
 * With ~470 sites, and dozens of them within a few kilometres of each other at Hurghada, Sharm
 * el-Sheikh and Dahab, one native marker per site is too many pins and too many views. Zoomed out,
 * sites that share a cell of a grid become one cluster with a count; zoomed in, every site shows on
 * its own.
 *
 * Everything here is pure and cheap (one pass over the sites, no allocation per cell beyond the
 * cluster itself), because it runs on every region change.
 *
 * The grid
 * - **Sized from the region.** The cell width is the width of the visible region divided by about
 *   `CELLS_ACROSS`, rounded to the next size in a ladder of 360° / 2^k (a quadtree, as slippy-map
 *   tiles are), so a cell is never narrower than 1/5 of the screen and never wider than 2/5: on
 *   a phone, 70 to 140 pt, about the 100 pt cells of Google's own grid clusterer. The
 *   region's `longitudeDelta` is what sizes it: on a map of fixed width it stays the same while
 *   panning, whereas `latitudeDelta` drifts with latitude (Mercator), which would resize the cells
 *   as you pan. `latitudeDelta` sets how far up and down the clusters are worked out.
 * - **Anchored to the world.** Cell edges are at multiples of the cell width counted from 180°W, and
 *   rows are counted in Mercator space, so a cell is as tall on screen as it is wide, whatever
 *   the latitude. A site's cell depends only on the zoom ladder step, never on where the viewport
 *   is, so panning at one zoom never regroups the sites: the same cluster keeps the same id, count
 *   and centroid, and the map's markers aren't re-created.
 * - **Nested.** Each step of the ladder halves the cells, so zooming in splits a cluster into
 *   clusters (never regroups it across the old edges), apart from the merge below.
 *
 * The merge pass
 * Two neighbouring cells can have centroids a few points apart (a cluster hugging each side of an
 * edge), and their roundels pile on top of each other. So after the grid step, any two clusters
 * (or lone sites) whose centroids are closer than `MERGE_DISTANCE` of a cell, about one marker
 * diameter, are merged: greedily, largest first (count, then id), the larger absorbing the smaller,
 * repeated until no pair is that close. The result is that no two markers are closer than that.
 * Trade-offs:
 * - A merged cluster takes the id of its largest part (a lone site that absorbs another becomes
 *   `cluster:site:<id>`), its centroid is the mean of all its sites, its bounds the union, and
 *   `place` is the largest part's. A merge can span cells, so a cluster's bounds may be wider than
 *   one cell, and zooming in no longer splits it exactly along the old cell edges
 *   (`boundsToRegion` takes the current region to make sure each tap still zooms in).
 * - Pan stability is a little weaker than the grid alone: the grid is the same wherever the view
 *   is, but a merge depends on the neighbours in the area worked out, and a cluster at the far edge
 *   of that area (a screen from the view) can group differently as the area slides. A cluster in
 *   view decides from clusters at most a few cells away, well inside the padding, so what is on
 *   screen stays put while panning.
 * - Distances are measured in the plane the screen shows (longitude, and Mercator y), and never
 *   across the antimeridian, so the merge can't join the two sides of it.
 *
 * The antimeridian
 * Longitude 180° is the edge between the last cell and the first at every level of the ladder, so
 * no cell ever straddles it and a centroid never averages 179° with -179°. A cluster of Fiji sites
 * on each side shows as two clusters, one each side of the line, where a hand-drawn grouping might
 * show one; that is accepted. What does cross it is the visible region (a map centred on 179°E
 * shows -178°), and `clusterSites` wraps the region's columns to take both sides in.
 */

/** A visible map region, as react-native-maps gives it (a `Region`). */
export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

/** What clustering needs of a site (`DiveSite` fits). */
export type ClusterableSite = Pick<DiveSite, 'id' | 'lat' | 'lng'> & Partial<Pick<DiveSite, 'region'>>;

export interface SiteBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface SiteCluster {
  /**
   * The site's own id for a lone site; for a group `cluster:<level>:<column>:<row>` (its cell), or
   * that of the largest part it was merged from (`cluster:site:<id>` if that was a lone site).
   * Stable while panning.
   */
  id: string;
  /** How many sites it stands for; 1 means the site itself. */
  count: number;
  /** The mean position of its sites. */
  lat: number;
  lng: number;
  /** The box around its sites, to zoom to (see `boundsToRegion`). */
  bounds: SiteBounds;
  /** Its sites' ids, in id order. */
  siteIds: string[];
  /** The region most of its sites are in ("Hurghada & Safaga, Red Sea"), for a screen reader; after a merge, the largest part's. */
  place: string;
}

/** Between this many and half as many cells fit across the screen (the cell width steps in halves, so it can't be exact). */
export const CELLS_ACROSS = 5;
/**
 * At or below this width of the visible region (degrees of longitude: about 1.7 km at the equator,
 * roughly zoom level 15 on a phone) every site shows on its own: no cluster at this zoom, or any
 * closer, is wanted. Sites 100 m apart are about 20 pt apart there.
 */
export const CLOSE_ZOOM_LNG_DELTA = 0.015;
/** The finest step of the ladder: cells of about 2 m. */
const MAX_LEVEL = 24;
/** Web Mercator stops here; so do the rows. */
const MAX_LAT = 85.0511287798;
/** How much of the world around the visible region is worked out too, in regions each side, so a pan starts with its pins in place. */
export const VIEWPORT_PADDING = 1;

const RAD = Math.PI / 180;
const clamp = (n: number, min: number, max: number) => (n < min ? min : n > max ? max : n);

/** A longitude in [-180, 180). */
function wrapLng(lng: number): number {
  if (lng >= -180 && lng < 180) return lng; // already in range: no rounding drift
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

/** Mercator y of a latitude (radians; ±π at the poles' limit). */
function mercatorY(lat: number): number {
  return Math.log(Math.tan(Math.PI / 4 + (clamp(lat, -MAX_LAT, MAX_LAT) * RAD) / 2));
}

/** The latitude (degrees) of a Mercator y. */
function latFromMercatorY(y: number): number {
  return (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / RAD;
}

/**
 * How wide a region is, in degrees of longitude. react-native-maps on Android gives the east edge
 * minus the west, which is negative when the view crosses the antimeridian (177°E to 177°W comes
 * out as -354, for 6°).
 */
function lngWidth(longitudeDelta: number): number {
  return longitudeDelta < 0 ? longitudeDelta + 360 : longitudeDelta;
}

/** A usable region: finite numbers, a latitude on the globe, deltas between a hair and the whole world. */
function sanitize(region: MapRegion): MapRegion {
  const finite = (n: number, fallback: number) => (Number.isFinite(n) ? n : fallback);
  return {
    latitude: clamp(finite(region.latitude, 0), -90, 90),
    longitude: wrapLng(finite(region.longitude, 0)),
    latitudeDelta: clamp(finite(region.latitudeDelta, 180), 1e-7, 180),
    longitudeDelta: clamp(lngWidth(finite(region.longitudeDelta, 360)), 1e-7, 360),
  };
}

/**
 * The step of the grid ladder for a region: cells are 360° / 2^level wide, the narrowest that is
 * still at least `longitudeDelta / cellsAcross`. Whole world → level 2 (90° cells); a phone showing
 * the Red Sea (10°) → 7 (2.8°); a harbour (0.1°) → 14 (0.022°).
 */
export function gridLevel(longitudeDelta: number, cellsAcross: number = CELLS_ACROSS): number {
  const delta = clamp(Number.isFinite(longitudeDelta) ? longitudeDelta : 360, 1e-7, 360);
  return clamp(Math.floor(Math.log2((360 * cellsAcross) / delta)), 0, MAX_LEVEL);
}

/** How wide (degrees of longitude) the cells are at a ladder step. */
export const cellWidth = (level: number): number => 360 / 2 ** level;

export interface ClusterOptions {
  /** Cells across the screen; see `CELLS_ACROSS`. */
  cellsAcross?: number;
  /** Width of the region (degrees of longitude) at or below which nothing is clustered. */
  closeZoomLngDelta?: number;
  /** Regions of padding to work out around the visible one, each side. */
  padding?: number;
  /** Clusters closer than this many cells are merged (see `MERGE_DISTANCE`); 0 leaves the grid as it is. */
  mergeDistance?: number;
}

/**
 * The clusters to draw for a region: one per grid cell that holds two or more sites, one per lone
 * site, for the cells in and around the region. At or below `closeZoomLngDelta` every site in view
 * is its own cluster of one. Sites with no usable position are left out. The order is fixed (north
 * to south, then west to east) and doesn't depend on the order of `sites`.
 */
export function clusterSites(sites: readonly ClusterableSite[], region: MapRegion, options: ClusterOptions = {}): SiteCluster[] {
  const {
    cellsAcross = CELLS_ACROSS,
    closeZoomLngDelta = CLOSE_ZOOM_LNG_DELTA,
    padding = VIEWPORT_PADDING,
    mergeDistance = MERGE_DISTANCE,
  } = options;
  const view = sanitize(region);
  const level = gridLevel(view.longitudeDelta, cellsAcross);
  const columns = 2 ** level;
  const width = cellWidth(level);
  const rowHeight = width * RAD; // radians of Mercator y: the same angle as the width, so cells are square
  const rowOffset = columns; // rows run -columns/2 … columns/2; shifted to stay positive
  const stride = 2 * columns + 1;

  // The cells to work out: the padded region's rows, and its columns (which wrap past the antimeridian).
  const halfLat = (view.latitudeDelta / 2) * (1 + 2 * padding);
  const halfLng = (view.longitudeDelta / 2) * (1 + 2 * padding);
  const rowSouth = Math.floor(mercatorY(view.latitude - halfLat) / rowHeight);
  const rowNorth = Math.floor(mercatorY(view.latitude + halfLat) / rowHeight);
  const allColumns = halfLng * 2 >= 360;
  const west = wrapLng(view.longitude - halfLng);
  const firstColumn = Math.floor((west + 180) / width);
  const columnSpan = allColumns ? columns : Math.floor((west + 2 * halfLng + 180) / width) - firstColumn + 1;
  const closeZoom = view.longitudeDelta <= closeZoomLngDelta;

  const cells = new Map<number, { level: number; column: number; row: number; members: ClusterableSite[] }>();
  const singles: SiteCluster[] = [];

  for (const site of sites) {
    const { lat, lng } = site;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90) continue;
    const column = clamp(Math.floor((wrapLng(lng) + 180) / width), 0, columns - 1);
    const row = Math.floor(mercatorY(lat) / rowHeight);
    if (row < rowSouth || row > rowNorth) continue;
    if (!allColumns && columnSpan < columns && (((column - firstColumn) % columns) + columns) % columns >= columnSpan) continue;

    if (closeZoom) {
      singles.push(single(site));
      continue;
    }
    const key = column * stride + row + rowOffset;
    const cell = cells.get(key);
    if (cell) cell.members.push(site);
    else cells.set(key, { level, column, row, members: [site] });
  }

  let clusters = singles;
  for (const { level: l, column, row, members } of cells.values()) {
    clusters.push(members.length === 1 ? single(members[0]) : group(`cluster:${l}:${column}:${row}`, members));
  }
  if (!closeZoom && mergeDistance > 0) clusters = mergeNearby(clusters, mergeDistance * width);
  // North to south, west to east, ids last: the same sites always come out in the same order.
  return clusters.sort((a, b) => b.lat - a.lat || a.lng - b.lng || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Clusters whose centroids are closer than this many cells are merged: about one marker (a roundel is 34–46 pt, a cell 70–140). */
export const MERGE_DISTANCE = 0.6;

const byPriority = (a: SiteCluster, b: SiteCluster) => b.count - a.count || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Where a cluster is on the flat map: longitude, and Mercator y as degrees, so a degree is the same distance either way. */
const planeY = (lat: number) => mercatorY(lat) / RAD;

/**
 * Merges clusters whose centroids are closer than `threshold` (degrees on the flat map), largest
 * first, until no two are. Each pass visits the clusters in priority order (count, then id): one
 * absorbs every lower-priority neighbour within reach of its centroid as it now stands. A pass that
 * moves a centroid can leave a new close pair behind, so passes repeat until one changes nothing;
 * that last pass is the check that no pair is closer than `threshold`. Neighbours are found in bins
 * of the threshold's size, so a pass is linear in the number of clusters.
 */
function mergeNearby(clusters: SiteCluster[], threshold: number): SiteCluster[] {
  if (clusters.length < 2) return clusters;
  let items = clusters.map((c) => ({ c, x: c.lng, y: planeY(c.lat) }));
  for (;;) {
    items.sort((a, b) => byPriority(a.c, b.c));
    let minX = Infinity;
    let minY = Infinity;
    for (const { x, y } of items) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
    }
    const bins = new Map<number, number[]>();
    const binOf = (x: number, y: number): [number, number] => [Math.floor((x - minX) / threshold), Math.floor((y - minY) / threshold)];
    items.forEach(({ x, y }, i) => {
      const [bx, by] = binOf(x, y);
      const key = bx * 65536 + by;
      const bin = bins.get(key);
      if (bin) bin.push(i);
      else bins.set(key, [i]);
    });

    const gone: boolean[] = new Array(items.length).fill(false);
    let merged = false;
    for (let i = 0; i < items.length; i++) {
      if (gone[i]) continue;
      const a = items[i];
      const [bx, by] = binOf(a.x, a.y);
      const near: number[] = [];
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (const j of bins.get((bx + dx) * 65536 + by + dy) ?? []) if (j > i && !gone[j]) near.push(j);
        }
      }
      near.sort((p, q) => p - q);
      for (const j of near) {
        const b = items[j];
        // Plain longitude difference: two sides of the antimeridian are never "close".
        if (Math.hypot(a.x - b.x, a.y - b.y) >= threshold) continue;
        a.c = absorb(a.c, b.c);
        a.x = a.c.lng;
        a.y = planeY(a.c.lat);
        gone[j] = true;
        merged = true;
      }
    }
    if (!merged) return items.map((item) => item.c);
    items = items.filter((_, i) => !gone[i]);
  }
}

/** `big` and `small` as one cluster: id of the larger, centroid of all the sites, union of the bounds. */
function absorb(big: SiteCluster, small: SiteCluster): SiteCluster {
  const count = big.count + small.count;
  const ids: string[] = [];
  let i = 0;
  let j = 0;
  while (i < big.siteIds.length || j < small.siteIds.length) {
    if (j >= small.siteIds.length || (i < big.siteIds.length && big.siteIds[i] < small.siteIds[j])) ids.push(big.siteIds[i++]);
    else ids.push(small.siteIds[j++]);
  }
  return {
    id: big.id.startsWith('cluster:') ? big.id : `cluster:site:${big.id}`,
    count,
    lat: (big.lat * big.count + small.lat * small.count) / count,
    lng: (big.lng * big.count + small.lng * small.count) / count,
    bounds: {
      south: Math.min(big.bounds.south, small.bounds.south),
      west: Math.min(big.bounds.west, small.bounds.west),
      north: Math.max(big.bounds.north, small.bounds.north),
      east: Math.max(big.bounds.east, small.bounds.east),
    },
    siteIds: ids,
    place: big.place,
  };
}

function single(site: ClusterableSite): SiteCluster {
  const lat = site.lat;
  const lng = wrapLng(site.lng);
  return { id: site.id, count: 1, lat, lng, bounds: { south: lat, west: lng, north: lat, east: lng }, siteIds: [site.id], place: site.region ?? '' };
}

/** A cluster of two or more sites; the sites are summed in id order, so the centroid doesn't depend on their order. */
function group(id: string, members: ClusterableSite[]): SiteCluster {
  members.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  let latSum = 0;
  let lngSum = 0;
  const bounds: SiteBounds = { south: Infinity, west: Infinity, north: -Infinity, east: -Infinity };
  const regions = new Map<string, number>();
  for (const { lat, lng: rawLng, region } of members) {
    const lng = wrapLng(rawLng);
    latSum += lat;
    lngSum += lng;
    if (lat < bounds.south) bounds.south = lat;
    if (lat > bounds.north) bounds.north = lat;
    if (lng < bounds.west) bounds.west = lng;
    if (lng > bounds.east) bounds.east = lng;
    if (region) regions.set(region, (regions.get(region) ?? 0) + 1);
  }
  // The commonest region; a tie goes to the one that sorts first.
  let place = '';
  let best = 0;
  for (const [name, n] of regions) {
    if (n > best || (n === best && name < place)) {
      place = name;
      best = n;
    }
  }
  return { id, count: members.length, lat: latSum / members.length, lng: lngSum / members.length, bounds, siteIds: members.map((m) => m.id), place };
}

/** The smallest the region zoomed to a cluster gets, in degrees: under the close-zoom width, so even stacked sites separate. */
export const MIN_ZOOM_DELTA = CLOSE_ZOOM_LNG_DELTA / 2;

export interface ZoomOptions {
  /** The margin round the bounds, as a multiple of their size. */
  padding?: number;
  /** The smallest region to zoom to, in degrees. */
  minDelta?: number;
  /**
   * The region now on screen. The new region is never more than half as wide or tall, which makes
   * every tap on a cluster land on a finer step of the grid ladder (a merged cluster can be wider
   * than a cell, and framing it alone might not zoom in at all).
   */
  within?: MapRegion;
}

/**
 * The region that shows a cluster's bounds with a margin round them (`padding` times their size, at
 * least `MIN_ZOOM_DELTA`), and at most half the region it is zoomed from.
 */
export function boundsToRegion(bounds: SiteBounds, { padding = 1.5, minDelta = MIN_ZOOM_DELTA, within }: ZoomOptions = {}): MapRegion {
  const fit = (span: number, current: number | undefined) => {
    const wanted = Math.max(span * padding, minDelta);
    return current !== undefined && Number.isFinite(current) && current > 0 ? Math.min(wanted, current / 2) : wanted;
  };
  return {
    latitude: (bounds.south + bounds.north) / 2,
    longitude: (bounds.west + bounds.east) / 2,
    latitudeDelta: fit(bounds.north - bounds.south, within?.latitudeDelta),
    longitudeDelta: fit(bounds.east - bounds.west, within && lngWidth(within.longitudeDelta)),
  };
}

/** The north and south edges of a cell, for tests and tools: row `row` at ladder step `level`. */
export function cellLatRange(level: number, row: number): { south: number; north: number } {
  const rowHeight = cellWidth(level) * RAD;
  return { south: latFromMercatorY(row * rowHeight), north: latFromMercatorY((row + 1) * rowHeight) };
}

// ── Imported sites ───────────────────────────────────────────────────────────

/** Whether a site came from the OpenStreetMap import (its id starts with `osm-`, or it names OpenStreetMap as a source). */
export function isImportedSite(site: Pick<DiveSite, 'id' | 'sources'>): boolean {
  return site.id.startsWith('osm-') || !!site.sources?.some((s) => s.source === OSM_SOURCE_NAME);
}

/** Whether any site in the list is an imported one: the map and lists owe OpenStreetMap a credit then (docs/osm-sites.md). */
export function hasImportedSites(sites: readonly Pick<DiveSite, 'id' | 'sources'>[]): boolean {
  return sites.some(isImportedSite);
}
