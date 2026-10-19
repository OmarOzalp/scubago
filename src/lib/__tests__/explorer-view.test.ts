import { expect, test } from '@jest/globals';
import { ISLAND_PLACES } from '../archipelago';
import { clampView, createExplorer, EXPLORER, islandView, nearestIsland, overview, panBy, panLimit, stretchZoom, zoomAbout, zoomRange, type ExplorerFrame, type ExplorerView, type Finger } from '../explorer-view';
import { oceanScale, WORLD } from '../steering';

const PHONE: ExplorerFrame = { width: 390, height: 844, level: 1 };
const TABLET: ExplorerFrame = { width: 1180, height: 820, level: 6 };
const k = EXPLORER.depthStretch;
const WATER = EXPLORER.reach - EXPLORER.edge;
/** Half the water the screen shows across and in depth at this zoom (units). */
const halfView = (frame: ExplorerFrame, zoom: number) => ({ x: frame.width / (2 * zoom), z: frame.height * k / (2 * zoom) });
/** The spot on the water under a screen point (points from the middle). */
const under = (view: ExplorerView, x: number, y: number) => ({ x: view.x + x / view.zoom, z: view.z + y * k / view.zoom });
const middle = (fingers: readonly Finger[]) => ({ x: fingers.reduce((s, f) => s + f.x, 0) / fingers.length, y: fingers.reduce((s, f) => s + f.y, 0) / fingers.length });
const spread = (fingers: readonly Finger[]) => { const m = middle(fingers); return fingers.reduce((s, f) => s + Math.hypot(f.x - m.x, f.y - m.y), 0) / fingers.length; };
const settle = (explorer: ReturnType<typeof createExplorer>, frames = 120) => { for (let i = 0; i < frames; i++) explorer.step(1 / 60); };
const opened = (frame: ExplorerFrame) => { const explorer = createExplorer(frame); explorer.resize(frame); return explorer; };
/** A small deterministic random number generator, so a failing case can be replayed. */
const random = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

test('the depth stretch matches the island camera, from (0, 12, 6) looking at (0, -.15, 0)', () => {
  const forward = { y: -12.15, z: -6 }, length = Math.hypot(forward.y, forward.z);
  expect(k).toBeCloseTo(length / 12.15, 6);
});

test('it opens all the way out: the whole ocean and every animal in view, its water filling the screen to every edge', () => {
  const frames: ExplorerFrame[] = [PHONE, { ...PHONE, level: 6 }, { width: 430, height: 932, level: 6 }, { width: 360, height: 800, level: 6 }, TABLET, { width: 1440, height: 900, level: 1 }];
  for (const frame of frames) {
    const { min, max } = zoomRange(frame), half = halfView(frame, min), s = oceanScale(frame.level);
    expect(overview(frame)).toEqual({ x: 0, z: 0, zoom: min });
    // The swimming area, and a little water around it, all on screen.
    expect(half.x).toBeGreaterThanOrEqual(WORLD.x * s + EXPLORER.frame - 1e-9);
    expect(half.z).toBeGreaterThanOrEqual(WORLD.z * s + EXPLORER.frame - 1e-9);
    // Water to every edge of the screen: no haze, no background showing.
    expect(half.x).toBeLessThanOrEqual(WATER + 1e-9);
    expect(half.z).toBeLessThanOrEqual(WATER + 1e-9);
    // And a long way in, to see the smaller things.
    expect(max).toBeGreaterThanOrEqual(min * 2);
    expect(Math.min(frame.width, frame.height) / max).toBeLessThanOrEqual(EXPLORER.closest + 1e-9);
  }
  // A phone zooms in about seven times.
  expect(zoomRange(PHONE).max / zoomRange(PHONE).min).toBeGreaterThan(6.5);
});

test('panning keeps the spot under the finger under it, and stops a little past the swimming area, inside the water', () => {
  const start = { x: 0, z: 0, zoom: zoomRange(PHONE).min * 3 };
  const moved = panBy(PHONE, start, 40, -30);
  expect(moved.x).toBeCloseTo(-40 / start.zoom, 9);
  expect(moved.z).toBeCloseTo(30 * k / start.zoom, 9);
  const far = panBy(PHONE, start, -1e5, 1e5), limit = panLimit(PHONE, start.zoom), half = halfView(PHONE, start.zoom);
  expect(far.x).toBeCloseTo(limit.x, 9);
  expect(far.z).toBeCloseTo(-limit.z, 9);
  expect(far.x + half.x).toBeCloseTo(WORLD.x + EXPLORER.margin, 9);
  // All the way out, everything is in view; zoomed in a little, a phone moves up and down as well as across.
  expect(panLimit(PHONE, zoomRange(PHONE).min).z).toBe(0);
  expect(panLimit(PHONE, zoomRange(PHONE).min * 2.5).z).toBeGreaterThan(.5);
});

