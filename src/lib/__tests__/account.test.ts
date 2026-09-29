import { describe, expect, it } from '@jest/globals';
import { deleteAccount } from '@/lib/account';

/** A fake client whose photo folder holds `photos` file names; `fail` makes one step error. */
function fakeClient(opts: { photos: number; fail?: 'list' | 'remove' | 'rpc' | 'missing-rpc' }) {
  let stored = Array.from({ length: opts.photos }, (_, i) => `s-${i}.jpg`);
  const calls: string[] = [];
  const client = {
    storage: {
      from: (bucket: string) => ({
        list: async (folder: string, { limit }: { limit: number }) => {
          calls.push(`list ${bucket}/${folder}`);
          if (opts.fail === 'list') return { data: null, error: { message: 'offline' } };
          return { data: stored.slice(0, limit).map((name) => ({ id: `id-${name}`, name })), error: null };
        },
        remove: async (paths: string[]) => {
          calls.push(`remove ${paths.length}`);
          if (opts.fail === 'remove') return { data: null, error: { message: 'denied' } };
          stored = stored.filter((name) => !paths.includes(`uid-1/${name}`));
          return { data: [], error: null };
        },
      }),
    },
    rpc: async (name: string) => {
      calls.push(`rpc ${name}`);
      if (opts.fail === 'missing-rpc') return { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } };
      if (opts.fail === 'rpc') return { data: null, error: { code: '42501', message: 'Sign in to delete your account' } };
      return { data: null, error: null };
    },
    auth: { signOut: async ({ scope }: { scope: string }) => { calls.push(`signOut ${scope}`); return { error: null }; } },
  };
  return { client: client as any, calls, remaining: () => stored.length };
}

describe('deleteAccount', () => {
  it('removes every photo in the user\'s folder, page by page, then the account, then the local session', async () => {
    const { client, calls, remaining } = fakeClient({ photos: 230 });
    await deleteAccount(client, 'uid-1');
    expect(remaining()).toBe(0);
    expect(calls.filter((c) => c.startsWith('remove'))).toEqual(['remove 100', 'remove 100', 'remove 30']);
    expect(calls.slice(-2)).toEqual(['rpc delete_own_account', 'signOut local']);
    expect(calls[0]).toBe('list sighting-photos/uid-1');
  });

  it('works for an account without photos', async () => {
    const { client, calls } = fakeClient({ photos: 0 });
    await deleteAccount(client, 'uid-1');
    expect(calls).toEqual(['list sighting-photos/uid-1', 'rpc delete_own_account', 'signOut local']);
  });

  it('leaves the account alone if the photos cannot all be removed', async () => {
    for (const fail of ['list', 'remove'] as const) {
      const { client, calls } = fakeClient({ photos: 3, fail });
      await expect(deleteAccount(client, 'uid-1')).rejects.toThrow(/photos/);
      expect(calls.some((c) => c.startsWith('rpc'))).toBe(false);
    }
  });

  it('explains a server without the deletion function, and passes other errors on', async () => {
    await expect(deleteAccount(fakeClient({ photos: 0, fail: 'missing-rpc' }).client, 'uid-1')).rejects.toThrow(/not set up on the server/);
    const { client, calls } = fakeClient({ photos: 0, fail: 'rpc' });
    await expect(deleteAccount(client, 'uid-1')).rejects.toThrow('Sign in to delete your account');
    expect(calls).not.toContain('signOut local');
  });
});
