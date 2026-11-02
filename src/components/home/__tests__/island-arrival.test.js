import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { SanctuaryEnvironment } from '../three/sanctuary-environment';
import { builtKey, forgetBuilt, wasBuilt } from '../three/built-islands';
import { Arriving, IslandContext, SeenContext, Stage, StagerContext, Whole } from '../three/staging';
import { createStager, STAGE } from '../three/stager';
import { GrowthContext, Unlock } from '../three/unlock';

/**
 * How an island comes into a scene that is already on show (staging.tsx, sanctuary-environment.tsx): one built before in this session is simply there, and
 * one new to it is hidden while its coast and what grows on and round it are built in steps and then shown whole, all at once. Nothing grows up out of the
 * ground (that is unlock.tsx's, for a level-up, and it still does).
 */
let mockFrames = [];
jest.mock('@react-three/fiber', () => ({
  useFrame: (callback) => { global.__frames.push(callback); },
  useThree: (select) => select({ invalidate: () => {}, size: { width: 390, height: 844 } }),
}));
jest.mock('../three/water-surface', () => ({
  useOcean: () => ({ uniforms: {}, field: { bank: null }, meshes: [] }),
  WaterSurface: () => null,
}));
jest.mock('../three/ocean-mesh', () => ({ islandOceanUniforms: () => ({}) }));
jest.mock('../three/island-shape', () => ({ islandScale: () => 1 }));
jest.mock('../three/kelp-movers', () => ({ createKelpMovers: () => ({}), KelpMoversContext: require('react').createContext(null) }));
jest.mock('../three/islet-material', () => ({ submerge: () => () => undefined }));
// The island's pieces, as they are made in the app: each wrapped in what brings a piece into a scene on show (Arriving), and the corals standing in for a mesh made in slices.
jest.mock('../three/reef-coast', () => {
  const { Arriving: Arrive } = require('../three/staging');
  return { ReefCoast: () => <Arrive><reefcoast /></Arrive>, ReefCorals: () => <Arrive><corals /></Arrive> };
});
jest.mock('../three/kelp-coast', () => ({ KelpCoast: () => <kelpcoast /> }));
jest.mock('../three/kelp-forest', () => ({ KelpForest: () => <kelpforest /> }));
jest.mock('../three/volcanic-coast', () => ({ VolcanicCoast: () => <volcanic /> }));
jest.mock('../three/mangrove-coast', () => ({ MangroveCoast: () => <mangrove /> }));
jest.mock('../three/seagrass-meadow', () => ({ SeagrassMeadow: () => <seagrass /> }));
jest.mock('../three/wreck-coast', () => ({ WreckCoast: () => <wreck /> }));
jest.mock('../three/archipelago-sea', () => ({ ArchipelagoSea: () => <sea /> }));

let root, stager, scaled;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  mockFrames = []; global.__frames = mockFrames;
  forgetBuilt();
  delete process.env.EXPO_PUBLIC_ISLAND_ARRIVAL;
  scaled = [];
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
  jest.useRealTimers();
  delete process.env.EXPO_PUBLIC_ISLAND_ARRIVAL;
});
/** A frame drawn and the timers it sets run: the stager opens its next step (the test's clock does no work, so there is a frame between only when it is a long while since the last). */
const step = async () => { await act(async () => { stager.frame(); jest.advanceTimersByTime(300); }); };
const nodes = (type) => root.root.findAll((node) => node.type === type);
/** The group holding the island's coast and what grows on and round it (staging.tsx: Whole). */
const whole = () => root.root.find((node) => node.type === 'group' && typeof node.props.visible === 'boolean');
/** Every group the scene gave a scale to (what arrives into a scene on show grows by scaling), with the smallest scale it was ever given. */
const createNodeMock = (element) => {
  if (element.type !== 'group') return null;
  const node = { smallest: 1, last: 1, scale: { setScalar(value) { node.smallest = Math.min(node.smallest, value); node.last = value; } } };
  scaled.push(node);
  return node;
};
const island = { key: 'island', habitat: 'island', x: 0, z: 0, content: <swimming /> };
const scene = (extra = {}) => (
  <StagerContext.Provider value={stager}>
    <GrowthContext.Provider value={{ animate: true, duration: 3.5 }}>
      <SanctuaryEnvironment habitat="island" level={1} active growIn islands={[island]} {...extra} />
    </GrowthContext.Provider>
  </StagerContext.Provider>
);
const mount = async (extra) => { await act(async () => { root = create(scene(extra), { createNodeMock }); }); };
const newStager = () => { stager = createStager({ heavy: 1e9, age: 1e9 }); stager.show(true); };

test('an island new to the session is hidden while its coast and what grows on and round it are built, and shown whole when the last step has opened', async () => {
  newStager();
  await mount();
  // Nothing is built before the scene's first frame: the sea draws first.
  expect(nodes('reefcoast')).toHaveLength(0);
  expect(whole().props.visible).toBe(false);
  const shown = [];
  for (let i = 0; i < 6; i++) {
    await step();
    shown.push([nodes('reefcoast').length, nodes('corals').length, whole().props.visible]);
  }
  // The coast is built first and the corals after (with the animals' swimming between): both are in the scene, and not shown, until the corals' step has opened;
  // then both are shown, all at once.
  const firstShown = shown.findIndex(([, , visible]) => visible);
  expect(firstShown).toBeGreaterThan(0);
  expect(shown.slice(0, firstShown).some(([coast, corals]) => coast === 1 && corals === 0)).toBe(true);
  expect(shown[firstShown - 1][2]).toBe(false);
  expect(shown[firstShown].slice(0, 2)).toEqual([1, 1]);
  expect(shown.slice(firstShown).every(([coast, corals, visible]) => coast === 1 && corals === 1 && visible)).toBe(true);
  // Nothing grew: no piece was ever given a scale under its full size.
  expect(scaled.every((node) => node.smallest === 1)).toBe(true);
});