test('zooming about a point keeps the spot under it, within the zoom limits', () => {
  const view = { x: .4, z: -.3, zoom: zoomRange(PHONE).min * 3 }, fx = 60, fy = -110;
  const zoomed = zoomAbout(PHONE, view, 1.5, fx, fy);
  expect(zoomed.zoom).toBeCloseTo(view.zoom * 1.5, 9);
  expect(under(zoomed, fx, fy).x).toBeCloseTo(under(view, fx, fy).x, 9);
  expect(under(zoomed, fx, fy).z).toBeCloseTo(under(view, fx, fy).z, 9);
  expect(zoomAbout(PHONE, view, 100, 0, 0).zoom).toBeCloseTo(zoomRange(PHONE).max, 9);
  expect(zoomAbout(PHONE, view, .001, 0, 0).zoom).toBeCloseTo(zoomRange(PHONE).min, 9);
  const range = zoomRange(TABLET), clamped = clampView(TABLET, { x: 50, z: -50, zoom: range.max * 3 });
  expect(clamped).toEqual({ x: panLimit(TABLET, range.max).x, z: -panLimit(TABLET, range.max).z, zoom: range.max });
});

test('one finger drags the water: the spot under it stays under it, move by move', () => {
  const explorer = opened(PHONE);
  explorer.zoomAt(3, 0, 0);
  let finger = { id: 1, x: 20, y: 30 }, t = 0;
  explorer.touch([finger], t);
  const spot = under(explorer.view, finger.x, finger.y);
  for (let i = 1; i <= 20; i++) {
    finger = { id: 1, x: 20 - i * 3, y: 30 + i * 2 };
    explorer.touch([finger], t += 16);
    expect(under(explorer.view, finger.x, finger.y).x).toBeCloseTo(spot.x, 9);
    expect(under(explorer.view, finger.x, finger.y).z).toBeCloseTo(spot.z, 9);
  }
});

test('two fingers pinch: the zoom follows their spread, and the spot between them stays between them as they move', () => {
  // Zoomed in a little and drifting sideways, so the limits never stop the pair and it stays short of all the way in (the random test below covers the limits).
  const explorer = opened(PHONE);
  explorer.zoomAt(2, 0, 0);
  let t = 0, a = { id: 1, x: -20, y: 0 }, b = { id: 2, x: 20, y: 10 };
  explorer.touch([a], t);
  explorer.touch([a, b], t += 5);
  const spot = under(explorer.view, (a.x + b.x) / 2, (a.y + b.y) / 2), zoom0 = explorer.view.zoom;
  // Spread apart while the pair drifts to the right: in, about the moving middle.
  for (let i = 1; i <= 15; i++) {
    a = { id: 1, x: -20 - i * 3 + i * 2, y: 0 }; b = { id: 2, x: 20 + i * 3 + i * 2, y: 10 };
    explorer.touch([a, b], t += 16);
    const m = middle([a, b]);
    expect(under(explorer.view, m.x, m.y).x).toBeCloseTo(spot.x, 9);
    expect(under(explorer.view, m.x, m.y).z).toBeCloseTo(spot.z, 9);
  }
  expect(explorer.view.zoom / zoom0).toBeCloseTo(spread([a, b]) / 20.6155, 3);
  // Back together: out again, the same smooth way.
  for (let i = 1; i <= 10; i++) { a = { id: 1, x: a.x + 5, y: a.y }; b = { id: 2, x: b.x - 5, y: b.y }; explorer.touch([a, b], t += 16); }
  expect(explorer.view.zoom / zoom0).toBeCloseTo(spread([a, b]) / 20.6155, 3);
  explorer.touch([], t += 16);
});

