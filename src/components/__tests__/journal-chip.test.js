import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { StyleSheet } from 'react-native';
import { create } from 'react-test-renderer';

import { Chip } from '@/components/journal/chip';

// The theme module imports the web stylesheet, which Jest can't parse.
jest.mock('@/global.css', () => ({}));

let root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });

const pressable = () => root.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function')[0];

test('a chip is at least 44 points tall, selected or not, so a finger can hit it', async () => {
  for (const selected of [false, true]) {
    await act(async () => { root = create(<Chip label="Sharks" selected={selected} onPress={() => {}} />); });
    expect(StyleSheet.flatten(pressable().props.style({ pressed: false })).minHeight).toBeGreaterThanOrEqual(44);
    await act(async () => root.unmount());
    root = null;
  }
});

test('a chip says whether it is on, and presses', async () => {
  const onPress = jest.fn();
  await act(async () => { root = create(<Chip label="Sharks" selected onPress={onPress} />); });
  expect(pressable().props['aria-selected']).toBe(true);
  await act(async () => pressable().props.onPress());
  expect(onPress).toHaveBeenCalledTimes(1);
});
