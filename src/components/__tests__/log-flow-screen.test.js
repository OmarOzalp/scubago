import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { ScrollView, TextInput } from 'react-native';
import { create } from 'react-test-renderer';
import LogSightingScreen from '@/app/log/new';
import { confirmAction } from '@/lib/confirm';
import { router } from 'expo-router';
import { SITES } from '@/data/sites';

let mockParams = {};
let mockOptions = null;
let mockGuard = null;
let mockNavigation = null;
let mockState = null;

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => mockParams,
  useNavigation: () => mockNavigation,
  Stack: { Screen: ({ options }) => { mockOptions = { ...mockOptions, ...options }; return null; } },
}));
jest.mock('expo-router/react-navigation', () => ({
  usePreventRemove: (preventRemove, callback) => { mockGuard = { preventRemove, callback }; },
}));
jest.mock('@/global.css', () => ({}));
jest.mock('@/components/external-link', () => ({ ExternalLink: () => null }));
jest.mock('expo-image-picker', () => ({}));
// Drawing 130 species' art is slow and not what these tests are about.
jest.mock('@/components/species-avatar', () => ({ SpeciesAvatar: () => null }));
jest.mock('@/components/species-art', () => ({ SpeciesArt: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  useReducedMotion: () => true,
  useSharedValue: (v) => ({ get: () => v, set: () => {} }),
  useAnimatedStyle: () => ({}),
  withDelay: (_d, v) => v,
  withTiming: (v) => v,
  default: { View: require('react-native').View },
}));
jest.mock('@/lib/confirm', () => ({ confirmAction: jest.fn(async () => true) }));
jest.mock('@/hooks/use-rewards', () => ({ useRewards: () => ({ badges: [], ready: true }) }));
jest.mock('@/hooks/use-new-badges', () => ({ useNewBadges: () => ({ fresh: [], markSeen: jest.fn() }) }));
jest.mock('@/lib/store', () => {
  const useAppStore = (select) => select(mockState);
  useAppStore.getState = () => mockState;
  return {
    useAppStore,
    useAllSites: () => require('@/data/sites').SITES,
    useSiteById: () => (id) => require('@/data/sites').SITES_BY_ID.get(id),
    useMyDives: () => mockState.dives,
    useMySightings: () => mockState.sightings,
    useMyUserId: () => 'local',
    useNextDiveNumber: () => 28,
  };
});

const SITE = SITES.find((s) => s.name === 'Blue Corner') ?? SITES[0];

let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockParams = {};
  mockOptions = null;
  mockGuard = null;
  mockNavigation = { dispatch: jest.fn() };
  mockState = {
    ready: true, user: null, backendEnabled: true, dives: [], sightings: [], divesBefore: {},
    addSightings: jest.fn(), updateSighting: jest.fn(),
    logDive: jest.fn(async () => ({ dive: { id: 'd-28', number: 28 }, newSpeciesIds: [] })),
  };
  jest.clearAllMocks();
});
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });

const render = async () => { await act(async () => { root = create(<LogSightingScreen />); }); };
const byTitle = (title) => root.root.findAll((n) => n.props.title === title && typeof n.props.onPress === 'function')[0];
const press = async (node) => { await act(async () => node.props.onPress()); };
const header = () => mockOptions.headerLeft({ tintColor: '#000' }).props;
const field = (label) => root.root.findAll((n) => n.type === TextInput && n.props.accessibilityLabel === label)[0];
const typeInto = async (label, text) => { await act(async () => field(label).props.onChangeText(text)); };
const pickSite = async () => {
  await typeInto('Where did you dive?', SITE.name);
  await press(root.root.findAll((n) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith(`${SITE.name},`) && typeof n.props.onPress === 'function')[0]);
};
const tickFirstSpecies = async () => press(root.root.findAll((n) => n.props.accessibilityRole === 'checkbox' && typeof n.props.onPress === 'function')[0]);
const texts = () => root.root.findAll((n) => typeof n.children?.[0] === 'string').map((n) => n.children.join(''));

