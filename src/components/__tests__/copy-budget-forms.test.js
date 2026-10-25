import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import AddSiteScreen from '@/app/add-site';
import DivesBeforeScreen from '@/app/dive/count';
import { countWords, screenTexts, screenWords } from '@/test-support/screen-words';

// The two small forms: "Add a dive site" (it was 62 words, with six typewriter labels) and "Dives before ScubaGo" (it
// was 61, with a 30-word paragraph). A form says at most 40 words in all: labels, hints and the lines under the
// fields. A helper line is 12 words or fewer, and only where the format is not guessable.
const FORM_BUDGET = 40;
const HELPER_MAX = 12;

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), dismiss: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => true) },
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
}));
jest.mock('@/global.css', () => ({}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/lib/site-added', () => ({ notifySiteAdded: jest.fn() }));
jest.mock('@/lib/announce', () => ({ announce: jest.fn() }));
jest.mock('@/lib/store', () => ({
  useAppStore: (select) => select({ ready: true, addSite: jest.fn(), setDivesBefore: jest.fn() }),
  useDivesBefore: () => 21,
  useMyDives: () => [{ id: 'd1', userId: 'local', number: 22, siteId: 'shark-yolanda', divedOn: '2026-03-12', synced: true, createdAt: '2026-03-12T10:00:00Z' }],
}));

let root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });
const render = async (element) => { await act(async () => { root = create(element); }); };

describe('Add a dive site’s copy budget', () => {
  test('stays within the form budget, with no eyebrow and no helper longer than 12 words', async () => {
    await render(<AddSiteScreen />);
    const texts = screenTexts(root.toJSON());
    expect(screenWords(root.toJSON())).toBeLessThanOrEqual(FORM_BUDGET);
    expect(texts).not.toContain('A new page for the chart');
    expect(texts.filter((t) => countWords(t) > HELPER_MAX)).toEqual([]);
  });

  test('says what is missing in seven words, and how to find the numbers in ten', async () => {
    await render(<AddSiteScreen />);
    const texts = screenTexts(root.toJSON());
    expect(texts).toContain('Missing a site? Add it to your map.');
    expect(texts).toContain('In a maps app, hold a spot and copy its numbers.');
  });

  test('the coordinates have an example, one line to say it is latitude then longitude, and nothing else to read', async () => {
    await render(<AddSiteScreen />);
    // The "Latitude first, then longitude." nudge shows while what was typed is not yet a pair.
    expect(screenTexts(root.toJSON())).toContain('Latitude first, then longitude.');
    expect(screenTexts(root.toJSON(), { placeholders: true })).toContain('e.g. 7.81, 98.54');
  });
});

describe('Dives before ScubaGo’s copy budget', () => {
  test('stays within the form budget, with the paragraph in 15 words and the helper in 10', async () => {
    await render(<DivesBeforeScreen />);
    const texts = screenTexts(root.toJSON());
    expect(screenWords(root.toJSON())).toBeLessThanOrEqual(FORM_BUDGET);
    expect(texts).toContain('Say how many dives you logged before ScubaGo, so your pages carry your real numbers.');
    expect(texts).toContain('Leave it at 0 if ScubaGo is your first log.');
    expect(texts.filter((t) => countWords(t) > 15)).toEqual([]);
  });
});
