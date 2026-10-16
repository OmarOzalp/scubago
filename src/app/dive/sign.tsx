import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { ChoiceChips } from '@/components/dive/choice-chips';
import { SignaturePad, SignatureView } from '@/components/dive/signature';
import { FormField } from '@/components/form-field';
import { Icon } from '@/components/icon';
import { Paper } from '@/components/journal/paper';
import { Seal } from '@/components/journal/stamp';
import { OceanButton } from '@/components/ocean-button';
import { Segmented } from '@/components/segmented';
import { formatDate } from '@/components/sighting-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WhenReady } from '@/components/when-ready';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { announce } from '@/lib/announce';
import { confirmAction } from '@/lib/confirm';
import { askBuddyToSign, signShareMessage, SIGNER_ROLE_LABEL, SIGNER_ROLES, withdrawSignCode, type SignerRole } from '@/lib/dive-signature-api';
import { formatDepth, formatDiveNumber, formatMinutes } from '@/lib/dives';
import { useAllSites, useAppStore, useMyDives } from '@/lib/store';
import { getSupabase } from '@/lib/supabase';
import { isConnectionProblem } from '@/lib/verification';
import { verificationError, type CreatedCode, type VerificationError } from '@/lib/verification-api';

type Way = 'here' | 'code';

const ROLE_OPTIONS = SIGNER_ROLES.map((id) => ({ id, label: SIGNER_ROLE_LABEL[id] }));

/**
 * A buddy signs a page (`?id=`). On the diver's phone: they write their name, say what they were on
 * the dive, and sign with a finger. From their own phone: the diver makes a code and sends it; the
 * buddy enters it under Logbook → Buddy code and signs there (it needs accounts and a synced page).
 */
export default function SignDiveScreenRoute() {
  return (
    <WhenReady>
      <SignDiveScreen />
    </WhenReady>
  );
}

