import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { SanctuaryScene } from '../sanctuary-scene';
import { useMarineModels } from '../three/use-marine-models';

/**
 * A scene that has been on show and no longer is (a screen that is kept: Home's under the explorer, the explorer's under Home) does no work: its canvas
 * draws nothing, not even a frame on demand, and its stager builds nothing; on show again it draws at once.
 */
let mockActive = true, mockVisible = true;
jest.mock('@/hooks/use-scene-active', () => ({ useSceneActive: () => mockActive, useSceneVisible: () => mockVisible }));
jest.mock('../three/scene-quality', () => ({ useSceneQuality: () => 'full' }));
jest.mock('../three/scene-canvas', () => ({ SceneCanvas: ({ children, frameloop }) => <canvas-host frameloop={frameloop}>{children}</canvas-host> }));
jest.mock('../three/use-marine-models', () => ({ useMarineModels: jest.fn() }));
jest.mock('../three/scene-camera', () => ({ SceneCamera: () => null }));
jest.mock('../three/scene-performance', () => ({ ScenePerformance: () => null }));
jest.mock('../three/sanctuary-environment', () => ({ SanctuaryEnvironment: ({ children, ready }) => <environment data-ready={ready}>{children}</environment> }));
const mockInvalidate = jest.fn();
jest.mock('@react-three/fiber', () => ({
  useFrame: jest.fn(),
  useThree: (select) => select({ size: { width: 390, height: 844 }, invalidate: mockInvalidate, camera: {}, get: () => ({ gl: {}, scene: {}, camera: {} }) }),
}));
// The stager is real; the provider says whether it was told to hold, and lets a test reach it.
let mockStager = null;
jest.mock('../three/staging', () => ({
  ...jest.requireActual('../three/staging'),
  StagingProvider: ({ stager, hidden, children }) => { mockStager = stager; stager.hold(hidden); return <staging data-hidden={hidden}>{children}</staging>; },
}));
jest.mock('../home-start', () => ({ ...jest.requireActual('../home-start'), useHomeScene: () => null, rememberHomeScene: jest.fn(), rememberHomePicture: jest.fn(), rememberExplorerPicture: jest.fn(async () => undefined) }));
jest.mock('../three/animated-marine', () => ({ AnimatedMarine: () => null }));
jest.mock('../three/tuna-school-mesh', () => ({ TunaSchoolMesh: () => null }));
jest.mock('../three/marine-splashes', () => ({ MarineSplashes: () => null }));
jest.mock('../three/reef-rocks', () => ({ ReefRocks: () => null }));
jest.mock('../three/reef-anemone', () => ({ ReefAnemones: () => null }));
jest.mock('../three/tap-target', () => ({ TAP_SLOP: 8 }));
jest.mock('../three/kelp-movers', () => ({ KELP_MOVERS: 12, KelpMoversContext: require('react').createContext(null) }));
jest.mock('../three/macro-life', () => ({ MacroLife: () => null }));
jest.mock('../island-scene', () => ({ IslandScene: () => <fallback /> }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../three/seabed-files', () => ({ SEABED_FILES: {} }));
// (the ocean's seabed is worked out for real elsewhere; here it is ready)
jest.mock('../three/seabed-assets', () => ({ ...jest.requireActual('../three/seabed-assets'), useSeabedReady: () => true, preloadSeabedBakes: jest.fn() }));

let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  mockActive = true; mockVisible = true; mockStager = null; mockInvalidate.mockClear();
  useMarineModels.mockReturnValue({ models: {}, failed: false, retry: jest.fn() });
});
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; jest.useRealTimers(); });
const props = { habitat: 'island', level: 1, residents: [], onInspect: jest.fn() };
const render = async (element) => { await act(async () => { root = create(element); }); };
const update = async (element) => { await act(async () => root.update(element)); };
const frameloop = () => root.root.findByType('canvas-host').props.frameloop;

test('on show it draws every frame; once it has been on show and is not, it draws nothing at all and builds nothing; shown again it draws and builds', async () => {
  await render(<SanctuaryScene {...props} />);
  expect(frameloop()).toBe('always');
  expect(root.root.findByType('staging').props['data-hidden']).toBe(false);
  mockVisible = false;
  await update(<SanctuaryScene {...props} />);
  expect(frameloop()).toBe('never');
  expect(root.root.findByType('staging').props['data-hidden']).toBe(true);
  mockVisible = true;
  await update(<SanctuaryScene {...props} />);
  expect(frameloop()).toBe('always');
  expect(root.root.findByType('staging').props['data-hidden']).toBe(false);
});

test('a scene that has not been on show yet (its screen not focused yet) is not asleep: its first frame is not held up', async () => {
  mockVisible = false;
  await render(<SanctuaryScene {...props} />);
  expect(frameloop()).toBe('always');
});

test('Reduce Motion: shown it draws on demand (still), hidden it draws nothing, shown again a frame is asked for', async () => {
  mockActive = false;
  await render(<SanctuaryScene {...props} />);
  expect(frameloop()).toBe('demand');
  mockVisible = false;
  await update(<SanctuaryScene {...props} />);
  expect(frameloop()).toBe('never');
  mockInvalidate.mockClear();
  mockVisible = true;
  await update(<SanctuaryScene {...props} />);
  expect(frameloop()).toBe('demand');
  expect(mockInvalidate).toHaveBeenCalled();
});
