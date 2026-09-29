import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { checkSupabaseConfig, describeSupabaseConfig } from '@/lib/supabase-env';

/**
 * Nullable Supabase client: null when env is unconfigured, in which case the app
 * runs fully local (the vertical-slice behavior). Session persists via AsyncStorage.
 * A secret or service-role key is refused (see supabase-env.ts): loudly in development,
 * and in a release build the app falls back to local-only rather than use it.
 */
export function createSupabaseForEnv(url?: string, key?: string): SupabaseClient | null {
  const config = checkSupabaseConfig(url, key);
  if (config.status === 'unconfigured') return null;
  if (config.status !== 'ok') {
    const message = describeSupabaseConfig(config);
    if (__DEV__) throw new Error(message);
    console.error(message);
    return null;
  }
  // Static web rendering has no browser storage or session to refresh.
  const persistSession = Platform.OS !== 'web' || typeof window !== 'undefined';
  return createClient(config.url, config.key, {
    auth: {
      storage: persistSession ? AsyncStorage : undefined,
      autoRefreshToken: persistSession,
      persistSession,
      detectSessionInUrl: false,
    },
  });
}

let client: SupabaseClient | null | undefined;

export function getSupabase(): SupabaseClient | null {
  if (client === undefined) {
    client = createSupabaseForEnv(
      process.env.EXPO_PUBLIC_SUPABASE_URL,
      // Supabase's current name for the client key, or the legacy anon key.
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    );
    if (client) {
      // Supabase's recommended Expo pattern: refresh tokens only while foregrounded.
      const c = client;
      AppState.addEventListener('change', (state) => {
        if (state === 'active') c.auth.startAutoRefresh();
        else c.auth.stopAutoRefresh();
      });
    }
  }
  return client;
}
