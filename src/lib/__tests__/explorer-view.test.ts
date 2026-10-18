import { expect, test } from '@jest/globals';
import { CARD_SPAN, clampView, createExplorer, EXPLORER, hazeFor, overview, panBy, panLimit, zoomAbout, zoomRange, type ExplorerFrame } from '../explorer-view';
import { OCEAN } from '../ocean';
import { oceanScale, WORLD } from '../steering';

const PHONE: ExplorerFrame = { width: 390, height: 844, level: 1 };
const TABLET: ExplorerFrame = { width: 1180, height: 820, level: 6 };
const k = EXPLORER.depthStretch;
/** Half the water the screen shows across and in depth at this zoom (units). */
const halfView = (frame: ExplorerFrame, zoom: number) => ({ x: frame.width / (2 * zoom), z: frame.height * k / (2 * zoom) });
/** Where the water's near and far edges show on screen at this view (clip space, 1 at the screen's top and bottom). */
const waterEdge = (frame: ExplorerFrame, view: { z: number; zoom: number }) => (OCEAN.waterExtent - Math.abs(view.z)) * view.zoom / k / (frame.height / 2);
const settle = (explorer: ReturnType<typeof createExplorer>, frames = 120) => { for (let i = 0; i < frames; i++) explorer.step(1 / 60); };

test('the depth stretch matches the island camera, from (0, 12, 6) looking at (0, -.15, 0)', () => {
  // A ray straight down the view meets the water; moving the camera up the screen moves that point this much farther.
  const forward = { y: -12.15, z: -6 }, length = Math.hypot(forward.y, forward.z);
  expect(k).toBeCloseTo(length / 12.15, 6);
  expect(k).toBeGreaterThan(1.1);
  expect(k).toBeLessThan(1.12);
});

test('it opens as the Home card frames the island, zooms out a little further, never past the water at the sides, and well in', () => {
  for (const frame of [PHONE, TABLET, { width: 360, height: 640, level: 3 }, { width: 1440, height: 900, level: 1 }]) {
    const { min, start, max } = zoomRange(frame), card = Math.min(frame.width, frame.height) / (CARD_SPAN * oceanScale(frame.level));
    expect(min).toBeLessThanOrEqual(start);
    expect(start).toBeGreaterThanOrEqual(card - 1e-9);
    expect(halfView(frame, min).x).toBeLessThanOrEqual(OCEAN.waterExtent - EXPLORER.edge + 1e-9);
    expect(max).toBeGreaterThan(start * 1.4);
    // All the way in, the shorter side spans a close look at the reef.
    expect(Math.min(frame.width, frame.height) / max).toBeLessThanOrEqual(EXPLORER.closest + 1e-9);
  }
  // A phone opens exactly at the card's framing, the whole swimming area across it, and can pull back from there.
  const phone = zoomRange(PHONE);
  expect(phone.start).toBeCloseTo(PHONE.width / CARD_SPAN, 9);
  expect(halfView(PHONE, phone.start).x).toBeGreaterThan(WORLD.x);
  expect(phone.min).toBeLessThan(phone.start * .8);
  expect(overview(PHONE)).toEqual({ x: 0, z: 0, zoom: phone.start });
});

test('seeing past the water’s near and far edges, the haze is complete before them; closer in, it is thin', () => {
  const range = zoomRange(PHONE);
  for (const zoom of [range.min, range.start]) {
    const view = { x: 0, z: 0, zoom }, [from, to] = hazeFor(PHONE, view);
    // A tall phone sees past the water up and down the screen: the haze ends just inside it.
    expect(waterEdge(PHONE, view)).toBeLessThan(1);
    expect(to).toBeLessThan(waterEdge(PHONE, view));
    expect(from).toBeLessThan(to);
  }
  expect(hazeFor(PHONE, { x: 0, z: 0, zoom: range.max })).toEqual(EXPLORER.haze);
  // Panned toward one edge, the nearer edge counts.
  const shifted = { x: 0, z: 3, zoom: range.start * 1.5 };
  expect(hazeFor(PHONE, shifted)[1]).toBeLessThan(waterEdge(PHONE, shifted));
});

