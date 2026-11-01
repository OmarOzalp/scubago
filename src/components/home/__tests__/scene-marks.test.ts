import { beforeEach, expect, jest, test } from '@jest/globals';

// The timing marks (three/scene-marks.ts): made once each, and awaited by what should wait for the island to be on show.
let marks: typeof import('../three/scene-marks');
beforeEach(() => {
  jest.resetModules();
  marks = require('../three/scene-marks'); // eslint-disable-line @typescript-eslint/no-require-imports
});

test('whoever waits for a mark is let go when it is made, once, and at once if it was made already', async () => {
  const seen: string[] = [];
  const first = marks.whenMarked('scubago:first-animal').then(() => seen.push('first'));
  const second = marks.whenMarked('scubago:first-animal').then(() => seen.push('second'));
  const other = marks.whenMarked('scubago:picture').then(() => seen.push('picture'));
  await Promise.resolve();
  expect(seen).toEqual([]);
  marks.markOnce('scubago:first-animal');
  marks.markOnce('scubago:first-animal');
  await Promise.all([first, second]);
  expect(seen).toEqual(['first', 'second']);
  // (made already: nothing to wait for)
  await marks.whenMarked('scubago:first-animal');
  expect(seen).toEqual(['first', 'second']);
  marks.markOnce('scubago:picture');
  await other;
  expect(seen).toEqual(['first', 'second', 'picture']);
});
