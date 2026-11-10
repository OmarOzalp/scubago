import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { SanctuaryScene } from '../sanctuary-scene';
import { useMarineModels } from '../three/use-marine-models';
import { captureScene, hasScene } from '@/lib/scene-snapshot';
import { rememberExplorerPicture } from '../home-start';

/**
 * The picture kept of the explorer's opening view: taken once everything in view is built and the view has not been moved, unless the
 * one kept was shown (and good); the scene registers how to take it under its own name, and Home's card keeps its own.
 */
let mockQuality = 'full';
jest.mock('@/hooks/use-scene-active', () => ({ useSceneActive: () => true, useSceneVisible: () => true }));
jest.mock('../three/scene-quality', () => ({ useSceneQuality: () => mockQuality }));
jest.mock('@/lib/scene-snapshot', () => ({ ...jest.requireActual('@/lib/scene-snapshot'), captureFrame: jest.fn(async () => 'file:///cache/GLView/explorer.png'), captureScene: jest.fn() }));
jest.mock('../three/scene-canvas', () => ({ SceneCanvas: ({ children }) => <>{children}</> }));
jest.mock('../three/warm-up', () => ({ WarmUp: () => null }));
jest.mock('../three/use-marine-models', () => ({ useMarineModels: jest.fn() }));
jest.mock('../three/scene-camera', () => ({ SceneCamera: () => null }));
jest.mock('../three/scene-performance', () => ({ ScenePerformance: () => null, FrameReport: () => null }));
jest.mock('../three/sanctuary-environment', () => ({ SanctuaryEnvironment: ({ children }) => <environment>{children}</environment> }));
jest.mock('@react-three/fiber', () => ({
  useFrame: jest.fn(),
  useThree: (select) => select({ size: { width: 390, height: 844 }, invalidate: () => {}, camera: {}, get: () => ({ gl: {}, scene: {}, camera: {} }) }),
}));
jest.mock('../three/staging', () => ({ ...jest.requireActual('../three/staging'), StagingProvider: ({ children }) => <>{children}</> }));
let mockKept = null;
jest.mock('../home-start', () => ({ ...jest.requireActual('../home-start'), useHomeScene: () => mockKept, rememberHomeScene: jest.fn(), rememberHomePicture: jest.fn(), rememberExplorerPicture: jest.fn(async () => undefined) }));
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

const KEY = '1|coral-reef|1|coral-reef|0.46', PICTURE = 'file:///documents/home-island-9.png';
let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  mockKept = null; mockQuality = 'full';
  useMarineModels.mockReturnValue({ models: {}, failed: false, retry: jest.fn() });
  captureScene.mockReset(); captureScene.mockImplementation(async (key) => (hasScene(key) ? 'file:///cache/GLView/explorer.png' : null));
  rememberExplorerPicture.mockClear();
});
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; jest.useRealTimers(); });
const props = { habitat: 'island', level: 1, residents: [], onInspect: jest.fn() };
const explorer = (extra = {}) => ({ camera: null, tapScale: 1, zoom: () => 40, focus: jest.fn(), reach: { x: 20, z: 20 }, pictureKey: KEY, opening: () => true, ...extra });
const show = async (extra = {}, scene = {}) => {
  await act(async () => { root = create(<SanctuaryScene {...props} explorer={explorer(extra)} {...scene} />); });
  // The screen measured: 390 × 844 points.
  const view = root.root.findAll((node) => typeof node.props.onLayout === 'function')[0];
  await act(async () => view.props.onLayout({ nativeEvent: { layout: { width: 390, height: 844 } } }));
};
const wait = async (ms) => { await act(async () => { jest.advanceTimersByTime(ms); }); };

test('the explorer registers how to take its picture under its own name, and Home’s card is not it', async () => {
  await show();
  expect(hasScene('explorer')).toBe(true);
  expect(hasScene('home')).toBe(false);
  await act(async () => root.unmount());
  root = null;
  expect(hasScene('explorer')).toBe(false);
});

