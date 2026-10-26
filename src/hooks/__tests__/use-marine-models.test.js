import React, { act, useEffect } from 'react';
import { create } from 'react-test-renderer';
import { useMarineModels } from '@/components/home/three/use-marine-models';
import { getLoadedMarineModels, loadMarineModel } from '@/components/home/three/marine-loader';

// The loader's cache, as the real one keeps it: a model is there once its load has finished.
let mockLoaded = {};
jest.mock('@/components/home/three/marine-loader', () => ({
  loadMarineModel: jest.fn(),
  getLoadedMarineModels: jest.fn((requested) => {
    const ready = requested.filter((model) => mockLoaded[model]);
    if (requested.length > 0 && ready.length === 0) return null;
    return Object.fromEntries(ready.map((model) => [model, mockLoaded[model]]));
  }),
}));
/** A load the test finishes (or fails) by hand. */
function pending() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
let current;
let root;
function Harness({ requested = ['shark'] }) {
  const result = useMarineModels(requested);
  useEffect(() => { current = result; });
  return null;
}
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; mockLoaded = {}; });
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
  jest.restoreAllMocks();
  loadMarineModel.mockReset();
  getLoadedMarineModels.mockClear();
});

test('revisiting a scene uses already loaded rigs on its first render, and asks for none again', async () => {
  mockLoaded = { shark: { name: 'shark' }, manta: { name: 'manta' } };
  await act(async () => { root = create(<Harness requested={['shark', 'manta']} />); });
  expect(current.models).toEqual({ shark: mockLoaded.shark, manta: mockLoaded.manta });
  expect(current.failed).toBe(false);
  expect(loadMarineModel).not.toHaveBeenCalled();
});

test('each animal’s model is there as soon as it is loaded: the scene doesn’t wait for the slowest', async () => {
  const loads = { shark: pending(), manta: pending() };
  loadMarineModel.mockImplementation((model) => loads[model].promise);
  await act(async () => { root = create(<Harness requested={['shark', 'manta']} />); });
  expect(current.models).toBeNull();
  await act(async () => { mockLoaded.manta = { name: 'manta' }; loads.manta.resolve(mockLoaded.manta); });
  expect(current.models).toEqual({ manta: mockLoaded.manta });
  const first = current.models;
  await act(async () => { mockLoaded.shark = { name: 'shark' }; loads.shark.resolve(mockLoaded.shark); });
  expect(current.models).toEqual({ manta: mockLoaded.manta, shark: mockLoaded.shark });
  // The same models, the same object (the scene compares it).
  const both = current.models;
  await act(async () => root.update(<Harness requested={['manta', 'shark']} />));
  expect(current.models).toBe(both);
  expect(first).not.toBe(both);
});

test('a failed load can be retried without leaving the screen', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  loadMarineModel.mockRejectedValueOnce(new Error('offline')).mockImplementationOnce(async (model) => { mockLoaded[model] = { name: model }; return mockLoaded[model]; });
  await act(async () => { root = create(<Harness />); });
  expect(current.failed).toBe(true);
  expect(current.models).toBeNull();
  await act(async () => current.retry());
  expect(current.failed).toBe(false);
  expect(current.models).toEqual({ shark: mockLoaded.shark });
});

test('a change of animals keeps those loaded and adds the newcomer once its model is in; a late load for animals gone does no harm', async () => {
  const whale = pending(), manta = pending();
  loadMarineModel.mockImplementation((model) => (model === 'whale-shark' ? whale.promise : manta.promise));
  mockLoaded = { shark: { name: 'shark' } };
  await act(async () => { root = create(<Harness requested={['shark', 'whale-shark']} />); });
  expect(current.models).toEqual({ shark: mockLoaded.shark });
  await act(async () => root.update(<Harness requested={['shark', 'reef-manta']} />));
  expect(current.models).toEqual({ shark: mockLoaded.shark });
  await act(async () => { mockLoaded['whale-shark'] = { name: 'whale' }; whale.resolve(mockLoaded['whale-shark']); });
  expect(current.models).toEqual({ shark: mockLoaded.shark });
  await act(async () => { mockLoaded['reef-manta'] = { name: 'manta' }; manta.resolve(mockLoaded['reef-manta']); });
  expect(current.models).toEqual({ shark: mockLoaded.shark, 'reef-manta': mockLoaded['reef-manta'] });
});

test('returning to a failed selection starts fresh without showing its previous failure', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  loadMarineModel.mockRejectedValueOnce(new Error('offline')).mockImplementation(() => new Promise(() => {}));
  await act(async () => { root = create(<Harness requested={['whale-shark']} />); });
  expect(current.failed).toBe(true);
  await act(async () => root.update(<Harness requested={['reef-manta']} />));
  await act(async () => root.update(<Harness requested={['whale-shark']} />));
  expect(current.models).toBeNull();
  expect(current.failed).toBe(false);
});

test('nothing asked for is nothing to wait for', async () => {
  await act(async () => { root = create(<Harness requested={[]} />); });
  expect(current.models).toEqual({});
  expect(current.failed).toBe(false);
});
