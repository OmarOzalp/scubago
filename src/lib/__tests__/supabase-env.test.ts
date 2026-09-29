import { describe, expect, it } from '@jest/globals';
import { checkSupabaseConfig, classifySupabaseKey, describeSupabaseConfig, isPrivilegedKey } from '@/lib/supabase-env';
import { createSupabaseForEnv } from '@/lib/supabase';

/** A JWT-shaped key with the given role claim (signature irrelevant: only the claim is read). */
const jwt = (payload: object) => ['{"alg":"HS256","typ":"JWT"}', JSON.stringify(payload)]
  .map((part) => Buffer.from(part).toString('base64url')).join('.') + '.signature';
const URL_OK = 'https://abcdefghijklmnop.supabase.co';

describe('classifySupabaseKey', () => {
  it('tells client keys from privileged ones, whatever their format', () => {
    expect(classifySupabaseKey('sb_publishable_abc123')).toBe('publishable');
    expect(classifySupabaseKey('sb_secret_abc123')).toBe('secret');
    expect(classifySupabaseKey(jwt({ iss: 'supabase', role: 'anon' }))).toBe('anon');
    expect(classifySupabaseKey(jwt({ iss: 'supabase', role: 'service_role' }))).toBe('service_role');
    expect(classifySupabaseKey(`  ${jwt({ role: 'service_role' })}\n`)).toBe('service_role');
    expect(classifySupabaseKey('not-a-key')).toBe('unknown');
    expect(classifySupabaseKey('a.b.c')).toBe('unknown');
    expect(isPrivilegedKey('secret') && isPrivilegedKey('service_role')).toBe(true);
    expect(isPrivilegedKey('publishable') || isPrivilegedKey('anon') || isPrivilegedKey('unknown')).toBe(false);
  });
});

describe('checkSupabaseConfig', () => {
  it('runs local-only without a URL or key', () => {
    expect(checkSupabaseConfig(undefined, 'sb_publishable_x').status).toBe('unconfigured');
    expect(checkSupabaseConfig(URL_OK, '  ').status).toBe('unconfigured');
  });

  it('accepts a publishable or anon key with an https project URL', () => {
    expect(checkSupabaseConfig(`${URL_OK}/`, 'sb_publishable_x')).toEqual({ status: 'ok', url: URL_OK, key: 'sb_publishable_x', kind: 'publishable' });
    expect(checkSupabaseConfig(URL_OK, jwt({ role: 'anon' })).status).toBe('ok');
    // A local Supabase during development.
    expect(checkSupabaseConfig('http://127.0.0.1:54321', 'sb_publishable_x').status).toBe('ok');
  });

  it('refuses privileged keys and insecure or malformed URLs, without repeating the key', () => {
    const secret = checkSupabaseConfig(URL_OK, 'sb_secret_topsecret');
    expect(secret.status).toBe('privileged-key');
    expect(describeSupabaseConfig(secret)).not.toContain('topsecret');
    expect(checkSupabaseConfig(URL_OK, jwt({ role: 'service_role' })).status).toBe('privileged-key');
    expect(checkSupabaseConfig('http://abcdefghijklmnop.supabase.co', 'sb_publishable_x').status).toBe('invalid-url');
    expect(checkSupabaseConfig('abcdefghijklmnop.supabase.co', 'sb_publishable_x').status).toBe('invalid-url');
  });

  it('never builds a client from a privileged key', () => {
    expect(() => createSupabaseForEnv(URL_OK, 'sb_secret_topsecret')).toThrow(/Refusing to use a Supabase secret key/);
    expect(() => createSupabaseForEnv(URL_OK, jwt({ role: 'service_role' }))).toThrow(/service-role/);
    expect(createSupabaseForEnv(URL_OK, 'sb_publishable_x')).not.toBeNull();
  });
});
