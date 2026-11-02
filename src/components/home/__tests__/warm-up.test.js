import React, { act } from 'react';
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { create } from 'react-test-renderer';
import { kindsFor } from '../three/warm-kinds';
import { drawWarmed, warmedKinds, warmTextures, warmUp, WarmUp } from '../three/warm-up';

// Three 0.186's ESM entry is outside this Expo Jest transform, so the stand-ins (which are made with it) are replaced: what is tested is what warmUp
// does with them (which kinds, once each, compiled against the scene's lights, kept, drawn one kind at a time, textures, never throwing). warm-specimens.ts
// itself is checked against the real renderer by scripts/verify-warm-up.mjs.
const mockBuilt = [];
jest.mock('../three/warm-specimens', () => ({
  buildSpecimens: (kinds, context) => { const groups = new Map(kinds.map((kind) => [kind, { kind, context }])); mockBuilt.push({ kinds, context, groups }); return groups; },
  offscreen: (scene, group) => ({ holder: true, scene, group }),
}));
let mockState, mockFrame;
jest.mock('@react-three/fiber', () => ({ useThree: (select) => select(mockState), useFrame: (callback, priority) => { mockFrame = { callback, priority }; } }));

/** A renderer as far as warmUp reads it: its program list (which compile grows by what it links), compile, and initTexture. */
const renderer = (linkPerCompile = 3) => {
  const gl = { info: { programs: [] }, autoClear: true, render: jest.fn(() => { gl.cleared = gl.autoClear; }), compile: jest.fn(() => { for (let i = 0; i < linkPerCompile; i++) gl.info.programs.push({}); }), initTexture: jest.fn() };
  return gl;
};
const scene = {}, camera = {};
beforeEach(() => { mockBuilt.length = 0; global.IS_REACT_ACT_ENVIRONMENT = true; });

test('each shore brings what it draws with, and every scene has an ocean, animals and coasts', () => {
  expect(kindsFor([])).toEqual(['ocean', 'animals', 'coast']);
  expect(kindsFor(['island'])).toEqual(['ocean', 'animals', 'coast', 'islet', 'reef']);
  expect(kindsFor(['kelp'])).toContain('kelp');
  expect(kindsFor(['volcanic'])).toContain('steam');
  expect(kindsFor(['mangrove'])).toContain('seagrass');
  expect(kindsFor(['wreck'])).toContain('reef');
  expect(kindsFor(['island', 'island'], true).filter((k) => k === 'reef')).toHaveLength(1);
  expect(kindsFor(['island'], true)).toContain('school');
  expect(kindsFor(['island'], false)).not.toContain('school');
});

test('every kind is compiled in one call to warmUp, against the scene (whose lights the programs are made for), and the programs it adds are counted', () => {
  const gl = renderer();
  const result = warmUp(gl, scene, camera, { habitats: ['island', 'kelp'], waters: 2, quality: 'lite' });
  const kinds = kindsFor(['island', 'kelp']);
  expect(gl.compile).toHaveBeenCalledTimes(kinds.length);
  kinds.forEach((kind, i) => expect(gl.compile).toHaveBeenNthCalledWith(i + 1, mockBuilt[0].groups.get(kind), camera, scene));
  expect(mockBuilt[0].kinds).toEqual(kinds);
  expect(mockBuilt[0].context).toMatchObject({ lite: true, waters: 2 });
  expect(result.kinds).toEqual(kinds);
  expect(result.added).toBe(3 * kinds.length);
  expect(result.programs).toBe(result.added);
  expect(warmedKinds(gl)).toEqual(new Set(kinds));
  // (none of it is drawn, so nothing waits for the GL thread: that is for drawWarmed)
  expect(gl.render).not.toHaveBeenCalled();
});

test('the stand-ins are drawn one kind at a time, in the order compiled, outside the view, without clearing anything, and the renderer is left as it was', () => {
  const gl = renderer();
  const { kinds } = warmUp(gl, scene, camera, { habitats: ['island'] });
  expect(drawWarmed(gl, scene, camera)).toBe(kinds[0]);
  expect(gl.render).toHaveBeenCalledTimes(1);
  expect(gl.render).toHaveBeenCalledWith({ holder: true, scene, group: mockBuilt[0].groups.get(kinds[0]) }, camera);
  expect(gl.cleared).toBe(false);
  expect(gl.autoClear).toBe(true);
  const drawn = [kinds[0]];
  for (let kind = drawWarmed(gl, scene, camera); kind !== null; kind = drawWarmed(gl, scene, camera)) drawn.push(kind);
  expect(drawn).toEqual(kinds);
  expect(gl.render).toHaveBeenCalledTimes(kinds.length);
  // nothing left: nothing drawn
  expect(drawWarmed(gl, scene, camera)).toBeNull();
  expect(gl.render).toHaveBeenCalledTimes(kinds.length);
});

test('draw: true draws them all at once', () => {
  const gl = renderer();
  const { kinds } = warmUp(gl, scene, camera, { habitats: ['island'], draw: true });
  expect(gl.render).toHaveBeenCalledTimes(kinds.length);
  expect(drawWarmed(gl, scene, camera)).toBeNull();
});

