import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { SanctuaryScene } from '../sanctuary-scene';
import { useMarineModels } from '../three/use-marine-models';
import { captureFrame, captureScene, hasScene } from '@/lib/scene-snapshot';

// The card's picture (src/lib/scene-snapshot.ts): the scene registers how to take it only while it can.
let mockActive = true, mockVisible = true, mockQuality = 'full';
jest.mock('@/hooks/use-scene-active', () => ({ useSceneActive: () => mockActive, useSceneVisible: () => mockVisible }));
jest.mock('../three/scene-quality', () => ({ useSceneQuality: () => mockQuality }));
jest.mock('@/lib/scene-snapshot', () => ({ ...jest.requireActual('@/lib/scene-snapshot'), captureFrame: jest.fn() }));
jest.mock('../three/scene-canvas', () => ({ SceneCanvas: ({ children }) => <>{children}</> }));
jest.mock('../three/use-marine-models', () => ({ useMarineModels: jest.fn() }));
jest.mock('../three/scene-camera', () => ({ SceneCamera: () => null }));
jest.mock('../three/scene-performance', () => ({ ScenePerformance: () => null }));
jest.mock('../three/sanctuary-environment', () => ({ SanctuaryEnvironment: ({ children }) => <environment>{children}</environment> }));
const mockRenderer = { gl: { render: jest.fn() }, scene: { name: 'scene' }, camera: { name: 'camera' } };
jest.mock('@react-three/fiber', () => ({
  useFrame: jest.fn(),
  useThree: (select) => select({ size: { width: 420, height: 390 }, invalidate: () => {}, camera: {}, get: () => mockRenderer }),
}));
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

let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockActive = true; mockVisible = true; mockQuality = 'full';
  useMarineModels.mockReturnValue({ models: {}, failed: false, retry: jest.fn() });
  captureFrame.mockReset();
});
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });
const props = { habitat: 'island', level: 1, residents: [], onInspect: jest.fn() };
const show = async (extra = {}) => { await act(async () => { root = create(<SanctuaryScene {...props} {...extra} />); }); };

test('the Home card registers its picture, taken from the renderer as it is when asked', async () => {
  captureFrame.mockResolvedValue('file:///cache/GLView/home.png');
  await show();
  expect(hasScene('home')).toBe(true);
  expect(await captureScene('home', { width: 1736, height: 812 })).toBe('file:///cache/GLView/home.png');
  expect(captureFrame).toHaveBeenCalledWith({ gl: mockRenderer.gl, scene: mockRenderer.scene, camera: mockRenderer.camera }, { width: 1736, height: 812 });
});

test('it unregisters when the scene goes away, so Share draws the illustration', async () => {
  await show();
  expect(hasScene('home')).toBe(true);
  await act(async () => root.unmount());
  root = null;
  expect(hasScene('home')).toBe(false);
  expect(await captureScene('home', { width: 1736, height: 812 })).toBeNull();
});

test('a paused island can still be photographed', async () => {
  mockActive = false;
  await show({ paused: true });
  expect(hasScene('home')).toBe(true);
});

test('Reduce Motion (the scene is still, without the diver pausing it) is left to the illustration', async () => {
  mockActive = false;
  await show();
  expect(hasScene('home')).toBe(false);
});

test.each([
  ['the screen isn’t on show', () => { mockVisible = false; }, {}],
  ['the diver’s discoveries are still loading', () => {}, { loading: true }],
  ['it runs in the cheap lite tier (an emulator’s software GL)', () => { mockQuality = 'lite'; }, {}],
])('there is no picture to take while %s', async (_name, setup, extra) => {
  setup();
  await show(extra);
  expect(hasScene('home')).toBe(false);
});

test('it registers again when the scene comes back (focus, foreground)', async () => {
  mockVisible = false;
  await show();
  expect(hasScene('home')).toBe(false);
  mockVisible = true;
  await act(async () => root.update(<SanctuaryScene {...props} />));
  expect(hasScene('home')).toBe(true);
});

test('the full-screen explorer never registers: it is not the Home card', async () => {
  await show({ explorer: { camera: null, tapScale: 1, zoom: () => 40, focus: jest.fn() } });
  expect(hasScene('home')).toBe(false);
});

test('a scene that failed to load its animals has no 3D picture to give', async () => {
  useMarineModels.mockReturnValue({ models: null, failed: true, retry: jest.fn() });
  await show();
  expect(hasScene('home')).toBe(false);
});
