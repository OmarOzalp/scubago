import { beforeEach, expect, test } from '@jest/globals';
import { builtKey, forgetBuilt, markBuilt, wasBuilt } from '../three/built-islands';

// The islands a session has built to the end (built-islands.ts): by shores, level and quality tier, for the session only.
beforeEach(() => forgetBuilt());

test('an island is built once it has been marked, and not before', () => {
  const key = builtKey('island', 3, 'full');
  expect(wasBuilt(key)).toBe(false);
  markBuilt(key);
  expect(wasBuilt(key)).toBe(true);
  markBuilt(key);
  expect(wasBuilt(key)).toBe(true);
});

test('another shore, another level or another quality tier is another island', () => {
  markBuilt(builtKey('island', 3, 'full'));
  expect(wasBuilt(builtKey('kelp', 3, 'full'))).toBe(false);
  expect(wasBuilt(builtKey('island', 4, 'full'))).toBe(false);
  expect(wasBuilt(builtKey('island', 3, 'lite'))).toBe(false);
});

test('they can all be forgotten', () => {
  markBuilt(builtKey('island', 3, 'full'));
  markBuilt(builtKey('kelp', 1, 'lite'));
  forgetBuilt();
  expect(wasBuilt(builtKey('island', 3, 'full'))).toBe(false);
  expect(wasBuilt(builtKey('kelp', 1, 'lite'))).toBe(false);
});