test('an island built to the end is remembered, by its shores, level and quality', async () => {
  newStager();
  expect(wasBuilt(builtKey('island', 1, 'full'))).toBe(false);
  await mount();
  for (let i = 0; i < 6; i++) await step();
  expect(whole().props.visible).toBe(true);
  expect(wasBuilt(builtKey('island', 1, 'full'))).toBe(true);
  expect(wasBuilt(builtKey('island', 2, 'full'))).toBe(false);
  expect(wasBuilt(builtKey('island', 1, 'lite'))).toBe(false);
  expect(wasBuilt(builtKey('kelp', 1, 'full'))).toBe(false);
});

test('an island that is left before it is built is not remembered as built', async () => {
  newStager();
  await mount();
  await step();
  expect(nodes('reefcoast')).toHaveLength(1);
  expect(wasBuilt(builtKey('island', 1, 'full'))).toBe(false);
  await act(async () => root.unmount());
  root = null;
  expect(wasBuilt(builtKey('island', 1, 'full'))).toBe(false);
});

test('an island built before is simply there on the first render, whole, with nothing staged but its animals, and nothing grows', async () => {
  newStager();
  await mount();
  for (let i = 0; i < 6; i++) await step();
  await act(async () => root.unmount());
  root = null;
  scaled = [];

  // A scene mounted again (the island pill switched back, the explorer opened again): its coast and corals are in it, shown, before any frame.
  newStager();
  await mount();
  expect(nodes('reefcoast')).toHaveLength(1);
  expect(nodes('corals')).toHaveLength(1);
  expect(whole().props.visible).toBe(true);
  // No step of the coast or what grows on it is left to the stager; the animals' swimming is.
  expect(stager.has('island', [STAGE.coast, STAGE.props])).toBe(false);
  expect(stager.has('island', [STAGE.swim])).toBe(true);
  expect(nodes('swimming')).toHaveLength(0);
  await step();
  expect(nodes('swimming')).toHaveLength(1);
  expect(scaled.every((node) => node.smallest === 1)).toBe(true);
});

test('with growing arrival, a piece of an island new to the session grows in, and one built before still does not', async () => {
  process.env.EXPO_PUBLIC_ISLAND_ARRIVAL = 'grow';
  newStager();
  await mount();
  await step();
  // (the coast is built and not held back: it grows)
  expect(whole().props.visible).toBe(true);
  expect(scaled.some((node) => node.smallest < .01)).toBe(true);
  for (let i = 0; i < 6; i++) await step();
  await act(async () => root.unmount());
  root = null;
  scaled = [];

  newStager();
  await mount();
  await step();
  expect(nodes('reefcoast')).toHaveLength(1);
  expect(scaled.every((node) => node.smallest === 1)).toBe(true);
});

test('islands in the explorer: each is shown whole when its own steps are all open, those built before at once', async () => {
  newStager();
  const places = [
    { key: 'coral-reef', habitat: 'island', x: 0, z: 0 },
    { key: 'kelp-forest', habitat: 'kelp', x: 0, z: -24 },
  ];
  // The reef was built before (on Home's card).
  await mount({ islands: places });
  for (let i = 0; i < 10; i++) await step();
  const groups = () => root.root.findAll((node) => node.type === 'group' && typeof node.props.visible === 'boolean').map((node) => node.props.visible);
  expect(groups()).toEqual([true, true]);
  await act(async () => root.unmount());
  root = null;

  newStager();
  await mount({ islands: [places[0], { key: 'volcanic-pinnacle', habitat: 'volcanic', x: 0, z: -12 }] });
  // The reef is there at once; the volcano, new to the session, is not shown until its coast has been made.
  expect(groups()).toEqual([true, false]);
  for (let i = 0; i < 10; i++) await step();
  expect(groups()).toEqual([true, true]);
});

test('Whole holds nothing back where nothing stages the scene (the animal close-up, the tests)', async () => {
  await act(async () => { root = create(<IslandContext.Provider value="a"><Whole memory="x"><Stage at={STAGE.coast}><built /></Stage></Whole></IslandContext.Provider>); });
  expect(whole().props.visible).toBe(true);
  expect(nodes('built')).toHaveLength(1);
});

test('a level-up still grows its new pieces in, as it always did, on an island shown whole', async () => {
  newStager();
  const Island = ({ level }) => (
    <StagerContext.Provider value={stager}>
      <GrowthContext.Provider value={{ animate: true, duration: 3.5 }}>
        <IslandContext.Provider value="island"><SeenContext.Provider value>
          <Whole memory="island|level-up|full"><Unlock at={4} level={level} kind="grow"><Arriving><palm /></Arriving></Unlock></Whole>
        </SeenContext.Provider></IslandContext.Provider>
      </GrowthContext.Provider>
    </StagerContext.Provider>
  );
  await act(async () => { root = create(<Island level={3} />, { createNodeMock }); });
  expect(nodes('palm')).toHaveLength(0);
  await act(async () => root.update(<Island level={4} />));
  expect(nodes('palm')).toHaveLength(1);
  // The level's piece starts from nothing and grows over the frames that follow.
  const unlockGroup = scaled.find((node) => node.smallest < .01);
  expect(unlockGroup).toBeDefined();
  const tick = mockFrames.filter((callback) => callback.length === 2);
  expect(tick.length).toBeGreaterThan(0);
  for (let i = 0; i < 80; i++) await act(async () => { for (const callback of tick) callback(undefined, .05); });
  expect(unlockGroup.last).toBe(1);
  expect(whole().props.visible).toBe(true);
});
