import { expect, test } from '@jest/globals';
import { clampView, createExplorer, EXPLORER, overview, panBy, panLimit, zoomAbout, zoomRange, type ExplorerFrame } from '../explorer-view';
import { OCEAN } from '../ocean';
import { oceanScale, WORLD } from '../steering';

const PHONE: ExplorerFrame = { width: 390, height: 844, level: 1 };
const TABLET: ExplorerFrame = { width: 1180, height: 820, level: 6 };
const k = EXPLORER.depthStretch;
/** Half the water the screen shows across and in depth at this zoom (units). */
const halfView = (frame: ExplorerFrame, zoom: number) => ({ x: frame.width / (2 * zoom), z: frame.height * k / (2 * zoom) });

test('the depth stretch matches the island camera, from (0, 12, 6) looking at (0, -.15, 0)', () => {
  // A ray straight down the view meets the water; moving the camera up the screen moves that point this much farther.
  const forward = { y: -12.15, z: -6 }, length = Math.hypot(forward.y, forward.z);
  expect(k).toBeCloseTo(length / 12.15, 6);
  expect(k).toBeGreaterThan(1.1);
  expect(k).toBeLessThan(1.12);
});

test('zoomed all the way out the screen is all water, never past its edge, and shows the whole area when it can', () => {
  for (const frame of [PHONE, TABLET, { width: 360, height: 640, level: 3 }, { width: 1440, height: 900, level: 1 }]) {
    const { min, max } = zoomRange(frame), half = halfView(frame, min), water = OCEAN.waterExtent;
    expect(half.x).toBeLessThanOrEqual(water - EXPLORER.edge + 1e-9);
    expect(half.z).toBeLessThanOrEqual(water - EXPLORER.edge + 1e-9);
    expect(max).toBeGreaterThan(min * 1.4);
    // All the way in, the shorter side spans a close look at the reef.
    expect(Math.min(frame.width, frame.height) / max).toBeLessThanOrEqual(EXPLORER.closest + 1e-9);
  }
  // A tall phone shows the swimming area's full depth and a slice of its width; it pans across the rest.
  const half = halfView(PHONE, zoomRange(PHONE).min);
  expect(half.z).toBeGreaterThan(WORLD.z * oceanScale(1));
  expect(half.x).toBeLessThan(WORLD.x * oceanScale(1));
});

test('panning keeps the spot under the finger under it, and stops where the view meets the swimming area', () => {
  const start = { x: 0, z: 0, zoom: zoomRange(PHONE).min * 2 };
  const moved = panBy(PHONE, start, 40, -30);
  expect(moved.x).toBeCloseTo(-40 / start.zoom, 9);
  expect(moved.z).toBeCloseTo(30 * k / start.zoom, 9);
  // A long drag stops at the limit: the view's edge reaches the swimming area's edge (plus its margin), no farther.
  const far = panBy(PHONE, start, -1e5, 1e5), limit = panLimit(PHONE, start.zoom), half = halfView(PHONE, start.zoom);
  expect(far.x).toBeCloseTo(limit.x, 9);
  expect(far.z).toBeCloseTo(-limit.z, 9);
  expect(far.x + half.x).toBeCloseTo(WORLD.x * oceanScale(1) + EXPLORER.margin, 9);
  // Zoomed all the way out the whole depth is in view: nothing to pan to up and down.
  expect(panLimit(PHONE, zoomRange(PHONE).min).z).toBe(0);
});

test('a pinch zooms about the fingers: the spot between them stays put on screen', () => {
  // Zoomed in far enough that the move stays inside the limits (they would stop it otherwise).
  const view = { x: .4, z: -.3, zoom: zoomRange(PHONE).min * 2 }, fx = 60, fy = -110;
  const zoomed = zoomAbout(PHONE, view, 1.5, fx, fy);
  expect(zoomed.zoom).toBeCloseTo(view.zoom * 1.5, 9);
  const before = { x: view.x + fx / view.zoom, z: view.z + fy * k / view.zoom };
  const after = { x: zoomed.x + fx / zoomed.zoom, z: zoomed.z + fy * k / zoomed.zoom };
  expect(after.x).toBeCloseTo(before.x, 9);
  expect(after.z).toBeCloseTo(before.z, 9);
  // Zoom stops at its limits, either way.
  expect(zoomAbout(PHONE, view, 100, 0, 0).zoom).toBeCloseTo(zoomRange(PHONE).max, 9);
  expect(zoomAbout(PHONE, view, .001, 0, 0).zoom).toBeCloseTo(overview(PHONE).zoom, 9);
});

