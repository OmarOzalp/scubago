import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';

/** When the explorer keeps its scene (explorer-keep.ts): by default; not with the build switch, and not after the phone says it is short of memory. */
let heard;
beforeEach(() => {
  jest.resetModules();
  heard = {};
  jest.doMock('react-native', () => ({ AppState: { addEventListener: (name, handler) => { heard[name] = handler; return { remove: () => {} }; } } }));
  delete process.env.EXPO_PUBLIC_EXPLORER_KEEP;
});
afterEach(() => { delete process.env.EXPO_PUBLIC_EXPLORER_KEEP; });

test('it keeps its scene by default', () => {
  const { mayKeep } = require('../explorer-keep');
  expect(mayKeep()).toBe(true);
});

test('EXPO_PUBLIC_EXPLORER_KEEP=0 keeps nothing, and any other value is the default', () => {
  const { mayKeep } = require('../explorer-keep');
  process.env.EXPO_PUBLIC_EXPLORER_KEEP = '0';
  expect(mayKeep()).toBe(false);
  process.env.EXPO_PUBLIC_EXPLORER_KEEP = '1';
  expect(mayKeep()).toBe(true);
});

test('the phone’s memory warning (React Native’s AppState "memoryWarning") makes it keep nothing from then on, and tells those listening', () => {
  const { mayKeep, forgetKeeping } = require('../explorer-keep');
  expect(typeof heard.memoryWarning).toBe('function');
  expect(mayKeep()).toBe(true);
  heard.memoryWarning();
  expect(mayKeep()).toBe(false);
  forgetKeeping();
  expect(mayKeep()).toBe(true);
});
