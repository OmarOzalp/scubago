import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { create } from 'react-test-renderer';

import { usePhotoUrl } from '@/hooks/use-photo-url';

let mockCreateSignedUrl;
jest.mock('@/lib/supabase', () => ({ getSupabase: () => ({ storage: { from: () => ({ createSignedUrl: (...args) => mockCreateSignedUrl(...args) }) } }) }));
jest.mock('@/global.css', () => ({}));

let root;
function Probe({ uri }) {
  return React.createElement('probe', { value: usePhotoUrl(uri) });
}
const seen = () => root.root.findByType('probe').props.value;
const unhandled = jest.fn();
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  unhandled.mockClear();
  process.on('unhandledRejection', unhandled);
});
afterEach(async () => {
  process.off('unhandledRejection', unhandled);
  if (root) await act(async () => root.unmount());
  root = null;
});

test('a public photo or a file on the phone is used as it is', async () => {
  mockCreateSignedUrl = jest.fn();
  await act(async () => { root = create(<Probe uri="https://example.com/p.jpg" />); });
  expect(seen()).toBe('https://example.com/p.jpg');
  expect(mockCreateSignedUrl).not.toHaveBeenCalled();
});

test('a private photo gets a short-lived link', async () => {
  mockCreateSignedUrl = jest.fn(async () => ({ data: { signedUrl: 'https://signed/abc' }, error: null }));
  await act(async () => { root = create(<Probe uri="private:user-1/photo.jpg" />); });
  expect(seen()).toBe('https://signed/abc');
});

// Offline, the request for the link can reject: that was an unhandled rejection (a red error bar in Expo Go).
test('a link that cannot be had (offline) leaves the photo without one, and nothing unhandled', async () => {
  mockCreateSignedUrl = jest.fn(async () => { throw new TypeError('Network request failed'); });
  await act(async () => { root = create(<Probe uri="private:user-1/photo.jpg" />); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  expect(seen()).toBeUndefined();
  expect(unhandled).not.toHaveBeenCalled();
});