test('fingers moved one at a time (as the web sends them) count as one move: a limit met halfway holds nothing back', () => {
  // Zoomed in a little near the far edge, where the limit draws in as the view zooms out (a case found driving the web build with multi-touch).
  const place = () => {
    const explorer = opened(PHONE);
    explorer.zoomAt(89.16 / explorer.view.zoom, 0, 0);
    explorer.touch([{ id: 9, x: 100, y: 100 }], 0);
    explorer.touch([{ id: 9, x: -64, y: 65.5 }], 16);
    explorer.touch([], 1000);
    explorer.touch([{ id: 1, x: 109, y: 7.5 }, { id: 2, x: 73.9, y: 65.8 }], 1100);
    return explorer;
  };
  const a = { id: 1, x: 114.7, y: 3.6 }, b = { id: 2, x: 81.8, y: 60.4 }, was = { x: (109 + 73.9) / 2, y: (7.5 + 65.8) / 2 };
  const together = place(), apart = place(), halfway = place(), start = together.view;
  expect(start.z).toBeLessThan(panLimit(PHONE, start.zoom).z);
  together.touch([a, b], 1116);
  // The second finger's move first, then the first's, as two events.
  apart.touch([{ id: 1, x: 109, y: 7.5 }, b], 1116);
  apart.touch([a, b], 1116);
  expect(apart.view).toEqual(together.view);
  // Followed only as the fingers both moved: the water between them stayed there, the zoom with their spread.
  const m = middle([a, b]);
  expect(under(together.view, m.x, m.y).x).toBeCloseTo(under(start, was.x, was.y).x, 9);
  expect(under(together.view, m.x, m.y).z).toBeCloseTo(under(start, was.x, was.y).z, 9);
  expect(together.view.zoom).toBeCloseTo(start.zoom * spread([a, b]) / spread([{ id: 1, x: 109, y: 7.5 }, { id: 2, x: 73.9, y: 65.8 }]), 9);
  // Followed a finger at a time, the first half pinches in, meets the drawn-in limit, and the water slips.
  halfway.touch([{ id: 1, x: 109, y: 7.5 }, b], 1116);
  expect(halfway.view.z).toBeCloseTo(panLimit(PHONE, halfway.view.zoom).z, 9);
  halfway.touch([a, b], 1116);
  expect(Math.abs(halfway.view.z - together.view.z) * together.view.zoom / k).toBeGreaterThan(5);
});

test('a finger landing or lifting never moves the view, however far from the others; nothing glides after a pinch', () => {
  const explorer = opened(PHONE);
  explorer.zoomAt(2.5, 0, 0);
  let t = 0;
  explorer.touch([{ id: 1, x: 0, y: 0 }], t);
  explorer.touch([{ id: 1, x: -15, y: 0 }], t += 16);
  const before = explorer.view;
  explorer.touch([{ id: 1, x: -15, y: 0 }, { id: 2, x: 150, y: 220 }], t += 16);
  expect(explorer.view).toEqual(before);
  explorer.touch([{ id: 1, x: -15, y: 0 }, { id: 2, x: 150, y: 220 }, { id: 3, x: -120, y: -200 }], t += 16);
  expect(explorer.view).toEqual(before);
  explorer.touch([{ id: 3, x: -120, y: -200 }], t += 16);
  expect(explorer.view).toEqual(before);
  // The finger left behind drags on from where it is.
  explorer.touch([{ id: 3, x: -100, y: -200 }], t += 16);
  expect(explorer.view.x).toBeCloseTo(before.x - 20 / before.zoom, 9);
  // It lifts moving fast, but this touch pinched: no glide.
  explorer.touch([{ id: 3, x: -40, y: -200 }], t += 16);
  explorer.touch([], t += 4);
  expect(explorer.moving).toBe(false);
});

test('fingers pinched almost together only drag: the zoom never snaps as their spread nears nothing', () => {
  const explorer = opened(PHONE);
  explorer.zoomAt(4, 0, 0);
  const zoom = explorer.view.zoom;
  let t = 0;
  explorer.touch([{ id: 1, x: -30, y: 0 }, { id: 2, x: 30, y: 0 }], t);
  explorer.touch([{ id: 1, x: -12, y: 0 }, { id: 2, x: 12, y: 0 }], t += 16);
  expect(explorer.view.zoom).toBeCloseTo(zoom * 12 / 30, 9);
  const settled = explorer.view.zoom;
  // Closer than real fingers come: a wobble of a point or two doesn't zoom at all.
  explorer.touch([{ id: 1, x: -2, y: 0 }, { id: 2, x: 2, y: 0 }], t += 16);
  explorer.touch([{ id: 1, x: -.5, y: 1 }, { id: 2, x: .5, y: -1 }], t += 16);
  explorer.touch([{ id: 1, x: -4, y: 0 }, { id: 2, x: 4, y: 0 }], t += 16);
  expect(explorer.view.zoom).toBe(settled);
  explorer.touch([], t += 16);
});

