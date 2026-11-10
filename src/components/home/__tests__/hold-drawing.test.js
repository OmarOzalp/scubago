import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { create } from 'react-test-renderer';

/**
 * HoldDrawing (an island switch on Home keeps the island it leaves until the next is whole) and IslandsWhole (the explorer's veil lifts
 * once the islands in view are whole), driven frame by frame; and the canvas's quality governor as SceneCanvas uses it.
 */
const mockFrames = [];
const mockInvalidate = jest.fn();
jest.mock('@react-three/fiber', () => ({
  useFrame: (callback, priority = 0) => { mockFrames.push({ callback, priority }); },
  useThree: (select) => select({ invalidate: mockInvalidate }),
}));
// (the scene's own module is loaded for the two components, with three.js's parts kept out as the scene's tests do)
jest.mock('../three/scene-canvas', () => ({ SceneCanvas: ({ children }) => <>{children}</> }));
jest.mock('../three/warm-up', () => ({ WarmUp: () => null }));
jest.mock('../three/use-marine-models', () => ({ useMarineModels: jest.fn() }));
jest.mock('../three/scene-camera', () => ({ SceneCamera: () => null }));
jest.mock('../three/scene-performance', () => ({ ScenePerformance: () => null, FrameReport: () => null }));
jest.mock('../three/sanctuary-environment', () => ({ WATER: {}, SanctuaryEnvironment: () => null }));
jest.mock('../three/animated-marine', () => ({ AnimatedMarine: () => null }));
jest.mock('../three/tuna-school-mesh', () => ({ TunaSchoolMesh: () => null }));
jest.mock('../three/marine-splashes', () => ({ MarineSplashes: () => null }));
jest.mock('../three/reef-rocks', () => ({ ReefRocks: () => null }));
jest.mock('../three/reef-anemone', () => ({ ReefAnemones: () => null }));
jest.mock('../three/tap-target', () => ({ TAP_SLOP: 8 }));
jest.mock('../three/kelp-movers', () => ({ KELP_MOVERS: 12, KelpMoversContext: require('react').createContext(null) }));
jest.mock('../three/macro-life', () => ({ MacroLife: () => null }));
jest.mock('../island-scene', () => ({ IslandScene: () => null }));
jest.mock('../three/seabed-files', () => ({ SEABED_FILES: {} }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const { HoldDrawing, IslandsWhole } = require('../sanctuary-scene');
const { STAGE } = require('../three/stager');
const { GovernorHold, GovernorContext, useCanvasGovernor } = require('../three/governor');

/** A stager whose islands are pending or not, as the test says. */
const fakeStager = (pending) => ({ pending: jest.fn((island, stages) => pending.has(island) && stages.includes(STAGE.coast)) });
/** The frame callbacks of the last render, and a frame run through them. */
const latest = () => mockFrames.slice(-1)[0];
const frame = async () => { await act(async () => { latest().callback({}, 1 / 30); }); };

let root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; mockFrames.length = 0; mockInvalidate.mockClear(); jest.useFakeTimers(); });
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; jest.useRealTimers(); });

test('HoldDrawing takes over the drawing (priority 1, drawing nothing) until the island it waits for is whole', async () => {
  const pending = new Set(['mangrove']), stager = fakeStager(pending), onDone = jest.fn();
  await act(async () => { root = create(<HoldDrawing stager={stager} island="mangrove" onDone={onDone} />); });
  expect(latest().priority).toBe(1);
  // The first frames come before the island's parts have said what they have to build: never done on them, even with nothing pending.
  pending.clear();
  await frame(); await frame();
  expect(onDone).not.toHaveBeenCalled();
  pending.add('mangrove');
  await frame(); await frame();
  expect(onDone).not.toHaveBeenCalled();
  expect(stager.pending).toHaveBeenLastCalledWith('mangrove', [STAGE.coast, STAGE.props]);
  pending.clear();
  await frame();
  expect(onDone).toHaveBeenCalledTimes(1);
  // and a frame is asked for, so R3F draws the whole island at once
  expect(mockInvalidate).toHaveBeenCalled();
  await frame();
  expect(onDone).toHaveBeenCalledTimes(1);
});

test('HoldDrawing lets go after 1.5 s however long the island takes, even with no frames coming', async () => {
  const onDone = jest.fn();
  await act(async () => { root = create(<HoldDrawing stager={fakeStager(new Set(['kelp']))} island="kelp" onDone={onDone} />); });
  await act(async () => { jest.advanceTimersByTime(1400); });
  expect(onDone).not.toHaveBeenCalled();
  await act(async () => { jest.advanceTimersByTime(200); });
  expect(onDone).toHaveBeenCalledTimes(1);
});

test('IslandsWhole draws as usual (priority 0) and says so once every island in view is whole', async () => {
  const pending = new Set(['reef', 'kelp']), onWhole = jest.fn();
  let inView = ['reef'];
  await act(async () => { root = create(<IslandsWhole stager={fakeStager(pending)} inView={() => inView} onWhole={onWhole} />); });
  expect(latest().priority).toBe(0);
  await frame(); await frame(); await frame();
  pending.delete('reef');
  inView = ['reef', 'kelp'];
  await frame();
  expect(onWhole).not.toHaveBeenCalled();
  pending.delete('kelp');
  await frame();
  expect(onWhole).toHaveBeenCalledTimes(1);
});

test('the canvas governor: its level is the canvas’s, and GovernorHold stops it judging', async () => {
  let seen = null, governor = null;
  function Probe({ hold }) {
    const value = useCanvasGovernor();
    seen = value.level; governor = value.governor;
    return <GovernorContext.Provider value={value.governor}><GovernorHold hold={hold} /></GovernorContext.Provider>;
  }
  await act(async () => { root = create(<Probe hold />); });
  expect(seen.dpr).toBe(2);
  // Held (building, hidden): late frames change nothing.
  await act(async () => { for (let i = 0; i < 100; i++) governor.frame(70, 30, 5); });
  expect(seen.dpr).toBe(2);
  await act(async () => { root.update(<Probe hold={false} />); });
  await act(async () => { for (let i = 0; i < 70; i++) governor.frame(70, 30, 5); });
  expect(seen.dpr).toBeLessThan(2);
});
