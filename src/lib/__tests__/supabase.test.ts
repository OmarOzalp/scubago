import { describe, expect, it } from '@jest/globals';
import { createSupabaseForEnv } from '@/lib/supabase';

describe('createSupabaseForEnv', () => {
  it('returns null when env is missing', () => {
    expect(createSupabaseForEnv(undefined, undefined)).toBeNull();
    expect(createSupabaseForEnv('https://x.supabase.co', undefined)).toBeNull();
    expect(createSupabaseForEnv(undefined, 'key')).toBeNull();
  });

  it('returns a client when both env vars are set', () => {
    const client = createSupabaseForEnv('https://x.supabase.co', 'anon-key');
    expect(client).not.toBeNull();
    expect(client!.auth).toBeDefined();
  });
});