test('let go of a fast drag and the view glides on and slows, capped in speed; slow, or stopped before lifting, it stays', () => {
  const explorer = opened(PHONE);
  explorer.zoomAt(4, 0, 0);
  const drag = (speed: number, pause = 0) => {
    let t = 1000 * Math.random(), x = 0;
    explorer.touch([{ id: 7, x, y: 0 }], t);
    for (let i = 0; i < 8; i++) explorer.touch([{ id: 7, x: x -= speed * .016, y: 0 }], t += 16);
    explorer.touch([], t + 4 + pause);
  };
  drag(EXPLORER.flick * .6);
  expect(explorer.moving).toBe(false);
  drag(900, 150);
  expect(explorer.moving).toBe(false);
  drag(900);
  expect(explorer.moving).toBe(true);
  const x0 = explorer.view.x;
  explorer.step(1 / 60);
  const x1 = explorer.view.x;
  settle(explorer, 240);
  expect(x1).toBeGreaterThan(x0);
  expect(explorer.moving).toBe(false);
  // However hard the flick (or however bunched the touch events), no faster than the top speed.
  drag(50000);
  const a = explorer.view.x;
  explorer.step(1 / 60);
  expect((explorer.view.x - a) * explorer.view.zoom * 60).toBeLessThanOrEqual(EXPLORER.topSpeed + 1e-6);
  // A touch taken away by the system doesn't glide either.
  let t = 0;
  explorer.touch([{ id: 9, x: 0, y: 0 }], t);
  for (let i = 0; i < 8; i++) explorer.touch([{ id: 9, x: i * 20, y: 0 }], t += 16);
  explorer.touch([], t + 4, true);
  expect(explorer.moving).toBe(false);
});

test('random touches, hundreds of them: the water under the fingers stays under them, nothing ever jumps, and every touch ends inside the limits', () => {
  for (let session = 0; session < 400; session++) {
    const rand = random(session + 1), frame = [PHONE, TABLET, { width: 430, height: 932, level: 3 }][session % 3];
    const explorer = opened(frame), range = zoomRange(frame);
    if (rand() < .5) explorer.zoomAt(1 + rand() * 4, 0, 0);
    // The zoom the fingers' spread asks for, with no limits.
    let fingers: Finger[] = [], next = 1, t = 0, asked = explorer.view.zoom;
    for (let step = 0; step < 80; step++) {
      const roll = rand();
      let moved: Finger[];
      if (fingers.length === 0 || (roll < .08 && fingers.length < 4)) {
        moved = [...fingers, { id: next++, x: (rand() - .5) * frame.width * .8, y: (rand() - .5) * frame.height * .8 }];
      } else if (roll < .14) {
        const lift = Math.floor(rand() * fingers.length);
        moved = fingers.filter((_, i) => i !== lift);
      } else {
        // Every finger moves a little: together (a drag), apart or together (a pinch), or round (a twist).
        const dx = (rand() - .5) * 24, dy = (rand() - .5) * 24, grow = 1 + (rand() - .5) * .12, turn = (rand() - .5) * .1, m = middle(fingers);
        moved = fingers.map((f) => {
          const rx = f.x - m.x, ry = f.y - m.y;
          return { id: f.id, x: m.x + dx + (rx * Math.cos(turn) - ry * Math.sin(turn)) * grow, y: m.y + dy + (rx * Math.sin(turn) + ry * Math.cos(turn)) * grow };
        });
      }
      const before = explorer.view;
      if (fingers.length === 0) asked = before.zoom;
      explorer.touch(moved, t += 16);
      const after = explorer.view, same = moved.length === fingers.length && moved.every((f) => fingers.some((g) => g.id === f.id));
      // Mid-touch, never far past the limits: a pinch stretches a little past the zoom range, the view within the water for that zoom.
      const limit = panLimit(frame, after.zoom);
      expect(Math.abs(after.x)).toBeLessThanOrEqual(limit.x + 1e-9);
      expect(Math.abs(after.z)).toBeLessThanOrEqual(limit.z + 1e-9);
      expect(after.zoom).toBeLessThan(range.max * EXPLORER.stretch);
      expect(after.zoom).toBeGreaterThan(range.min / EXPLORER.stretch);
      if (moved.length === 0) {
        // The last finger lifted: anywhere past the limits springs back inside them.
        settle(explorer);
        expect(clampView(frame, explorer.view)).toEqual(explorer.view);
      } else if (!same) {
        // A finger landed or lifted: the view stays exactly where it was.
        expect(after).toEqual(before);
      } else {
        const was = middle(fingers), now = middle(moved);
        const factor = moved.length > 1 && spread(fingers) >= EXPLORER.pinchFloor && spread(moved) >= EXPLORER.pinchFloor ? spread(moved) / spread(fingers) : 1;
        asked *= factor;
        // The zoom is the fingers' own (stretched only past the limits)...
        expect(after.zoom).toBeCloseTo(factor === 1 ? before.zoom : stretchZoom(frame, asked), 6);
        // ...and unless the edge of the water stopped it, the spot that was under the fingers is under them still.
        const target = under(before, was.x, was.y), landed = under(after, now.x, now.y);
        const atEdge = Math.abs(Math.abs(after.x) - limit.x) < 1e-9 || Math.abs(Math.abs(after.z) - limit.z) < 1e-9;
        if (!atEdge) {
          expect(landed.x).toBeCloseTo(target.x, 6);
          expect(landed.z).toBeCloseTo(target.z, 6);
        }
        // Never a jump: the zoom changes no more than the fingers' spread did (past a limit, less).
        expect(Math.abs(Math.log(after.zoom / before.zoom))).toBeLessThanOrEqual(Math.abs(Math.log(factor)) + 1e-9);
      }
      fingers = moved;
    }
    explorer.touch([], t += 16);
    settle(explorer);
    expect(clampView(frame, explorer.view)).toEqual(explorer.view);
  }
});

