import { expect, test } from '@jest/globals';
import { ISLAND_PLACES } from '../archipelago';
import { createExplorer, EXPLORER, EXPLORER_PICTURE_VERSION, explorerViewKey, islandsByView, islandView, overview, type ExplorerFrame } from '../explorer-view';
import { oceanScale, WORLD } from '../steering';

// What the explorer's scene builds first (staging.tsx), and the key of the picture kept of its opening view (instant-picture.tsx).
const PHONE: ExplorerFrame = { width: 390, height: 844, level: 1 };
const FIVE = Object.values(ISLAND_PLACES) as [number, number][];
const FIVE_FRAME: ExplorerFrame = { ...PHONE, islands: FIVE };
const IDS = Object.keys(ISLAND_PLACES);
const k = EXPLORER.depthStretch;
const halfView = (frame: ExplorerFrame, zoom: number) => ({ x: frame.width / (2 * zoom), z: frame.height * k / (2 * zoom) });

test('opened on an island, the islands in or near the view are the one it opens on and the neighbours its screen shows, nearest first', () => {
  for (const frame of [FIVE_FRAME, { ...FIVE_FRAME, level: 6 }]) {
    for (let i = 0; i < FIVE.length; i++) {
      const view = islandView(frame, FIVE[i][0], FIVE[i][1]), { order, near } = islandsByView(frame, view);
      // The island opened on is the nearest, and every island is listed once.
      expect(order[0]).toBe(i);
      expect([...order].sort()).toEqual([0, 1, 2, 3, 4]);
      expect(near).toBeGreaterThanOrEqual(1);
      // Those counted are the nearest ones, and each of them reaches into the water the screen shows (with a margin), none of the others does.
      const half = halfView(frame, view.zoom), s = oceanScale(frame.level);
      order.forEach((island, rank) => {
        const [x, z] = FIVE[island];
        const reaches = Math.abs(x - view.x) < half.x * 1.25 + WORLD.x * s && Math.abs(z - view.z) < half.z * 1.25 + WORLD.z * s;
        expect(reaches).toBe(rank < near);
      });
    }
  }
  // On a tall phone at the first level the Coral Reef (Home's) shows its two neighbours and not the far two.
  const home = islandsByView(FIVE_FRAME, islandView(FIVE_FRAME, 0, 0));
  expect(home.near).toBe(3);
  expect(home.order.slice(0, 3).sort()).toEqual([0, IDS.indexOf('mangroves'), IDS.indexOf('volcanic-pinnacle')].sort());
});

test('all the way out over the archipelago every island is in view; and moving the view toward an island brings it in', () => {
  expect(islandsByView(FIVE_FRAME, overview(FIVE_FRAME)).near).toBe(5);
  // Opened on Home's island, the far one (the Shipwreck, 24.8 units south) is not near; with the view moved toward it, it is.
  const here = islandView(FIVE_FRAME, 0, 0), far = IDS.indexOf('shipwreck'), before = islandsByView(FIVE_FRAME, here);
  expect(before.order.indexOf(far)).toBeGreaterThanOrEqual(before.near);
  const after = islandsByView(FIVE_FRAME, { ...here, z: 15 });
  expect(after.order.indexOf(far)).toBeLessThan(after.near);
});

test('a screen not measured yet lists only the island under the middle as near, and a lone island is the only one', () => {
  const unmeasured: ExplorerFrame = { width: 1, height: 1, level: 1, islands: FIVE };
  const view = islandView(unmeasured, FIVE[2][0], FIVE[2][1]), { order, near } = islandsByView(unmeasured, view);
  expect(order[0]).toBe(2);
  expect(near).toBe(1);
  expect(islandsByView(PHONE, overview(PHONE))).toEqual({ order: [0], near: 1 });
});

test('the key of the explorer’s opening view changes with the islands, the level, the island it opens on and the shape of the screen, and not with its size', () => {
  const base = { islands: IDS, level: 3, opens: 'coral-reef', width: 390, height: 844 };
  const key = explorerViewKey(base);
  expect(key.startsWith(`${EXPLORER_PICTURE_VERSION}|`)).toBe(true);
  expect(explorerViewKey({ ...base })).toBe(key);
  expect(explorerViewKey({ ...base, islands: IDS.slice(0, 3) })).not.toBe(key);
  expect(explorerViewKey({ ...base, islands: [...IDS].reverse() })).not.toBe(key);
  expect(explorerViewKey({ ...base, level: 4 })).not.toBe(key);
  expect(explorerViewKey({ ...base, opens: 'shipwreck' })).not.toBe(key);
  expect(explorerViewKey({ ...base, width: 844, height: 390 })).not.toBe(key);
  // The same shape of screen at another size (a picture stretched by a hundredth at most), and the same phone a point or two off.
  expect(explorerViewKey({ ...base, width: 780, height: 1688 })).toBe(key);
  expect(explorerViewKey({ ...base, width: 391, height: 843 })).toBe(key);
  // Another shape of screen is another picture (a bigger phone of the same shape is the same one).
  expect(explorerViewKey({ ...base, width: 360, height: 640 })).not.toBe(key);
  expect(explorerViewKey({ ...base, width: 430, height: 932 })).toBe(key);
  // An unmeasured screen still makes a key rather than a NaN.
  expect(explorerViewKey({ ...base, width: 0, height: 0 })).not.toContain('NaN');
});

test('the view is "opening" until a finger, a button or the wheel has moved it, though the screen being measured does not count', () => {
  const explorer = createExplorer({ width: 1, height: 1, level: 1, islands: FIVE }, 1);
  expect(explorer.opening).toBe(true);
  explorer.resize({ ...PHONE, islands: FIVE });
  expect(explorer.opening).toBe(true);
  explorer.open(2);
  expect(explorer.opening).toBe(true);
  const wheel = createExplorer(PHONE); wheel.resize(PHONE); wheel.zoomAt(1.2, 0, 0);
  expect(wheel.opening).toBe(false);
  const button = createExplorer(PHONE); button.resize(PHONE); button.zoomBy(EXPLORER.step);
  expect(button.opening).toBe(false);
  const finger = createExplorer(PHONE); finger.resize(PHONE); finger.touch([{ id: 1, x: 0, y: 0 }], 0);
  expect(finger.opening).toBe(false);
});
