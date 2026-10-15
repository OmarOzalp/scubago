import type { SupabaseClient } from '@supabase/supabase-js';

/** Default username derived from the auth uid; user-editable someday. */
export function usernameForUser(userId: string): string {
  return `diver-${userId.replace(/-/g, '').slice(0, 8)}`;
}

/** Rethrow as a real `Error` (Supabase's `AuthError` already is one; this only matters for tests/mocks). */
function toError(e: unknown): Error {
  if (e instanceof Error) return e;
  const message = typeof e === 'object' && e !== null && 'message' in e ? String((e as { message: unknown }).message) : String(e);
  return new Error(message);
}

/** Shortest password Supabase accepts by default (Authentication → Providers → Email). */
export const MIN_PASSWORD_LENGTH = 6;

export type CredentialsMode = 'sign-in' | 'create' | 'reset';

/** "Enter your email address." until it looks like one, else null. */
export function emailProblem(email: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? null : 'Enter your email address.';
}

/**
 * What's wrong with the form before anything is sent, or null when it can be submitted. Creating
 * an account and choosing a new password both ask for the password twice, so a typo can't lock
 * the diver out of the account they just made.
 */
export function credentialsProblem(
  mode: CredentialsMode,
  { email, password, confirm }: { email: string; password: string; confirm?: string },
): string | null {
  if (mode !== 'reset') {
    const problem = emailProblem(email);
    if (problem) return problem;
  }
  if (password.length < MIN_PASSWORD_LENGTH) return `Passwords are at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (mode !== 'sign-in' && password !== confirm) return 'The two passwords don’t match.';
  return null;
}

/**
 * Sign in to an existing account. A wrong password and an unknown email look the same on purpose
 * (Supabase returns one error for both); the message points to account creation instead of
 * guessing. Never creates an account: a mistyped email must not quietly start a new one.
 */
export async function signIn(client: SupabaseClient, email: string, password: string): Promise<{ id: string }> {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    if (/invalid login credentials/i.test(error.message)) {
      throw new Error('That email and password don’t match an account. Check them, or create an account.');
    }
    throw toError(error);
  }
  if (!data.user) throw new Error('No user returned from sign-in');
  return { id: data.user.id };
}

/**
 * Create an account. The project has email auto-confirm enabled, so signUp returns a live session
 * at once; a project that requires confirmation gets a clear message instead of a half-signed-in
 * user whose every upload is refused (Authentication → Providers → Email → "Confirm email";
 * ScubaGo expects it off, see README).
 */
export async function createAccount(client: SupabaseClient, email: string, password: string): Promise<{ id: string }> {
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) {
    if (/already registered/i.test(error.message)) {
      throw new Error('There’s already an account with this email. Sign in instead.');
    }
    throw toError(error);
  }
  if (!data.user) throw new Error('No user returned from sign-up');
  if (!data.session) {
    throw new Error('Check your email to confirm your account, then sign in.');
  }
  return { id: data.user.id };
}

/**
 * Email a password-reset code. Supabase answers the same whether or not the address has an
 * account, so nobody can use this to find out who uses ScubaGo.
 */
export async function requestPasswordReset(client: SupabaseClient, email: string): Promise<void> {
  const { error } = await client.auth.resetPasswordForEmail(email);
  if (error) throw toError(error);
}

/**
 * Finish a reset with the code from the email, set the new password, and leave the diver signed
 * in. A code instead of a link, because a link would have to open the app (Expo Go has no fixed
 * address for that). Needs `{{ .Token }}` in the "Reset password" email template
 * (docs/ios-distribution.md, section 6).
 */
export async function resetPasswordWithCode(
  client: SupabaseClient,
  email: string,
  code: string,
  newPassword: string,
): Promise<{ id: string }> {
  const { data, error } = await client.auth.verifyOtp({ email, token: code.replace(/\s/g, ''), type: 'recovery' });
  if (error) {
    if (/expired|invalid/i.test(error.message)) throw new Error('That code is wrong or has expired. Ask for a new one.');
    throw toError(error);
  }
  if (!data.user) throw new Error('No user returned for that code');
  const { error: updateError } = await client.auth.updateUser({ password: newPassword });
  if (updateError) throw toError(updateError);
  return { id: data.user.id };
}

/** Create the public profile row on first login; return the username either way. */
export async function ensureProfile(client: SupabaseClient, userId: string): Promise<string> {
  const { data, error: selectError } = await client
    .from('profiles')
    .select('username')
    .eq('user_id', userId)
    .maybeSingle();
  if (selectError) throw selectError;
  if (data?.username) return data.username;

  const username = usernameForUser(userId);
  const { error } = await client.from('profiles').insert({ user_id: userId, username });
  if (error && error.code !== '23505') throw error; // 23505 = raced with ourselves; fine
  return username;
}

export async function getSessionUserId(client: SupabaseClient): Promise<string | null> {
  const { data } = await client.auth.getSession();
  return data.session?.user.id ?? null;
}

export async function signOut(client: SupabaseClient): Promise<void> {
  await client.auth.signOut();
}
