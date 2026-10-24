import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { SiteMap } from '../site-map';
import { OSM_COPYRIGHT_URL } from '../site-list';
import { SITES as APP_SITES } from '@/data/sites';
import { clusterSites } from '@/lib/site-clusters';
import { seededRandom } from '@/lib/wash';

// The theme module imports the web stylesheet, which Jest can't parse.
jest.mock('@/global.css', () => ({}));
// The credit is a link out; the real one needs the router.
jest.mock('@/components/external-link', () => ({ ExternalLink: ({ children, ...props }) => <extlink {...props}>{children}</extlink> }));
// A map that records what it was given, and markers that count how often they are drawn.
let mockMap = null;
const mockZoom = jest.fn();
const mockMarkerRenders = [];
jest.mock('react-native-maps', () => {
  const { forwardRef, useImperativeHandle, createElement } = require('react');
  const MapView = forwardRef(function MockMapView(props, ref) {
    mockMap = props;
    useImperativeHandle(ref, () => ({ animateToRegion: mockZoom }));
    return createElement('map', props, props.children);
  });
  const Marker = (props) => {
    mockMarkerRenders.push(props.accessibilityLabel);
    return createElement('marker', props, props.children);
  };
  return { __esModule: true, default: MapView, Marker };
});

/**
 * Sites for these tests are generated here, never added to the app's data: knots like the Red Sea's
 * and the Great Barrier Reef's, a thin scatter round the world, and one dense knot of 40 sites
 * within a kilometre (the "dozens of sites within a few km" at Hurghada).
 */
function generateSites(count, { imported = false } = {}) {
  const random = seededRandom(5);
  const prefix = imported ? 'osm-node-' : 'gen-';
  const knots = [['Hurghada & Safaga, Red Sea', 27.2, 33.85, 0.35, 0.3], ['Sharm el-Sheikh, Red Sea', 27.85, 34.3, 0.3, 0.2], ['Cairns, Great Barrier Reef', -16.7, 146.0, 0.8, 0.25]];
  const sites = [];
  for (let i = 0; i < count; i++) {
    const pick = random();
    let share = 0;
    const knot = knots.find((k) => (share += k[4]) > pick);
    const [region, lat, lng, spread] = knot ?? ['Elsewhere', (random() - 0.5) * 100, (random() - 0.5) * 340, 0];
    sites.push({
      id: `${prefix}${i}`, name: `Reef ${i}`, region, country: 'Testland', blurb: '', notableSpecies: [], source: 'seed',
      lat: knot ? lat + (random() - 0.5) * 2 * spread : lat, lng: knot ? lng + (random() - 0.5) * 2 * spread : lng,
    });
  }
  for (let i = 0; i < 40; i++) {
    sites.push({
      id: `${prefix}dense-${i}`, name: `Dense ${i}`, region: 'Hurghada & Safaga, Red Sea', country: 'Testland', blurb: '', notableSpecies: [], source: 'seed',
      lat: 27.2 + (random() - 0.5) * 0.01, lng: 33.85 + (random() - 0.5) * 0.01,
    });
  }
  return sites;
}

const CLOSE = { latitude: 27.2, longitude: 33.85, latitudeDelta: 0.015, longitudeDelta: 0.01 };
const RED_SEA = { latitude: 27.4, longitude: 34, latitudeDelta: 3, longitudeDelta: 2 };

let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  mockMap = null;
  mockZoom.mockClear();
  mockMarkerRenders.length = 0;
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
  jest.useRealTimers();
});

const props = (over) => ({ sites: SITES, highlightedSiteIds: null, onSelectSite: jest.fn(), onLongPress: jest.fn(), ...over });
const SITES = generateSites(600);
const markers = () => root.root.findAllByType('marker');
const clusterMarkers = () => markers().filter((m) => m.props.children !== undefined);
const singleMarkers = () => markers().filter((m) => m.props.children === undefined);
const text = () => root.root.findAll((n) => typeof n.children?.[0] === 'string').map((n) => n.children.join('')).join(' | ');
const settle = async (region) => {
  await act(async () => { mockMap.onRegionChangeComplete(region); jest.advanceTimersByTime(200); });
};

