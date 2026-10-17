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
 * Email a password reset. Supabase's standard email holds a link: `redirectTo` (the app's own
 * address, Linking.createURL) brings the diver back into ScubaGo to choose a new password (see
 * recoveryFromUrl). A project whose "Reset password" template also prints `{{ .Token }}` sends a
 * code that works too (resetPasswordWithCode). Supabase answers the same whether or not the
 * address has an account, so nobody can use this to find out who uses ScubaGo.
 */
export async function requestPasswordReset(client: SupabaseClient, email: string, redirectTo?: string): Promise<void> {
  const { error } = await client.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined);
  if (error) throw toError(error);
}

export type Recovery = { accessToken: string; refreshToken: string } | { error: string };

/**
 * What a password-reset link brought back to the app: the recovery session in the URL fragment
 * (`#access_token=…&refresh_token=…&type=recovery`), Supabase's error for a dead link, or null for
 * any other URL. Parsed by hand: React Native's URLSearchParams can't read values.
 */
export function recoveryFromUrl(url: string | null | undefined): Recovery | null {
  const fragment = url?.split('#')[1];
  if (!fragment) return null;
  const params: Record<string, string> = {};
  for (const pair of fragment.split('&')) {
    const [key, value = ''] = pair.split('=');
    if (!key) continue;
    try {
      params[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' '));
    } catch {
      // A malformed part: skip it.
    }
  }
  if (params.error || params.error_code) {
    return { error: 'That reset link has expired or was already used. Ask for a new one.' };
  }
  if (params.type !== 'recovery' || !params.access_token || !params.refresh_token) return null;
  return { accessToken: params.access_token, refreshToken: params.refresh_token };
}

/** Sign in with the session a reset link carried, so the diver can choose a new password. */
export async function startRecovery(
  client: SupabaseClient,
  tokens: { accessToken: string; refreshToken: string },
): Promise<{ id: string }> {
  const { data, error } = await client.auth.setSession({ access_token: tokens.accessToken, refresh_token: tokens.refreshToken });
  if (error) throw new Error('That reset link has expired or was already used. Ask for a new one.');
  if (!data.user) throw new Error('No user returned for that link');
  return { id: data.user.id };
}

/** Set the signed-in diver's new password (after startRecovery). */
export async function setNewPassword(client: SupabaseClient, password: string): Promise<void> {
  const { error } = await client.auth.updateUser({ password });
  if (error) throw toError(error);
}

/**
 * Finish a reset with a code from the email instead of the link: check it, set the new password,
 * and leave the diver signed in. Only for projects whose "Reset password" template includes
 * `{{ .Token }}` (Supabase allows editing templates once a custom email provider is set up).
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
  await setNewPassword(client, newPassword);
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
