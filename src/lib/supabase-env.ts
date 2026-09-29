/**
 * Which Supabase settings a build may carry. Everything named EXPO_PUBLIC_* is compiled into the
 * app, where anyone can read it, so only the project URL and a client key belong there: the
 * publishable key (sb_publishable_…) or, on older projects, the anon key (a JWT with role "anon").
 * Secret keys (sb_secret_…) and the service-role key bypass row-level security and must never
 * ship. Pure (no React Native imports): scripts/check-public-env.ts uses it too.
 */
export type SupabaseKeyKind = 'publishable' | 'anon' | 'secret' | 'service_role' | 'unknown';

/** The role claim of a JWT-shaped key, or null if the value isn't a readable JWT. */
function jwtRole(key: string): string | null {
  const parts = key.split('.');
  if (parts.length !== 3 || typeof globalThis.atob !== 'function') return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(globalThis.atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')));
    return typeof payload?.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

export function classifySupabaseKey(key: string): SupabaseKeyKind {
  const value = key.trim();
  if (value.startsWith('sb_publishable_')) return 'publishable';
  if (value.startsWith('sb_secret_')) return 'secret';
  const role = jwtRole(value);
  if (role === 'anon') return 'anon';
  if (role === 'service_role') return 'service_role';
  return 'unknown';
}

/** Keys that bypass row-level security: never allowed in the app. */
export const isPrivilegedKey = (kind: SupabaseKeyKind) => kind === 'secret' || kind === 'service_role';

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/;

export type SupabaseConfig =
  | { status: 'ok'; url: string; key: string; kind: SupabaseKeyKind }
  | { status: 'unconfigured' }
  | { status: 'privileged-key'; kind: SupabaseKeyKind }
  | { status: 'invalid-url'; url: string };

/**
 * Validate the URL and client key a build was given. Missing settings mean the app runs fully
 * local (no sign-in, no sync), as before; a privileged key or a malformed URL is refused.
 */
export function checkSupabaseConfig(url?: string, key?: string): SupabaseConfig {
  const trimmedUrl = url?.trim(), trimmedKey = key?.trim();
  if (!trimmedUrl || !trimmedKey) return { status: 'unconfigured' };
  const kind = classifySupabaseKey(trimmedKey);
  if (isPrivilegedKey(kind)) return { status: 'privileged-key', kind };
  let parsed: URL;
  try {
    parsed = new URL(trimmedUrl);
  } catch {
    return { status: 'invalid-url', url: trimmedUrl };
  }
  // Plain http only for a local Supabase during development.
  const secure = parsed.protocol === 'https:' || (parsed.protocol === 'http:' && LOCAL_HOST.test(parsed.hostname));
  if (!secure) return { status: 'invalid-url', url: trimmedUrl };
  return { status: 'ok', url: trimmedUrl.replace(/\/+$/, ''), key: trimmedKey, kind };
}

/** A sentence explaining a refused configuration (never includes the key itself). */
export function describeSupabaseConfig(config: SupabaseConfig): string {
  switch (config.status) {
    case 'privileged-key':
      return `Refusing to use a Supabase ${config.kind === 'secret' ? 'secret' : 'service-role'} key in the app: it bypasses row-level security and anyone could read it from the app. Use the project's publishable (or anon) key in EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.`;
    case 'invalid-url':
      return `EXPO_PUBLIC_SUPABASE_URL must be an https URL like https://<project-ref>.supabase.co (got "${config.url}").`;
    case 'unconfigured':
      return 'Supabase is not configured: the app runs fully local (no sign-in, no sync).';
    default:
      return 'Supabase is configured.';
  }
}
