import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { SanctuaryScene } from '../sanctuary-scene';
import { useMarineModels } from '../three/use-marine-models';
import { registerSeabedBake } from '@/lib/seabed-bake';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The scene as the app builds it: in steps (stager.ts, staging.tsx), the animals joining one at a time as their steps come, and Home's
 * picture of it staying up until all in view is built. (The island's parts themselves, behind the scene's environment, are staged by
 * sanctuary-environment.tsx, which three.js keeps out of Jest: perf-build/staged-build.tsx measures those.)
 */
jest.mock('../three/scene-canvas', () => ({ SceneCanvas: ({ children }) => <>{children}</> }));
jest.mock('../three/warm-up', () => ({ WarmUp: () => null }));
jest.mock('../three/use-marine-models', () => ({ useMarineModels: jest.fn() }));
jest.mock('@/hooks/use-scene-active', () => ({ useSceneActive: () => true, useSceneVisible: () => true }));
jest.mock('../three/scene-camera', () => ({ SceneCamera: () => null }));
jest.mock('../three/scene-performance', () => ({ ScenePerformance: () => null, FrameReport: () => null }));
jest.mock('../three/sanctuary-environment', () => ({
  SanctuaryEnvironment: ({ children, islands }) => <environment>{children}{islands?.map((island) => <island key={island.key} data-habitat={island.habitat}>{island.content}{island.small}</island>)}</environment>,
}));
jest.mock('@react-three/fiber', () => ({
  useFrame: jest.fn(),
  useThree: (select) => select({ size: { width: 420, height: 390 }, invalidate: () => {}, camera: {} }),
}));
// The stager the scene made, for drawing frames by hand.
jest.mock('../three/staging', () => {
  const actual = jest.requireActual('../three/staging');
  return { ...actual, StagingProvider: (props) => { global.__stager = props.stager; return <actual.StagingProvider {...props} />; } };
});
jest.mock('../three/animated-marine', () => ({ AnimatedMarine: ({ model, lane, emerge }) => <swimmer {...{ model, lane, emerge }} /> }));
let mockKept = null;
jest.mock('../home-start', () => ({ ...jest.requireActual('../home-start'), useHomeScene: () => mockKept, rememberHomeScene: jest.fn(), rememberHomePicture: jest.fn(), rememberExplorerPicture: jest.fn() }));
jest.mock('../three/tuna-school-mesh', () => ({ TunaSchoolMesh: () => <school /> }));
jest.mock('../three/marine-splashes', () => ({ MarineSplashes: () => null }));
jest.mock('../three/reef-rocks', () => ({ ReefRocks: () => null }));
jest.mock('../three/reef-anemone', () => ({ ReefAnemones: () => null }));
jest.mock('../three/tap-target', () => ({ TAP_SLOP: 8 }));
jest.mock('../three/kelp-movers', () => ({ KELP_MOVERS: 12, KelpMoversContext: require('react').createContext(null) }));
jest.mock('../three/macro-life', () => ({ MacroLife: () => <macro /> }));
jest.mock('../island-scene', () => ({ IslandScene: () => <fallback /> }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../three/seabed-files', () => ({ SEABED_FILES: {} }));
// The explorer's ocean of several islands comes from the ocean store (ocean-store.ts), which would work a real one out in slices: here it is simply held.
jest.mock('@/lib/ocean-store', () => ({
  ...jest.requireActual('@/lib/ocean-store'),
  createOceanStore: () => ({
    ensure: async (level, islands, reach) => { const bake = require('@/lib/seabed-bake'); bake.rememberOcean(bake.seabedBakeKey(level, islands, reach), {}); return 'held'; },
    release: () => undefined,
  }),
}));
for (const bake of ['reef-1']) registerSeabedBake(readFileSync(join(process.cwd(), `assets/baked/seabed/${bake}.bin`)));

let root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; mockKept = null; jest.useFakeTimers(); });
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; jest.useRealTimers(); });
const props = { habitat: 'island', level: 1, residents: [], onInspect: jest.fn() };
const logged = (id, category) => ({ species: { id, commonName: id, scientificName: id, category, rarity: 'common', blurb: '' }, count: 1, firstSeenOn: '2026-01-01', firstSeenSiteId: 'x', lastSeenOn: '2026-01-01' });
const swimmers = () => root.root.findAllByType('swimmer').map((swimmer) => swimmer.props.model);
/** A frame drawn, and the timers it sets run: one step, with a frame between when the work is heavy (the test's clock does no work). */
const step = async () => { await act(async () => { global.__stager.frame(); jest.advanceTimersByTime(300); }); };
const residents = [logged('bottlenose-dolphin', 'mammal'), logged('great-hammerhead', 'shark'), logged('spotted-eagle-ray', 'ray')];
const models = { 'bottlenose-dolphin': {}, 'scalloped-hammerhead': {}, 'spotted-eagle-ray': {} };