describe('the back arrow of Log a dive', () => {
  test('steps back one step at a time, and closes only from the site step', async () => {
    await render();
    // The first step: Back closes.
    expect(header().label).toBe('Close');
    await pickSite();
    expect(header().label).toBe('Back to site');
    await tickFirstSpecies();
    await press(byTitle('Next · 1 species'));
    expect(header().label).toBe('Back to species');

    await act(async () => header().onPress());
    expect(router.back).not.toHaveBeenCalled();
    expect(header().label).toBe('Back to site');
    await act(async () => header().onPress());
    expect(router.back).not.toHaveBeenCalled();
    expect(header().label).toBe('Close');
    await act(async () => header().onPress());
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  test('closes to Home when there is nothing to go back to (a reload on the screen)', async () => {
    router.canGoBack.mockReturnValueOnce(false);
    await render();
    await act(async () => header().onPress());
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/');
  });

  test('on a page, Back from the species closes (the site is the page’s)', async () => {
    mockState.dives = [{ id: 'd-26', userId: 'local', number: 26, siteId: SITE.id, divedOn: '2026-10-16', synced: true, createdAt: '2026-10-16T10:00:00Z' }];
    mockParams = { dive: 'd-26' };
    await render();
    expect(header().label).toBe('Close');
  });

  test('Android’s back button steps back too, and lets go on the first step', async () => {
    const { BackHandler, Platform } = require('react-native');
    const original = Platform.OS;
    Platform.OS = 'android';
    const listeners = [];
    const add = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => { listeners.push(handler); return { remove: jest.fn() }; });
    try {
      await render();
      await pickSite();
      expect(header().label).toBe('Back to site');
      let handled;
      await act(async () => { handled = listeners.at(-1)(); });
      expect(handled).toBe(true);
      expect(header().label).toBe('Close');
      await act(async () => { handled = listeners.at(-1)(); });
      expect(handled).toBe(false);
    } finally {
      add.mockRestore();
      Platform.OS = original;
    }
  });
});

describe('leaving Log a dive with something entered', () => {
  test('is not questioned while nothing is entered', async () => {
    await render();
    expect(mockGuard.preventRemove).toBe(false);
    // Choosing the site is the first thing entered.
    await pickSite();
    expect(mockGuard.preventRemove).toBe(true);
  });

  test('asks "Discard this entry?" for a typed note, and leaves only when the diver says so', async () => {
    await render();
    await pickSite();
    await tickFirstSpecies();
    await press(byTitle('Next · 1 species'));
    await typeInto('Notes on what you saw (optional)', 'Came up to check us out');
    expect(mockGuard.preventRemove).toBe(true);

    const action = { type: 'POP' };
    confirmAction.mockResolvedValueOnce(false);
    await act(async () => { mockGuard.callback({ data: { action } }); });
    expect(confirmAction).toHaveBeenCalledWith(expect.objectContaining({ title: 'Discard this entry?', destructive: true }));
    expect(mockNavigation.dispatch).not.toHaveBeenCalled();

    confirmAction.mockResolvedValueOnce(true);
    await act(async () => { mockGuard.callback({ data: { action } }); });
    expect(mockNavigation.dispatch).toHaveBeenCalledWith(action);
  });

  test('asks for a typed dive field, too', async () => {
    await render();
    await pickSite();
    await press(byTitle('Nothing to log · next'));
    await typeInto('Max depth (m)', '18');
    expect(mockGuard.preventRemove).toBe(true);
  });

  test('is not questioned after saving, nor when it saves itself', async () => {
    await render();
    await pickSite();
    await press(byTitle('Nothing to log · next'));
    await press(byTitle('Save dive No. 28'));
    expect(mockState.logDive).toHaveBeenCalled();
    expect(mockGuard.preventRemove).toBe(false);
    expect(texts()).toContain('Entry No. 28');
  });

  test('an edit that saves and closes itself is not questioned on the way out', async () => {
    mockState.sightings = [{ id: 'sg-1', userId: 'local', username: 'you', speciesId: 'reef-manta', siteId: SITE.id, sightedOn: '2026-10-01', isDemo: false, synced: true, createdAt: '2026-10-01T10:00:00Z' }];
    mockState.updateSighting = jest.fn(async () => ({ sighting: mockState.sightings[0], isNewSpecies: false }));
    mockParams = { edit: 'sg-1' };
    await render();
    await typeInto('Notes (optional)', 'Came in close');
    expect(mockGuard.preventRemove).toBe(true);
    await press(byTitle('Save changes'));
    expect(router.back).toHaveBeenCalledTimes(1);
    // The close that follows is stopped by the navigator once, then let through without a question.
    const action = { type: 'POP' };
    await act(async () => { mockGuard.callback({ data: { action } }); });
    expect(confirmAction).not.toHaveBeenCalled();
    expect(mockNavigation.dispatch).toHaveBeenCalledWith(action);
  });
});

describe('the saved page', () => {
  /** Writes a dive with no animals, or with one the diver has seen before, and is on the saved page. */
  const writeDive = async ({ animals = false, firstRecord = false } = {}) => {
    mockState.logDive = jest.fn(async () => ({ dive: { id: 'd-28', number: 28 }, newSpeciesIds: firstRecord ? ['reef-manta'] : [] }));
    await render();
    await pickSite();
    if (animals) {
      await tickFirstSpecies();
      await press(byTitle('Next · 1 species'));
    } else {
      await press(byTitle('Nothing to log · next'));
    }
    await press(byTitle('Save dive No. 28'));
  };
  const titles = () => root.root.findAll((n) => typeof n.props.title === 'string' && typeof n.props.onPress === 'function').map((n) => n.props.title);
  const pinned = (title) => {
    const node = byTitle(title);
    // Pinned means outside every ScrollView: the page above scrolls and this doesn't.
    return !!node && root.root.findAllByType(ScrollView).every((scroll) => scroll.findAll((n) => n === node).length === 0);
  };

  test('an ordinary log: "Logged" in the header, "Done" first, then the page, with sign and log another as quieter links', async () => {
    await writeDive({ animals: true });
    expect(mockOptions.title).toBe('Logged');
    expect(mockOptions.headerLeft).toBeUndefined();
    expect(titles()).toEqual(['Done', 'Open the page', 'Ask your buddy to sign', 'Log another dive']);
    expect(pinned('Done')).toBe(true);
    expect(pinned('Open the page')).toBe(true);
    expect(pinned('Ask your buddy to sign')).toBe(true);
    expect(pinned('Log another dive')).toBe(true);
    await press(byTitle('Open the page'));
    expect(router.replace).toHaveBeenCalledWith('/dive/d-28');
    await press(byTitle('Done'));
    expect(router.back).toHaveBeenCalledTimes(1);
    await press(byTitle('Ask your buddy to sign'));
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/dive/sign', params: { id: 'd-28', then: 'page' } });
  });

  test('a first record: "Visit my home" first, then the same rows in the same footer', async () => {
    await writeDive({ animals: true, firstRecord: true });
    expect(mockOptions.title).toBe('Logged');
    expect(mockOptions.headerLeft).toBeUndefined();
    expect(titles()).toEqual(['Visit my home', 'Open the page', 'Ask your buddy to sign', 'Log another dive']);
    expect(pinned('Visit my home')).toBe(true);
    expect(pinned('Open the page')).toBe(true);
    expect(pinned('Ask your buddy to sign')).toBe(true);
    expect(pinned('Log another dive')).toBe(true);
    await press(byTitle('Visit my home'));
    expect(router.dismissTo).toHaveBeenCalledWith('/(tabs)');
  });

  test('a dive with no animals offers "Add what you saw", which adds them on its page', async () => {
    await writeDive();
    expect(titles()).toEqual(['Add what you saw', 'Done', 'Open the page', 'Ask your buddy to sign', 'Log another dive']);
    await press(byTitle('Add what you saw'));
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/log/new', params: { dive: 'd-28' } });
  });

  test('a dive with animals does not', async () => {
    await writeDive({ animals: true });
    expect(titles()).not.toContain('Add what you saw');
  });

  test('"Log another dive" starts a page afresh at the site step', async () => {
    await writeDive({ animals: true });
    await press(byTitle('Log another dive'));
    expect(mockOptions.title).toBe('Log a dive');
    expect(mockOptions.headerLeft({}).props.label).toBe('Close');
    // Nothing entered on the new page yet, so leaving it isn't questioned.
    expect(mockGuard.preventRemove).toBe(false);
  });
});

describe('the details step', () => {
  const goToDetails = async ({ unlisted = false } = {}) => {
    await render();
    await pickSite();
    if (unlisted) {
      await press(root.root.findAll((n) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Something else') && typeof n.props.onPress === 'function')[0]);
      await press(byTitle('Next · 1 species'));
    } else {
      await tickFirstSpecies();
      await press(byTitle('Next · 1 species'));
    }
  };
  const inside = (parent, text) => parent.findAll((n) => n.children?.join?.('') === text).length > 0;
  const scrollers = () => root.root.findAllByType(ScrollView);
  const bars = () => root.root.findAll((n) => n.type?.name === 'BottomBar');
  const tick = async () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

  test('"Save dive No. 28" is pinned under the page, not at the end of it', async () => {
    await goToDetails();
    const save = byTitle('Save dive No. 28');
    expect(save).toBeDefined();
    expect(scrollers().every((scroll) => scroll.findAll((n) => n === save).length === 0)).toBe(true);
    expect(bars().some((bar) => bar.findAll((n) => n === save).length > 0)).toBe(true);
    expect(byTitle('Write entry No. 28')).toBeUndefined();
  });

  test('a problem with a field is under that field, which is focused, and not by the button', async () => {
    mockState.logDive = jest.fn(async () => { throw new Error('Maximum depth has to be between 0 and 350.'); });
    await goToDetails();
    await typeInto('Max depth (m)', '500');
    await press(byTitle('Save dive No. 28'));
    const message = 'Maximum depth has to be between 0 and 350.';
    const form = scrollers().find((scroll) => inside(scroll, message));
    expect(form).toBeDefined();
    expect(bars().some((bar) => inside(bar, message))).toBe(false);
    // The field is outlined, and taken to.
    const depth = field('Max depth (m)');
    expect(JSON.stringify(depth.props.style)).toContain('borderColor');
    await tick();
    expect(depth.instance.focus).toHaveBeenCalled();
    // Putting the field right ends the problem.
    await typeInto('Max depth (m)', '30');
    expect(scrollers().some((scroll) => inside(scroll, message))).toBe(false);
  });

  test('a typing problem names its field too, and opens More details when the field is in it', async () => {
    await goToDetails();
    await typeInto('Time in', 'morning');
    await press(byTitle('Save dive No. 28'));
    expect(mockState.logDive).not.toHaveBeenCalled();
    expect(scrollers().some((scroll) => inside(scroll, 'Write the time in as hours and minutes, like 09:30.'))).toBe(true);

    mockState.logDive = jest.fn(async () => { throw new Error('The end pressure can’t be higher than the start pressure.'); });
    await typeInto('Time in', '09:30');
    await press(byTitle('Save dive No. 28'));
    await tick();
    // "End (bar)" is under More details, closed until now.
    expect(field('End (bar)')).toBeDefined();
    expect(scrollers().some((scroll) => inside(scroll, 'The end pressure can’t be higher than the start pressure.'))).toBe(true);
    expect(field('End (bar)').instance.focus).toHaveBeenCalled();
  });

  test('a problem with the page as a whole is above the button', async () => {
    mockState.logDive = jest.fn(async () => { throw new Error('Could not save'); });
    await goToDetails();
    await press(byTitle('Save dive No. 28'));
    expect(bars().some((bar) => inside(bar, 'Could not save'))).toBe(true);
  });

  test('"Something else" without a name is never a greyed-out button: a tap says what is missing and goes to the field', async () => {
    await goToDetails({ unlisted: true });
    const save = byTitle('Save dive No. 28');
    expect(save.props.disabled).toBe(false);
    await press(save);
    expect(mockState.logDive).not.toHaveBeenCalled();
    expect(scrollers().some((scroll) => inside(scroll, 'Name the animal first'))).toBe(true);
    await tick();
    expect(field('What was it?').instance.focus).toHaveBeenCalled();
    // Naming it ends the message, and the dive can be saved.
    await typeInto('What was it?', 'Nudibranch');
    expect(scrollers().some((scroll) => inside(scroll, 'Name the animal first'))).toBe(false);
    await press(byTitle('Save dive No. 28'));
    expect(mockState.logDive).toHaveBeenCalledWith(expect.objectContaining({ sightings: [expect.objectContaining({ speciesId: 'unlisted', customName: 'Nudibranch' })] }));
  });

  test('"What was it?" is directly under the species card, before the dive’s own fields', async () => {
    await goToDetails({ unlisted: true });
    const labels = scrollers().at(-1).findAll((n) => n.type === TextInput).map((n) => n.props.accessibilityLabel);
    expect(labels[0]).toBe('What was it?');
    expect(labels.indexOf('Dive number')).toBeGreaterThan(0);
  });
});