test('panning keeps the spot under the finger under it, and stops a little past the swimming area', () => {
  const start = { x: 0, z: 0, zoom: zoomRange(PHONE).start * 3 };
  const moved = panBy(PHONE, start, 40, -30);
  expect(moved.x).toBeCloseTo(-40 / start.zoom, 9);
  expect(moved.z).toBeCloseTo(30 * k / start.zoom, 9);
  // A long drag stops at the limit: the view's edge reaches the swimming area's edge (plus its margin), no farther.
  const far = panBy(PHONE, start, -1e5, 1e5), limit = panLimit(PHONE, start.zoom), half = halfView(PHONE, start.zoom);
  expect(far.x).toBeCloseTo(limit.x, 9);
  expect(far.z).toBeCloseTo(-limit.z, 9);
  expect(far.x + half.x).toBeCloseTo(WORLD.x * oceanScale(1) + EXPLORER.margin, 9);
  // As the card frames it, a phone sees the area's whole depth (nothing to pan to up and down) and can look a little to either side.
  const opened = zoomRange(PHONE).start;
  expect(panLimit(PHONE, opened).z).toBe(0);
  expect(panLimit(PHONE, opened).x).toBeCloseTo(WORLD.x + EXPLORER.margin - halfView(PHONE, opened).x, 9);
  // Zoomed in a little, it can move up and down too, and never past the water's edge.
  expect(panLimit(PHONE, opened * 2.4).z).toBeGreaterThan(.5);
  for (const zoom of [opened, opened * 2, opened * 4]) {
    expect(panLimit(PHONE, zoom).x + halfView(PHONE, zoom).x).toBeLessThanOrEqual(OCEAN.waterExtent - EXPLORER.edge + 1e-9);
  }
});

test('a pinch zooms about the fingers: the spot between them stays put on screen', () => {
  // Zoomed in far enough that the move stays inside the limits (they would stop it otherwise).
  const view = { x: .4, z: -.3, zoom: zoomRange(PHONE).start * 3 }, fx = 60, fy = -110;
  const zoomed = zoomAbout(PHONE, view, 1.5, fx, fy);
  expect(zoomed.zoom).toBeCloseTo(view.zoom * 1.5, 9);
  const before = { x: view.x + fx / view.zoom, z: view.z + fy * k / view.zoom };
  const after = { x: zoomed.x + fx / zoomed.zoom, z: zoomed.z + fy * k / zoomed.zoom };
  expect(after.x).toBeCloseTo(before.x, 9);
  expect(after.z).toBeCloseTo(before.z, 9);
  // Zoom stops at its limits, either way.
  expect(zoomAbout(PHONE, view, 100, 0, 0).zoom).toBeCloseTo(zoomRange(PHONE).max, 9);
  expect(zoomAbout(PHONE, view, .001, 0, 0).zoom).toBeCloseTo(zoomRange(PHONE).min, 9);
});

test('a view outside the limits comes back inside them', () => {
  const range = zoomRange(TABLET);
  const view = clampView(TABLET, { x: 50, z: -50, zoom: range.max * 3 });
  expect(view.zoom).toBe(range.max);
  expect(view.x).toBeCloseTo(panLimit(TABLET, range.max).x, 9);
  expect(view.z).toBeCloseTo(-panLimit(TABLET, range.max).z, 9);
});

test('two fingers pinch: the view zooms about them and moves with them, never jumping as fingers come and go', () => {
  const explorer = createExplorer(PHONE), range = zoomRange(PHONE);
  explorer.resize(PHONE);
  explorer.zoomAt(2, 0, 0);
  explorer.grab();
  explorer.pinchStart();
  // The fingers' middle slides 30 points right without spreading: the water under them goes with them.
  const x0 = explorer.view.x;
  explorer.pinch(1, 0, 0);
  explorer.pinch(1, 30, 0);
  expect(explorer.view.x).toBeCloseTo(x0 - 30 / explorer.view.zoom, 9);
  // Spreading about a point keeps that point under the fingers.
  const before = explorer.view, spot = before.x + 30 / before.zoom;
  explorer.pinch(1.3, 30, 0);
  expect(explorer.view.zoom).toBeCloseTo(before.zoom * 1.3, 9);
  expect(explorer.view.x + 30 / explorer.view.zoom).toBeCloseTo(spot, 9);
  // A third finger lands and the middle jumps: the view doesn't.
  const steady = explorer.view;
  explorer.pinch(1, 140, 90, 3);
  expect(explorer.view).toEqual(steady);
  // While pinching, a one-finger drag is the pinch's to make.
  explorer.pan(50, 50);
  expect(explorer.view).toEqual(steady);
  explorer.pinchEnd();
  // The finger left down may jump as the other lifts: its first move is skipped, then it drags as usual.
  explorer.pan(80, 0);
  expect(explorer.view).toEqual(steady);
  explorer.pan(-10, 0);
  expect(explorer.view.x).toBeCloseTo(steady.x + 10 / steady.zoom, 9);
  // Let go after a pinch: no glide, however fast the last finger was moving.
  explorer.fling(-2000, 0);
  expect(explorer.moving).toBe(false);
  // Both fingers lift at once after a pinch: the next touch's drag moves from its first change.
  explorer.grab(); explorer.pinchStart(); explorer.pinch(1, 0, 0); explorer.pinchEnd();
  explorer.grab();
  const fresh = explorer.view;
  explorer.pan(-10, 0);
  expect(explorer.view.x).toBeCloseTo(fresh.x + 10 / fresh.zoom, 9);
  expect(explorer.view.zoom).toBeLessThanOrEqual(range.max);
});

