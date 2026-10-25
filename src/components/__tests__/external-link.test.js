import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { openBrowserAsync } from 'expo-web-browser';

import { ExternalLink } from '@/components/external-link';

let mockLink = null;
jest.mock('expo-router', () => ({ Link: (props) => { mockLink = props; return null; } }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(), WebBrowserPresentationStyle: { AUTOMATIC: 'automatic' } }));
jest.mock('@/global.css', () => ({}));

let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
});

test('on a phone the link opens in the in-app browser', async () => {
  openBrowserAsync.mockResolvedValueOnce({ type: 'opened' });
  await act(async () => { root = create(<ExternalLink href="https://www.openstreetmap.org/copyright">credit</ExternalLink>); });
  const event = { preventDefault: jest.fn() };
  await act(async () => mockLink.onPress(event));
  expect(event.preventDefault).toHaveBeenCalled();
  expect(openBrowserAsync).toHaveBeenCalledWith('https://www.openstreetmap.org/copyright', { presentationStyle: 'automatic' });
});

// A second tap while the first page is opening (iOS shows one browser at a time) rejects: that was an
// unhandled rejection, a red error bar in Expo Go.
test('a browser that will not open (already open, or none) is no error for the diver', async () => {
  openBrowserAsync.mockRejectedValueOnce(new Error('Another web browser is already open'));
  await act(async () => { root = create(<ExternalLink href="https://www.openstreetmap.org/copyright">credit</ExternalLink>); });
  await expect(mockLink.onPress({ preventDefault: jest.fn() })).resolves.toBeUndefined();
});
