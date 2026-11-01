import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { clearSeabedBakes, EXPLORER_REACH, rememberOcean, seabedBakeKey } from '@/lib/seabed-bake';
import type { OceanIsland } from '@/lib/seabed';
import { useSeabedReady } from '../three/seabed-assets';

// When a scene may build its ocean (seabed-assets.ts): the explorer's ocean of several islands has no bake shipped, so it waits for the
// ocean store (src/lib/ocean-store.ts) to hold it, read back or worked out in slices, and no longer than that.
jest.mock('../three/seabed-files', () => ({ SEABED_FILES: {} }));
jest.mock('../three/ocean-files', () => ({ oceanFiles: { read: async () => null, write: async () => undefined, remove: async () => undefined, list: async () => [] } }));
const mockEnsure = jest.fn<(level: number, islands: readonly OceanIsland[], reach: unknown, hurry: boolean) => Promise<string>>();
const mockRelease = jest.fn<(level: number, islands: readonly OceanIsland[], reach: unknown) => void>();
jest.mock('@/lib/ocean-store', () => ({
  ...(jest.requireActual('@/lib/ocean-store') as object),
  createOceanStore: () => ({ ensure: (...args: Parameters<typeof mockEnsure>) => mockEnsure(...args), release: (...args: Parameters<typeof mockRelease>) => mockRelease(...args) }),
}));

const several: OceanIsland[] = [{ x: 0, z: 0, habitat: 'island' }, { x: 2.4, z: 12.4, habitat: 'mangrove' }, { x: -1.6, z: -24.8, habitat: 'kelp' }];
let root: ReactTestRenderer | undefined;
const seen: boolean[] = [];
function Probe(props: { level: number; islands: OceanIsland[]; reach?: typeof EXPLORER_REACH; wanted?: boolean }) {
  const ready = useSeabedReady(props.level, props.islands, props.reach, props.wanted);
  seen.push(ready);
  return null;
}
/** What the scene was last told. */
const ready = () => seen[seen.length - 1];
beforeEach(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; seen.length = 0; mockEnsure.mockReset(); mockRelease.mockReset(); });
afterEach(async () => { clearSeabedBakes(); if (root) await act(async () => root!.unmount()); root = undefined; });

test('the explorer’s several islands wait for their ocean, and are ready once it is held', async () => {
  let held!: () => void;
  mockEnsure.mockImplementation(() => new Promise((resolve) => { held = () => { rememberOcean(seabedBakeKey(3, several, EXPLORER_REACH), {}); resolve('worked out'); }; }));
  await act(async () => { root = create(<Probe level={3} islands={several} reach={EXPLORER_REACH} />); });
  expect(ready()).toBe(false);
  // (asked for once, for these islands, this level and reach, and as someone waiting for it)
  expect(mockEnsure).toHaveBeenCalledTimes(1);
  expect(mockEnsure).toHaveBeenCalledWith(3, several, EXPLORER_REACH, true);
  await act(async () => held());
  expect(ready()).toBe(true);
  expect(mockEnsure).toHaveBeenCalledTimes(1);
});

test('an ocean already held (made ready from Home) is there at the first render, with nothing asked for', async () => {
  rememberOcean(seabedBakeKey(3, several, EXPLORER_REACH), {});
  await act(async () => { root = create(<Probe level={3} islands={several} reach={EXPLORER_REACH} />); });
  expect(ready()).toBe(true);
  expect(seen[0]).toBe(true);
  expect(mockEnsure).not.toHaveBeenCalled();
});

test('nothing is asked for before it is wanted, and an ocean that could not be had does not hold the scene up', async () => {
  await act(async () => { root = create(<Probe level={3} islands={several} reach={EXPLORER_REACH} wanted={false} />); });
  expect(ready()).toBe(false);
  expect(mockEnsure).not.toHaveBeenCalled();
  // (the store gives up: the scene works the ocean out itself, as it always did)
  mockEnsure.mockResolvedValue('failed');
  await act(async () => root!.update(<Probe level={3} islands={several} reach={EXPLORER_REACH} />));
  expect(mockEnsure).toHaveBeenCalledTimes(1);
  expect(ready()).toBe(true);
});

test('a new level of islands that were ready takes nothing away: no wait, nothing asked for', async () => {
  rememberOcean(seabedBakeKey(3, several, EXPLORER_REACH), {});
  await act(async () => { root = create(<Probe level={3} islands={several} reach={EXPLORER_REACH} />); });
  expect(ready()).toBe(true);
  await act(async () => root!.update(<Probe level={4} islands={several} reach={EXPLORER_REACH} />));
  expect(ready()).toBe(true);
  expect(seen.every(Boolean)).toBe(true);
  expect(mockEnsure).not.toHaveBeenCalled();
});

test('Home’s own island, which has its bake shipped, asks nothing of the ocean store', async () => {
  const home: OceanIsland[] = [{ x: 0, z: 0, habitat: 'island' }];
  await act(async () => { root = create(<Probe level={2} islands={home} />); });
  // (no files under Jest: nothing to wait for)
  expect(ready()).toBe(true);
  await act(async () => root!.update(<Probe level={2} islands={home} reach={EXPLORER_REACH} />));
  expect(ready()).toBe(true);
  expect(mockEnsure).not.toHaveBeenCalled();
});

test('a scene that stops waiting (its reach changed, or it is gone) lets the ocean it asked for go', async () => {
  mockEnsure.mockImplementation(() => new Promise(() => undefined));
  await act(async () => { root = create(<Probe level={3} islands={several} reach={EXPLORER_REACH} />); });
  expect(mockRelease).not.toHaveBeenCalled();
  // The screen turns out to reach farther: the ocean for the first reach is no longer waited for, and another is.
  await act(async () => root!.update(<Probe level={3} islands={several} reach={{ x: 42, z: 20 }} />));
  expect(mockRelease).toHaveBeenCalledTimes(1);
  expect(mockRelease).toHaveBeenCalledWith(3, several, EXPLORER_REACH);
  expect(mockEnsure).toHaveBeenCalledTimes(2);
  await act(async () => root!.unmount());
  root = undefined;
  expect(mockRelease).toHaveBeenCalledTimes(2);
  expect(mockRelease).toHaveBeenLastCalledWith(3, several, { x: 42, z: 20 });
});