test('quick pinches are never a double tap, however quick; two quick one-finger taps are', () => {
  const explorer = opened(PHONE), range = zoomRange(PHONE);
  explorer.zoomAt(4, 0, 0);
  let t = 0;
  const pinch = (from: number, to: number) => {
    for (let i = 0; i <= 3; i++) { const d = from + (to - from) * i / 3; explorer.touch([{ id: 1, x: -d, y: 40 }, { id: 2, x: d, y: 40 }], t += 16); }
    explorer.touch([], t += 16);
  };
  const tap = (x: number, y: number, hold = 60, drift = 0) => { explorer.touch([{ id: 5, x, y }], t); explorer.touch([{ id: 5, x: x + drift, y }], t += hold); explorer.touch([], t += 1); };
  // Two quick pinches in a row to zoom out (each a tenth of a second, a tenth apart): out, and out again.
  const start = explorer.view.zoom;
  pinch(70, 50); t += 100; pinch(70, 50);
  settle(explorer);
  expect(explorer.view.zoom).toBeCloseTo(start * (50 / 70) ** 2, 6);
  // Two quick taps with one finger: twice as close, about that spot.
  const zoom = explorer.view.zoom, spot = under(explorer.view, 40, -60);
  tap(40, -60); t += 120; tap(42, -58);
  settle(explorer);
  expect(explorer.view.zoom).toBeCloseTo(Math.min(zoom * EXPLORER.doubleTap, range.max), 6);
  expect(under(explorer.view, 40, -60).x).toBeCloseTo(spot.x, 6);
  // Not a double tap: a finger that drags, or lingers; taps too far apart in time or place; a tap then a pinch.
  const was = explorer.view.zoom;
  tap(0, 0, 60, 15); t += 100; tap(0, 0);
  t += 1000; tap(0, 0, 400); t += 100; tap(0, 0);
  t += 1000; tap(0, 0); t += 500; tap(0, 0);
  t += 1000; tap(0, 0); t += 100; tap(80, 0);
  t += 1000; tap(0, 0); t += 100; pinch(60, 61);
  settle(explorer);
  expect(explorer.view.zoom).toBeCloseTo(was * 61 / 60, 6);
});

