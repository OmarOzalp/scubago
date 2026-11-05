import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { act } from 'react';
import { ScrollView, TextInput } from 'react-native';
import { create } from 'react-test-renderer';
import LogSightingScreen from '@/app/log/new';
import { router } from 'expo-router';
import { SITES } from '@/data/sites';

let mockParams = {};
let mockOptions = null;
let mockGuard = null;
const mockDisable = jest.fn();
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
  // As in expo-router: the hook hands back the way to lift the block, and `repeat` lifts it and sends the action again.
  usePreventRemove: (preventRemove, callback) => { mockGuard = { preventRemove, callback }; return mockDisable; },
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
// The animals are a windowed list: "Something else…" is its last row, so scroll the list down until it is drawn.
const findSomethingElse = () => root.root.findAll((n) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Something else') && typeof n.props.onPress === 'function')[0];
const somethingElse = async () => {
  const list = root.root.findAllByType(ScrollView).find((scroll) => scroll.props.keyboardShouldPersistTaps === 'handled' && typeof scroll.props.onScroll === 'function');
  const event = (y) => ({ nativeEvent: { contentOffset: { x: 0, y }, contentSize: { width: 393, height: 30000 }, layoutMeasurement: { width: 393, height: 700 }, zoomScale: 1, contentInset: { top: 0, left: 0, bottom: 0, right: 0 } } });
  await act(async () => {
    list.props.onLayout?.({ nativeEvent: { layout: { x: 0, y: 0, width: 393, height: 700 } } });
    list.props.onContentSizeChange?.(393, 30000);
  });
  for (let y = 0; y <= 30000 && !findSomethingElse(); y += 1500) {
    await act(async () => { list.props.onScroll(event(y)); await new Promise((resolve) => setTimeout(resolve, 60)); });
  }
  return findSomethingElse();
};
// The animal cards that can be ticked (each is a card and the pressable inside it: the outer one counts).
const checkboxes = () => {
  const all = root.root.findAll((n) => n.props.accessibilityRole === 'checkbox' && typeof n.props.onPress === 'function');
  return all.filter((n) => !all.some((o) => o !== n && o.findAll((c) => c === n).length > 0));
};
const tickFirstSpecies = async () => press(checkboxes()[0]);
const openMore = async () => act(async () => {
  root.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function' && n.findAll((c) => c.children?.join?.('') === 'More details').length > 0)[0].props.onPress();
});
const texts = () => root.root.findAll((n) => typeof n.children?.[0] === 'string').map((n) => n.children.join(''));


const { CATALOG, CATALOG_BY_ID } = require('@/lib/catalog');
const { RARITY_COLOR } = require('@/lib/rarity');
const flat = (style) => Object.assign({}, ...[typeof style === 'function' ? style({ pressed: false }) : style].flat(Infinity).filter(Boolean));

describe('the animals step: picture cards', () => {
  const goToAnimals = async () => { await render(); await pickSite(); };

  test('the cards say the common name only: no Latin names, and no rarity word', async () => {
    await goToAnimals();
    const said = texts();
    expect(said).toContain('What did you see?');
    const cards = checkboxes();
    expect(cards.length).toBeGreaterThan(2);
    for (const card of cards) {
      const species = CATALOG.find((s) => s.commonName === card.props.accessibilityLabel);
      expect(species).toBeDefined();
      expect(said).not.toContain(species.scientificName);
    }
    for (const word of ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary']) expect(said).not.toContain(word);
    // A screen reader hears the name and whether it is ticked, not the rarity.
    expect(cards.every((card) => !/common|rare|epic|legendary/i.test(card.props.accessibilityLabel))).toBe(true);
  });

  test('rarity is the colour of the card’s top edge', async () => {
    await goToAnimals();
    for (const card of checkboxes().slice(0, 4)) {
      const species = CATALOG.find((s) => s.commonName === card.props.accessibilityLabel);
      expect(flat(card.props.style).borderTopColor).toBe(RARITY_COLOR[species.rarity]);
    }
  });

  test('tapping a card ticks it (and says so to VoiceOver); tapping again clears it', async () => {
    await goToAnimals();
    const name = checkboxes()[0].props.accessibilityLabel;
    expect(checkboxes()[0].props['aria-checked']).toBe(false);
    await press(checkboxes()[0]);
    const ticked = checkboxes().find((card) => card.props.accessibilityLabel === name);
    expect(ticked.props['aria-checked']).toBe(true);
    expect(ticked.props['aria-selected']).toBe(true);
    expect(flat(ticked.props.style).borderWidth).toBe(2);
    await press(ticked);
    expect(checkboxes().find((card) => card.props.accessibilityLabel === name).props['aria-checked']).toBe(false);
  });

  test('the footer always says Next: with a count once something is ticked, never "Skip animals"', async () => {
    await goToAnimals();
    expect(byTitle('Next').props.disabled).toBe(false);
    expect(byTitle('Skip animals')).toBeUndefined();
    await press(checkboxes()[0]);
    await press(checkboxes()[1]);
    expect(byTitle('Next · 2 animals')).toBeDefined();
  });

  test('adding to a page that has none yet: Next waits for one animal', async () => {
    mockState.dives = [{ id: 'd-26', userId: 'local', number: 26, siteId: SITE.id, divedOn: '2026-10-16', synced: true, createdAt: '2026-10-16T10:00:00Z' }];
    mockParams = { dive: 'd-26' };
    await render();
    expect(byTitle('Next').props.disabled).toBe(true);
    await press(checkboxes()[0]);
    expect(byTitle('Next · 1 animal').props.disabled).toBe(false);
  });

  test('the species page’s “I saw one!” opens it pre-filled: that animal is chosen, on the details', async () => {
    mockParams = { siteId: SITE.id, speciesId: 'reef-manta' };
    await render();
    expect(header().label).toBe('Back to animals');
    expect(texts()).toContain(`Dive at ${SITE.name}`);
    await press(byTitle('Save dive'));
    expect(mockState.logDive).toHaveBeenCalledWith(expect.objectContaining({ sightings: [expect.objectContaining({ speciesId: 'reef-manta' })] }));
  });

  test('the site page’s “Log a dive here” opens it on the animals, at that site', async () => {
    mockParams = { siteId: SITE.id };
    await render();
    expect(texts()).toContain('What did you see?');
    expect(header().label).toBe('Back to site');
  });
});

describe('the reward screen', () => {
  const writeDive = async (newSpeciesIds) => {
    mockState.logDive = jest.fn(async () => ({ dive: { id: 'd-28', number: 28 }, newSpeciesIds }));
    await render();
    await pickSite();
    await press(checkboxes()[0]);
    await press(byTitle('Next · 1 animal'));
    await press(byTitle('Save dive'));
  };

  test('shows each animal with its rarity said as “… find”, and which are new', async () => {
    await render();
    await pickSite();
    const card = checkboxes()[0];
    const picked = CATALOG.find((sp) => sp.commonName === card.props.accessibilityLabel);
    await press(card);
    mockState.logDive = jest.fn(async () => ({ dive: { id: 'd-28', number: 28 }, newSpeciesIds: [picked.id] }));
    await press(byTitle('Next · 1 animal'));
    await press(byTitle('Save dive'));
    const said = texts();
    expect(said).toContain(picked.commonName);
    expect(said).toContain(`${picked.rarity[0].toUpperCase()}${picked.rarity.slice(1)} find`);
    expect(said.join(' ')).toContain('New in your field guide: ');
  });

  test('the island grew: said with the same stages Home uses', async () => {
    await writeDive(['reef-manta']);
    // One new species for a diver with none: 1 of 3 on the way to the second stage.
    expect(texts().join(' ')).toContain('Your island grew: 2 more animals to the next level');
  });

  test('no growth line when nothing was new', async () => {
    await writeDive([]);
    expect(texts().join(' ')).not.toContain('Your island grew');
  });

  test('a badge earned is shown on it, by the rewards’ own banner', async () => {
    await writeDive([]);
    expect(root.root.findAll((n) => n.type?.name === 'NewBadgesCelebration').length).toBe(1);
  });

  test('keeps everything it stored: the sighting with its site, privacy and the species', async () => {
    await writeDive([]);
    expect(CATALOG_BY_ID.get(mockState.logDive.mock.calls[0][0].sightings[0].speciesId)).toBeDefined();
    expect(mockState.logDive.mock.calls[0][0].dive).toEqual(expect.objectContaining({ siteId: SITE.id, number: 28 }));
  });
});
