import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';

import { OceanButton } from '@/components/ocean-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ensureProfile, sendLoginCode, verifyLoginCode } from '@/lib/auth';
import { useAppStore } from '@/lib/store';
import { getSupabase } from '@/lib/supabase';

type Step = 'email' | 'code';

export default function AuthScreen() {
  const theme = useTheme();
  const user = useAppStore((s) => s.user);
  const onSignedIn = useAppStore((s) => s.onSignedIn);
  const signOutUser = useAppStore((s) => s.signOutUser);
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
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

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    try {
      await sendLoginCode(client, email.trim().toLowerCase());
      setStep('code');
    } catch (e: any) {
      setError(e.message ?? 'Could not send the code');
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      const { id } = await verifyLoginCode(client, email.trim().toLowerCase(), code.trim());
      const username = await ensureProfile(client, id);
      await onSignedIn({ id, username });
      router.back();
    } catch (e: any) {
      setError(e.message ?? 'Wrong code — try again');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="subtitle">
        {step === 'email' ? 'Sign in to sync your log' : `Enter the code sent to ${email}`}
      </ThemedText>
      {step === 'email' ? (
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
      ) : (
        <TextInput
          style={inputStyle}
          placeholder="123456"
          placeholderTextColor={theme.textSecondary}
          keyboardType="number-pad"
          maxLength={6}
          value={code}
          onChangeText={setCode}
        />
      )}
      {error ? (
        <ThemedText type="small" style={{ color: '#c0392b' }}>
          {error}
        </ThemedText>
      ) : null}
      {busy ? (
        <ActivityIndicator />
      ) : step === 'email' ? (
        <OceanButton title="Email me a code" onPress={sendCode} disabled={!email.includes('@')} />
      ) : (
        <View style={{ gap: Spacing.two }}>
          <OceanButton title="Verify" onPress={verify} disabled={code.length !== 6} />
          <OceanButton
            title="Use a different email"
            onPress={() => {
              setStep('email');
              setError(null);
              setCode('');
            }}
          />
        </View>
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
