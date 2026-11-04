import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { SanctuaryScene } from '../sanctuary-scene';
import { useMarineModels } from '../three/use-marine-models';
import { HOME_MARKS, markOnce } from '../three/scene-marks';

/**
 * A scene that has been on show and no longer is (a screen that is kept: Home's under the explorer, the explorer's under Home) does no work: its canvas
 * draws nothing, not even a frame on demand, and its stager builds nothing; on show again it draws at once. And the shader warm-up is wired to the scene's
 * moments: Home's card warms every island's shores once its first animal has been drawn and the phone is idle; the explorer warms the islands in view first,
 * and the rest once it is built and idle.
 */
let mockActive = true, mockVisible = true, mockBusy = false;
jest.mock('@/hooks/use-scene-active', () => ({ useSceneActive: () => mockActive, useSceneVisible: () => mockVisible }));
jest.mock('../three/scene-quality', () => ({ useSceneQuality: () => 'full' }));
jest.mock('../three/scene-canvas', () => ({ SceneCanvas: ({ children, frameloop }) => <canvas-host frameloop={frameloop}>{children}</canvas-host> }));
jest.mock('../three/warm-up', () => ({ WarmUp: (props) => <warm {...props} /> }));
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
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; jest.useRealTimers(); delete global.requestIdleCallback; });
const props = { habitat: 'island', level: 1, residents: [], onInspect: jest.fn() };
const explorer = { camera: null, tapScale: 1, zoom: () => 40, focus: jest.fn(), reach: { x: 20, z: 20 }, pictureKey: null, opening: () => true, busy: () => mockBusy,
  near: () => ({ order: ['coral-reef', 'kelp-forest', 'volcanic'], near: 2 }) };
const islands = [['coral-reef', 'island', 0], ['kelp-forest', 'kelp', 30], ['volcanic', 'volcanic', 60]].map(([key, habitat, x]) => ({ key, habitat, x, z: 0, residents: [] }));
const render = async (element) => { await act(async () => { root = create(element); }); };
const update = async (element) => { await act(async () => root.update(element)); };
const frameloop = () => root.root.findByType('canvas-host').props.frameloop;
const warm = () => root.root.findAllByType('warm').map((w) => w.props);
const wait = async (ms) => { await act(async () => { jest.advanceTimersByTime(ms); }); };

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

test('Home’s card warms every island’s shores only once its first animal has been drawn and the phone has been left alone', async () => {
  global.requestIdleCallback = (callback) => setTimeout(callback, 0);
  await render(<SanctuaryScene {...props} warm={['island', 'kelp', 'volcanic']} />);
  await wait(10000);
  expect(warm()).toEqual([]);
  await act(async () => { markOnce(HOME_MARKS.animal); });
  await wait(1000);
  expect(warm()).toEqual([]);
  await wait(3000);
  expect(warm()).toHaveLength(1);
  expect(warm()[0]).toMatchObject({ habitats: ['island', 'kelp', 'volcanic'], waters: 1 });
  // (not while hidden)
  mockVisible = false;
  await update(<SanctuaryScene {...props} warm={['island', 'kelp', 'volcanic']} />);
  expect(warm()).toEqual([]);
});

test('the explorer warms every island’s shores once it is built and the phone has been left alone, and nothing before (opening it is not slowed by it)', async () => {
  global.requestIdleCallback = (callback) => setTimeout(callback, 0);
  await render(<SanctuaryScene {...props} islands={islands} explorer={explorer} />);
  await wait(3000);
  expect(warm()).toEqual([]);
  // Built (nothing left to build anywhere), and a second of peace.
  await act(async () => { mockStager.register({ island: null, stage: 0, total: 0, opened: 0, open: () => {} }); });
  await wait(900);
  expect(warm()).toEqual([]);
  await wait(300);
  expect(warm()).toHaveLength(1);
  expect(warm()[0]).toMatchObject({ habitats: ['island', 'kelp', 'volcanic'], waters: 3, paced: true });
  // A kind a frame, and none while a finger is down or the camera is easing.
  expect(warm()[0].paused()).toBe(false);
  mockBusy = true;
  expect(warm()[0].paused()).toBe(true);
  mockBusy = false;
  // Hidden (closed, kept), it links nothing more; shown again, nothing is done twice (the warm-up itself skips what it has linked).
  mockVisible = false;
  await update(<SanctuaryScene {...props} islands={islands} explorer={explorer} />);
  expect(warm()).toEqual([]);
});

test('with EXPO_PUBLIC_EXPLORER_WARM=view the explorer warms the islands in view first, as its canvas is ready, and the rest once built and idle', async () => {
  process.env.EXPO_PUBLIC_EXPLORER_WARM = 'view';
  try {
    global.requestIdleCallback = (callback) => setTimeout(callback, 0);
    await render(<SanctuaryScene {...props} islands={islands} explorer={explorer} />);
    await wait(10);
    expect(warm()).toHaveLength(1);
    expect(warm()[0]).toMatchObject({ habitats: ['island', 'kelp'], waters: 3 });
    await act(async () => { mockStager.register({ island: null, stage: 0, total: 0, opened: 0, open: () => {} }); });
    await wait(1200);
    expect(warm()).toHaveLength(1);
    expect(warm()[0]).toMatchObject({ habitats: ['island', 'kelp', 'volcanic'], waters: 3 });
  } finally { delete process.env.EXPO_PUBLIC_EXPLORER_WARM; }
});
