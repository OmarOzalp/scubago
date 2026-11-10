import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { create } from 'react-test-renderer';

import { Button } from '@/components/ui/button';

jest.mock('@/global.css', () => ({}));
let mockReduced = false;
jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(async () => mockReduced);

let root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });

const pressedStyle = () => StyleSheet.flatten(root.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.style === 'function')[0].props.style({ pressed: true }));

test('a pressed button scales to 0.98, and never sinks', async () => {
  mockReduced = false;
  await act(async () => { root = create(<Button title="Save" onPress={() => {}} />); });
  expect(pressedStyle().transform).toEqual([{ scale: 0.98 }]);
});

test('under Reduce Motion a pressed button does not move', async () => {
  mockReduced = true;
  await act(async () => { root = create(<Button title="Save" onPress={() => {}} />); });
  expect(pressedStyle().transform).toBeUndefined();
});
