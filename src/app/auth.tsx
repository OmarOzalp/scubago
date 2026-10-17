import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { FormField } from '@/components/form-field';
import { Icon, type IconName } from '@/components/icon';
import { Paper } from '@/components/journal/paper';
import { Screen, ScreenHeader } from '@/components/journal/screen';
import { Wash } from '@/components/journal/wash';
import { OceanButton } from '@/components/ocean-button';
import { Segmented } from '@/components/segmented';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { announce } from '@/lib/announce';
import {
  MIN_PASSWORD_LENGTH,
  createAccount,
  credentialsProblem,
  emailProblem,
  ensureProfile,
  recoveryFromUrl,
  requestPasswordReset,
  resetPasswordWithCode,
  setNewPassword,
  signIn,
  startRecovery,
} from '@/lib/auth';
import { confirmAction } from '@/lib/confirm';
import { useAppStore, usePendingChanges } from '@/lib/store';
import { getSupabase } from '@/lib/supabase';

/**
 * reset-request → (email) → reset-sent: open the link on this phone → reset-new (the link signed
 * the diver in) → new password. Or, from reset-sent, reset-code for an email that shows a code.
 */
type Mode = 'sign-in' | 'create' | 'reset-request' | 'reset-sent' | 'reset-code' | 'reset-new';

/** Reset links already used in this session (on the web, the address keeps the link's fragment). */
const finishedRecoveryLinks = new Set<string>();

/** The picture beside each step's title. */
const MODE_ICON: Record<Mode, IconName> = {
  'sign-in': 'account',
  create: 'logbook',
  'reset-request': 'key',
  'reset-sent': 'email',
  'reset-code': 'email',
  'reset-new': 'lock',
};

export default function AuthScreen() {
  const user = useAppStore((s) => s.user);
  const client = getSupabase();
  // A reset link signs the diver in (and the app may pick that session up on launch): keep the
  // new-password form up until they've chosen one, instead of jumping to their account.
  const url = Linking.useLinkingURL();
  const recovery = recoveryFromUrl(url);
  const recovering = !!url && !!recovery && !('error' in recovery) && !finishedRecoveryLinks.has(url);

  if (!client) {
    return (
      <Screen>
        <Paper style={styles.centred}>
          <WashIcon icon="sync" width={120} height={84} size={44} />
          <ThemedText style={styles.centreText}>Sync isn&apos;t configured in this build.</ThemedText>
        </Paper>
      </Screen>
    );
  }
  return user && !recovering ? <Account username={user.username} /> : <SignInForm url={url} />;
}

function Account({ username }: { username: string }) {
  const theme = useTheme();
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
    <Screen>
      {/* The account, like the name plate inside a logbook's cover. */}
      <Paper raised style={styles.centred}>
        <WashIcon icon="account" width={120} height={84} size={44} />
        <View style={styles.nameplate}>
          <ThemedText type="label">Signed in as</ThemedText>
          <ThemedText type="display" accessibilityRole="header" style={styles.centreText}>
            @{username}
          </ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centreText}>
          Your sightings back up automatically and follow you to any device.
        </ThemedText>
        {pending.count > 0 ? (
          <View style={styles.pending}>
            <Icon name="sync" size={18} color={theme.textSecondary} />
            <ThemedText type="small" themeColor="textSecondary" style={styles.pendingText}>
              {pending.count} {pending.count === 1 ? 'change is' : 'changes are'} waiting to sync.
            </ThemedText>
          </View>
        ) : null}
      </Paper>
      <OceanButton title="Sign out" variant="secondary" icon="signOut" disabled={busy} onPress={signOut} />
      {error ? <ErrorNote message={error} /> : null}
      {busy ? (
        <View style={styles.spinner}>
          <ActivityIndicator color={theme.tint} accessibilityLabel="Deleting your account" />
        </View>
      ) : (
        <Pressable onPress={removeAccount} accessibilityRole="button" style={({ pressed }) => [styles.textButton, { opacity: pressed ? 0.6 : 1 }]}>
          <Icon name="trash" size={18} color={theme.danger} wash={theme.danger} washOpacity={0.15} />
          <ThemedText type="smallBold" themeColor="danger">
            Delete account
          </ThemedText>
        </Pressable>
      )}
    </Screen>
  );
}

