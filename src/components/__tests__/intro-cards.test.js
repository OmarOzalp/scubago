import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { IntroCards } from '@/components/intro-cards';

jest.mock('@/global.css', () => ({}));
jest.mock('react-native-reanimated', () => ({ __esModule: true, useReducedMotion: () => true, default: { View: require('react-native').View } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

let root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });

const render = async (onDone = () => {}) => { await act(async () => { root = create(<IntroCards visible onDone={onDone} />); }); };
const texts = () => root.root.findAll((n) => n.type === 'Text' && typeof n.children?.[0] === 'string').map((n) => n.children.join(''));
const words = (list) => list.join(' ').match(/[\p{L}\p{N}][\p{L}\p{N}'’.,%/-]*/gu)?.length ?? 0;
const buttons = () => root.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityRole === 'button');

test('is one card: what to do, that it works without a signal, and one button that ends it', async () => {
  const onDone = jest.fn();
  await render(onDone);
  expect(texts().filter((t) => t !== 'LOGGED')).toEqual(['Log what you see', 'Pick the site, tick every animal you saw. It works without a signal.', 'Start exploring']);
  // No Next, no Skip, no dots to count: the card is the whole introduction.
  expect(texts().join('|')).not.toMatch(/Next|Skip/);
  expect(buttons()).toHaveLength(1);
  await act(async () => buttons()[0].props.onPress());
  expect(onDone).toHaveBeenCalledTimes(1);
});

test('copy budget: 20 words for the card, its title once, and a screen reader hears it as one piece', async () => {
  await render();
  const shown = texts().filter((t) => t !== 'LOGGED');
  expect(words(shown.slice(0, 2))).toBeLessThanOrEqual(20);
  expect(shown.filter((t) => t === 'Log what you see')).toHaveLength(1);
  const spoken = root.root.findAll((n) => n.props.accessible === true && typeof n.props.accessibilityLabel === 'string' && /Log what you see/.test(n.props.accessibilityLabel));
  expect(spoken[0].props.accessibilityLabel).toBe('Log what you see. Pick the site, tick every animal you saw. It works without a signal.');
});
