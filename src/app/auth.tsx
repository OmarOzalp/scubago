import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput } from 'react-native';

import { OceanButton } from '@/components/ocean-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ensureProfile, signInWithPassword } from '@/lib/auth';
import { useAppStore } from '@/lib/store';
import { getSupabase } from '@/lib/supabase';

export default function AuthScreen() {
  const theme = useTheme();
  const user = useAppStore((s) => s.user);
  const onSignedIn = useAppStore((s) => s.onSignedIn);
  const signOutUser = useAppStore((s) => s.signOutUser);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const client = getSupabase();
  const inputStyle = [styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }];

  if (!client) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Sync isn't configured in this build.</ThemedText>
      </ThemedView>
    );
  }

  if (user) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText type="subtitle">@{user.username}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Your sightings back up automatically and follow you to any device.
        </ThemedText>
        <OceanButton
          title="Sign out"
          onPress={async () => {
            await signOutUser();
            router.back();
          }}
        />
      </ThemedView>
    );
  }

  const submit = async () => {
    if (!client) return;
    setBusy(true);
    setError(null);
    try {
      const { id } = await signInWithPassword(client, email.trim().toLowerCase(), password);
      const username = await ensureProfile(client, id);
      await onSignedIn({ id, username });
      router.back();
    } catch (e: any) {
      setError(e.message ?? 'Could not sign in');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="subtitle">Sign in to sync your log</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        New here? The same form creates your account.
      </ThemedText>
      <TextInput
        style={inputStyle}
        placeholder="you@example.com"
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={inputStyle}
        placeholder="password (6+ characters)"
        placeholderTextColor={theme.textSecondary}
        secureTextEntry
        autoComplete="password"
        value={password}
        onChangeText={setPassword}
      />
      {error ? (
        <ThemedText type="small" style={{ color: '#c0392b' }}>
          {error}
        </ThemedText>
      ) : null}
      {busy ? (
        <ActivityIndicator />
      ) : (
        <OceanButton
          title="Sign in"
          onPress={submit}
          disabled={!email.includes('@') || password.length < 6}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Spacing.four, gap: Spacing.three },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#8886',
    borderRadius: 10,
    padding: Spacing.two,
    fontSize: 16,
  },
});
