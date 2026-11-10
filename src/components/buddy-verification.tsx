import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Platform, Share, StyleSheet, Text, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { Icon } from '@/components/icon';
import { Seal } from '@/components/journal/stamp';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { IconTile } from '@/components/ui/list';
import { Radius, Space, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { announce } from '@/lib/announce';
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
  useEffect(() => announce(problem?.message), [problem]);

  // A buddy-verified sighting carries the seal. It is stamped in only when the confirmation arrives
  // while the page is open; one that was already confirmed shows it still.
  const confirmed = sighting.status === 'confirmed';
  const [wasConfirmed, setWasConfirmed] = useState(confirmed);
  const [stampSeal, setStampSeal] = useState(false);
  if (confirmed !== wasConfirmed) {
    setWasConfirmed(confirmed);
    setStampSeal(confirmed);
  }

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
  // Signed out: the one button is still the way in, and a short line says what comes first.
  if (!user) {
    return <View style={styles.ask}>
      <Button title="Ask a buddy to confirm" icon="buddies" variant="secondary" accessibilityHint="Sign in first" onPress={() => router.push('/auth')} />
      <Text style={[TypeScale.subhead, styles.centred, { color: theme.textSecondary }]}>Sign in first.</Text>
    </View>;
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

  const askButton = (
    <Button
      title={busy ? 'Creating a code…' : 'Ask a buddy to confirm'}
      icon="buddies"
      variant="secondary"
      disabled={busy || loading}
      onPress={() => void ask()}
    />
  );
  const problemLine = problem ? (
    <Text accessibilityLiveRegion="polite" style={[TypeScale.subhead, { color: problem.kind === 'offline' ? theme.textSecondary : theme.danger }]}>
      {problem.message}
      {problem.kind === 'offline' && cached.checkedAt ? ` Showing what was known on ${dateOf(cached.checkedAt)}.` : ''}
    </Text>
  ) : null;

  // Nothing asked yet and nothing answered: just the button, not a card with a heading above it.
  if (answers.length === 0 && sighting.synced && !code && !confirmed) {
    return <View style={styles.ask}>
      {askButton}
      {loading ? <ActivityIndicator color={theme.tint} /> : null}
      {problemLine}
    </View>;
  }

  return <Section title="Ask a buddy" seal={confirmed ? <Seal label="Verified" size={76} animate={stampSeal} /> : null}>
    {answers.length > 0 && !voided ? (
      <View>
        {answers.map((a, index) => {
          const saw = a.decision === 'saw_it';
          return (
            <View key={`${a.verifier}-${a.at}`} style={[styles.answer, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.rule }]}>
              <Icon
                name={saw ? 'checkCircle' : 'close'}
                size={saw ? 20 : 16}
                color={saw ? theme.tint : theme.textSecondary}
                weight={saw ? 'duotone' : 'bold'}
                style={styles.answerIcon}
              />
              <Text style={[TypeScale.subhead, styles.flex, { color: theme.text }]}>
                <Text style={TypeScale.subheadStrong}>@{a.verifier}</Text>
                {saw ? ' confirmed it' : a.decision === 'did_not_see' ? ' didn’t see it' : ' wasn’t on this dive'}
                <Text style={{ color: theme.textSecondary }}>{a.role === 'buddy' ? '' : ` · says they were the ${ROLE_LABEL[a.role].toLowerCase()} (not checked)`}</Text>
              </Text>
            </View>
          );
        })}
      </View>
    ) : null}

    {!sighting.synced ? (
      <View style={styles.note}>
        <Icon name="sync" size={18} color={theme.textSecondary} style={styles.answerIcon} />
        <Text style={[TypeScale.subhead, styles.flex, { color: theme.textSecondary }]}>
          {voided
            ? 'You changed the species, site or date, so earlier confirmations no longer apply. Once your change has synced, you can ask again.'
            : 'Once this sighting has synced, you can ask someone who was on the dive to confirm it.'}
        </Text>
      </View>
    ) : code ? (
      <View style={styles.stack}>
        <Text style={[TypeScale.subhead, { color: theme.textSecondary }]}>Send this code to someone who was on the dive with you:</Text>
        {/* The code as a ticket stub: typewriter letters above a perforation, the terms below it. */}
        <View style={[styles.ticket, { backgroundColor: theme.backgroundSelected }]}>
          <Text selectable accessibilityLabel={`Code ${code.code.split('').join(' ')}`} style={[TypeScale.ticket, styles.centred, { color: theme.text }]}>
            {code.code}
          </Text>
          {/* Hidden on a wrapper: on the web, Svg hands its props straight to the <svg> element. */}
          <View aria-hidden style={styles.perforation}>
            <Svg width="100%" height={2}>
              <Line x1="0" y1="1" x2="100%" y2="1" stroke={theme.textTertiary} strokeWidth={1.5} strokeDasharray="5 4" />
            </Svg>
          </View>
          <View style={styles.terms}>
            <Icon name="clock" size={16} color={theme.textSecondary} />
            <Text style={[TypeScale.subhead, styles.shrink, { color: theme.textSecondary }]}>
              Up to {code.maxUses} people can answer · valid until {dateOf(code.expiresAt)}
            </Text>
          </View>
        </View>
        <Button title="Share code" icon="share" onPress={() => void share(code)} />
        <Button title={busy ? 'Making a new code…' : 'Make a new code'} icon="sync" variant="plain" size="md" disabled={busy} accessibilityHint="The code above stops working" onPress={() => void ask(code)} />
      </View>
    ) : (
      <View style={styles.stack}>{askButton}</View>
    )}

    {loading ? <ActivityIndicator color={theme.tint} /> : null}
    {problemLine}
  </Section>;
}

/** The block's card: a heading beside its icon, and the seal once a buddy has confirmed the sighting. */
function Section({ title, seal, children }: { title: string; seal?: ReactNode; children: ReactNode }) {
  const theme = useTheme();
  return <Card style={styles.card}>
    <View style={styles.head}>
      <IconTile icon="buddies" />
      <Text accessibilityRole="header" style={[TypeScale.headline, styles.flex, { color: theme.text }]}>{title}</Text>
      {seal ? <View style={styles.seal}>{seal}</View> : null}
    </View>
    {children}
  </Card>;
}

const styles = StyleSheet.create({
  ask: {
    gap: Space.s2,
  },
  centred: {
    textAlign: 'center',
  },
  card: {
    gap: Space.s3,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s3,
    minHeight: 44,
  },
  // The seal overhangs the heading a little, as a stamp pressed onto the page would.
  seal: {
    marginVertical: -14,
    marginRight: -2,
  },
  flex: {
    flex: 1,
  },
  shrink: {
    flexShrink: 1,
  },
  stack: {
    gap: Space.s3,
  },
  answer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.s3,
    paddingVertical: Space.s2,
  },
  answerIcon: {
    marginTop: 1,
    width: 20,
    alignItems: 'center',
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.s3,
  },
  ticket: {
    borderRadius: Radius.md,
    paddingTop: Space.s4,
    paddingBottom: Space.s3,
    paddingHorizontal: Space.s4,
    gap: Space.s3,
    alignItems: 'center',
  },
  perforation: {
    alignSelf: 'stretch',
  },
  terms: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.s2,
  },
});
