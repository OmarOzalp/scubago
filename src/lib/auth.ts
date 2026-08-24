import type { SupabaseClient } from '@supabase/supabase-js';

/** Default username derived from the auth uid; user-editable someday. */
export function usernameForUser(userId: string): string {
  return `diver-${userId.replace(/-/g, '').slice(0, 8)}`;
}

/** Email a 6-digit login code (requires the Magic Link template to include {{ .Token }}). */
export async function sendLoginCode(client: SupabaseClient, email: string): Promise<void> {
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
}

export async function verifyLoginCode(
  client: SupabaseClient,
  email: string,
  code: string,
): Promise<{ id: string }> {
  const { data, error } = await client.auth.verifyOtp({ email, token: code, type: 'email' });
  if (error) throw error;
  if (!data.user) throw new Error('No user returned from verifyOtp');
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
