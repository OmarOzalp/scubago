import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';

import { FormField } from '@/components/form-field';
import { OceanButton } from '@/components/ocean-button';
import { Segmented } from '@/components/segmented';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { announce } from '@/lib/announce';
import {
  MIN_PASSWORD_LENGTH,
  createAccount,
  credentialsProblem,
  emailProblem,
  ensureProfile,
  requestPasswordReset,
  resetPasswordWithCode,
  signIn,
} from '@/lib/auth';
import { confirmAction } from '@/lib/confirm';
import { useAppStore, usePendingChanges } from '@/lib/store';
import { getSupabase } from '@/lib/supabase';

type Mode = 'sign-in' | 'create' | 'reset-request' | 'reset-code';

export default function AuthScreen() {
  const user = useAppStore((s) => s.user);
  const client = getSupabase();

  if (!client) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Sync isn&apos;t configured in this build.</ThemedText>
      </ThemedView>
    );
  }
  return user ? <Account username={user.username} /> : <SignInForm />;
}

function Account({ username }: { username: string }) {
  const signOutUser = useAppStore((s) => s.signOutUser);
  const deleteAccount = useAppStore((s) => s.deleteAccount);
  const pending = usePendingChanges();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signOut = async () => {
    const waiting =
      pending.count > 0
        ? ` ${pending.count} ${pending.count === 1 ? 'change hasn’t' : 'changes haven’t'} synced yet: ${pending.count === 1 ? 'it stays' : 'they stay'} on this device and sync the next time you sign in to this account.`
        : '';
    const ok = await confirmAction({
      title: 'Sign out?',
      message: `Your log is safe in your account. Sign in again to see it on this device.${waiting}`,
      confirmLabel: 'Sign out',
    });
    if (!ok) return;
    await signOutUser();
    router.back();
  };

  const removeAccount = async () => {
    const ok = await confirmAction({
      title: 'Delete your account?',
      message:
        'This permanently deletes your ScubaGo account and your sightings and photos, from our servers and from this device. Dive sites you added stay on the map, without your name. This cannot be undone.',
      confirmLabel: 'Delete account',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAccount();
      router.back();
    } catch (e: any) {
      const message = e.message ?? 'Could not delete your account';
      setError(message);
      announce(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="subtitle" accessibilityRole="header">
        @{username}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Your sightings back up automatically and follow you to any device.
      </ThemedText>
      {pending.count > 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          {pending.count} {pending.count === 1 ? 'change is' : 'changes are'} waiting to sync.
        </ThemedText>
      ) : null}
      <OceanButton title="Sign out" disabled={busy} onPress={signOut} />
      {error ? (
        <ThemedText type="small" themeColor="danger" accessibilityLiveRegion="polite">
          {error}
        </ThemedText>
      ) : null}
      {busy ? (
        <ActivityIndicator accessibilityLabel="Deleting your account" />
      ) : (
        <Pressable onPress={removeAccount} accessibilityRole="button" style={styles.textButton}>
          <ThemedText type="small" themeColor="danger">
            Delete account
          </ThemedText>
        </Pressable>
      )}
    </ThemedView>
  );
}

function SignInForm() {
  const client = getSupabase()!;
  const onSignedIn = useAppStore((s) => s.onSignedIn);
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const codeRef = useRef<TextInput>(null);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
    setPassword('');
    setConfirm('');
    if (next !== 'reset-code') setCode('');
  };

  const fail = (e: any, fallback: string) => {
    const message = e?.message ?? fallback;
    setError(message);
    announce(message);
  };

  const finish = async (id: string) => {
    const username = await ensureProfile(client, id);
    await onSignedIn({ id, username });
    router.back();
  };

  const formMode = mode === 'sign-in' ? 'sign-in' : mode === 'create' ? 'create' : 'reset';
  const problem =
    mode === 'reset-request' ? emailProblem(email) : credentialsProblem(formMode, { email, password, confirm });

  const submit = async () => {
    if (busy) return;
    if (problem) {
      fail({ message: problem }, problem);
      return;
    }
    if (mode === 'reset-code' && code.replace(/\s/g, '').length < 6) {
      fail({ message: 'Enter the code from the email.' }, '');
      return;
    }
    setBusy(true);
    setError(null);
    const address = email.trim().toLowerCase();
    try {
      if (mode === 'sign-in') await finish((await signIn(client, address, password)).id);
      else if (mode === 'create') await finish((await createAccount(client, address, password)).id);
      else if (mode === 'reset-request') {
        await requestPasswordReset(client, address);
        setMode('reset-code');
        const sent = `If there’s an account for ${address}, we’ve emailed it a reset code.`;
        setNotice(sent);
        announce(sent);
        setTimeout(() => codeRef.current?.focus(), 50);
      } else {
        await finish((await resetPasswordWithCode(client, address, code, password)).id);
      }
    } catch (e: any) {
      fail(e, 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const resetting = mode === 'reset-request' || mode === 'reset-code';
  const title = mode === 'create' ? 'Create your account' : resetting ? 'Reset your password' : 'Sign in to sync your log';
  const action =
    mode === 'create' ? 'Create account' : mode === 'reset-request' ? 'Email me a code' : mode === 'reset-code' ? 'Set new password' : 'Sign in';

  return (
    <ThemedView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {!resetting ? (
          <Segmented
            accessibilityLabel="Account"
            options={[
              { value: 'sign-in', label: 'Sign in' },
              { value: 'create', label: 'Create account' },
            ]}
            value={mode as 'sign-in' | 'create'}
            onChange={switchMode}
          />
        ) : null}
        <ThemedText type="subtitle" accessibilityRole="header" style={styles.title}>
          {title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {mode === 'create'
            ? 'Back up your log and see it on any device. Sightings logged on this phone move into your new account.'
            : mode === 'reset-request'
              ? 'We’ll email you a code to choose a new password.'
              : mode === 'reset-code'
                ? 'Enter the code from the email and choose a new password.'
                : 'Your log backs up to your account and follows you to any device.'}
        </ThemedText>

        <FormField
          label="Email"
          placeholder="you@example.com"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          keyboardType="email-address"
          returnKeyType={mode === 'reset-request' ? 'send' : 'next'}
          editable={mode !== 'reset-code'}
          value={email}
          onChangeText={setEmail}
          onSubmitEditing={() => (mode === 'reset-request' ? submit() : passwordRef.current?.focus())}
        />
        {mode === 'reset-code' ? (
          <FormField
            ref={codeRef}
            label="Code from the email"
            placeholder="123456"
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            returnKeyType="next"
            value={code}
            onChangeText={setCode}
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
        ) : null}
        {mode !== 'reset-request' ? (
          <FormField
            ref={passwordRef}
            label={mode === 'reset-code' ? 'New password' : 'Password'}
            hint={mode === 'sign-in' ? undefined : `At least ${MIN_PASSWORD_LENGTH} characters`}
            secureTextEntry
            autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
            textContentType={mode === 'sign-in' ? 'password' : 'newPassword'}
            returnKeyType={mode === 'sign-in' ? 'go' : 'next'}
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={() => (mode === 'sign-in' ? submit() : confirmRef.current?.focus())}
          />
        ) : null}
        {mode === 'create' || mode === 'reset-code' ? (
          <FormField
            ref={confirmRef}
            label="Type the password again"
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="go"
            value={confirm}
            onChangeText={setConfirm}
            onSubmitEditing={submit}
          />
        ) : null}

        {notice ? (
          <ThemedText type="small" themeColor="textSecondary">
            {notice}
          </ThemedText>
        ) : null}
        {error ? (
          <ThemedText type="small" themeColor="danger" accessibilityLiveRegion="polite">
            {error}
          </ThemedText>
        ) : null}
        {busy ? (
          <ActivityIndicator accessibilityLabel="Working" />
        ) : (
          <OceanButton title={action} onPress={submit} />
        )}

        {mode === 'sign-in' ? (
          <Pressable onPress={() => switchMode('reset-request')} accessibilityRole="button" style={styles.textButton}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              Forgot your password?
            </ThemedText>
          </Pressable>
        ) : null}
        {resetting ? (
          <>
            {mode === 'reset-code' ? (
              <Pressable onPress={() => switchMode('reset-request')} accessibilityRole="button" style={styles.textButton}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  Send a new code
                </ThemedText>
              </Pressable>
            ) : null}
            <Pressable onPress={() => switchMode('sign-in')} accessibilityRole="button" style={styles.textButton}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                Back to sign in
              </ThemedText>
            </Pressable>
          </>
        ) : null}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: Spacing.four, gap: Spacing.three },
  title: { fontSize: 26, lineHeight: 32 },
  textButton: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.two },
});