test('hundreds of sites are drawn as a few clusters, not a marker each, and every site is in one', async () => {
  await act(async () => { root = create(<SiteMap {...props()} />); });
  expect(markers().length).toBeGreaterThan(3);
  expect(markers().length).toBeLessThan(60);
  // Each cluster says how many sites it holds; together with the lone pins they are all the sites in view.
  const labelled = clusterMarkers().map((m) => m.props.accessibilityLabel);
  expect(labelled.every((l) => /^\d+ dive sites/.test(l))).toBe(true);
  expect(labelled.some((l) => /in Hurghada & Safaga, Red Sea/.test(l))).toBe(true);
  const total = clusterMarkers().reduce((n, m) => n + Number(m.props.accessibilityLabel.match(/^(\d+)/)[1]), 0) + singleMarkers().length;
  const expected = clusterSites(SITES, mockMap.initialRegion).reduce((n, c) => n + c.count, 0);
  expect(total).toBe(expected);
  // Roundel: the count in a ring of paper; the platform's pin only for a lone site.
  expect(text()).toMatch(/\b\d{2,3}\b/);
  expect(mockMap.initialRegion).toEqual({ latitude: 12, longitude: 100, latitudeDelta: 60, longitudeDelta: 80 });
});

test('zoomed right in, every site shows as its own pin, and a pin opens its site', async () => {
  const onSelectSite = jest.fn();
  await act(async () => { root = create(<SiteMap {...props({ onSelectSite })} />); });
  await settle(RED_SEA);
  expect(clusterMarkers().length).toBeGreaterThan(0);
  await settle(CLOSE);
  expect(clusterMarkers()).toHaveLength(0);
  expect(singleMarkers().length).toBeGreaterThanOrEqual(40);
  const pin = singleMarkers().find((m) => m.props.accessibilityLabel.startsWith('Dense 7,'));
  expect(pin.props.accessibilityLabel).toBe('Dense 7, Hurghada & Safaga, Red Sea, Testland');
  expect(pin.props.accessibilityRole).toBe('button');
  await act(async () => pin.props.onPress());
  expect(onSelectSite).toHaveBeenCalledWith('gen-dense-7');
});

test('choosing a site does not redraw the map: a new callback each render touches no marker', async () => {
  const first = jest.fn();
  await act(async () => { root = create(<SiteMap {...props({ onSelectSite: first })} />); });
  await settle(CLOSE);
  expect(markers().length).toBeGreaterThan(40);
  mockMarkerRenders.length = 0;

  // The screen re-renders with a new function on every selection; the markers must stay as they are.
  const second = jest.fn();
  await act(async () => root.update(<SiteMap {...props({ onSelectSite: second, onLongPress: jest.fn() })} />));
  expect(mockMarkerRenders).toEqual([]);
  // The marker that was already drawn calls the newest callback.
  const pin = singleMarkers().find((m) => m.props.accessibilityLabel.startsWith('Dense 3,'));
  await act(async () => pin.props.onPress());
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledWith('gen-dense-3');
});

test('moving the map groups again only after it has stopped, and only the markers whose cell changed are redrawn', async () => {
  await act(async () => { root = create(<SiteMap {...props()} />); });
  await settle(RED_SEA);
  const before = markers().map((m) => m.props.accessibilityLabel);
  mockMarkerRenders.length = 0;

  // A burst of moves: nothing happens until 150 ms after the last.
  await act(async () => {
    mockMap.onRegionChangeComplete({ ...RED_SEA, longitude: 34.1 });
    jest.advanceTimersByTime(100);
    mockMap.onRegionChangeComplete({ ...RED_SEA, longitude: 34.2 });
    jest.advanceTimersByTime(100);
  });
  expect(mockMarkerRenders).toEqual([]);
  await act(async () => jest.advanceTimersByTime(60));
  expect(markers().length).toBeGreaterThan(0);

  // Clusters in both views are the same markers: not drawn again.
  const after = markers().map((m) => m.props.accessibilityLabel);
  const kept = after.filter((l) => before.includes(l));
  expect(kept.length).toBeGreaterThan(0);
  for (const label of kept) expect(mockMarkerRenders.filter((l) => l === label)).toHaveLength(0);
  // A region that hasn't really moved does nothing at all.
  mockMarkerRenders.length = 0;
  await settle({ ...RED_SEA, longitude: 34.2000001 });
  expect(mockMarkerRenders).toEqual([]);
});

