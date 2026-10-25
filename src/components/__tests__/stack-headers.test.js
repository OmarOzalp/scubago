import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import RootLayout from '@/app/_layout';

// The root layout, with its fonts, splash and stack standing by: only the options each screen is given matter here.
jest.mock('@/global.css', () => ({}));
jest.mock('@expo-google-fonts/courier-prime/700Bold', () => ({ CourierPrime_700Bold: 1 }));
jest.mock('@expo-google-fonts/figtree/500Medium', () => ({ Figtree_500Medium: 1 }));
jest.mock('@expo-google-fonts/figtree/600SemiBold', () => ({ Figtree_600SemiBold: 1 }));
jest.mock('@expo-google-fonts/figtree/700Bold', () => ({ Figtree_700Bold: 1 }));
jest.mock('@expo-google-fonts/figtree/800ExtraBold', () => ({ Figtree_800ExtraBold: 1 }));
jest.mock('@expo-google-fonts/fraunces/500Medium', () => ({ Fraunces_500Medium: 1 }));
jest.mock('@expo-google-fonts/fraunces/500Medium_Italic', () => ({ Fraunces_500Medium_Italic: 1 }));
jest.mock('@expo-google-fonts/fraunces/600SemiBold', () => ({ Fraunces_600SemiBold: 1 }));
jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: jest.fn(async () => undefined), hideAsync: jest.fn(async () => undefined) }));
jest.mock('@/components/animated-icon', () => ({ AnimatedSplashOverlay: () => null }));
jest.mock('@/components/storage-problem', () => ({ StorageProblem: () => null }));
jest.mock('@/lib/store', () => ({ useAppStore: (select) => select({ init: () => {} }) }));
jest.mock('expo-router', () => {
  function Screen({ name, options }) { return <screen name={name} options={options} />; }
  function Stack({ children }) { return <stack>{children}</stack>; }
  Stack.Screen = Screen;
  function ThemeProvider({ children }) { return children; }
  return { Stack, ThemeProvider, DefaultTheme: { colors: {} }, DarkTheme: { colors: {} } };
});

let root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });

const screens = async () => {
  await act(async () => { root = create(<RootLayout />); });
  return Object.fromEntries(root.root.findAllByType('screen').map((n) => [n.props.name, n.props.options]));
};

// The pages that print their own display title (a species, a site, a sighting, a badge, a collection).
const OWN_TITLE = ['species/[id]', 'site/[id]', 'sighting/[id]', 'rewards/[badge]', 'rewards/collections/[id]'];

test('a page with a title of its own shows only the back arrow in the header: its name is not said twice', async () => {
  const all = await screens();
  for (const name of OWN_TITLE) {
    expect(all[name]).toBeDefined();
    // The header text is empty; a page may still set `title` itself (a window title, the screen's name for a screen reader),
    // so the header must be told to leave it out (headerTitle), not only given no title.
    expect(all[name].headerTitle).toBe('');
  }
});

test('a modal with no title of its own keeps its name in the header', async () => {
  const all = await screens();
  expect(all['log/new'].title).toBe('Log a dive');
  expect(all['add-site'].title).toBe('Add a dive site');
  expect(all.auth.title).toBe('Account');
  expect(all.verify.title).toBe('Buddy code');
  expect(all['dive/count'].title).toBe('Dives before ScubaGo');
  for (const name of ['log/new', 'add-site', 'auth', 'verify', 'dive/count']) expect(all[name].headerTitle).toBeUndefined();
});
