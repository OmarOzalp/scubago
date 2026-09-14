import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

/**
 * Nullable Supabase client: null when env is unconfigured, in which case the app
 * runs fully local (the vertical-slice behavior). Session persists via AsyncStorage.
 */
export function createSupabaseForEnv(url?: string, anonKey?: string): SupabaseClient | null {
  if (!url || !anonKey) return null;
  // Static web rendering has no browser storage or session to refresh.
  const persistSession = Platform.OS !== 'web' || typeof window !== 'undefined';
  return createClient(url, anonKey, {
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
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
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
