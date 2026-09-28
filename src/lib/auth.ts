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

/**
 * Email + password sign-in that transparently creates the account on first use.
 * The project has email auto-confirm enabled, so signUp returns a live session
 * immediately — no email round-trip (a project that requires confirmation gets a clear
 * error instead of a half-signed-in user). Supabase deliberately returns the same
 * "Invalid login credentials" for wrong-password and unknown-email, so we try
 * signUp on that error: a new user signs up cleanly; an existing user's signUp
 * fails with "already registered", which means the password was wrong.
 */
export async function signInWithPassword(
  client: SupabaseClient,
  email: string,
  password: string,
): Promise<{ id: string }> {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (!error) {
    if (!data.user) throw new Error('No user returned from sign-in');
    return { id: data.user.id };
  }
  if (!/invalid login credentials/i.test(error.message)) throw toError(error);

  const { data: signUpData, error: signUpError } = await client.auth.signUp({ email, password });
  if (signUpError) {
    if (/already registered/i.test(signUpError.message)) {
      throw new Error('Wrong password for this email');
    }
    throw toError(signUpError);
  }
  if (!signUpData.user) throw new Error('No user returned from sign-up');
  // No session means the project asks new accounts to confirm their email (Authentication →
  // Providers → Email → "Confirm email"; ScubaGo expects it off, see README). Carrying on would
  // leave a "signed-in" user whose every upload is refused.
  if (!signUpData.session) {
    throw new Error('Check your email to confirm your account, then sign in. (If you already have an account, check your password.)');
  }
  return { id: signUpData.user.id };
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
