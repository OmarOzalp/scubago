import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { Dimensions } from 'react-native';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import type { IslandId } from '@/lib/archipelago';
import { EXPLORER_REACH } from '@/lib/seabed-bake';
import { IDLE_MS, oceanAhead, useOceanAhead } from '../ocean-ahead';

// The explorer's ocean made ready from Home (ocean-ahead.ts): asked for once Home has an animal on show and the phone has been left alone a
// while, for the islands, level and water's reach the explorer will use, and again when they change.
jest.mock('../three/seabed-files', () => ({ SEABED_FILES: {} }));
jest.mock('../three/ocean-files', () => ({ oceanFiles: { read: async () => null, write: async () => undefined, remove: async () => undefined, list: async () => [] } }));
const mockEnsure = jest.fn<(level: number, islands: readonly unknown[], reach: unknown, hurry?: boolean) => Promise<string>>();
jest.mock('@/lib/ocean-store', () => ({
  ...(jest.requireActual('@/lib/ocean-store') as object),
  createOceanStore: () => ({ ensure: (...args: Parameters<typeof mockEnsure>) => mockEnsure(...args) }),
}));
let mockMarked = Promise.resolve();
jest.mock('../three/scene-marks', () => ({ whenMarked: () => mockMarked }));
const screen = (width: number, height: number) => Dimensions.set({ window: { width, height, scale: 3, fontScale: 1 }, screen: { width, height, scale: 3, fontScale: 1 } });

const ALL: IslandId[] = ['coral-reef', 'kelp-forest', 'volcanic-pinnacle', 'mangroves', 'shipwreck'];
let root: ReactTestRenderer | undefined;
function Probe(props: { level: number; ids: IslandId[]; enabled?: boolean }) {
  useOceanAhead(props.level, props.ids, props.enabled ?? true);
  return null;
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  mockEnsure.mockReset().mockResolvedValue('worked out');
  mockMarked = Promise.resolve();
  screen(390, 844);
});
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; jest.useRealTimers(); });
const passTime = async (ms: number) => { await act(async () => { await jest.advanceTimersByTimeAsync(ms); }); };

test('the ocean to make ready is the explorer’s: the islands found, in the order it takes them, at the level, with the water its screen reaches', () => {
  const plan = oceanAhead(3, ['coral-reef', 'shipwreck', 'kelp-forest'], { width: 390, height: 844 })!;
  expect(plan.level).toBe(3);
  expect(plan.islands).toEqual([{ x: 0, z: 0, habitat: 'island' }, { x: -.2, z: 24.8, habitat: 'wreck' }, { x: -1.6, z: -24.8, habitat: 'kelp' }]);
  expect(plan.reach).toEqual({ x: 20, z: 20 });
  // A wider screen reaches farther.
  expect(oceanAhead(3, ALL, { width: 1180, height: 820 })!.reach.x).toBeGreaterThan(20);
  // Home's island alone, on a screen the usual reach serves, has its bake shipped: nothing to make ready. (Not on one that reaches farther.)
  expect(oceanAhead(3, ['coral-reef'], { width: 390, height: 844 })).toBeNull();
  expect(EXPLORER_REACH).toEqual({ x: 20, z: 20 });
  expect(oceanAhead(3, ['coral-reef'], { width: 3000, height: 800 })?.reach.x).toBeGreaterThan(20);
  expect(oceanAhead(3, [], { width: 390, height: 844 })).toBeNull();
});

test('it is asked for once Home has an animal on show and the phone has been left alone, and not before', async () => {
  let shown!: () => void;
  mockMarked = new Promise((resolve) => { shown = resolve; });
  await act(async () => { root = create(<Probe level={3} ids={ALL} />); });
  await passTime(IDLE_MS * 4);
  expect(mockEnsure).not.toHaveBeenCalled();
  await act(async () => shown());
  await passTime(IDLE_MS - 100);
  expect(mockEnsure).not.toHaveBeenCalled();
  await passTime(200);
  expect(mockEnsure).toHaveBeenCalledTimes(1);
  const [level, islands, reach, hurry] = mockEnsure.mock.calls[0];
  expect(level).toBe(3);
  expect(islands).toHaveLength(5);
  expect(reach).toEqual({ x: 20, z: 20 });
  // (nobody is waiting for it: the slices are short)
  expect(hurry).toBeFalsy();
  await passTime(IDLE_MS * 4);
  expect(mockEnsure).toHaveBeenCalledTimes(1);
});

test('a level-up or a newly found island asks again, for the new ocean; the same ocean asks nothing more', async () => {
  await act(async () => { root = create(<Probe level={3} ids={ALL.slice(0, 3)} />); });
  await passTime(IDLE_MS + 100);
  expect(mockEnsure).toHaveBeenCalledTimes(1);
  await act(async () => root!.update(<Probe level={3} ids={ALL.slice(0, 3)} />));
  await passTime(IDLE_MS + 100);
  expect(mockEnsure).toHaveBeenCalledTimes(1);
  await act(async () => root!.update(<Probe level={4} ids={ALL.slice(0, 3)} />));
  await passTime(IDLE_MS + 100);
  expect(mockEnsure).toHaveBeenCalledTimes(2);
  expect(mockEnsure.mock.calls[1][0]).toBe(4);
  await act(async () => root!.update(<Probe level={4} ids={ALL.slice(0, 4)} />));
  await passTime(IDLE_MS + 100);
  expect(mockEnsure).toHaveBeenCalledTimes(3);
  expect(mockEnsure.mock.calls[2][1]).toHaveLength(4);
});

test('nothing is asked for while there is nothing to explore, or after leaving, or for an ocean that ships', async () => {
  await act(async () => { root = create(<Probe level={3} ids={ALL} enabled={false} />); });
  await passTime(IDLE_MS * 2);
  expect(mockEnsure).not.toHaveBeenCalled();
  // Left before the phone was idle.
  await act(async () => root!.update(<Probe level={3} ids={ALL} />));
  await passTime(IDLE_MS - 500);
  await act(async () => root!.unmount());
  root = undefined;
  await passTime(IDLE_MS * 2);
  expect(mockEnsure).not.toHaveBeenCalled();
  // Home's island alone on the usual screen.
  await act(async () => { root = create(<Probe level={3} ids={['coral-reef']} />); });
  await passTime(IDLE_MS * 2);
  expect(mockEnsure).not.toHaveBeenCalled();
});

test('a screen that reaches farther is another ocean', async () => {
  screen(1180, 820);
  await act(async () => { root = create(<Probe level={3} ids={ALL} />); });
  await passTime(IDLE_MS + 100);
  expect((mockEnsure.mock.calls[0][2] as { x: number }).x).toBeGreaterThan(20);
});