test('tapping a cluster zooms to its sites', async () => {
  await act(async () => { root = create(<SiteMap {...props()} />); });
  await settle(RED_SEA);
  const hurghada = clusterMarkers().filter((m) => /in Hurghada/.test(m.props.accessibilityLabel)).sort((a, b) => b.props.coordinate.latitude - a.props.coordinate.latitude)[0];
  expect(hurghada.props.accessibilityHint).toBe('Zooms in to show them');
  await act(async () => hurghada.props.onPress());
  expect(mockZoom).toHaveBeenCalledTimes(1);
  const [region, duration] = mockZoom.mock.calls[0];
  expect(duration).toBeGreaterThan(0);
  // Centred on the cluster's sites and no wider than a screenful round them.
  const cluster = clusterSites(SITES, RED_SEA).find((c) => Math.abs(c.lat - hurghada.props.coordinate.latitude) < 1e-9 && Math.abs(c.lng - hurghada.props.coordinate.longitude) < 1e-9);
  expect(region.latitude).toBeCloseTo((cluster.bounds.south + cluster.bounds.north) / 2, 9);
  expect(region.longitude).toBeCloseTo((cluster.bounds.west + cluster.bounds.east) / 2, 9);
  expect(region.longitudeDelta).toBeLessThan(RED_SEA.longitudeDelta);
});

test('a cluster view is redrawn into the map while it appears, then left alone', async () => {
  await act(async () => { root = create(<SiteMap {...props()} />); });
  const tracked = () => clusterMarkers().map((m) => m.props.tracksViewChanges);
  expect(tracked().length).toBeGreaterThan(0);
  // Not blank on the first frame: tracking starts on...
  expect(tracked().every((t) => t === true)).toBe(true);
  // ...and is switched off once the view has been copied, so dozens of roundels cost nothing per frame.
  await act(async () => jest.advanceTimersByTime(600));
  expect(tracked().every((t) => t === false)).toBe(true);
  // A roundel that changes (it now holds a site the filter matches) is tracked again until it has settled.
  const some = new Set(SITES.filter((s) => s.region.startsWith('Cairns')).map((s) => s.id));
  await act(async () => root.update(<SiteMap {...props({ highlightedSiteIds: some })} />));
  expect(clusterMarkers().some((m) => m.props.tracksViewChanges === true)).toBe(true);
  await act(async () => jest.advanceTimersByTime(600));
  expect(tracked().every((t) => t === false)).toBe(true);
  // The platform's own pins have no view to copy.
  await settle(CLOSE);
  expect(singleMarkers().every((m) => m.props.tracksViewChanges === undefined)).toBe(true);
});

test('a species filter colours what matches and dims the rest, clusters included, and the key explains it', async () => {
  const dense = new Set(SITES.filter((s) => s.id.includes('dense-')).map((s) => s.id));
  await act(async () => { root = create(<SiteMap {...props({ highlightedSiteIds: dense })} />); });
  expect(text()).toContain('Where to see it');
  const matching = clusterMarkers().filter((m) => m.props.opacity === 1);
  expect(matching.length).toBeGreaterThan(0);
  expect(matching.every((m) => /\d+ match(es)? your search/.test(m.props.accessibilityLabel))).toBe(true);
  expect(markers().some((m) => m.props.opacity === 0.3)).toBe(true);
  await settle(CLOSE);
  const pins = singleMarkers();
  const lit = pins.filter((m) => m.props.opacity === 1);
  expect(lit).toHaveLength(40);
  expect(lit.every((m) => m.props.accessibilityLabel.endsWith(', matches your search'))).toBe(true);
  expect(new Set(lit.map((m) => m.props.pinColor)).size).toBe(1);
  expect(pins.filter((m) => m.props.opacity === 0.3).every((m) => m.props.pinColor !== lit[0].props.pinColor)).toBe(true);
});