test('pinched past either zoom limit, the zoom stretches with more and more resistance, and springs back once the fingers lift', () => {
  const explorer = opened(PHONE), range = zoomRange(PHONE);
  explorer.zoomAt(100, 0, 0);
  expect(explorer.view.zoom).toBeCloseTo(range.max, 9);
  // All the way in, the fingers spread to twice as far apart: past the limit, each step gives less than the last.
  let t = 0, d = 40, last = explorer.view.zoom, gave = Infinity;
  explorer.touch([{ id: 1, x: -d, y: 20 }, { id: 2, x: d, y: 20 }], t);
  const spot = under(explorer.view, 0, 20);
  for (let i = 0; i < 20; i++) {
    d *= 2 ** (1 / 20);
    explorer.touch([{ id: 1, x: -d, y: 20 }, { id: 2, x: d, y: 20 }], t += 16);
    const zoom = explorer.view.zoom, step = Math.log(zoom / last);
    expect(step).toBeGreaterThan(0);
    expect(step).toBeLessThan(gave);
    expect(zoom).toBeCloseTo(stretchZoom(PHONE, range.max * d / 40), 9);
    gave = step; last = zoom;
  }
  expect(explorer.view.zoom).toBeGreaterThan(range.max * 1.1);
  expect(explorer.view.zoom).toBeLessThan(range.max * EXPLORER.stretch);
  // Stretched about the fingers: what was between them is there still.
  expect(under(explorer.view, 0, 20).x).toBeCloseTo(spot.x, 6);
  // They lift: back to the limit, easing, about the same spot.
  explorer.touch([], t += 16);
  expect(explorer.moving).toBe(true);
  settle(explorer);
  expect(explorer.view.zoom).toBeCloseTo(range.max, 6);
  expect(under(explorer.view, 0, 20).x).toBeCloseTo(spot.x, 6);
  // All the way out, pinched in: stretched out a little (never so far the water stops filling the screen), and back.
  explorer.showAll(); settle(explorer);
  explorer.touch([{ id: 3, x: -100, y: 0 }, { id: 4, x: 100, y: 0 }], t += 16);
  explorer.touch([{ id: 3, x: -50, y: 0 }, { id: 4, x: 50, y: 0 }], t += 16);
  expect(explorer.view.zoom).toBeLessThan(range.min);
  expect(explorer.view.zoom).toBeGreaterThanOrEqual(Math.max(range.min / EXPLORER.stretch, range.cover));
  explorer.touch([], t += 16);
  settle(explorer);
  expect(explorer.view).toEqual(overview(PHONE));
  // A finger landing as it springs back stops it there, and the next move carries on from there without a jump.
  explorer.zoomAt(100, 0, 0);
  explorer.touch([{ id: 5, x: -40, y: 0 }, { id: 6, x: 40, y: 0 }], t += 16);
  explorer.touch([{ id: 5, x: -70, y: 0 }, { id: 6, x: 70, y: 0 }], t += 16);
  explorer.touch([], t += 16);
  explorer.step(1 / 60);
  const caught = explorer.view.zoom;
  expect(caught).toBeGreaterThan(range.max);
  explorer.touch([{ id: 7, x: -60, y: 0 }, { id: 8, x: 60, y: 0 }], t += 16);
  explorer.touch([{ id: 7, x: -60.3, y: 0 }, { id: 8, x: 60.3, y: 0 }], t += 16);
  expect(Math.abs(Math.log(explorer.view.zoom / caught))).toBeLessThan(Math.log(60.3 / 60) + 1e-9);
  expect(explorer.view.zoom).toBeGreaterThan(caught);
  explorer.touch([], t += 16);
  // Held still (reduced motion), it is back at the limit as they lift.
  settle(explorer);
  explorer.holdStill(true);
  explorer.touch([{ id: 9, x: -40, y: 0 }, { id: 10, x: 40, y: 0 }], t += 16);
  explorer.touch([{ id: 9, x: -80, y: 0 }, { id: 10, x: 80, y: 0 }], t += 16);
  explorer.touch([], t += 16);
  expect(explorer.view.zoom).toBeCloseTo(range.max, 9);
});

test('a pinch only tells the tap targets its zoom once it ends, not move by move', () => {
  const explorer = opened(PHONE), heard: number[] = [];
  explorer.subscribe((zoom) => heard.push(zoom));
  let t = 0, a = { id: 1, x: -10, y: 0 }, b = { id: 2, x: 10, y: 0 };
  explorer.touch([a, b], t);
  for (let i = 1; i <= 20; i++) { a = { id: 1, x: -10 - i * 8, y: 0 }; b = { id: 2, x: 10 + i * 8, y: 0 }; explorer.touch([a, b], t += 16); }
  expect(heard).toEqual([]);
  explorer.touch([], t += 16);
  expect(heard).toEqual([explorer.view.zoom]);
});

