import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { TextInput } from 'react-native';
import { create } from 'react-test-renderer';
import EditDiveScreen from '@/app/dive/edit';
import { confirmAction } from '@/lib/confirm';
import { router } from 'expo-router';

let mockOptions = null;
let mockGuard = null;
let mockNavigation = null;
let mockState = null;

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => ({ id: 'd-26' }),
  useNavigation: () => mockNavigation,
  Stack: { Screen: ({ options }) => { mockOptions = { ...mockOptions, ...options }; return null; } },
}));
jest.mock('expo-router/react-navigation', () => ({
  usePreventRemove: (preventRemove, callback) => { mockGuard = { preventRemove, callback }; },
}));
jest.mock('@/global.css', () => ({}));
jest.mock('@/components/external-link', () => ({ ExternalLink: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/lib/confirm', () => ({ confirmAction: jest.fn(async () => true) }));
jest.mock('@/lib/store', () => ({
  useAppStore: (select) => select(mockState),
  useAllSites: () => require('@/data/sites').SITES,
  useSiteById: () => (id) => require('@/data/sites').SITES_BY_ID.get(id),
  useMyDives: () => mockState.dives,
  useMyUserId: () => 'local',
}));

const SITE = require('@/data/sites').SITES.find((s) => s.name === 'Blue Corner');

let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockOptions = null;
  mockGuard = null;
  mockNavigation = { dispatch: jest.fn() };
  mockState = {
    ready: true,
    user: null,
    sightings: [],
    dives: [{ id: 'd-26', userId: 'local', number: 26, siteId: SITE.id, divedOn: '2026-10-16', maxDepthM: 28, synced: true, createdAt: '2026-10-16T10:00:00Z' }],
    updateDive: jest.fn(async () => {}),
  };
  jest.clearAllMocks();
});
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });

const render = async () => { await act(async () => { root = create(<EditDiveScreen />); }); };
const byTitle = (title) => root.root.findAll((n) => n.props.title === title && typeof n.props.onPress === 'function')[0];
const press = async (node) => { await act(async () => node.props.onPress()); };
const field = (label) => root.root.findAll((n) => n.type === TextInput && n.props.accessibilityLabel === label)[0];
const typeInto = async (label, text) => { await act(async () => field(label).props.onChangeText(text)); };
const changeSite = () => root.root.findAll((n) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Change the site') && typeof n.props.onPress === 'function')[0];

describe('the site picker on the edit page', () => {
  test('Back from "Choose the site" closes the picker, not the screen, and keeps the edits', async () => {
    await render();
    await typeInto('Max depth (m)', '31');
    await press(changeSite());
    expect(mockOptions.title).toBe('Choose the site');
    const back = mockOptions.headerLeft({ tintColor: '#000' }).props;
    expect(back.label).toBe('Back to No. 26');
    await act(async () => back.onPress());
    expect(router.back).not.toHaveBeenCalled();
    // Back on the page, with what was typed still there, and the navigator's own arrow again.
    expect(mockOptions.title).toBe('Edit No. 26');
    expect(mockOptions.headerLeft).toBeUndefined();
    expect(field('Max depth (m)').props.value).toBe('31');
  });

  test('Android’s back does the same, and lets go when the picker isn’t open', async () => {
    const { BackHandler, Platform } = require('react-native');
    const original = Platform.OS;
    Platform.OS = 'android';
    const listeners = [];
    const add = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => { listeners.push(handler); return { remove: jest.fn() }; });
    try {
      await render();
      let handled;
      await act(async () => { handled = listeners.at(-1)(); });
      expect(handled).toBe(false);
      await press(changeSite());
      await act(async () => { handled = listeners.at(-1)(); });
      expect(handled).toBe(true);
      expect(mockOptions.title).toBe('Edit No. 26');
    } finally {
      add.mockRestore();
      Platform.OS = original;
    }
  });
});

describe('leaving the edit page', () => {
  test('is free until something is changed, then asks, and leaves only when the diver says so', async () => {
    await render();
    expect(mockGuard.preventRemove).toBe(false);
    await typeInto('Max depth (m)', '31');
    expect(mockGuard.preventRemove).toBe(true);

    const action = { type: 'POP' };
    confirmAction.mockResolvedValueOnce(false);
    await act(async () => { mockGuard.callback({ data: { action } }); });
    expect(confirmAction).toHaveBeenCalledWith(expect.objectContaining({ title: 'Discard your changes?', destructive: true }));
    expect(mockNavigation.dispatch).not.toHaveBeenCalled();
    confirmAction.mockResolvedValueOnce(true);
    await act(async () => { mockGuard.callback({ data: { action } }); });
    expect(mockNavigation.dispatch).toHaveBeenCalledWith(action);
  });

  test('a change put back as it was is no change', async () => {
    await render();
    await typeInto('Max depth (m)', '31');
    await typeInto('Max depth (m)', '28');
    expect(mockGuard.preventRemove).toBe(false);
  });

  test('a changed site counts', async () => {
    await render();
    await press(changeSite());
    const other = require('@/data/sites').SITES.find((s) => s.id !== SITE.id);
    await act(async () => {
      root.root.findByType(require('@/components/site-picker').SitePicker).props.onPick(other);
    });
    expect(mockGuard.preventRemove).toBe(true);
  });

  test('saving closes the page without the question', async () => {
    await render();
    await typeInto('Max depth (m)', '31');
    await press(byTitle('Save changes'));
    expect(mockState.updateDive).toHaveBeenCalledWith('d-26', expect.objectContaining({ maxDepthM: 31 }));
    expect(router.back).toHaveBeenCalledTimes(1);
    const action = { type: 'POP' };
    await act(async () => { mockGuard.callback({ data: { action } }); });
    expect(confirmAction).not.toHaveBeenCalled();
    expect(mockNavigation.dispatch).toHaveBeenCalledWith(action);
  });
});
