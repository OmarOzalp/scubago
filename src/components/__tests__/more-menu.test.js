import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { create } from 'react-test-renderer';

import { MoreMenu } from '@/components/ui/more-menu';

jest.mock('@/global.css', () => ({}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
  jest.useRealTimers();
});

const buttons = () => root.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function');
const named = (label) => buttons().find((n) => n.props.accessibilityLabel === label);

test('the "…" button is labelled, and its rows wait until it is opened', async () => {
  const onDelete = jest.fn();
  await act(async () => {
    root = create(<MoreMenu accessibilityLabel="More actions for this page" items={[{ label: 'Delete page', destructive: true, onPress: onDelete }]} />);
  });
  expect(named('More actions for this page')).toBeTruthy();
  expect(named('Delete page')).toBeUndefined();
  await act(async () => named('More actions for this page').props.onPress());
  expect(named('Delete page')).toBeTruthy();
  expect(named('Cancel')).toBeTruthy();
  expect(onDelete).not.toHaveBeenCalled();
});

test('choosing a row closes the menu and then runs it; Cancel runs nothing', async () => {
  const onDelete = jest.fn();
  await act(async () => {
    root = create(<MoreMenu items={[{ label: 'Delete page', destructive: true, onPress: onDelete }]} />);
  });
  await act(async () => named('More actions').props.onPress());
  await act(async () => named('Cancel').props.onPress());
  act(() => jest.advanceTimersByTime(500));
  expect(onDelete).not.toHaveBeenCalled();
  expect(named('Delete page')).toBeUndefined();

  await act(async () => named('More actions').props.onPress());
  await act(async () => named('Delete page').props.onPress());
  act(() => jest.advanceTimersByTime(500));
  expect(onDelete).toHaveBeenCalledTimes(1);
  expect(named('Delete page')).toBeUndefined();
});

test('a disabled menu does not open', async () => {
  await act(async () => {
    root = create(<MoreMenu disabled items={[{ label: 'Delete page', onPress: () => {} }]} />);
  });
  await act(async () => named('More actions').props.onPress());
  expect(named('Delete page')).toBeUndefined();
});