test('buttons and double taps ease in and out, the wheel zooms at once, and showing the whole ocean goes back to where it opened', () => {
  const explorer = createExplorer({ width: 1, height: 1, level: 1 }), heard: number[] = [];
  explorer.subscribe((zoom) => heard.push(zoom));
  explorer.resize(PHONE);
  expect(explorer.view).toEqual(overview(PHONE));
  explorer.zoomBy(EXPLORER.step);
  const first = explorer.step(1 / 60).zoom;
  expect(first).toBeGreaterThan(overview(PHONE).zoom);
  expect(first).toBeLessThan(overview(PHONE).zoom * EXPLORER.step);
  // Heard once, when it settles.
  const before = heard.length;
  settle(explorer);
  expect(explorer.view.zoom).toBeCloseTo(overview(PHONE).zoom * EXPLORER.step, 6);
  expect(heard.length).toBe(before + 1);
  // Zoom out from all the way out: it stays all the way out.
  explorer.showAll(); settle(explorer);
  explorer.zoomBy(1 / EXPLORER.step); settle(explorer);
  expect(explorer.view.zoom).toBeCloseTo(zoomRange(PHONE).min, 6);
  for (let i = 0; i < 8 && explorer.view.zoom < zoomRange(PHONE).max - 1e-6; i++) { explorer.zoomToward(0, 0); settle(explorer); }
  expect(explorer.view.zoom).toBeCloseTo(zoomRange(PHONE).max, 6);
  explorer.zoomToward(0, 0); settle(explorer);
  expect(explorer.view.zoom).toBeCloseTo(overview(PHONE).zoom, 6);
  explorer.zoomAt(1.5, 0, 0);
  expect(explorer.view.zoom).toBeCloseTo(overview(PHONE).zoom * 1.5, 6);
  explorer.showAll(); settle(explorer);
  expect(explorer.view).toEqual(overview(PHONE));
});

test('every move is heard (so a scene drawn on demand redraws), and held still the view jumps rather than sweeps', () => {
  const explorer = createExplorer({ width: 1, height: 1, level: 1 });
  let moves = 0;
  const unwatch = explorer.watch(() => { moves++; });
  explorer.resize(PHONE);
  explorer.touch([{ id: 1, x: 0, y: 0 }], 0);
  explorer.touch([{ id: 1, x: 10, y: 0 }], 16);
  explorer.zoomAt(1.2, 0, 0);
  explorer.zoomBy(EXPLORER.step);
  expect(moves).toBe(4);
  expect(explorer.moving).toBe(true);
  settle(explorer);
  expect(explorer.moving).toBe(false);
  explorer.zoomBy(EXPLORER.step);
  explorer.holdStill(true);
  expect(explorer.moving).toBe(false);
  const zoom = explorer.view.zoom;
  explorer.zoomBy(1 / EXPLORER.step);
  expect(explorer.view.zoom).toBeCloseTo(zoom / EXPLORER.step, 9);
  let t = 100;
  explorer.touch([{ id: 2, x: 0, y: 0 }], t);
  for (let i = 0; i < 8; i++) explorer.touch([{ id: 2, x: i * 20, y: 0 }], t += 16);
  explorer.touch([], t + 4);
  expect(explorer.moving).toBe(false);
  explorer.showAll();
  expect(explorer.view).toEqual(overview(PHONE));
  const heard = moves;
  unwatch();
  explorer.zoomAt(1.1, 0, 0);
  expect(moves).toBe(heard);
});

test('focusing on a spot eases over to it and in, never back out, within the limits', () => {
  const explorer = opened(PHONE), range = zoomRange(PHONE);
  explorer.focus(1.2, -.8, range.min * 4);
  settle(explorer, 180);
  expect(explorer.view).toEqual(clampView(PHONE, { x: 1.2, z: -.8, zoom: range.min * 4 }));
  expect(explorer.view.x).toBeCloseTo(1.2, 6);
  // Already closer than asked: it keeps the zoom; somewhere past the limits: as near as they allow.
  explorer.focus(0, 0, range.min * 2);
  settle(explorer, 180);
  expect(explorer.view.zoom).toBeCloseTo(range.min * 4, 6);
  explorer.focus(50, 0, range.min * 4);
  settle(explorer, 180);
  expect(explorer.view.x).toBeCloseTo(panLimit(PHONE, range.min * 4).x, 6);
});

// The archipelago in one ocean: the Coral Reef in the middle, the Kelp Forest to the north.
const ARCHIPELAGO = [ISLAND_PLACES['coral-reef'], ISLAND_PLACES['kelp-forest']];
const KELP = ISLAND_PLACES['kelp-forest'];

