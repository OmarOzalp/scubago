import { describe, expect, it } from '@jest/globals';
import { signInWithPassword, usernameForUser } from '@/lib/auth';

describe('usernameForUser', () => {
  it('derives a stable, valid username from the auth uid', () => {
    expect(usernameForUser('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe('diver-a1b2c3d4');
  });
  it('always fits the 3..24 char DB constraint', () => {
    const name = usernameForUser('xy');
    expect(name.length).toBeGreaterThanOrEqual(3);
    expect(name.length).toBeLessThanOrEqual(24);
  });
});

type FakeAuthResult = { data: { user: { id: string } | null }; error: { message: string } | null };

function fakeClient(opts: {
  signIn: FakeAuthResult;
  signUp?: FakeAuthResult;
}) {
  const calls: string[] = [];
  return {
    calls,
    client: {
      auth: {
        signInWithPassword: async () => {
          calls.push('signIn');
          return opts.signIn;
        },
        signUp: async () => {
          calls.push('signUp');
          return opts.signUp ?? { data: { user: null }, error: { message: 'unexpected' } };
        },
      },
    } as any,
  };
}

describe('signInWithPassword', () => {
  it('returns the user id on a successful sign-in without calling signUp', async () => {
    const { client, calls } = fakeClient({
      signIn: { data: { user: { id: 'uid-1' } }, error: null },
    });
    await expect(signInWithPassword(client, 'a@b.co', 'pw123456')).resolves.toEqual({ id: 'uid-1' });
    expect(calls).toEqual(['signIn']);
  });

  it('falls back to signUp for a brand-new user and returns the new id', async () => {
    const { client, calls } = fakeClient({
      signIn: { data: { user: null }, error: { message: 'Invalid login credentials' } },
      signUp: { data: { user: { id: 'uid-new' } }, error: null },
    });
    await expect(signInWithPassword(client, 'new@b.co', 'pw123456')).resolves.toEqual({ id: 'uid-new' });
    expect(calls).toEqual(['signIn', 'signUp']);
  });

  it('reports a wrong password when the account already exists', async () => {
    const { client } = fakeClient({
      signIn: { data: { user: null }, error: { message: 'Invalid login credentials' } },
      signUp: { data: { user: null }, error: { message: 'User already registered' } },
    });
    await expect(signInWithPassword(client, 'a@b.co', 'wrong')).rejects.toThrow(
      'Wrong password for this email',
    );
  });

  it('propagates non-credential sign-in errors without attempting signUp', async () => {
    const { client, calls } = fakeClient({
      signIn: { data: { user: null }, error: { message: 'Email rate limit exceeded' } },
    });
    await expect(signInWithPassword(client, 'a@b.co', 'pw123456')).rejects.toThrow(
      'Email rate limit exceeded',
    );
    expect(calls).toEqual(['signIn']);
  });
});