function SignDiveScreen() {
  // `then=page`: opened from the saved screen, so finishing opens the page instead of going back.
  const { id, then } = useLocalSearchParams<{ id: string; then?: string }>();
  const theme = useTheme();
  const sites = useAllSites();
  const dive = useMyDives().find((d) => d.id === id);
  const toPage = () => (then === 'page' ? router.replace(`/dive/${id}`) : router.back());
  const signDive = useAppStore((s) => s.signDive);
  const [way, setWay] = useState<Way>('here');
  const [name, setName] = useState(dive?.buddyName ?? '');
  const [role, setRole] = useState<SignerRole | undefined>('buddy');
  const [svg, setSvg] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!dive) {
    return (
      <ThemedView style={styles.centered}>
        <Stack.Screen options={{ title: 'Sign the page' }} />
        <ThemedText>This page isn’t in your log any more.</ThemedText>
      </ThemedView>
    );
  }
  const siteName = sites.find((s) => s.id === dive.siteId)?.name ?? 'a dive site';

  if (done && dive.signature) {
    return (
      <ThemedView style={styles.centered}>
        <Stack.Screen options={{ title: 'Signed' }} />
        <Seal label="Signed" size={104} rotate={-8} animate />
        <ThemedText type="display" accessibilityRole="header" style={styles.center}>
          {formatDiveNumber(dive.number)} is signed
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.center}>
          {dive.signature.name} signed your page at {siteName}.
        </ThemedText>
        <OceanButton title={then === 'page' ? 'Open the page' : 'Back to the page'} onPress={toPage} style={styles.stretch} />
      </ThemedView>
    );
  }

  const sign = async () => {
    if (!name.trim() || !svg || saving) return;
    setSaving(true);
    setError(null);
    try {
      await signDive(dive.id, { name: name.trim().slice(0, 80), svg, role, at: new Date().toISOString() });
      setDone(true);
      announce(`Signed by ${name.trim()}`);
    } catch (e: any) {
      const message = e.message ?? 'Could not sign the page';
      setError(message);
      announce(message);
    } finally {
      setSaving(false);
    }
  };

  const unsign = async () => {
    const ok = await confirmAction({
      title: 'Remove the signature?',
      message: `${dive.signature?.name}’s signature comes off ${formatDiveNumber(dive.number)}. They can sign again afterwards.`,
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok) return;
    try {
      await signDive(dive.id, null);
    } catch (e: any) {
      setError(e.message ?? 'Could not remove the signature');
    }
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: `Sign ${formatDiveNumber(dive.number)}` }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" scrollEnabled={!drawing}>
        {/* What is being signed, so the signer can check it. */}
        <Paper style={styles.summary} raised>
          <ThemedText type="label">{formatDate(dive.divedOn)}</ThemedText>
          <ThemedText type="heading">
            {formatDiveNumber(dive.number)} at {siteName}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {[dive.timeIn ? `In ${dive.timeIn}` : null, dive.maxDepthM !== undefined ? `${formatDepth(dive.maxDepthM)} deep` : null, dive.bottomTimeMin ? formatMinutes(dive.bottomTimeMin) : null, dive.buddyName ? `buddy ${dive.buddyName}` : null]
              .filter(Boolean)
              .join(' · ') || 'No depth or time written yet.'}
          </ThemedText>
        </Paper>

        <Segmented<Way>
          options={[
            { value: 'here', label: 'On this phone' },
            { value: 'code', label: 'From their phone' },
          ]}
          value={way}
          onChange={setWay}
          accessibilityLabel="How your buddy signs"
        />

        {way === 'here' ? (
          dive.signature ? (
            <Paper style={styles.stack}>
              <SignatureView svg={dive.signature.svg} height={64} />
              <View style={[styles.signLine, { borderTopColor: theme.textSecondary }]}>
                <ThemedText type="smallBold">{dive.signature.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {dive.signature.role ? `${SIGNER_ROLE_LABEL[dive.signature.role]} · ` : ''}signed on your phone
                </ThemedText>
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                A page holds one signature from your phone. To have someone else sign, remove this one, or send them a code to sign from their own phone.
              </ThemedText>
              <OceanButton title="Remove this signature" variant="secondary" icon="trash" onPress={() => void unsign()} />
            </Paper>
          ) : (
            <View style={styles.stack}>
              <View style={styles.note}>
                <Icon name="buddies" size={20} wash={theme.sun} />
                <ThemedText type="small" style={styles.flex}>
                  Hand your phone to your buddy or guide. They write their name and sign below.
                </ThemedText>
              </View>
              <FormField label="Their name" value={name} onChangeText={setName} placeholder="Name as they sign it" autoCapitalize="words" maxLength={80} />
              <ChoiceChips label="On this dive they were" options={ROLE_OPTIONS} value={role} onChange={setRole} />
              <SignaturePad onChange={setSvg} onDrawing={setDrawing} />
              <ThemedText type="caption" themeColor="textSecondary">
                What they say they were is shown as they wrote it; ScubaGo doesn’t check certifications.
              </ThemedText>
              {error ? (
                <ThemedText type="small" themeColor="danger" accessibilityLiveRegion="polite">
                  {error}
                </ThemedText>
              ) : null}
              <OceanButton
                title={saving ? 'Signing…' : `Sign ${formatDiveNumber(dive.number)}`}
                icon={saving ? undefined : 'signature'}
                variant="log"
                onPress={() => void sign()}
                disabled={saving || !name.trim() || !svg}
              />
              {!name.trim() || !svg ? (
                <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
                  {!name.trim() ? 'Write their name' : 'Sign in the box'} to sign the page.
                </ThemedText>
              ) : null}
            </View>
          )
        ) : (
          <SendCode diveId={dive.id} number={dive.number} siteName={siteName} synced={dive.synced} syncError={dive.syncError} />
        )}
      </ScrollView>
    </ThemedView>
  );
}

