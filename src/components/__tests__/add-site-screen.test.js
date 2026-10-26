import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { TextInput } from 'react-native';
import { create } from 'react-test-renderer';
import AddSiteScreen from '@/app/add-site';
import { notifySiteAdded } from '@/lib/site-added';
import { router } from 'expo-router';

let mockParams = {};
let mockAddSite = null;

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), dismiss: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => true) },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/global.css', () => ({}));
jest.mock('@/lib/site-added', () => ({ notifySiteAdded: jest.fn() }));
jest.mock('@/lib/store', () => ({ useAppStore: (select) => select({ addSite: (...args) => mockAddSite(...args) }) }));

let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockParams = {};
  mockAddSite = jest.fn(async (input) => ({ ...input, id: 'user-1' }));
  jest.clearAllMocks();
});
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });

const render = async () => { await act(async () => { root = create(<AddSiteScreen />); }); };
const field = (label) => root.root.findAll((n) => n.type === TextInput && n.props.accessibilityLabel === label)[0];
const typeInto = async (label, text) => { await act(async () => field(label).props.onChangeText(text)); };
const button = (title) => root.root.findAll((n) => n.props.title === title && typeof n.props.onPress === 'function')[0];
const press = async (title) => { await act(async () => button(title).props.onPress()); };
const texts = () => root.root.findAll((n) => typeof n.children?.[0] === 'string').map((n) => n.children.join(''));

describe('the Coordinates field', () => {
  test('is one field with an "e.g." placeholder, in place of separate latitude and longitude', async () => {
    await render();
    expect(field('Coordinates (required)').props.placeholder).toBe('e.g. 7.81, 98.54');
    expect(field('Latitude (required)')).toBeUndefined();
    expect(field('Longitude (required)')).toBeUndefined();
    // Every placeholder is an example, not a value that looks filled in.
    expect(field('Site name (required)').props.placeholder).toBe('e.g. Shark Point');
    expect(field('Region').props.placeholder).toMatch(/^e\.g\. /);
    expect(field('Country').props.placeholder).toMatch(/^e\.g\. /);
  });

  test('takes a pair pasted from a maps app, and says it back', async () => {
    await render();
    await typeInto('Site name (required)', 'Shark Point');
    await typeInto('Coordinates (required)', '7.8123, 98.5412');
    expect(texts()).toContain('That is 7.8123° N, 98.5412° E.');
    await press('Add site');
    expect(mockAddSite).toHaveBeenCalledWith(expect.objectContaining({ name: 'Shark Point', lat: 7.8123, lng: 98.5412 }));
  });

  test('says a missed minus sign, so it can be caught', async () => {
    await render();
    await typeInto('Coordinates (required)', '-0.59, -130.49');
    expect(texts()).toContain('That is 0.59° S, 130.49° W.');
  });

  test('a long-press on the map arrives as one pair, to five places', async () => {
    mockParams = { lat: '7.812345678', lng: '98.5' };
    await render();
    expect(field('Coordinates (required)').props.value).toBe('7.81235, 98.5');
  });

  test('says what is wrong under the field, and goes to it', async () => {
    await render();
    await typeInto('Site name (required)', 'Shark Point');
    await typeInto('Coordinates (required)', 'Shark Point');
    await press('Add site');
    expect(mockAddSite).not.toHaveBeenCalled();
    expect(texts()).toContain('Write the coordinates as two numbers, latitude first, like 7.81, 98.54.');
    expect(field('Coordinates (required)').instance.focus).toHaveBeenCalled();
    // Typing again ends the message.
    await typeInto('Coordinates (required)', '7.81, 98.54');
    expect(texts()).not.toContain('Write the coordinates as two numbers, latitude first, like 7.81, 98.54.');
  });

  test('a missing name is said under the name, which takes focus', async () => {
    await render();
    await typeInto('Coordinates (required)', '7.81, 98.54');
    await press('Add site');
    expect(mockAddSite).not.toHaveBeenCalled();
    expect(texts()).toContain('Give the site a name.');
    expect(field('Site name (required)').instance.focus).toHaveBeenCalled();
  });
});

describe('the buttons', () => {
  const fill = async () => {
    await typeInto('Site name (required)', 'Shark Point');
    await typeInto('Coordinates (required)', '7.81, 98.54');
  };

  test('from Explore, "Add site" is the main button and just adds it', async () => {
    await render();
    expect(root.root.findAll((n) => typeof n.props.title === 'string' && typeof n.props.onPress === 'function').map((n) => n.props.title)).toEqual(['Add site', 'Add and log a dive']);
    await fill();
    await press('Add site');
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.push).not.toHaveBeenCalled();
    expect(notifySiteAdded).not.toHaveBeenCalled();
  });

  test('"Add and log a dive" carries on to the log, at the new site', async () => {
    await render();
    await fill();
    await press('Add and log a dive');
    expect(router.dismiss).toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith({ pathname: '/log/new', params: { siteId: 'user-1' } });
  });

  test('from the log there is one button, and the new site goes back to it', async () => {
    mockParams = { then: 'log', name: 'Shark Point' };
    await render();
    expect(field('Site name (required)').props.value).toBe('Shark Point');
    expect(button('Add and log a dive')).toBeUndefined();
    await typeInto('Coordinates (required)', '7.81, 98.54');
    await press('Add site');
    expect(notifySiteAdded).toHaveBeenCalledWith('user-1');
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  // Opened straight from a link, or the web page reloaded on it: nothing underneath to go back to.
  test('with nothing underneath, adding a site still leaves the screen: to Explore, or on to the log', async () => {
    router.canGoBack.mockReturnValue(false);
    router.canDismiss.mockReturnValue(false);
    try {
      await render();
      await fill();
      await press('Add site');
      expect(router.back).not.toHaveBeenCalled();
      expect(router.replace).toHaveBeenLastCalledWith('/map');

      await act(async () => root.unmount());
      await render();
      await fill();
      await press('Add and log a dive');
      expect(router.dismiss).not.toHaveBeenCalled();
      expect(router.replace).toHaveBeenLastCalledWith({ pathname: '/log/new', params: { siteId: 'user-1' } });

      await act(async () => root.unmount());
      mockParams = { then: 'log', name: 'Shark Point' };
      await render();
      await typeInto('Coordinates (required)', '7.81, 98.54');
      await press('Add site');
      expect(router.replace).toHaveBeenLastCalledWith({ pathname: '/log/new', params: { siteId: 'user-1' } });
    } finally {
      router.canGoBack.mockReturnValue(true);
      router.canDismiss.mockReturnValue(true);
    }
  });

  test('a site that could not be saved says so, and can be tried again', async () => {
    mockAddSite = jest.fn(async () => { throw new Error('No room left on this phone'); });
    await render();
    await fill();
    await press('Add site');
    expect(texts()).toContain('No room left on this phone');
    expect(router.back).not.toHaveBeenCalled();
    expect(button('Add site').props.disabled).toBe(false);
  });
});
