import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, Share, StyleSheet, Text, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { ChoiceChips } from '@/components/dive/choice-chips';
import { SignaturePad, SignatureView } from '@/components/dive/signature';
import { FormField } from '@/components/form-field';
import { Seal } from '@/components/journal/stamp';
import { formatDate } from '@/components/sighting-row';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MoreMenu } from '@/components/ui/more-menu';
import { EmptyState, Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { WhenReady } from '@/components/when-ready';
import { Space, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { announce } from '@/lib/announce';
import { confirmAction } from '@/lib/confirm';
import { askBuddyToSign, signShareMessage, SIGNER_ROLE_LABEL, SIGNER_ROLES, withdrawSignCode, type SignerRole } from '@/lib/dive-signature-api';
import { formatDepth, formatDiveNumber, formatMinutes } from '@/lib/dives';
import { leave } from '@/lib/leave';
import { useAppStore, useMyDives, useSiteById } from '@/lib/store';
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
  const siteById = useSiteById();
  const dive = useMyDives().find((d) => d.id === id);
  const toPage = () => (then === 'page' ? router.replace(`/dive/${id}`) : leave(`/dive/${id}`));
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
      <Screen kind="modal">
        <Stack.Screen options={{ title: 'Buddy signature' }} />
        <EmptyState icon="logbook" title="This page isn’t in your log any more." />
      </Screen>
    );
  }
  const siteName = siteById(dive.siteId)?.name ?? 'a dive site';

  if (done && dive.signature) {
    return (
      <Screen kind="modal" contentStyle={styles.centered}>
        <Stack.Screen options={{ title: 'Signed' }} />
        <Seal label="Signed" size={104} rotate={-8} animate />
        <Text accessibilityRole="header" style={[TypeScale.display, styles.center, { color: theme.text }]}>
          {formatDiveNumber(dive.number)} is signed
        </Text>
        <Text style={[TypeScale.body, styles.center, { color: theme.textSecondary }]}>
          {dive.signature.name} signed your page at {siteName}.
        </Text>
        <Button title={then === 'page' ? 'Open the page' : 'Back to the page'} onPress={toPage} style={styles.stretch} />
      </Screen>
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
    <Screen kind="modal" scrollEnabled={!drawing}>
      <Stack.Screen options={{ title: 'Buddy signature' }} />
      <Text style={[TypeScale.callout, { color: theme.textSecondary }]}>Your buddy or guide signs this page, on this phone or on theirs.</Text>
      {/* What is being signed, so the signer can check it. */}
      <Card style={styles.summary}>
        <Text style={[TypeScale.footnoteStrong, { color: theme.textSecondary }]}>{formatDate(dive.divedOn)}</Text>
        <Text style={[TypeScale.headline, { color: theme.text }]}>
          {formatDiveNumber(dive.number)} at {siteName}
        </Text>
        <Text style={[TypeScale.subhead, { color: theme.textSecondary }]}>
          {[dive.timeIn ? `In ${dive.timeIn}` : null, dive.maxDepthM !== undefined ? `${formatDepth(dive.maxDepthM)} deep` : null, dive.bottomTimeMin ? formatMinutes(dive.bottomTimeMin) : null, dive.buddyName ? `buddy ${dive.buddyName}` : null]
            .filter(Boolean)
            .join(' · ') || 'No depth or time written yet.'}
        </Text>
      </Card>

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
          <Card style={styles.stack}>
            <SignatureView svg={dive.signature.svg} height={64} />
            <View style={[styles.signLine, { borderTopColor: theme.textTertiary }]}>
              <Text style={[TypeScale.subheadStrong, { color: theme.text }]}>{dive.signature.name}</Text>
              <Text style={[TypeScale.subhead, { color: theme.textSecondary }]}>
                {dive.signature.role ? `${SIGNER_ROLE_LABEL[dive.signature.role]} · ` : ''}signed on your phone
              </Text>
            </View>
            <Text style={[TypeScale.subhead, { color: theme.textSecondary }]}>
              A page holds one signature from your phone. To have someone else sign, remove this one, or send them a code to sign from their own phone.
            </Text>
            <View style={styles.moreRow}>
              <MoreMenu accessibilityLabel="More actions for this signature" items={[{ label: 'Remove this signature', icon: 'trash', destructive: true, onPress: () => void unsign() }]} />
            </View>
          </Card>
        ) : (
          <View style={styles.stack}>
            <Notice icon="buddies">Hand your phone to your buddy or guide. They write their name and sign below.</Notice>
            <FormField label="Their name" value={name} onChangeText={setName} placeholder="Name as they sign it" autoCapitalize="words" maxLength={80} />
            <ChoiceChips label="On this dive they were" options={ROLE_OPTIONS} value={role} onChange={setRole} />
            <SignaturePad onChange={setSvg} onDrawing={setDrawing} />
            <Text style={[TypeScale.subhead, { color: theme.textSecondary }]}>What they say they were is shown as they wrote it; ScubaGo doesn’t check certifications.</Text>
            {error ? (
              <Text accessibilityLiveRegion="polite" style={[TypeScale.subhead, { color: theme.danger }]}>
                {error}
              </Text>
            ) : null}
            <Button title={saving ? 'Signing…' : 'Sign this page'} icon={saving ? undefined : 'signature'} variant="log" onPress={() => void sign()} disabled={saving || !name.trim() || !svg} />
            {!name.trim() || !svg ? (
              <Text style={[TypeScale.subhead, styles.center, { color: theme.textSecondary }]}>{!name.trim() ? 'Write their name' : 'Sign in the box'} to sign the page.</Text>
            ) : null}
          </View>
        )
      ) : (
        <SendCode diveId={dive.id} number={dive.number} siteName={siteName} synced={dive.synced} syncError={dive.syncError} />
      )}
    </Screen>
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
      <Text style={[TypeScale.subhead, { color: theme.textSecondary }]}>
        Signing from another phone needs ScubaGo accounts, and this build has no server to sign in to. Your buddy can sign on this phone instead.
      </Text>
    );
  }
  if (!user) {
    return (
      <View style={styles.stack}>
        <Text style={[TypeScale.subhead, { color: theme.textSecondary }]}>Sign in to send a code: your buddy signs from their own account, so you both need one.</Text>
        <Button title="Sign in" icon="account" onPress={() => router.push('/auth')} />
      </View>
    );
  }
  if (!synced) {
    const offline = !syncError || isConnectionProblem(syncError);
    return (
      <View style={styles.stack}>
        <Notice icon="sync">{offline ? 'Once this page has synced, you can make a code for it.' : `This page hasn’t synced: ${syncError!.replace(/\.$/, '')}.`}</Notice>
        <Button title={syncing ? 'Syncing…' : 'Sync now'} icon="sync" variant="secondary" disabled={syncing} onPress={() => void requestSync()} />
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
          <Text style={[TypeScale.subhead, { color: theme.textSecondary }]}>Send this code to your buddy. In ScubaGo they go to Logbook → Buddy code, check the page and sign it.</Text>
          <Card style={styles.ticket}>
            <Text selectable accessibilityLabel={`Code ${code.code.split('').join(' ')}`} style={[TypeScale.ticket, styles.center, { color: theme.text }]}>
              {code.code}
            </Text>
            <View aria-hidden style={styles.perforation}>
              <Svg width="100%" height={2}>
                <Line x1="0" y1="1" x2="100%" y2="1" stroke={theme.textTertiary} strokeWidth={1.5} strokeDasharray="5 4" />
              </Svg>
            </View>
            <Text style={[TypeScale.subhead, styles.center, { color: theme.textSecondary }]}>
              Up to {code.maxUses} people can sign · valid until {new Date(code.expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </Text>
          </Card>
          <Button title="Share code" icon="share" onPress={() => void share(code)} />
          <Button title={syncing ? 'Checking…' : 'Check for signatures'} icon="sync" variant="secondary" disabled={syncing} onPress={() => void requestSync()} />
          <Button title={busy ? 'Making a new code…' : 'Make a new code'} icon="sync" variant="plain" size="md" disabled={busy} accessibilityHint="The code above stops working" onPress={() => void ask(code)} />
        </>
      ) : (
        <>
          <Text style={[TypeScale.subhead, { color: theme.textSecondary }]}>
            Not together any more? Make a code and send it. Your buddy sees this page’s number, site and date before they sign, and their signature appears here when your log next syncs.
          </Text>
          <Button title={busy ? 'Making a code…' : 'Make a code'} icon="code" disabled={busy} onPress={() => void ask()} />
        </>
      )}
      {problem ? (
        <Text accessibilityLiveRegion="polite" style={[TypeScale.subhead, { color: problem.kind === 'offline' ? theme.textSecondary : theme.danger }]}>
          {problem.message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  moreRow: { alignItems: 'flex-end' },
  centered: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: Space.s4 },
  center: { textAlign: 'center' },
  stretch: { alignSelf: 'stretch' },
  summary: { gap: 2 },
  stack: { gap: Space.s4 },
  signLine: { borderTopWidth: 1, paddingTop: Space.s1 },
  ticket: { gap: Space.s3, alignItems: 'center', paddingTop: Space.s5 },
  perforation: { alignSelf: 'stretch' },
});
