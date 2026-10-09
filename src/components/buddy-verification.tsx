import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { OceanButton } from '@/components/ocean-button';
import { ThemedText } from '@/components/themed-text';
import { Ocean } from '@/constants/palette';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/lib/store';
import { getSupabase } from '@/lib/supabase';
import type { Sighting } from '@/lib/types';
import {
  askBuddy,
  ROLE_LABEL,
  shareMessage,
  usable,
  verificationError,
  verificationSummary,
  withdrawCode,
  type CreatedCode,
  type Summary,
  type VerificationError,
} from '@/lib/verification-api';

/**
 * What this device remembers per sighting: the last answers it saw (shown offline) and the code the
 * owner created, so they can share it again (the server keeps only its hash).
 */
type Cached = { summary?: Summary; code?: CreatedCode; checkedAt?: string };
const cacheKey = (sightingId: string) => `scubago:verification:v1:${sightingId}`;
async function readCache(sightingId: string): Promise<Cached> {
  try {
    return JSON.parse((await AsyncStorage.getItem(cacheKey(sightingId))) ?? '{}') as Cached;
  } catch {
    return {};
  }
}
function writeCache(sightingId: string, value: Cached) {
  AsyncStorage.setItem(cacheKey(sightingId), JSON.stringify(value)).catch(() => undefined);
}

const DANGER = '#c0392b';
const dateOf = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/**
 * "Ask a buddy" on the owner's own sighting: a code to send to someone who was on the dive, and
 * their answers. The status itself comes from the server (it's on the sighting).
 */