test('every island found is in one ocean: all the way out shows them all, and the view sails from one to the other and settles over each', () => {
  for (const base of [PHONE, { ...PHONE, level: 6 }, TABLET, { width: 1440, height: 900, level: 1 }]) {
    const frame = { ...base, islands: ARCHIPELAGO }, all = overview(frame), half = halfView(frame, all.zoom), s = oceanScale(frame.level);
    // Both islands' swimming areas on screen at once, and the water still to every edge.
    for (const [x, z] of ARCHIPELAGO) {
      expect(Math.abs(x - all.x) + WORLD.x * s).toBeLessThanOrEqual(half.x + 1e-6);
      expect(Math.abs(z - all.z) + WORLD.z * s).toBeLessThanOrEqual(half.z + 1e-6);
    }
    expect(zoomRange(frame).min).toBeLessThanOrEqual(zoomRange(base).min + 1e-9);
    // Over each island, as the explorer opens on one alone: its middle in the middle of the screen.
    for (const [x, z] of ARCHIPELAGO) {
      const there = islandView(frame, x, z);
      expect(there.x).toBeCloseTo(x, 9);
      expect(there.z).toBeCloseTo(z, 9);
      expect(there.zoom).toBeCloseTo(zoomRange({ ...base, islands: [[x, z]] }).min, 9);
    }
    // A long drag down the screen carries the view from the reef all the way over the Kelp Forest (and no farther than an island alone would let it).
    const home = islandView(frame, 0, 0), dragged = panBy(frame, home, 0, 1e5), alone = panLimit({ ...base, islands: [KELP] }, home.zoom);
    expect(dragged.z).toBeCloseTo(KELP[1] - alone.z, 9);
  }
  // With Home's island alone, the explorer is exactly as before.
  expect(panLimit({ ...PHONE, islands: [[0, 0]] }, 40)).toEqual(panLimit(PHONE, 40));
  expect(overview({ ...TABLET, islands: [[0, 0]] })).toEqual(overview(TABLET));
});

test('the label knows which island the view is over, and the open sea between them', () => {
  const frame = { ...PHONE, islands: ARCHIPELAGO };
  expect(nearestIsland(frame, { x: 0, z: 0 })).toBe(0);
  expect(nearestIsland(frame, { x: KELP[0], z: KELP[1] })).toBe(1);
  expect(nearestIsland(frame, { x: KELP[0] / 2, z: KELP[1] / 2 })).toBe(-1);
  expect(nearestIsland(frame, { x: .2, z: KELP[1] * .2 })).toBe(0);
  expect(nearestIsland(PHONE, { x: 50, z: 50 })).toBe(0);
});

test('the explorer opens on the island asked for, sails to another at a button, and tells the label as the view moves', () => {
  const frame = { ...PHONE, islands: ARCHIPELAGO }, explorer = createExplorer(frame, 1);
  explorer.resize(frame);
  expect(explorer.view).toEqual(islandView(frame, KELP[0], KELP[1]));
  expect(explorer.island).toBe(1);
  const heard: number[] = [];
  explorer.near((island) => heard.push(island));
  explorer.visit(0);
  // The label names where it is going as soon as it sets off.
  expect(heard).toEqual([0]);
  settle(explorer);
  expect(explorer.view).toEqual(islandView(frame, 0, 0));
  // Dragged out into the open sea between them, the label names neither; on over the Kelp Forest, that.
  let t = 0;
  const drag = (to: number) => {
    explorer.touch([{ id: 1, x: 0, y: 0 }], t += 16);
    for (let y = 0; y <= to; y += 20) explorer.touch([{ id: 1, x: 0, y }], t += 16);
    explorer.step(1 / 60);
    explorer.touch([], t += 400);
  };
  drag(explorer.view.zoom * -KELP[1] / 2 / k);
  expect(explorer.island).toBe(-1);
  drag(explorer.view.zoom * -KELP[1] / 2 / k);
  expect(explorer.island).toBe(1);
  expect(heard).toEqual([0, -1, 1]);
});

test('islands known only once it is open (the collection still loading): it opens on the one asked for then, unless the view has moved', () => {
  const alone = { ...PHONE, islands: [ISLAND_PLACES['coral-reef']] }, both = { ...PHONE, islands: ARCHIPELAGO };
  const explorer = createExplorer(alone);
  explorer.resize(alone);
  explorer.resize(both);
  explorer.open(1);
  expect(explorer.view).toEqual(islandView(both, KELP[0], KELP[1]));
  // Moved by hand, it stays where it was put.
  const later = createExplorer(alone);
  later.resize(alone);
  later.zoomBy(EXPLORER.step);
  settle(later);
  const put = later.view;
  later.resize(both);
  later.open(1);
  expect(later.view).toEqual(clampView(both, put));
});
