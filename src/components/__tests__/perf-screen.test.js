import React, { act } from 'react';
import { expect, jest, test } from '@jest/globals';
import { create } from 'react-test-renderer';
import { perfReport } from '@/lib/perf-report';

jest.mock('@/global.css', () => ({}));
jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const PerfScreen = require('../../app/perf').default;
const text = (root) => root.root.findAll((node) => typeof node.children?.[0] === 'string').map((node) => node.children.join('')).join(' | ');

test('the performance report shows the build first, the launch milestones, each scene and a button to send it', async () => {
  perfReport.reset();
  perfReport.mark('js-start', 412);
  perfReport.mark('home-frame', 1830);
  perfReport.begin('explorer', 'coral-reef', 5000);
  perfReport.step('explorer', 'frame', 5040);
  perfReport.info('home', { fps: 30, quality: 'full', dpr: 2, level: 0, levelName: 'full' });
  for (let i = 0; i < 30; i++) perfReport.frame('home', 33.3, 4, 38, 52000);
  let root;
  await act(async () => { root = create(<PerfScreen />); });
  const shown = text(root);
  // Jest runs with __DEV__ on: the report says so before anything else.
  expect(shown.indexOf('DEVELOPMENT build')).toBeGreaterThanOrEqual(0);
  expect(shown.indexOf('DEVELOPMENT build')).toBeLessThan(shown.indexOf('JS start'));
  expect(shown).toContain('412');
  expect(shown).toContain('Explorer coral-reef');
  expect(shown).toContain('frame 40');
  expect(shown).toContain('Scene: home');
  expect(shown).toContain('38 draw calls');
  expect(shown).toMatch(/Share report|Copy report/);
  await act(async () => { root.unmount(); });
});
