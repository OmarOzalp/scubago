import React, { act } from 'react';
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { create } from 'react-test-renderer';
import { IslandPerfBadge } from '../island-perf-badge';
import { islandFrameStats } from '@/lib/frame-stats';

let root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; jest.useFakeTimers(); });
afterEach(async () => { if (root) await act(async () => root.unmount()); root = undefined; jest.useRealTimers(); });
const lines = () => root.root.findAll((node) => typeof node.children?.[0] === 'string').map((node) => node.children.join(''));

test('the badge stays hidden until there is a measurement, then shows it and refreshes', async () => {
  await act(async () => { root = create(<IslandPerfBadge />); });
  await act(async () => jest.advanceTimersByTime(1000));
  expect(root.toJSON()).toBeNull();
  islandFrameStats.gl(2.5);
  for (let i = 0; i < 130; i++) islandFrameStats.frame(1 / 60, 3, 31, 12000, 'full');
  await act(async () => jest.advanceTimersByTime(1000));
  expect(lines()).toEqual(['60 fps · 0 slow · full', 'JS 3.0 ms (max 3.0) · GL 2.5 ms · 31 draws · 12.0k tris']);
});