test('a picture of the opening view is taken once all in view is built, at twice the screen’s size, and kept under the view’s key', async () => {
  await show();
  await wait(1400);
  expect(captureScene).not.toHaveBeenCalled();
  await wait(200);
  expect(captureScene).toHaveBeenCalledTimes(1);
  // (without what moves: the picture is shown over a live scene whose animals are elsewhere by then)
  expect(captureScene).toHaveBeenCalledWith('explorer', { width: 780, height: 1688, stillOnly: true }, 10000);
  expect(rememberExplorerPicture).toHaveBeenCalledWith('file:///cache/GLView/explorer.png', KEY);
  // Once for each view while the explorer is up.
  await wait(10000);
  expect(captureScene).toHaveBeenCalledTimes(1);
});

test('no picture of a view that has been moved, in the lite tier of an emulator, with no key, or while the collection is read', async () => {
  await show({ opening: () => false });
  await wait(5000);
  expect(captureScene).not.toHaveBeenCalled();
  await act(async () => root.unmount());
  // (the lite tier registers no capture: asked, the registry answers nothing)
  mockQuality = 'lite';
  await show();
  await wait(5000);
  expect(rememberExplorerPicture).not.toHaveBeenCalled();
  await act(async () => root.unmount());
  captureScene.mockClear();
  mockQuality = 'full';
  await show({ pictureKey: undefined });
  await wait(5000);
  expect(captureScene).not.toHaveBeenCalled();
  await act(async () => root.unmount());
  await show({}, { loading: true });
  await wait(5000);
  expect(captureScene).not.toHaveBeenCalled();
});

test('a view moved during the wait is not photographed', async () => {
  let moved = false;
  await show({ opening: () => !moved });
  await wait(1000);
  moved = true;
  await wait(2000);
  expect(captureScene).not.toHaveBeenCalled();
});

test('a picture already kept for the view and shown is left alone; one that could not be shown is taken again', async () => {
  mockKept = { level: 1, habitat: 'island', models: [], views: [{ uri: PICTURE, key: KEY }] };
  await show();
  // (the picture is laid over the scene until it has drawn itself, and once it has loaded it is good)
  const image = root.root.findAll((node) => node.props.source?.uri === PICTURE && typeof node.type === 'string')[0];
  await act(async () => image.props.onLoad());
  await wait(6000);
  expect(captureScene).not.toHaveBeenCalled();
  await act(async () => root.unmount());
  // The same picture, gone from the device: it is no picture, and the view is photographed again.
  await show();
  const gone = root.root.findAll((node) => node.props.source?.uri === PICTURE && typeof node.type === 'string')[0];
  await act(async () => gone.props.onError());
  await wait(6000);
  expect(captureScene).toHaveBeenCalledTimes(1);
});

test('the explorer’s picture waits up to 12 s for a scene that is still being built (no frame has drawn it complete), where Home’s goes at 4 s', async () => {
  // (the picture is still laid over the scene while it is fully opaque; once it has begun to fade, or is gone, it is not)
  const shownPicture = () => root.root.findAll((node) => typeof node.type === 'string' && node.props.source?.uri === PICTURE
    && [node.props.style].flat(3).every((style) => !style || style.opacity === undefined || (style.opacity.__getValue?.() ?? style.opacity) >= 1)).length;
  // (no frame is ever drawn here: the scene never says it is drawn, so only the longest wait ends the picture)
  mockKept = { level: 1, habitat: 'island', models: [], picture: { uri: PICTURE, level: 1, habitat: 'island' }, views: [{ uri: PICTURE, key: KEY }] };
  await show();
  expect(shownPicture()).toBe(1);
  // (in steps, so that a fade begun by an earlier end of the wait has time to show in the picture before it is looked at)
  for (const ms of [3000, 3000, 3000, 1000, 500, 500, 500]) await wait(ms);
  expect(shownPicture()).toBe(1);
  // (the longest wait is over: the picture fades, which takes a moment more)
  for (const ms of [600, 300, 300]) await wait(ms);
  expect(shownPicture()).toBe(0);
  await act(async () => root.unmount());
  root = null;
  // Home's card: the picture is laid over its scene and goes after 4 s at the longest.
  await act(async () => { root = create(<SanctuaryScene {...props} />); });
  expect(shownPicture()).toBe(1);
  for (const ms of [1500, 1500, 400]) await wait(ms);
  expect(shownPicture()).toBe(1);
  for (const ms of [300, 300, 300, 300]) await wait(ms);
  expect(shownPicture()).toBe(0);
});
