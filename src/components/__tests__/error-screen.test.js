import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { router } from 'expo-router';
import { Try } from 'expo-router/build/views/Try';

import { AppError, ErrorScreen, ScreenError } from '@/components/error-screen';

jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
jest.mock('@/global.css', () => ({}));
// The root layout, loaded for its exports only: what it pulls in at start-up is stood in for.
jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: jest.fn(async () => undefined), hideAsync: jest.fn(async () => undefined) }));
jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('@/lib/store', () => ({ useAppStore: (select) => select({ init: async () => undefined, storageProblem: null }) }));
jest.mock('@/components/animated-icon', () => ({ AnimatedSplashOverlay: () => null }));
jest.mock('@/components/storage-problem', () => ({ StorageProblem: () => null }));

let root;
let consoleError;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  // React and the screen itself report the error; the test only looks at what is drawn.
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
  consoleError.mockRestore();
});

const texts = () => root.root.findAll((n) => typeof n.children?.[0] === 'string').map((n) => n.children.join(''));
const button = (title) => root.root.findAll((n) => n.props.title === title && typeof n.props.onPress === 'function')[0];

describe('the error screen', () => {
  test('a screen that fails says the log is safe, offers Try again and a way home, and shows what went wrong', async () => {
    const retry = jest.fn(async () => undefined);
    await act(async () => { root = create(<ScreenError error={new Error('Cannot read property name of undefined')} retry={retry} />); });
    expect(texts()).toContain('This page hit a snag');
    expect(texts().join(' ')).toMatch(/Your log is safe: nothing has been lost/);
    expect(texts()).toContain('Cannot read property name of undefined');
    await act(async () => button('Try again').props.onPress());
    expect(retry).toHaveBeenCalledTimes(1);
    await act(async () => button('Back to my home').props.onPress());
    expect(router.replace).toHaveBeenCalledWith('/');
  });

  test('the app failing as a whole has no navigator to go home with: only Try again', async () => {
    await act(async () => { root = create(<AppError error={new Error('boom')} retry={jest.fn(async () => undefined)} />); });
    expect(texts()).toContain('ScubaGo hit a snag');
    expect(button('Try again')).toBeDefined();
    expect(button('Back to my home')).toBeUndefined();
  });

  test('something thrown that is not an Error still draws', async () => {
    await act(async () => { root = create(<ErrorScreen error={'just a string'} retry={jest.fn(async () => undefined)} />); });
    expect(texts()).toContain('just a string');
  });

  test('inside expo-router’s boundary, a failing screen shows the card, and Try again draws the screen afresh', async () => {
    let fail = true;
    function Flaky() {
      if (fail) throw new Error('The sighting has no species');
      return <ScreenErrorProbe />;
    }
    await act(async () => { root = create(<Try catch={ScreenError}><Flaky /></Try>); });
    expect(texts()).toContain('This page hit a snag');
    expect(texts()).toContain('The sighting has no species');
    fail = false;
    await act(async () => button('Try again').props.onPress());
    expect(texts()).not.toContain('This page hit a snag');
    expect(root.root.findAll((n) => n.type === ScreenErrorProbe)).toHaveLength(1);
  });
});

function ScreenErrorProbe() {
  return null;
}

describe('the root layout', () => {
  test('gives every screen the calm error card, and catches the app failing as a whole', () => {
    const layout = require('@/app/_layout');
    expect(layout.unstable_settings.screenErrorBoundary).toBe(ScreenError);
    expect(typeof layout.ErrorBoundary).toBe('function');
  });
});
