import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { act } from 'react';
import { ScrollView, TextInput } from 'react-native';
import { create } from 'react-test-renderer';
import LogSightingScreen from '@/app/log/new';
import { confirmAction } from '@/lib/confirm';
import { router } from 'expo-router';
import { SITES } from '@/data/sites';
import { PrivacyFields } from '@/components/privacy-fields';

let mockParams = {};
let mockOptions = null;
let mockGuard = null;
let mockNavigation = null;
let mockState = null;
const mockScrollTo = jest.fn();
let mockKeyboard = { open: false, overlap: 0 };

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
jest.mock('@/hooks/use-keyboard', () => ({ ...jest.requireActual('@/hooks/use-keyboard'), useKeyboard: () => mockKeyboard }));
jest.mock('@/hooks/use-scroll-to', () => ({
  useScrollTo: () => ({ scrollView: { current: null }, onScroll: () => {}, scrollTo: (...args) => mockScrollTo(...args) }),
}));
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
  mockKeyboard = { open: false, overlap: 0 };
  mockOptions = null;
  mockGuard = null;
  mockNavigation = { dispatch: jest.fn() };
  mockState = {
    ready: true, user: null, backendEnabled: true, dives: [], sightings: [], divesBefore: {},
    addSightings: jest.fn(), updateSighting: jest.fn(),
    logDive: jest.fn(async () => ({ dive: { id: 'd-28', number: 28 }, newSpeciesIds: [] })),
  };
  jest.clearAllMocks();
  return AsyncStorage.clear();
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
    expect(header().label).toBe('Back to animals');

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
    await typeInto('Notes about the animals', 'Came up to check us out');
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
    await press(byTitle('Skip animals'));
    await typeInto('Max depth (m)', '18');
    expect(mockGuard.preventRemove).toBe(true);
  });

  test('is not questioned after saving, nor when it saves itself', async () => {
    await render();
    await pickSite();
    await press(byTitle('Skip animals'));
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
    await typeInto('Notes about the animals', 'Came in close');
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
      await press(byTitle('Skip animals'));
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

describe('What you saw', () => {
  const labels = () => root.root.findAll((n) => n.type === TextInput).map((n) => n.props.accessibilityLabel);
  const visibleTo = () => root.root.findAll((n) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Visible to:') && typeof n.props.onPress === 'function')[0];
  const goToDetails = async () => {
    await render();
    await pickSite();
    await tickFirstSpecies();
    await press(byTitle('Next · 1 species'));
  };
  const choose = async (name, label) => {
    await act(async () => {
      root.root.findAll((n) => n.props.accessibilityRole === 'radiogroup' && n.props.accessibilityLabel === label)[0]
        .findAll((n) => n.props.accessibilityRole === 'radio' && n.props.accessibilityLabel === undefined && typeof n.props.onPress === 'function')
        .find((n) => n.findAll((c) => c.children?.join?.('') === name).length > 0)
        .props.onPress();
    });
  };

  test('notes about the animals, the photo and who can see it are one section, right under the animals; the dive’s own notes stay with the dive', async () => {
    await goToDetails();
    const order = labels();
    expect(order.indexOf('Notes about the animals')).toBe(0);
    expect(order.indexOf('Notes about the animals')).toBeLessThan(order.indexOf('Dive number'));
    expect(order).toContain('Notes about the dive (just for you)');
    expect(order.indexOf('Notes about the dive (just for you)')).toBeGreaterThan(order.indexOf('Dive number'));
    const text = texts();
    expect(text).toEqual(expect.arrayContaining(['What you saw', 'Photo', 'Who can see this']));
    // The section's parts come in this order, all before the dive's fields.
    const at = (t) => text.indexOf(t);
    expect(at('What you saw')).toBeLessThan(at('Photo'));
    expect(at('Photo')).toBeLessThan(at('Who can see this'));
    expect(at('Who can see this')).toBeLessThan(at('Dive number') === -1 ? Infinity : at('Dive number'));
  });

  test('with a name to give, "What was it?" comes first, then the section', async () => {
    await render();
    await pickSite();
    await press(root.root.findAll((n) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Something else') && typeof n.props.onPress === 'function')[0]);
    await press(byTitle('Next · 1 species'));
    expect(labels().slice(0, 2)).toEqual(['What was it?', 'Notes about the animals']);
  });

  test('several species: the notes go to each, and there is one photo note instead of a photo', async () => {
    await render();
    await pickSite();
    const rows = root.root.findAll((n) => n.props.accessibilityRole === 'checkbox' && typeof n.props.onPress === 'function');
    await press(rows[0]);
    await press(rows[1]);
    await press(byTitle('Next · 2 species'));
    expect(texts().join(' ')).toContain('Added to each of the 2 sightings.');
    expect(texts()).not.toContain('Photo');
    expect(texts().join(' ')).toContain('Photos go with one sighting each');
  });

  test('the last choice is remembered, and shown as a line above the save button: "Visible to: Only me · change"', async () => {
    await AsyncStorage.setItem('scubago.privacyChoice', JSON.stringify({ visibility: 'private', notesPrivate: true, photoPrivate: false }));
    await goToDetails();
    expect(visibleTo().props.accessibilityLabel).toBe('Visible to: Only me. Change who can see this');
    const line = texts().filter((t) => t === 'Only me' || t === 'change' || t.startsWith('Visible to:'));
    expect(line).toEqual(expect.arrayContaining(['Only me', 'change']));
    // It is in the bar under the form, not in the form.
    const bar = root.root.findAll((n) => n.type?.name === 'BottomBar')[0];
    expect(bar.findAll((n) => n === visibleTo()).length).toBe(1);
  });

  test('with nothing remembered the line says what the default is, and changing the choice changes the line', async () => {
    await goToDetails();
    expect(visibleTo().props.accessibilityLabel).toBe('Visible to: Everyone, but not your notes. Change who can see this');
    await choose('Only me', 'Who can see this sighting');
    expect(visibleTo().props.accessibilityLabel).toBe('Visible to: Only me. Change who can see this');
  });

  test('tapping the line takes the diver to the privacy choice', async () => {
    await goToDetails();
    mockScrollTo.mockClear();
    await press(visibleTo());
    expect(mockScrollTo).toHaveBeenCalledTimes(1);
    const [target] = mockScrollTo.mock.calls[0];
    // The view around the privacy fields.
    expect(target.props.children.type).toBe(PrivacyFields);
  });

  test('saving remembers the choice for the next log', async () => {
    await goToDetails();
    await choose('Only me', 'Who can see this sighting');
    await press(byTitle('Save dive No. 28'));
    expect(JSON.parse(await AsyncStorage.getItem('scubago.privacyChoice'))).toEqual({ visibility: 'private', notesPrivate: true, photoPrivate: false });
  });

  test('without a backend nothing leaves the phone, so there is no line and no choice', async () => {
    mockState.backendEnabled = false;
    await goToDetails();
    expect(visibleTo()).toBeUndefined();
    expect(texts()).not.toContain('Who can see this');
    expect(labels()).toContain('Notes about the animals');
  });
});

describe('with the keyboard', () => {
  const steps = () => root.root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'tablist');
  const rerender = async () => act(async () => root.update(<LogSightingScreen />));
  const flat = (style) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
  const withPadding = (px) => root.root.findAll((n) => typeof n.type === 'string' && flat(n.props.style).paddingBottom === px);

  test('the species step’s Next bar is pinned under the list, lifted clear of the keyboard, and dragging the list puts the keyboard away', async () => {
    await render();
    await pickSite();
    const bar = root.root.findAll((n) => n.type?.name === 'BottomBar')[0];
    expect(bar).toBeDefined();
    expect(bar.findAll((n) => n.props.title === 'Skip animals').length).toBeGreaterThan(0);
    const list = root.root.findAllByType(ScrollView).find((scroll) => scroll.props.keyboardShouldPersistTaps === 'handled');
    expect(list.props.keyboardDismissMode).toBe('on-drag');

    // The keyboard reaches 300 into the screen: the step is padded by that much.
    expect(withPadding(300)).toHaveLength(0);
    mockKeyboard = { open: true, overlap: 300 };
    await rerender();
    expect(withPadding(300).length).toBeGreaterThan(0);
    mockKeyboard = { open: false, overlap: 0 };
    await rerender();
    expect(withPadding(300)).toHaveLength(0);
  });

  test('the details form adjusts for the keyboard and lets go of it when dragged', async () => {
    await render();
    await pickSite();
    await tickFirstSpecies();
    await press(byTitle('Next · 1 species'));
    const form = root.root.findAllByType(ScrollView).find((scroll) => scroll.props.keyboardShouldPersistTaps === 'handled');
    expect(form.props.automaticallyAdjustKeyboardInsets).toBe(true);
    expect(form.props.keyboardDismissMode).toBe('on-drag');
  });

  test('the step bar steps aside while the keyboard is up', async () => {
    await render();
    await pickSite();
    expect(steps()).toHaveLength(1);
    mockKeyboard = { open: true, overlap: 300 };
    await rerender();
    expect(steps()).toHaveLength(0);
    mockKeyboard = { open: false, overlap: 0 };
    await rerender();
    expect(steps()).toHaveLength(1);
  });
});

describe('the step bar', () => {
  const tabs = () => root.root
    .findAll((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'tab')
    .map((tab) => ({ label: tab.props.accessibilityLabel, text: tab.findAll((n) => typeof n.children?.[0] === 'string').map((n) => n.children.join('')).filter((t) => !/^\d$/.test(t)).join('') }));
  const pressText = async (text) => act(async () => {
    root.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function' && n.findAll((c) => c.children?.join?.('') === text).length > 0)[0].props.onPress();
  });

  test('names each step with a short fixed word until something is chosen in it', async () => {
    await render();
    expect(tabs().map((t) => t.text)).toEqual(['Site', 'Animals', 'Details']);
    expect(tabs()[0].label).toBe('Step 1, Site');
    await pickSite();
    expect(tabs().map((t) => t.text)).toEqual([SITE.name.length > 14 ? `${SITE.name.slice(0, 13).trimEnd()}…` : SITE.name, 'Animals', 'Details']);
    expect(tabs()[0].label).toBe(`Step 1, Site: ${SITE.name}`);
    await tickFirstSpecies();
    expect(tabs()[1].text.length).toBeLessThanOrEqual(14);
    await press(byTitle('Next · 1 species'));
    // The third step is always "Details", not the dive's number.
    expect(tabs()[2].text).toBe('Details');
  });

  test('cuts a long name to about 14 characters, and says how many animals when there are several', async () => {
    await render();
    await pickSite();
    await press(root.root.findAll((n) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Something else') && typeof n.props.onPress === 'function')[0]);
    await press(byTitle('Next · 1 species'));
    await typeInto('What was it?', 'A very long name for a nudibranch I could not identify at all, with a long description besides');
    await act(async () => { mockOptions.headerLeft({}).props.onPress(); });
    expect(tabs()[1].text).toBe('A very long n…');
    expect(tabs()[1].label).toContain('A very long name for a nudibranch');
    const rows = root.root.findAll((n) => n.props.accessibilityRole === 'checkbox' && typeof n.props.onPress === 'function');
    await press(rows[0]);
    expect(tabs()[1].text).toBe('2 animals');
  });

  test('is not there when editing a sighting, which has no steps: the animal and the site are changed from the card', async () => {
    mockState.sightings = [{ id: 'sg-1', userId: 'local', username: 'you', speciesId: 'reef-manta', siteId: SITE.id, sightedOn: '2026-10-01', isDemo: false, synced: true, createdAt: '2026-10-01T10:00:00Z' }];
    mockParams = { edit: 'sg-1' };
    await render();
    expect(tabs()).toEqual([]);
    await pressText('Change the site');
    expect(root.root.findAll((n) => n.props.accessibilityLabel === 'Where did you dive?').length).toBeGreaterThan(0);
    // Back goes to the sighting, not out of the screen.
    expect(mockOptions.headerLeft({}).props.label).toBe('Back to details');
    await act(async () => { mockOptions.headerLeft({}).props.onPress(); });
    expect(router.back).not.toHaveBeenCalled();
    await pressText('Change the animal');
    expect(root.root.findAll((n) => n.props.accessibilityLabel === 'What did you see?').length).toBeGreaterThan(0);
  });

  test('on a page, an edit changes the animal only: the site is the page’s', async () => {
    mockState.dives = [{ id: 'd-26', userId: 'local', number: 26, siteId: SITE.id, divedOn: '2026-10-16', synced: true, createdAt: '2026-10-16T10:00:00Z' }];
    mockState.sightings = [{ id: 'sg-1', userId: 'local', username: 'you', speciesId: 'reef-manta', siteId: SITE.id, sightedOn: '2026-10-16', diveId: 'd-26', isDemo: false, synced: true, createdAt: '2026-10-16T10:00:00Z' }];
    mockParams = { edit: 'sg-1' };
    await render();
    expect(texts()).toContain('Change the animal');
    expect(texts()).not.toContain('Change the site');
  });
});
