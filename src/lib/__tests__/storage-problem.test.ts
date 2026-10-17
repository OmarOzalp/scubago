/**
 * When the log can't be opened (on the web: ScubaGo open in another tab), the app says so and can
 * try again, rather than crashing or showing an empty log.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories and fresh module copies need require() */
import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { hasNodeSqlite } from '@/test-support/node-sqlite';

jest.mock('expo-sqlite', () => require('@/test-support/node-sqlite').expoSqliteMock());
jest.mock('@/lib/supabase', () => ({ getSupabase: () => null }));

const claim = { granted: false };
jest.mock('@/lib/db-lock', () => ({ claimDatabase: async () => claim.granted }));

type Store = typeof import('@/lib/store');

function freshStore(): Store {
  let store!: Store;
  jest.isolateModules(() => {
    store = require('@/lib/store');
  });
  return store;
}

const describeSqlite = hasNodeSqlite ? describe : describe.skip;

describeSqlite('a log that is open elsewhere', () => {
  afterEach(() => {
    claim.granted = false;
  });

  it('is reported as busy, not as an empty log, and opens on "try again" once free', async () => {
    const { useAppStore } = freshStore();
    await expect(useAppStore.getState().init()).resolves.toBeUndefined();
    expect(useAppStore.getState().storageProblem).toBe('busy');
    expect(useAppStore.getState().ready).toBe(false);

    claim.granted = true;
    await useAppStore.getState().init();
    expect(useAppStore.getState().storageProblem).toBeNull();
    expect(useAppStore.getState().ready).toBe(true);
  });

  it('reports a browser that refuses the file itself as busy too', async () => {
    claim.granted = true;
    let store!: Store;
    jest.isolateModules(() => {
      jest.doMock('expo-sqlite', () => ({
        openDatabaseAsync: async () => {
          const e = new Error("Failed to execute 'createSyncAccessHandle' on 'FileSystemFileHandle'");
          e.name = 'NoModificationAllowedError';
          throw e;
        },
      }));
      store = require('@/lib/store');
    });
    await store.useAppStore.getState().init();
    expect(store.useAppStore.getState().storageProblem).toBe('busy');
  });
});

describe('the browser tab lock', () => {
  type Locks = { request: (name: string, options: { ifAvailable: boolean }, cb: (lock: object | null) => unknown) => Promise<unknown> };
  const withLocks = (locks: Locks | undefined, run: (claimDatabase: () => Promise<boolean>) => Promise<void>) => async () => {
    const nav = globalThis.navigator as unknown as { locks?: Locks };
    const before = nav.locks;
    Object.defineProperty(nav, 'locks', { value: locks, configurable: true });
    delete (globalThis as { __scubagoDatabaseClaim?: unknown }).__scubagoDatabaseClaim;
    try {
      let claimDatabase!: () => Promise<boolean>;
      jest.isolateModules(() => {
        claimDatabase = jest.requireActual<typeof import('@/lib/db-lock.web')>('@/lib/db-lock.web').claimDatabase;
      });
      await run(claimDatabase);
    } finally {
      Object.defineProperty(nav, 'locks', { value: before, configurable: true });
      delete (globalThis as { __scubagoDatabaseClaim?: unknown }).__scubagoDatabaseClaim;
    }
  };

  it(
    'lets the first tab in and keeps the lock',
    withLocks({ request: async (_n, _o, cb) => cb({}) }, async (claimDatabase) => {
      expect(await claimDatabase()).toBe(true);
      expect(await claimDatabase()).toBe(true);
    }),
  );

  it(
    'turns a second tab away, then lets it in once the first has gone',
    withLocks(
      (() => {
        let held = true;
        setTimeout(() => (held = false), 0);
        return { request: async (_n: string, _o: { ifAvailable: boolean }, cb: (lock: object | null) => unknown) => cb(held ? null : {}) };
      })(),
      async (claimDatabase) => {
        expect(await claimDatabase()).toBe(false);
        await new Promise((r) => setTimeout(r, 5));
        expect(await claimDatabase()).toBe(true);
      },
    ),
  );

  it(
    'opens as before in a browser without Web Locks',
    withLocks(undefined, async (claimDatabase) => {
      expect(await claimDatabase()).toBe(true);
    }),
  );
});