/** Make a code for the page and send it; the buddy's signature arrives with the next sync. */
function SendCode({ diveId, number, siteName, synced, syncError }: { diveId: string; number: number; siteName: string; synced: boolean; syncError?: string }) {
  const theme = useTheme();
  const client = getSupabase();
  const user = useAppStore((s) => s.user);
  const requestSync = useAppStore((s) => s.requestSync);
  const syncing = useAppStore((s) => s.syncing);
  const [code, setCode] = useState<CreatedCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<VerificationError | null>(null);

  if (!client) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        Signing from another phone needs ScubaGo accounts, and this build has no server to sign in to. Your buddy can sign on this phone instead.
      </ThemedText>
    );
  }
  if (!user) {
    return (
      <View style={styles.stack}>
        <ThemedText type="small" themeColor="textSecondary">
          Sign in to send a code: your buddy signs from their own account, so you both need one.
        </ThemedText>
        <OceanButton title="Sign in" icon="account" onPress={() => router.push('/auth')} />
      </View>
    );
  }
  if (!synced) {
    const offline = !syncError || isConnectionProblem(syncError);
    return (
      <View style={styles.stack}>
        <View style={styles.note}>
          <Icon name="sync" size={18} color={theme.textSecondary} wash={theme.textSecondary} washOpacity={0.2} />
          <ThemedText type="small" themeColor={offline ? 'textSecondary' : 'danger'} style={styles.flex}>
            {offline ? 'Once this page has synced, you can make a code for it.' : `This page hasn’t synced: ${syncError!.replace(/\.$/, '')}.`}
          </ThemedText>
        </View>
        <OceanButton title={syncing ? 'Syncing…' : 'Sync now'} icon="sync" variant="secondary" disabled={syncing} onPress={() => void requestSync()} />
      </View>
    );
  }

  const ask = async (replacing?: CreatedCode) => {
    setBusy(true);
    setProblem(null);
    try {
      if (replacing) await withdrawSignCode(client, replacing.id).catch(() => undefined);
      setCode(await askBuddyToSign(client, diveId));
    } catch (e) {
      setProblem(verificationError(e));
    } finally {
      setBusy(false);
    }
  };
  const share = async (c: CreatedCode) => {
    const message = signShareMessage(number, siteName, c.code, c.expiresAt);
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && !navigator.share) {
        await navigator.clipboard?.writeText(message);
        announce('Copied the message with the code');
        return;
      }
      await Share.share({ message });
    } catch (e) {
      console.warn('could not share the code', e);
    }
  };

  return (
    <View style={styles.stack}>
      {code ? (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            Send this code to your buddy. In ScubaGo they go to Logbook → Buddy code, check the page and sign it.
          </ThemedText>
          <View style={[styles.ticket, { backgroundColor: theme.background, borderColor: theme.rule }]}>
            <Text selectable accessibilityLabel={`Code ${code.code.split('').join(' ')}`} style={[styles.code, { color: theme.text }]}>
              {code.code}
            </Text>
            <View aria-hidden>
              <Svg width="100%" height={2}>
                <Line x1="0" y1="1" x2="100%" y2="1" stroke={theme.rule} strokeWidth={1.5} strokeDasharray="5 4" />
              </Svg>
            </View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
              Up to {code.maxUses} people can sign · valid until {new Date(code.expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </ThemedText>
          </View>
          <OceanButton title="Share code" icon="share" onPress={() => void share(code)} />
          <OceanButton title={syncing ? 'Checking…' : 'Check for signatures'} icon="sync" variant="secondary" disabled={syncing} onPress={() => void requestSync()} />
          <Pressable
            onPress={() => void ask(code)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityHint="The code above stops working"
            style={({ pressed }) => [styles.link, { opacity: busy ? 0.4 : pressed ? 0.6 : 1 }]}>
            <Icon name="sync" size={16} color={theme.tint} />
            <ThemedText type="smallBold" themeColor="tint">
              {busy ? 'Making a new code…' : 'Make a new code'}
            </ThemedText>
          </Pressable>
        </>
      ) : (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            Not together any more? Make a code and send it. Your buddy sees this page’s number, site and date before they sign, and their signature appears here when your log next syncs.
          </ThemedText>
          <OceanButton title={busy ? 'Making a code…' : 'Make a code'} icon="code" disabled={busy} onPress={() => void ask()} />
        </>
      )}
      {problem ? (
        <ThemedText type="small" themeColor={problem.kind === 'offline' ? 'textSecondary' : 'danger'} accessibilityLiveRegion="polite">
          {problem.message}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
  content: { padding: Spacing.three, gap: Spacing.four, paddingBottom: Spacing.six, width: '100%', maxWidth: 720, alignSelf: 'center' },
  center: { textAlign: 'center' },
  stretch: { alignSelf: 'stretch' },
  flex: { flex: 1 },
  summary: { gap: 2 },
  stack: { gap: Spacing.three },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  signLine: { borderTopWidth: 1, paddingTop: 4 },
  ticket: { borderWidth: 1.5, borderRadius: Radius.md, paddingTop: Spacing.three, paddingBottom: 12, paddingHorizontal: Spacing.three, gap: 12, alignItems: 'center' },
  code: { fontFamily: Type.label, fontSize: 26, lineHeight: 32, letterSpacing: 3, textAlign: 'center' },
  link: { alignSelf: 'center', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.two },
});
