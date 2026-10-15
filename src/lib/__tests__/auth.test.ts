import { describe, expect, it } from '@jest/globals';
import {
  createAccount,
  credentialsProblem,
  emailProblem,
  requestPasswordReset,
  resetPasswordWithCode,
  signIn,
  usernameForUser,
} from '@/lib/auth';

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

type Result = { data: Record<string, any>; error: { message: string } | null };

function fakeClient(results: Partial<Record<'signIn' | 'signUp' | 'reset' | 'verify' | 'update', Result>>) {
  const calls: { name: string; args: unknown }[] = [];
  const answer = (name: keyof typeof results) => async (args: unknown) => {
    calls.push({ name, args });
    return results[name] ?? { data: {}, error: { message: `unexpected ${name}` } };
  };
  return {
    calls,
    client: {
      auth: {
        signInWithPassword: answer('signIn'),
        signUp: answer('signUp'),
        resetPasswordForEmail: answer('reset'),
        verifyOtp: answer('verify'),
        updateUser: answer('update'),
      },
    } as any,
  };
}

describe('credentialsProblem', () => {
  it('asks for an email address that looks like one', () => {
    expect(emailProblem('diver@reef')).toBe('Enter your email address.');
    expect(emailProblem(' diver@reef.org ')).toBeNull();
    expect(credentialsProblem('sign-in', { email: 'nope', password: 'secret1' })).toBe('Enter your email address.');
  });
  it('enforces the minimum password length', () => {
    expect(credentialsProblem('sign-in', { email: 'a@b.co', password: '12345' })).toMatch(/at least 6/);
    expect(credentialsProblem('sign-in', { email: 'a@b.co', password: '123456' })).toBeNull();
  });
  it('asks for the password twice when creating an account or choosing a new one', () => {
    expect(credentialsProblem('create', { email: 'a@b.co', password: 'secret1', confirm: 'secret2' })).toMatch(/don’t match/);
    expect(credentialsProblem('create', { email: 'a@b.co', password: 'secret1', confirm: 'secret1' })).toBeNull();
    expect(credentialsProblem('reset', { email: '', password: 'secret1', confirm: 'secret' })).toMatch(/don’t match/);
  });
});

describe('signIn', () => {
  it('returns the user id', async () => {
    const { client } = fakeClient({ signIn: { data: { user: { id: 'uid-1' } }, error: null } });
    await expect(signIn(client, 'a@b.co', 'pw123456')).resolves.toEqual({ id: 'uid-1' });
  });

  it('never creates an account for an unknown email or a wrong password', async () => {
    const { client, calls } = fakeClient({
      signIn: { data: { user: null }, error: { message: 'Invalid login credentials' } },
    });
    await expect(signIn(client, 'typo@b.co', 'pw123456')).rejects.toThrow(/don’t match an account/);
    expect(calls.map((c) => c.name)).toEqual(['signIn']);
  });

  it('passes other errors through', async () => {
    const { client } = fakeClient({ signIn: { data: { user: null }, error: { message: 'Email rate limit exceeded' } } });
    await expect(signIn(client, 'a@b.co', 'pw123456')).rejects.toThrow('Email rate limit exceeded');
  });
});

describe('createAccount', () => {
  it('returns the new id when the project signs new accounts straight in', async () => {
    const { client } = fakeClient({
      signUp: { data: { user: { id: 'uid-new' }, session: { access_token: 't' } }, error: null },
    });
    await expect(createAccount(client, 'new@b.co', 'pw123456')).resolves.toEqual({ id: 'uid-new' });
  });

  it('points an existing email to sign-in', async () => {
    const { client } = fakeClient({ signUp: { data: { user: null }, error: { message: 'User already registered' } } });
    await expect(createAccount(client, 'a@b.co', 'pw123456')).rejects.toThrow(/Sign in instead/);
  });

  it('refuses to sign in half-way when the project requires email confirmation', async () => {
    const { client } = fakeClient({ signUp: { data: { user: { id: 'uid-pending' }, session: null }, error: null } });
    await expect(createAccount(client, 'new@b.co', 'pw123456')).rejects.toThrow(/confirm your account/);
  });
});

describe('password reset', () => {
  it('asks Supabase to email a reset code', async () => {
    const { client, calls } = fakeClient({ reset: { data: {}, error: null } });
    await requestPasswordReset(client, 'a@b.co');
    expect(calls).toEqual([{ name: 'reset', args: 'a@b.co' }]);
  });

  it('checks the code, sets the new password and signs the diver in', async () => {
    const { client, calls } = fakeClient({
      verify: { data: { user: { id: 'uid-1' }, session: {} }, error: null },
      update: { data: { user: { id: 'uid-1' } }, error: null },
    });
    await expect(resetPasswordWithCode(client, 'a@b.co', '123 456', 'newpass1')).resolves.toEqual({ id: 'uid-1' });
    expect(calls).toEqual([
      { name: 'verify', args: { email: 'a@b.co', token: '123456', type: 'recovery' } },
      { name: 'update', args: { password: 'newpass1' } },
    ]);
  });

  it('explains a wrong or expired code and leaves the password alone', async () => {
    const { client, calls } = fakeClient({
      verify: { data: { user: null }, error: { message: 'Token has expired or is invalid' } },
    });
    await expect(resetPasswordWithCode(client, 'a@b.co', '000000', 'newpass1')).rejects.toThrow(/wrong or has expired/);
    expect(calls.map((c) => c.name)).toEqual(['verify']);
  });
});
