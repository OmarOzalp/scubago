import { beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { useFrame } from '@react-three/fiber';
import { GrowthContext, ISLET_DEPTH, Unlock } from '../three/unlock';

jest.mock('@react-three/fiber', () => ({ useFrame: jest.fn() }));

let frames;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  frames = [];
  useFrame.mockImplementation((callback) => { frames.push(callback); });
});
/** Stand-ins for the three.js groups the renderer would create. */
const groups = [];
const createNodeMock = (element) => {
  if (element.type !== 'group') return null;
  const group = { position: { y: 0 }, scale: { value: 1, setScalar(v) { this.value = v; } } };
  groups.push(group);
  return group;
};
const tick = (delta) => { const latest = frames.at(-1); latest(undefined, delta); };
const islet = (level, animate = true) => (
  <GrowthContext.Provider value={{ animate, duration: 3.5 }}>
    <Unlock at={5} level={level} kind="rise"><mesh /></Unlock>
  </GrowthContext.Provider>
);

test('an islet unlocked on screen rises from the water to its place, carrying what stands on it', async () => {
  groups.length = 0;
  let root;
  await act(async () => { root = create(islet(4), { createNodeMock }); });
  expect(root.root.findAllByType('group')).toHaveLength(0);
  await act(async () => root.update(islet(5)));
  const group = groups.at(-1);
  expect(group.position.y).toBeCloseTo(-ISLET_DEPTH);
  const heights = [];
  for (let i = 0; i < 60 * 4; i++) { tick(1 / 60); heights.push(group.position.y); }
  // Up gently and steadily, never overshooting, and exactly home at the end.
  for (let i = 1; i < heights.length; i++) expect(heights[i]).toBeGreaterThanOrEqual(heights[i - 1] - 1e-9);
  expect(Math.max(...heights)).toBeLessThanOrEqual(0);
  expect(heights[60]).toBeLessThan(-.05); // still on its way after a second
  expect(heights.at(-1)).toBe(0);
  // Its palm is a child of the rising group, so it moves with it.
  expect(root.root.findByType('group').findAllByType('mesh')).toHaveLength(1);
  await act(async () => root.unmount());
});

test('present when the island is first shown, an islet is simply there', async () => {
  groups.length = 0;
  let root;
  await act(async () => { root = create(islet(6), { createNodeMock }); });
  expect(groups.at(-1).position.y).toBe(0);
  await act(async () => root.unmount());
});

test('with reduced motion (or the scene paused) a new islet appears in place at once', async () => {
  groups.length = 0;
  let root;
  await act(async () => { root = create(islet(4, false), { createNodeMock }); });
  await act(async () => root.update(islet(5, false)));
  expect(groups.at(-1).position.y).toBe(0);
  await act(async () => root.unmount());
});

test('an islet shown before its level-up was known, then held back for it, rises when the level-up plays', async () => {
  groups.length = 0;
  let root;
  // The island first draws at the collection's level; the level-up still owed holds it back a moment later.
  await act(async () => { root = create(islet(5), { createNodeMock }); });
  await act(async () => root.update(islet(4)));
  await act(async () => root.update(islet(5)));
  const group = groups.at(-1);
  expect(group.position.y).toBeCloseTo(-ISLET_DEPTH);
  for (let i = 0; i < 60 * 4; i++) tick(1 / 60);
  expect(group.position.y).toBe(0);
  await act(async () => root.unmount());
});

test('while it rises the islet looks under water below the surface, and looks as always once in place', async () => {
  groups.length = 0;
  const log = [];
  const submerge = (group) => { log.push('under'); return () => log.push('surfaced'); };
  const rising = (level) => (
    <GrowthContext.Provider value={{ animate: true, duration: 3.5, submerge }}>
      <Unlock at={5} level={level} kind="rise"><mesh /></Unlock>
    </GrowthContext.Provider>
  );
  let root;
  await act(async () => { root = create(rising(4), { createNodeMock }); });
  await act(async () => root.update(rising(5)));
  expect(log).toEqual(['under']);
  for (let i = 0; i < 60 * 2; i++) tick(1 / 60);
  expect(log).toEqual(['under']);
  for (let i = 0; i < 60 * 2; i++) tick(1 / 60);
  expect(log).toEqual(['under', 'surfaced']);
  await act(async () => root.unmount());
  expect(log).toEqual(['under', 'surfaced']);
});