test('a view outside the limits comes back inside them', () => {
  const range = zoomRange(TABLET);
  const view = clampView(TABLET, { x: 50, z: -50, zoom: range.max * 3 });
  expect(view.zoom).toBe(range.max);
  expect(view.x).toBeCloseTo(panLimit(TABLET, range.max).x, 9);
  expect(view.z).toBeCloseTo(-panLimit(TABLET, range.max).z, 9);
});

test('the explorer starts at the overview once it knows the screen, flings glide and slow, buttons ease in, and the zoom is reported as it changes', () => {
  const explorer = createExplorer({ width: 1, height: 1, level: 1 }), heard: number[] = [];
  explorer.subscribe((zoom) => heard.push(zoom));
  explorer.resize(PHONE);
  expect(explorer.view).toEqual(overview(PHONE));
  // Zoom in with the button: it eases over a few frames, then settles exactly.
  explorer.zoomBy(EXPLORER.step);
  const first = explorer.step(1 / 60).zoom;
  expect(first).toBeGreaterThan(overview(PHONE).zoom);
  expect(first).toBeLessThan(overview(PHONE).zoom * EXPLORER.step);
  for (let i = 0; i < 120; i++) explorer.step(1 / 60);
  expect(explorer.view.zoom).toBeCloseTo(overview(PHONE).zoom * EXPLORER.step, 6);
  expect(heard.at(-1)).toBeCloseTo(explorer.view.zoom, 6);
  // A fling glides on in the drag's direction and slows to a stop.
  explorer.grab();
  explorer.fling(-600, 0);
  const x0 = explorer.view.x;
  explorer.step(1 / 60);
  const x1 = explorer.view.x;
  for (let i = 0; i < 180; i++) explorer.step(1 / 60);
  const x2 = explorer.view.x;
  explorer.step(1 / 60);
  expect(x1).toBeGreaterThan(x0);
  expect(x2).toBeGreaterThan(x1);
  expect(explorer.view.x).toBe(x2);
  // A double tap zooms in on its spot, and back out once as close as it goes.
  explorer.zoomToward(50, 80);
  for (let i = 0; i < 120; i++) explorer.step(1 / 60);
  expect(explorer.view.zoom).toBeCloseTo(Math.min(zoomRange(PHONE).max, overview(PHONE).zoom * EXPLORER.step * EXPLORER.doubleTap), 6);
  for (let i = 0; i < 4; i++) { explorer.zoomToward(0, 0); for (let j = 0; j < 120; j++) explorer.step(1 / 60); }
  expect([zoomRange(PHONE).max, overview(PHONE).zoom].some((z) => Math.abs(explorer.view.zoom - z) < 1e-6)).toBe(true);
  explorer.showAll();
  for (let i = 0; i < 120; i++) explorer.step(1 / 60);
  expect(explorer.view.zoom).toBeCloseTo(overview(PHONE).zoom, 6);
  expect(explorer.view.x).toBeCloseTo(0, 6);
});

test('every move is heard (so a scene drawn on demand redraws), and held still the view jumps rather than sweeps', () => {
  const explorer = createExplorer({ width: 1, height: 1, level: 1 });
  let moves = 0;
  const unwatch = explorer.watch(() => { moves++; });
  explorer.resize(PHONE);
  explorer.pan(10, 0);
  explorer.pinch(1.2, 0, 0);
  explorer.zoomBy(EXPLORER.step);
  expect(moves).toBe(4);
  // An eased move keeps the camera drawing until it settles.
  expect(explorer.moving).toBe(true);
  for (let i = 0; i < 120; i++) explorer.step(1 / 60);
  expect(explorer.moving).toBe(false);

  // Reduced motion: a button lands at once, a fling doesn't glide, and a move already under way finishes at once.
  explorer.zoomBy(EXPLORER.step);
  explorer.holdStill(true);
  expect(explorer.moving).toBe(false);
  const zoom = explorer.view.zoom;
  explorer.zoomBy(1 / EXPLORER.step);
  expect(explorer.moving).toBe(false);
  expect(explorer.view.zoom).toBeCloseTo(zoom / EXPLORER.step, 9);
  explorer.fling(-600, 0);
  expect(explorer.moving).toBe(false);
  explorer.showAll();
  expect(explorer.view).toEqual(overview(PHONE));
  const heard = moves;
  unwatch();
  explorer.pan(10, 0);
  expect(moves).toBe(heard);
});