test('a failing draw leaves the renderer clearing as before, and the kinds that were warmed stay warmed', () => {
  const gl = renderer();
  gl.render.mockImplementationOnce(() => { throw new Error('no GL'); });
  const { kinds } = warmUp(gl, scene, camera, { habitats: ['island'] });
  expect(() => drawWarmed(gl, scene, camera)).not.toThrow();
  expect(gl.autoClear).toBe(true);
  expect(warmedKinds(gl)).toEqual(new Set(kinds));
});

test('a kind already warmed is not done again, one not yet warmed is, and a repeat does nothing at all', () => {
  const gl = renderer();
  warmUp(gl, scene, camera, { habitats: ['island'] });
  const again = warmUp(gl, scene, camera, { habitats: ['island'] });
  const first = gl.compile.mock.calls.length;
  expect(again.kinds).toEqual([]);
  expect(again.added).toBe(0);
  expect(gl.compile).toHaveBeenCalledTimes(first);
  const more = warmUp(gl, scene, camera, { habitats: ['island', 'volcanic'] });
  expect(gl.compile).toHaveBeenCalledTimes(first + 1);
  expect(mockBuilt[1].kinds).toEqual(['steam']);
  expect(more.kinds).toEqual(['steam']);
});

test('the ocean\'s waters default to the number of different shores', () => {
  warmUp(renderer(), scene, camera, { habitats: ['island', 'kelp', 'island', 'wreck'] });
  expect(mockBuilt[0].context.waters).toBe(3);
  warmUp(renderer(), scene, camera, { habitats: ['island', 'kelp'], waters: 1 });
  expect(mockBuilt[1].context.waters).toBe(1);
});

test('each renderer is warmed on its own (the explorer is a context of its own)', () => {
  const home = renderer(), explorer = renderer();
  warmUp(home, scene, camera, { habitats: ['island'] });
  warmUp(explorer, scene, camera, { habitats: ['island'] });
  expect(home.compile.mock.calls.length).toBe(explorer.compile.mock.calls.length);
  expect(home.compile.mock.calls.length).toBeGreaterThan(0);
});

test('exactly the kinds asked for, when asked', () => {
  const gl = renderer();
  warmUp(gl, scene, camera, { kinds: ['kelp', 'seagrass'], habitats: ['island'] });
  expect(mockBuilt[0].kinds).toEqual(['kelp', 'seagrass']);
});

test('the textures among the ocean\'s uniforms that exist are uploaded, and the others left to the first draw', () => {
  const gl = renderer(), depth = { isTexture: true }, region = { isTexture: true };
  const ocean = { uOceanTime: { value: 0 }, uOceanDepthMap: { value: depth }, uOceanRegionMap: { value: region }, uOceanLiteMap: { value: null }, uOceanColor: { value: { r: 1 } } };
  expect(warmTextures(gl, ocean)).toBe(2);
  expect(gl.initTexture.mock.calls.map(([t]) => t)).toEqual([depth, region]);
  const result = warmUp(renderer(), scene, camera, { ocean, kinds: [] });
  expect(result.textures).toBe(2);
});

test('a scene that cannot warm up is left as it was: nothing is thrown, and what failed is tried again next time', () => {
  const gl = renderer();
  gl.compile.mockImplementationOnce(() => { throw new Error('no GL'); });
  expect(() => warmUp(gl, scene, camera, { habitats: ['island'] })).not.toThrow();
  expect(warmedKinds(gl).size).toBe(0);
  warmUp(gl, scene, camera, { habitats: ['island'] });
  expect(warmedKinds(gl).size).toBeGreaterThan(0);
});

let root;
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });

test('in the canvas it warms its renderer once, as the canvas mounts, then draws a kind a frame (never at a priority that takes over the drawing), and renders nothing', async () => {
  const gl = renderer();
  mockState = { gl, scene, camera };
  await act(async () => { root = create(<WarmUp habitats={['island']} />); });
  const compiled = gl.compile.mock.calls.length;
  expect(compiled).toBeGreaterThan(0);
  expect(root.toJSON()).toBeNull();
  expect(mockFrame.priority).toBeLessThanOrEqual(0);
  expect(gl.render).not.toHaveBeenCalled();
  mockFrame.callback(); mockFrame.callback();
  expect(gl.render).toHaveBeenCalledTimes(2);
  await act(async () => root.update(<WarmUp habitats={['island', 'kelp']} />));
  // (the options are read as it mounts: a re-render does not warm again)
  expect(gl.compile).toHaveBeenCalledTimes(compiled);
});

test('with spread off the component draws nothing itself', async () => {
  const gl = renderer();
  mockState = { gl, scene, camera };
  await act(async () => { root = create(<WarmUp habitats={['island']} spread={false} />); });
  mockFrame.callback(); mockFrame.callback();
  expect(gl.render).not.toHaveBeenCalled();
});