export function BuddyVerification({ sighting, speciesName }: { sighting: Sighting; speciesName: string }) {
  const theme = useTheme();
  const client = getSupabase();
  const user = useAppStore((s) => s.user);
  const requestSync = useAppStore((s) => s.requestSync);
  const [cached, setCached] = useState<Cached>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<VerificationError | null>(null);

  const remember = (next: Cached) => {
    setCached(next);
    writeCache(sighting.id, next);
  };

  // What this device last saw, then what the server says now.
  const ready = !!client && !!user && sighting.synced;
  const status = sighting.status;
  useEffect(() => {
    let cancelled = false;
    readCache(sighting.id).then((stored) => {
      if (cancelled) return;
      setCached(stored);
      // Nothing to ask the server yet (signed out, or the sighting isn't there): no call, no error.
      if (!client || !user || !ready) { setProblem(null); setLoading(false); return; }
      verificationSummary(client, sighting.id).then((summary) => {
        if (cancelled) return;
        // A code that no longer works is forgotten.
        const code = stored.code && summary.requests.some((r) => r.id === stored.code!.id && usable(r)) ? stored.code : undefined;
        const next = { summary, code, checkedAt: new Date().toISOString() };
        setCached(next);
        writeCache(sighting.id, next);
        setProblem(null);
        setLoading(false);
        // A confirmation (or its loss) the log hasn't caught up with yet.
        if (summary.answers.some((a) => a.decision === 'saw_it') !== (status === 'confirmed')) void requestSync();
      }).catch((e) => {
        if (cancelled) return;
        setProblem(verificationError(e));
        setLoading(false);
      });
    });
    return () => { cancelled = true; };
  }, [sighting.id, client, user, ready, status, requestSync]);

  if (!client) return null;
  if (!user) {
    return <Section title="Ask a buddy">
      <Pressable onPress={() => router.push('/auth')} accessibilityRole="link">
        <ThemedText type="small" themeColor="textSecondary">
          Someone on the dive saw it too? <Text style={{ color: Ocean.primary }}>Sign in</Text> to ask them to confirm it.
        </ThemedText>
      </Pressable>
    </Section>;
  }

  const ask = async (replacing?: CreatedCode) => {
    setBusy(true);
    setProblem(null);
    try {
      if (replacing) await withdrawCode(client, replacing.id).catch(() => undefined);
      const code = await askBuddy(client, sighting.id);
      remember({ ...cached, code });
    } catch (e) {
      setProblem(verificationError(e));
    } finally {
      setBusy(false);
    }
  };
  const share = async (code: CreatedCode) => {
    const message = shareMessage(speciesName, code.code, code.expiresAt);
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && !navigator.share) {
        await navigator.clipboard?.writeText(message);
        return;
      }
      await Share.share({ message });
    } catch (e) {
      console.warn('could not share the code', e);
    }
  };

  const answers = cached.summary?.answers ?? [];
  // Edited here (species, site or date) and not synced yet: earlier answers were for the old facts.
  const voided = !sighting.synced && sighting.status !== 'confirmed' && answers.some((a) => a.decision === 'saw_it');
  const code = cached.code;

  return <Section title="Ask a buddy">
    {answers.length > 0 && !voided ? (
      <View style={{ gap: 4 }}>
        {answers.map((a) => (
          <ThemedText key={`${a.verifier}-${a.at}`} type="small">
            {a.decision === 'saw_it' ? '✓ ' : '– '}
            <ThemedText type="smallBold">@{a.verifier}</ThemedText>
            {a.decision === 'saw_it' ? ' confirmed it' : a.decision === 'did_not_see' ? ' didn’t see it' : ' wasn’t on this dive'}
            <ThemedText type="small" themeColor="textSecondary">
              {a.role === 'buddy' ? '' : ` · says they were the ${ROLE_LABEL[a.role].toLowerCase()} (not checked)`}
            </ThemedText>
          </ThemedText>
        ))}
      </View>
    ) : null}

    {!sighting.synced ? (
      <ThemedText type="small" themeColor="textSecondary">
        {voided
          ? 'You changed the species, site or date, so earlier confirmations no longer apply. Once your change has synced, you can ask again.'
          : 'Once this sighting has synced, you can ask someone who was on the dive to confirm it.'}
      </ThemedText>
    ) : code ? (
      <View style={{ gap: Spacing.two }}>
        <ThemedText type="small" themeColor="textSecondary">Send this code to someone who was on the dive with you:</ThemedText>
        <Text selectable accessibilityLabel={`Code ${code.code.split('').join(' ')}`} style={[styles.code, { color: theme.text, backgroundColor: theme.background }]}>
          {code.code}
        </Text>
        <ThemedText type="small" themeColor="textSecondary">
          Up to {code.maxUses} people can answer · valid until {dateOf(code.expiresAt)}
        </ThemedText>
        <OceanButton title="Share code" onPress={() => void share(code)} />
        <Pressable onPress={() => void ask(code)} disabled={busy} accessibilityRole="button" accessibilityHint="The code above stops working" style={styles.link}>
          <ThemedText type="small" style={{ color: Ocean.primary, opacity: busy ? 0.4 : 1 }}>
            {busy ? 'Making a new code…' : 'Make a new code'}
          </ThemedText>
        </Pressable>
      </View>
    ) : (
      <View style={{ gap: Spacing.two }}>
        <ThemedText type="small" themeColor="textSecondary">
          Someone on the dive saw it too? Ask them to confirm it: they’ll see the species, site and date, and answer for themselves.
        </ThemedText>
        <OceanButton title={busy ? 'Creating a code…' : 'Ask a buddy'} disabled={busy || loading} onPress={() => void ask()} />
      </View>
    )}

    {loading ? <ActivityIndicator /> : null}
    {problem ? (
      <ThemedText type="small" style={problem.kind === 'offline' ? undefined : { color: DANGER }} themeColor="textSecondary">
        {problem.message}
        {problem.kind === 'offline' && cached.checkedAt ? ` Showing what was known on ${dateOf(cached.checkedAt)}.` : ''}
      </ThemedText>
    ) : null}
  </Section>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
    <ThemedText type="smallBold">{title}</ThemedText>
    {children}
  </View>;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  code: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 3,
    textAlign: 'center',
    paddingVertical: Spacing.two,
    borderRadius: 10,
    fontVariant: ['tabular-nums'],
  },
  link: {
    alignSelf: 'center',
    paddingVertical: Spacing.one,
    minHeight: 44,
    justifyContent: 'center',
  },
});