test('sites on one exact spot are drawn round it at the closest zoom, so each pin can be tapped', async () => {
  // OpenStreetMap puts five Zabargad sites on one point.
  const zabargad = APP_SITES.filter((s) => s.lat === 23.61863 && s.lng === 36.20377);
  expect(zabargad).toHaveLength(5);
  const onSelectSite = jest.fn();
  await act(async () => { root = create(<SiteMap {...props({ sites: APP_SITES, onSelectSite })} />); });
  const view = { latitude: 23.61863, longitude: 36.20377, latitudeDelta: 0.008, longitudeDelta: 0.0075 };
  await settle(view);
  const pinOf = (site) => singleMarkers().find((m) => m.props.accessibilityLabel.startsWith(`${site.name}, ${site.region}`));
  const pins = zabargad.map(pinOf);
  expect(pins.every(Boolean)).toBe(true);
  // Five places on screen, all close round the spot.
  expect(new Set(pins.map((m) => `${m.props.coordinate.latitude},${m.props.coordinate.longitude}`)).size).toBe(5);
  for (const m of pins) {
    expect(Math.abs(m.props.coordinate.longitude - view.longitude)).toBeLessThan(view.longitudeDelta * 0.15);
    expect(Math.abs(m.props.coordinate.latitude - view.latitude)).toBeLessThan(view.longitudeDelta * 0.15);
  }
  // Each opens its own site.
  for (const site of zabargad) {
    await act(async () => pinOf(site).props.onPress());
    expect(onSelectSite).toHaveBeenLastCalledWith(site.id);
  }
});

test('a long press on the map still offers to add a site there', async () => {
  const onLongPress = jest.fn();
  await act(async () => { root = create(<SiteMap {...props({ onLongPress })} />); });
  await act(async () => mockMap.onLongPress({ nativeEvent: { coordinate: { latitude: 12.5, longitude: 99.5 } } }));
  expect(onLongPress).toHaveBeenCalledWith(12.5, 99.5);
});

test('the OpenStreetMap credit is shown, as a link, only when imported sites are on the map', async () => {
  const credits = () => root.root.findAllByType('extlink');
  await act(async () => { root = create(<SiteMap {...props({ sites: generateSites(50, { imported: true }) })} />); });
  expect(credits()).toHaveLength(1);
  expect(credits()[0].props.href).toBe('https://www.openstreetmap.org/copyright');
  expect(credits()[0].props.href).toBe(OSM_COPYRIGHT_URL);
  expect(credits()[0].props.children).toBe('Dive sites © OpenStreetMap contributors');
  await act(async () => root.unmount());

  // Seed sites and the diver's own: no credit.
  const own = generateSites(50).map((s, i) => (i % 2 ? { ...s, source: 'user', createdBy: 'local' } : s));
  await act(async () => { root = create(<SiteMap {...props({ sites: own })} />); });
  expect(credits()).toHaveLength(0);
  expect(text()).not.toContain('OpenStreetMap');
  await act(async () => root.unmount());

  // A site that names OpenStreetMap as a source counts, whatever its id.
  const sourced = [...own, { ...own[0], id: 'named-by-osm', sources: [{ fields: ['region'], source: 'OpenStreetMap contributors' }] }];
  await act(async () => { root = create(<SiteMap {...props({ sites: sourced })} />); });
  expect(credits()).toHaveLength(1);
  // The pins are still there with it, and it is not in the way of the legend.
  expect(markers().length).toBeGreaterThan(0);
  await act(async () => root.update(<SiteMap {...props({ sites: sourced, highlightedSiteIds: new Set(['gen-3']) })} />));
  expect(text()).toContain('Where to see it');
  expect(credits()).toHaveLength(1);
});