function SignInForm({ url }: { url: string | null }) {
  const theme = useTheme();
  const client = getSupabase()!;
  const onSignedIn = useAppStore((s) => s.onSignedIn);
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveredId, setRecoveredId] = useState<string | null>(null);
  const [linkErrorDismissed, setLinkErrorDismissed] = useState(false);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const codeRef = useRef<TextInput>(null);

  // Back from a reset link: it carries a session that lets the diver choose a new password.
  const linkRecovery = recoveryFromUrl(url);
  const linkError = linkRecovery && 'error' in linkRecovery && !linkErrorDismissed ? linkRecovery.error : null;
  const handledUrl = useRef<string | null>(null);
  useEffect(() => {
    const recovery = recoveryFromUrl(url);
    if (!url || !recovery || 'error' in recovery || handledUrl.current === url) return;
    handledUrl.current = url;
    startRecovery(client, recovery)
      .then(({ id }) => {
        setRecoveredId(id);
        setMode('reset-new');
        setError(null);
        announce('Choose a new password');
      })
      .catch((e: Error) => {
        finishedRecoveryLinks.add(url);
        setMode('reset-request');
        setError(e.message);
        announce(e.message);
      });
  }, [url, client]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setLinkErrorDismissed(true);
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
    // Opened straight from a reset link there's nothing to go back to.
    if (router.canGoBack()) router.back();
    else router.replace('/logbook');
  };

  const address = email.trim().toLowerCase();
  const sendReset = async () => {
    // The link comes back to this screen, in whichever app opened it (Expo Go, a build, the web).
    await requestPasswordReset(client, address, Linking.createURL('/auth'));
    setMode('reset-sent');
    announce(`If there’s an account for ${address}, we’ve emailed it a link to reset your password.`);
  };

  const formMode = mode === 'sign-in' ? 'sign-in' : mode === 'create' ? 'create' : 'reset';
  const problem =
    mode === 'reset-request' || mode === 'reset-sent'
      ? emailProblem(email)
      : credentialsProblem(formMode, { email, password, confirm });

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
    try {
      if (mode === 'sign-in') await finish((await signIn(client, address, password)).id);
      else if (mode === 'create') await finish((await createAccount(client, address, password)).id);
      else if (mode === 'reset-request' || mode === 'reset-sent') await sendReset();
      else if (mode === 'reset-new' && recoveredId) {
        await setNewPassword(client, password);
        announce('Password changed');
        if (url) finishedRecoveryLinks.add(url);
        // On the web the link's tokens are still in the address bar: drop them.
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
        await finish(recoveredId);
      } else if (mode === 'reset-code') {
        await finish((await resetPasswordWithCode(client, address, code, password)).id);
      }
    } catch (e: any) {
      fail(e, 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const resetting = mode !== 'sign-in' && mode !== 'create';
  const choosingPassword = mode === 'create' || mode === 'reset-code' || mode === 'reset-new';
  const title =
    mode === 'create'
      ? 'Create your account'
      : mode === 'reset-sent'
        ? 'Check your email'
        : mode === 'reset-new'
          ? 'Choose a new password'
          : resetting
            ? 'Reset your password'
            : 'Sign in to sync your log';
  const intro = {
    'sign-in': 'Your log backs up to your account and follows you to any device.',
    create: 'Back up your log and see it on any device. Sightings logged on this phone move into your new account.',
    'reset-request': 'We’ll email you a link to choose a new password.',
    'reset-sent': `If there’s an account for ${address}, we’ve emailed it a link. Open the email on this phone and tap the link: ScubaGo opens so you can choose a new password.`,
    'reset-code': 'Enter the code from the email and choose a new password.',
    'reset-new': 'You’re signed in from the link. Choose a new password to finish.',
  }[mode];
  const action =
    mode === 'create'
      ? 'Create account'
      : mode === 'reset-request'
        ? 'Email me a reset link'
        : mode === 'reset-sent'
          ? 'Send the link again'
          : mode === 'reset-code' || mode === 'reset-new'
            ? 'Set new password'
            : 'Sign in';

  return (
    <Screen>
      <ScreenHeader title={title} accessory={<WashIcon icon={MODE_ICON[mode]} />} />
      <ThemedText themeColor="textSecondary" style={styles.intro}>
        {intro}
      </ThemedText>

      <Paper raised style={styles.form}>
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
        {linkError && mode === 'sign-in' ? <ErrorNote message={linkError} /> : null}

        {mode !== 'reset-new' && mode !== 'reset-sent' ? (
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
            onSubmitEditing={() => (mode === 'reset-request' ? submit() : (mode === 'reset-code' ? codeRef : passwordRef).current?.focus())}
          />
        ) : null}
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
        {mode !== 'reset-request' && mode !== 'reset-sent' ? (
          <FormField
            ref={passwordRef}
            label={mode === 'reset-code' || mode === 'reset-new' ? 'New password' : 'Password'}
            hint={mode === 'sign-in' ? undefined : `At least ${MIN_PASSWORD_LENGTH} characters`}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
            textContentType={mode === 'sign-in' ? 'password' : 'newPassword'}
            returnKeyType={mode === 'sign-in' ? 'go' : 'next'}
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={() => (mode === 'sign-in' ? submit() : confirmRef.current?.focus())}
          />
        ) : null}
        {choosingPassword ? (
          <FormField
            ref={confirmRef}
            label="Type the password again"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="go"
            value={confirm}
            onChangeText={setConfirm}
            onSubmitEditing={submit}
          />
        ) : null}

        {error ? <ErrorNote message={error} /> : null}
        {/* The spinner takes the button's place at the button's height, so nothing below jumps. */}
        {busy ? (
          <View style={styles.spinner}>
            <ActivityIndicator color={theme.tint} accessibilityLabel="Working" />
          </View>
        ) : (
          <OceanButton title={action} onPress={submit} variant={mode === 'reset-sent' ? 'secondary' : 'primary'} />
        )}

        <View style={styles.links}>
          {mode === 'sign-in' ? <TextButton label="Forgot your password?" onPress={() => switchMode('reset-request')} /> : null}
          {mode === 'reset-sent' ? <TextButton label="The email has a code instead" onPress={() => switchMode('reset-code')} /> : null}
          {mode === 'reset-code' ? <TextButton label="Send a new link or code" onPress={() => switchMode('reset-request')} /> : null}
          {resetting && mode !== 'reset-new' ? <TextButton label="Back to sign in" onPress={() => switchMode('sign-in')} /> : null}
        </View>
      </Paper>

      {/* Profiles hold only a generated username (diver-…); the email stays with the sign-in service. */}
      {!resetting ? (
        <View style={styles.privacy}>
          <Icon name="lock" size={16} color={theme.textSecondary} wash={theme.textSecondary} washOpacity={0.2} style={styles.privacyIcon} />
          <ThemedText type="caption" themeColor="textSecondary" style={styles.privacyText}>
            Other divers see your username, never your email.
          </ThemedText>
        </View>
      ) : null}
    </Screen>
  );
}

/** An icon on a watercolour wash: the picture beside a title. Decorative. */
function WashIcon({ icon, width = 76, height = 60, size = 32 }: { icon: IconName; width?: number; height?: number; size?: number }) {
  const theme = useTheme();
  return (
    <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
      <Wash width={width} height={height} color={theme.wash} seed={23} style={StyleSheet.absoluteFill} />
      <Icon name={icon} size={size} wash={theme.lagoon} washOpacity={0.3} />
    </View>
  );
}

/** A problem to fix, read out as it appears. */
function ErrorNote({ message }: { message: string }) {
  const theme = useTheme();
  return (
    <View style={styles.error}>
      <Icon name="warning" size={18} color={theme.danger} wash={theme.danger} washOpacity={0.15} style={styles.errorIcon} />
      <ThemedText type="small" themeColor="danger" accessibilityLiveRegion="polite" style={styles.errorText}>
        {message}
      </ThemedText>
    </View>
  );
}

function TextButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.textButton, { opacity: pressed ? 0.6 : 1 }]}>
      <ThemedText type="smallBold" themeColor="tint">
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  intro: {
    marginTop: -8,
  },
  form: {
    gap: Spacing.three,
  },
  spinner: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  links: {
    alignItems: 'center',
    marginTop: -Spacing.two,
  },
  textButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: Spacing.two,
  },
  error: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  errorIcon: {
    marginTop: 1,
  },
  errorText: {
    flex: 1,
  },
  privacy: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: Spacing.two,
  },
  privacyIcon: {
    marginTop: 1,
  },
  privacyText: {
    flexShrink: 1,
    textAlign: 'center',
  },
  centred: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: Spacing.four,
  },
  centreText: {
    textAlign: 'center',
  },
  nameplate: {
    alignItems: 'center',
    gap: 2,
  },
  pending: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  pendingText: {
    flexShrink: 1,
    textAlign: 'center',
  },
});
