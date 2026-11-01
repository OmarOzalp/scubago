import React, { act } from 'react';
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { create } from 'react-test-renderer';
import { createProgramKeeper, ProgramKeeper } from '../three/program-keeper';

let mockAfter, mockUnsubscribe;
const mockState = { gl: { info: { programs: [] }, properties: new WeakMap() }, scene: {} };
jest.mock('@react-three/fiber', () => ({
  useThree: (select) => select(mockState),
  addAfterEffect: (callback) => { mockAfter = callback; return mockUnsubscribe; },
}));

/** What three.js keeps of a program (its key and how many materials use it) and of a material it has drawn with. */
const program = (cacheKey, usedTimes = 1) => ({ cacheKey, usedTimes });
const material = (isShaderMaterial, current, renderer) => {
  const m = { isShaderMaterial, dispose: jest.fn() };
  m.original = m.dispose;
  if (current) renderer.properties.set(m, { currentProgram: current });
  return m;
};
const renderer = (programs) => ({
  info: { programs },
  properties: { has: (m) => renderer.map.has(m), get: (m) => renderer.map.get(m), set: (m, v) => renderer.map.set(m, v) },
});
renderer.map = new WeakMap();
const sceneOf = (...materials) => ({ traverse: jest.fn((visit) => materials.forEach((m) => visit({ material: m }))) });

test('a built-in material\'s program gets one more use, once, so disposing every material that uses it never frees it', () => {
  const lambert = program('lambert,highp,srgb,marine-ocean-water-v3', 3), basic = program('basic,highp,srgb', 1);
  const gl = renderer([lambert, basic]), keeper = createProgramKeeper();
  keeper.keep(gl, sceneOf());
  keeper.keep(gl, sceneOf());
  expect(lambert.usedTimes).toBe(4);
  expect(basic.usedTimes).toBe(2);
  // one linked later is kept too, and the earlier ones are not counted again
  const kelp = program('lambert,highp,srgb,kelp-v5', 1);
  gl.info.programs.push(kelp);
  keeper.keep(gl, sceneOf());
  expect([lambert.usedTimes, basic.usedTimes, kelp.usedTimes]).toEqual([4, 2, 2]);
});

test('a ShaderMaterial\'s program is found by numbers three.js forgets with its code, so the first material with it is kept alive: its dispose does nothing', () => {
  const seabed = program('4,5,highp,srgb,false'), water = program('6,7,highp,srgb,false');
  const gl = renderer([seabed, water]);
  const one = material(true, seabed, gl), two = material(true, water, gl);
  const keeper = createProgramKeeper();
  keeper.keep(gl, sceneOf(one, two));
  expect(seabed.usedTimes).toBe(1);
  expect([...keeper.kept.keys()]).toEqual(['4,5,highp,srgb,false', '6,7,highp,srgb,false']);
  one.dispose(); two.dispose();
  expect(one.original).not.toHaveBeenCalled();
  expect(two.original).not.toHaveBeenCalled();
  // the next ocean, built with the same code, has the same program: its material is its own and is disposed as ever
  const next = material(true, seabed, gl);
  keeper.keep(gl, sceneOf(next));
  next.dispose();
  expect(next.original).toHaveBeenCalledTimes(1);
});

test('only ShaderMaterials are kept, and only those that have been drawn with a program', () => {
  const shader = program('8,9,highp,srgb,false'), lambert = program('lambert,highp,srgb,custom');
  const gl = renderer([shader, lambert]);
  const drawn = material(false, lambert, gl), undrawn = material(true, null, gl);
  const keeper = createProgramKeeper();
  keeper.keep(gl, sceneOf(drawn, undrawn));
  drawn.dispose(); undrawn.dispose();
  expect(drawn.original).toHaveBeenCalledTimes(1);
  expect(undrawn.original).toHaveBeenCalledTimes(1);
  expect(keeper.kept.size).toBe(0);
});

test('a mesh with several materials keeps each of its ShaderMaterials', () => {
  const a = program('10,11,x'), b = program('12,13,x');
  const gl = renderer([a, b]);
  const first = material(true, a, gl), second = material(true, b, gl);
  const keeper = createProgramKeeper();
  const scene = { traverse: (visit) => visit({ material: [first, second] }) };
  keeper.keep(gl, scene);
  expect(keeper.kept.size).toBe(2);
});

test('nothing walks the scene unless a program of a ShaderMaterial is new', () => {
  const shader = program('4,5,x'), lambert = program('lambert,x');
  const gl = renderer([lambert, shader]);
  const m = material(true, shader, gl);
  const keeper = createProgramKeeper(), scene = sceneOf(m);
  keeper.keep(gl, scene);
  expect(scene.traverse).toHaveBeenCalledTimes(1);
  keeper.keep(gl, scene); keeper.keep(gl, scene);
  expect(scene.traverse).toHaveBeenCalledTimes(1);
  // a renderer with no programs yet (before its first frame) is left alone
  expect(() => createProgramKeeper().keep({ info: { programs: null } }, sceneOf())).not.toThrow();
});

let root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; mockAfter = undefined; mockUnsubscribe = jest.fn(); });
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });

test('in the canvas it looks after every frame, and stops with the scene', async () => {
  const lambert = program('lambert,highp,srgb,x');
  mockState.gl = renderer([lambert]);
  await act(async () => { root = create(<ProgramKeeper />); });
  expect(mockAfter).toBeInstanceOf(Function);
  mockAfter();
  expect(lambert.usedTimes).toBe(2);
  await act(async () => root.unmount());
  root = null;
  expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
});