test('the swimming starts with no animal on the island, and each joins in its own step, all there at the end as they were before', async () => {
  useMarineModels.mockReturnValue({ models, failed: false, retry: jest.fn() });
  await act(async () => { root = create(<SanctuaryScene {...props} residents={residents} />); });
  expect(swimmers()).toEqual([]);
  const seen = [];
  for (let i = 0; i < 8; i++) { await step(); seen.push(new Set(swimmers()).size); }
  // One more species each time (with its group, a pod or a squadron), until all are in.
  expect(seen[0]).toBeGreaterThanOrEqual(0);
  for (let i = 1; i < seen.length; i++) {
    expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
    expect(seen[i] - seen[i - 1]).toBeLessThanOrEqual(1);
  }
  expect(seen.at(-1)).toBe(3);
  expect([...new Set(swimmers())].sort()).toEqual(['bottlenose-dolphin', 'scalloped-hammerhead', 'spotted-eagle-ray']);
  expect(global.__stager.getState().done).toBe(true);
});

test('Home’s picture stays up until everything in view is built, and the animals that joined under it are simply there, not rising', async () => {
  mockKept = { level: 1, habitat: 'island', models: [], picture: { uri: 'file:///documents/home-island-1.png', level: 1, habitat: 'island' } };
  useMarineModels.mockReturnValue({ models, failed: false, retry: jest.fn() });
  await act(async () => { root = create(<SanctuaryScene {...props} residents={residents} />); });
  const watch = () => root.root.find((node) => typeof node.type === 'function' && node.type.name === 'FrameWatch').props.watching;
  // Nothing built, so nothing drawn with its animals yet: not watching for the first such frame.
  expect(watch()).toBe(false);
  for (let i = 0; i < 8 && !watch(); i++) await step();
  expect(global.__stager.getState().settled).toBe(true);
  expect(watch()).toBe(true);
  for (const swimmer of root.root.findAllByType('swimmer')) expect(swimmer.props.emerge).toBe(false);
  expect(swimmers().length).toBeGreaterThanOrEqual(3);
});

test('with no picture kept, an animal whose step comes while the scene is on show rises out of the deep where it is, as one whose model came late does', async () => {
  useMarineModels.mockReturnValue({ models, failed: false, retry: jest.fn() });
  await act(async () => { root = create(<SanctuaryScene {...props} residents={residents} />); });
  for (let i = 0; i < 8; i++) await step();
  const joined = root.root.findAllByType('swimmer');
  expect(joined.length).toBeGreaterThanOrEqual(3);
  expect(joined.some((swimmer) => swimmer.props.emerge)).toBe(true);
});

test('the explorer’s islands are built in order of how near the view they are, the one it opens on first', async () => {
  useMarineModels.mockReturnValue({ models: {}, failed: false, retry: jest.fn() });
  const places = ['coral-reef', 'volcanic-pinnacle', 'mangroves'].map((key, i) => ({ key, habitat: ['island', 'volcanic', 'mangrove'][i], x: 0, z: i * 12, residents: [] }));
  const near = jest.fn(() => ({ order: ['volcanic-pinnacle', 'coral-reef', 'mangroves'], near: 2 }));
  const explorer = { camera: null, tapScale: 1, zoom: () => 40, focus: jest.fn(), reach: { x: 20, z: 20 }, near };
  await act(async () => { root = create(<SanctuaryScene {...props} islands={places} explorer={explorer} />); });
  await step();
  expect(near).toHaveBeenCalled();
});
