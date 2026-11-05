import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { router } from 'expo-router';
import { JournalTabBar } from '@/components/journal/tab-bar';
import { Type } from '@/constants/theme';

jest.mock('@/global.css', () => ({}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

let root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; router.push.mockClear(); });
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });

const TITLES = { index: 'Home', map: 'Sites', logbook: 'Logbook', 'field-guide': 'Field guide', explore: 'Explore your ocean' };
const routes = Object.keys(TITLES).map((name) => ({ key: name, name }));
const render = async (index = 0) => {
  const props = {
    state: { index, routes },
    descriptors: Object.fromEntries(routes.map((r) => [r.key, { options: { title: TITLES[r.name] } }])),
    emitter: { emit: () => ({ defaultPrevented: false }) },
    navigateToTab: jest.fn(),
    insets: { top: 0, bottom: 0, left: 0, right: 0 },
  };
  await act(async () => { root = create(<JournalTabBar {...props} />); });
  return props;
};
const labels = () => root.root.findAll((n) => n.type === 'Text' && typeof n.props.children === 'string').map((n) => n.props.children);
const style = (text) => Object.assign({}, ...[root.root.findAll((n) => n.type === 'Text' && n.props.children === text)[0].props.style].flat());

test('the tabs read Home, Sites, Log, Logbook, Field guide, and the explorer has no button', async () => {
  await render();
  expect(labels()).toEqual(['Home', 'Sites', 'Log', 'Logbook', 'Field guide']);
});

test('Log is a button that opens the log, and its label is not drawn like the selected tab', async () => {
  await render(0);
  const log = root.root.findAll((n) => n.props.accessibilityLabel === 'Log a dive' && typeof n.props.onPress === 'function')[0];
  expect(log.props.accessibilityRole).toBe('button');
  await act(async () => log.props.onPress());
  expect(router.push).toHaveBeenCalledWith('/log/new');
  expect(style('Home').fontFamily).toBe(Type.bodyHeavy);
  expect(style('Log').fontFamily).not.toBe(Type.bodyHeavy);
  expect(style('Log').fontFamily).toBe(style('Sites').fontFamily);
});

test('no bar over the explorer', async () => {
  await render(4);
  expect(root.toJSON()).toBeNull();
});
