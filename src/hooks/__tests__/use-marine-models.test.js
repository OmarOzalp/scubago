import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { useMarineModels } from '@/components/home/three/use-marine-models';
import { getLoadedMarineModels, loadMarineModels } from '@/components/home/three/marine-loader';

jest.mock('@/components/home/three/marine-loader', () => ({ loadMarineModels: jest.fn(), getLoadedMarineModels: jest.fn(() => null) }));
let current;
let root;
function Harness({ requested = ['shark'] }) { current = useMarineModels(requested); return null; }
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
  jest.restoreAllMocks();
  loadMarineModels.mockReset();
  getLoadedMarineModels.mockReturnValue(null);
});

test('revisiting a scene uses already loaded rigs on its first render', async () => {
  const models = { shark: {}, manta: {}, 'reef-fish': {} };
  getLoadedMarineModels.mockReturnValue(models);
  loadMarineModels.mockReturnValue(new Promise(() => {}));
  await act(async () => { root = create(<Harness />); });
  expect(current.models).toBe(models);
  expect(current.failed).toBe(false);
});

test('a failed load can be retried without leaving the screen', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  const models = { shark: {}, manta: {}, 'reef-fish': {} };
  loadMarineModels.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(models);
  await act(async () => { root = create(<Harness />); });
  expect(current.failed).toBe(true);
  expect(current.models).toBeNull();
  await act(async () => current.retry());
  expect(current.failed).toBe(false);
  expect(current.models).toBe(models);
});


test('switching requests hides previous rigs and ignores late responses', async () => {
  let finishOld;
  const oldLoad = new Promise((resolve) => { finishOld = resolve; });
  const latest = { 'reef-manta': {} };
  loadMarineModels.mockReturnValueOnce(oldLoad).mockResolvedValueOnce(latest);
  await act(async () => { root = create(<Harness requested={['whale-shark']} />); });
  await act(async () => root.update(<Harness requested={['reef-manta']} />));
  expect(current.models).toBe(latest);
  await act(async () => finishOld({ 'whale-shark': {} }));
  expect(current.models).toBe(latest);
});

test('A to B to A restores cached A and ignores pending B', async () => {
  const cachedA = { 'whale-shark': {} };
  let finishB;
  getLoadedMarineModels.mockImplementation((requested) => requested.includes('whale-shark') ? cachedA : null);
  loadMarineModels.mockResolvedValueOnce(cachedA)
    .mockImplementationOnce(() => new Promise((resolve) => { finishB = resolve; }))
    .mockResolvedValueOnce(cachedA);
  await act(async () => { root = create(<Harness requested={['whale-shark']} />); });
  await act(async () => root.update(<Harness requested={['reef-manta']} />));
  expect(current.models).toBeNull();
  await act(async () => root.update(<Harness requested={['whale-shark']} />));
  expect(current.models).toBe(cachedA);
  await act(async () => finishB({ 'reef-manta': {} }));
  expect(current.models).toBe(cachedA);
});

test('returning to failed A starts fresh without showing its previous failure', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  loadMarineModels.mockRejectedValueOnce(new Error('offline')).mockImplementation(() => new Promise(() => {}));
  await act(async () => { root = create(<Harness requested={['whale-shark']} />); });
  expect(current.failed).toBe(true);
  await act(async () => root.update(<Harness requested={['reef-manta']} />));
  await act(async () => root.update(<Harness requested={['whale-shark']} />));
  expect(current.models).toBeNull();
  expect(current.failed).toBe(false);
});

test('returning to a failed selection starts a fresh loading state', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  loadMarineModels.mockRejectedValueOnce(new Error('offline')).mockReturnValue(new Promise(() => {}));
  await act(async () => { root = create(<Harness requested={['whale-shark']} />); });
  expect(current.failed).toBe(true);
  await act(async () => root.update(<Harness requested={['reef-manta']} />));
  await act(async () => root.update(<Harness requested={['whale-shark']} />));
  expect(current.failed).toBe(false);
  expect(current.models).toBeNull();
});