test('a drag let go fast glides on and slows, capped in speed; let go slowly, it stays', () => {
  const explorer = createExplorer(PHONE);
  explorer.resize(PHONE);
  explorer.zoomAt(4, 0, 0);
  explorer.grab();
  explorer.fling(-EXPLORER.flick * .8, 0);
  expect(explorer.moving).toBe(false);
  explorer.grab();
  explorer.fling(-600, 0);
  const x0 = explorer.view.x;
  explorer.step(1 / 60);
  const x1 = explorer.view.x;
  settle(explorer, 240);
  const x2 = explorer.view.x;
  explorer.step(1 / 60);
  expect(x1).toBeGreaterThan(x0);
  expect(x2).toBeGreaterThan(x1);
  expect(explorer.view.x).toBe(x2);
  // However hard the flick, the glide is no faster than the top speed.
  explorer.grab();
  explorer.fling(-1e5, 0);
  const a = explorer.view.x;
  explorer.step(1 / 60);
  expect((explorer.view.x - a) * explorer.view.zoom * 60).toBeLessThanOrEqual(EXPLORER.topSpeed + 1e-6);
});

test('the explorer starts at the overview once it knows the screen, buttons ease in, double taps go in and back out, and the zoom is reported as it changes', () => {
  const explorer = createExplorer({ width: 1, height: 1, level: 1 }), heard: number[] = [];
  explorer.subscribe((zoom) => heard.push(zoom));
  explorer.resize(PHONE);
  expect(explorer.view).toEqual(overview(PHONE));
  // Zoom in with the button: it eases over a few frames, then settles exactly.
  explorer.zoomBy(EXPLORER.step);
  const first = explorer.step(1 / 60).zoom;
  expect(first).toBeGreaterThan(overview(PHONE).zoom);
  expect(first).toBeLessThan(overview(PHONE).zoom * EXPLORER.step);
  settle(explorer);
  expect(explorer.view.zoom).toBeCloseTo(overview(PHONE).zoom * EXPLORER.step, 6);
  expect(heard.at(-1)).toBeCloseTo(explorer.view.zoom, 6);
  // A double tap zooms in on its spot; double taps go all the way in, and the next one back out.
  explorer.zoomToward(50, 80);
  settle(explorer);
  expect(explorer.view.zoom).toBeCloseTo(Math.min(zoomRange(PHONE).max, overview(PHONE).zoom * EXPLORER.step * EXPLORER.doubleTap), 6);
  for (let i = 0; i < 8 && explorer.view.zoom < zoomRange(PHONE).max - 1e-6; i++) { explorer.zoomToward(0, 0); settle(explorer); }
  expect(explorer.view.zoom).toBeCloseTo(zoomRange(PHONE).max, 6);
  explorer.zoomToward(0, 0); settle(explorer);
  expect(explorer.view.zoom).toBeCloseTo(overview(PHONE).zoom, 6);
  // The mouse wheel zooms at once, about the pointer.
  explorer.zoomAt(1.5, 0, 0);
  expect(explorer.view.zoom).toBeCloseTo(overview(PHONE).zoom * 1.5, 6);
  explorer.showAll();
  settle(explorer);
  expect(explorer.view.zoom).toBeCloseTo(overview(PHONE).zoom, 6);
  expect(explorer.view.x).toBeCloseTo(0, 6);
});

test('every move is heard (so a scene drawn on demand redraws), and held still the view jumps rather than sweeps', () => {
  const explorer = createExplorer({ width: 1, height: 1, level: 1 });
  let moves = 0;
  const unwatch = explorer.watch(() => { moves++; });
  explorer.resize(PHONE);
  explorer.pan(10, 0);
  explorer.zoomAt(1.2, 0, 0);
  explorer.zoomBy(EXPLORER.step);
  expect(moves).toBe(4);
  // An eased move keeps the camera drawing until it settles.
  expect(explorer.moving).toBe(true);
  settle(explorer);
  expect(explorer.moving).toBe(false);

  // Reduced motion: a button lands at once, a fling doesn't glide, and a move already under way finishes at once.
  explorer.zoomBy(EXPLORER.step);
  explorer.holdStill(true);
  expect(explorer.moving).toBe(false);
  const zoom = explorer.view.zoom;
  explorer.zoomBy(1 / EXPLORER.step);
  expect(explorer.moving).toBe(false);
  expect(explorer.view.zoom).toBeCloseTo(zoom / EXPLORER.step, 9);
  explorer.grab();
  explorer.fling(-600, 0);
  expect(explorer.moving).toBe(false);
  explorer.showAll();
  expect(explorer.view).toEqual(overview(PHONE));
  const heard = moves;
  unwatch();
  explorer.pan(10, 0);
  expect(moves).toBe(heard);
});
