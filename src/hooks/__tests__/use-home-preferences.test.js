import React, { act } from 'react';
import { create } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useHomePreferences } from '../use-home-preferences';

let current;
let root;
function Harness({ owner }) {
  current = useHomePreferences(owner);
  return null;
}

beforeEach(async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  await AsyncStorage.clear();
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
  jest.restoreAllMocks();
});

async function mount(owner = 'local') {
  await act(async () => { root = create(<Harness owner={owner} />); });
}

test('a chosen habitat and name survive remounting', async () => {
  await mount();
  await act(async () => { expect(await current.save({ name: 'Quiet waters', habitat: 'lagoon' })).toBe(true); });
  await act(async () => root.unmount());
  await mount();
  expect(current.preferences).toEqual({ name: 'Quiet waters', habitat: 'lagoon' });
});

test('switching accounts loads only that account’s home', async () => {
  await AsyncStorage.setItem('scubago:home:v1:diver-b', JSON.stringify({ name: 'B cove', habitat: 'cove' }));
  await mount('diver-a');
  await act(async () => { await current.save({ name: 'A island', habitat: 'island' }); });
  await act(async () => root.update(<Harness owner="diver-b" />));
  expect(current.preferences).toEqual({ name: 'B cove', habitat: 'cove' });
});

test('a failed save preserves the home and allows a retry', async () => {
  await mount();
  jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('Disk full'));
  await act(async () => { expect(await current.save({ name: 'New cove', habitat: 'cove' })).toBe(false); });
  expect(current.preferences.name).toBe('My little island');
  expect(current.error).toContain('Could not save');
  await act(async () => { expect(await current.save({ name: 'New cove', habitat: 'cove' })).toBe(true); });
  expect(current.preferences.name).toBe('New cove');
  expect(current.error).toBe('');
});
