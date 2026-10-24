import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { create } from 'react-test-renderer';

import { SyncLine, useSyncLineShown } from '@/components/sync-line';
import { screenTexts } from '@/test-support/screen-words';

jest.mock('@/global.css', () => ({}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
let mockState = {};
jest.mock('@/lib/store', () => ({
  useAppStore: (select) => select({ syncing: false, requestSync: jest.fn(), ...mockState }),
}));

let root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });

const render = async (element) => { await act(async () => { root = create(element); }); };
function Shown() {
  return <>{String(useSyncLineShown())}</>;
}

describe('the sync line', () => {
  test('signed out, in a build with a server, says nothing: the Logbook banner is the one place that says the log is only on this phone', async () => {
    mockState = { user: null, backendEnabled: true };
    await render(<SyncLine item={{ synced: false }} />);
    expect(root.toJSON()).toBeNull();
  });

  test('says whether it has anything to say, so a page can leave out the room for it', async () => {
    mockState = { user: null, backendEnabled: true };
    await render(<Shown />);
    expect(root.toJSON()).toBe('false');
    await act(async () => root.unmount());

    mockState = { user: { id: 'u1' }, backendEnabled: true };
    await render(<Shown />);
    expect(root.toJSON()).toBe('true');
    await act(async () => root.unmount());

    // No server at all: the line says "Saved on this device." and that is true.
    mockState = { user: null, backendEnabled: false };
    await render(<Shown />);
    expect(root.toJSON()).toBe('true');
  });

  test('signed in, says where the change stands', async () => {
    mockState = { user: { id: 'u1' }, backendEnabled: true };
    await render(<SyncLine item={{ synced: true }} />);
    expect(screenTexts(root.toJSON())).toEqual(['Backed up to your account']);
    await act(async () => root.unmount());

    await render(<SyncLine item={{ synced: false }} />);
    expect(screenTexts(root.toJSON())).toEqual(['Saved on this device, waiting to sync.']);
    await act(async () => root.unmount());

    await render(<SyncLine item={{ synced: false, syncError: 'Network request failed' }} />);
    expect(screenTexts(root.toJSON()).join(' ')).toContain('Waiting for a connection.');
  });
});
