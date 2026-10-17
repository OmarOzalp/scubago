import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { RemoteSign } from '@/components/dive/remote-sign';
import { Icon, type IconName } from '@/components/icon';
import { Paper } from '@/components/journal/paper';
import { Screen } from '@/components/journal/screen';
import { Seal } from '@/components/journal/stamp';
import { Wash } from '@/components/journal/wash';
import { OceanButton } from '@/components/ocean-button';
import { formatDate } from '@/components/sighting-row';
import { SpeciesAvatar } from '@/components/species-avatar';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { announce } from '@/lib/announce';
import { CATALOG_BY_ID } from '@/lib/catalog';
import { isDiveCode, lookUpDiveCode, SIGN_OUTCOME_MESSAGE, type DivePreview } from '@/lib/dive-signature-api';
import { formatDiveNumber } from '@/lib/dives';
import { useAllSites, useAppStore } from '@/lib/store';
import { getSupabase } from '@/lib/supabase';
import { displayablePhoto } from '@/lib/sync';
import type { SightingStatus } from '@/lib/types';
import { STATUS_LABEL } from '@/lib/verification';
import {
  answerCode,
  formatCode,
  isCompleteCode,
  lookUpCode,
  OUTCOME_MESSAGE,
  ROLE_LABEL,
  verificationError,
  type CodePreview,
  type Decision,
  type VerifierRole,
} from '@/lib/verification-api';

const ROLES: VerifierRole[] = ['buddy', 'instructor', 'divemaster', 'other'];

/**
 * A buddy enters a code (`/verify?code=…`). Signed in, they see what it's for: a sighting, and they
 * say whether they saw it too (migration 0006); or a page of the diver's logbook (codes that start
 * with D), and they sign it (migration 0009). The server checks the code, the diver and the answer.
 */
export default function VerifyScreen() {
  const params = useLocalSearchParams<{ code?: string }>();
  const theme = useTheme();
  const client = getSupabase();
  const user = useAppStore((s) => s.user);
  const sites = useAllSites();
  const [code, setCode] = useState(() => formatCode(typeof params.code === 'string' ? params.code : ''));
  const [focused, setFocused] = useState(false);
  const [preview, setPreview] = useState<CodePreview | null>(null);
  const [role, setRole] = useState<VerifierRole>('buddy');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // Read problems aloud to screen-reader users as they appear (iOS ignores live regions).
  useEffect(() => announce(problem), [problem]);
  const [answered, setAnswered] = useState<{ decision: Decision; status?: SightingStatus } | null>(null);
  const [divePreview, setDivePreview] = useState<DivePreview | null>(null);
  const [signedDive, setSignedDive] = useState(false);
  const [drawing, setDrawing] = useState(false);

  if (!client) {
    return <Screen contentStyle={styles.centred}>
      <Emblem icon="verified" />
      <ThemedText style={styles.center}>Buddy verification needs a ScubaGo account, and this build has no server to sign in to.</ThemedText>
    </Screen>;
  }

  const species = preview ? CATALOG_BY_ID.get(preview.speciesId) : undefined;
  const speciesName = species?.commonName ?? preview?.speciesId ?? '';
  const siteName = preview ? (sites.find((s) => s.id === preview.siteId)?.name ?? preview.siteName ?? 'a dive site') : '';

  const lookUp = async () => {
    setBusy(true);
    setProblem(null);
    setPreview(null);
    setDivePreview(null);
    try {
      // A page's code starts with D; so does one sighting code in 32, so a D code that matches no
      // page is tried as a sighting's.
      if (isDiveCode(code)) {
        const page = await lookUpDiveCode(client, code);
        if (page.preview) {
          setDivePreview(page.preview);
          return;
        }
        if (page.outcome !== 'invalid_code') {
          setProblem(SIGN_OUTCOME_MESSAGE[page.outcome === 'ok' ? 'invalid_code' : page.outcome]);
          return;
        }
      }
      const found = await lookUpCode(client, code);
      if (found.preview) {
        setPreview(found.preview);
        setRole('buddy');
      } else {
        setProblem(OUTCOME_MESSAGE[found.outcome === 'ok' ? 'invalid_code' : found.outcome]);
      }
    } catch (e) {
      setProblem(verificationError(e).message);
    } finally {
      setBusy(false);
    }
  };

  const answer = async (decision: Decision) => {
    if (!preview) return;
    setBusy(true);
    setProblem(null);
    try {
      const result = await answerCode(client, code, decision, role, preview);
      if (result.outcome === 'ok') {
        setAnswered({ decision, status: result.status });
      } else if (result.outcome === 'changed') {
        // Show what the sighting says now; they answer again if it's still right.
        const found = await lookUpCode(client, code);
        setPreview(found.preview ?? null);
        setProblem(OUTCOME_MESSAGE[found.preview ? 'changed' : found.outcome === 'ok' ? 'invalid_code' : found.outcome]);
      } else {
        setPreview(null);
        setProblem(OUTCOME_MESSAGE[result.outcome]);
      }
    } catch (e) {
      setProblem(verificationError(e).message);
    } finally {
      setBusy(false);
    }
  };

  const close = () => (router.canGoBack() ? router.back() : router.replace('/logbook'));
  const diveSiteName = divePreview ? (sites.find((s) => s.id === divePreview.siteId)?.name ?? divePreview.siteName ?? 'a dive site') : '';

  if (signedDive && divePreview) {
    return <Screen contentStyle={styles.centred}>
      <Seal label="Signed" size={104} rotate={-8} animate />
      <ThemedText type="display" style={styles.center} accessibilityRole="header">Thanks for signing</ThemedText>
      <ThemedText style={styles.center}>
        {`Your signature is on @${divePreview.owner}’s ${formatDiveNumber(divePreview.number)} at ${diveSiteName}. It appears in their logbook when it next syncs.`}
      </ThemedText>
      <OceanButton title="Done" onPress={close} style={styles.stretch} />
    </Screen>;
  }

  if (answered && preview) {
    const confirmed = answered.decision === 'saw_it';
    return <Screen contentStyle={styles.centred}>
      {/* Their answer has just gone in: a "yes" is sealed (stamped in, unless Reduce Motion is on). */}
      {confirmed ? <Seal label="Confirmed" size={104} rotate={-8} animate /> : <Emblem icon="checkCircle" />}
      <ThemedText type="display" style={styles.center} accessibilityRole="header">{confirmed ? 'Thanks for confirming' : 'Thanks for answering'}</ThemedText>
      <ThemedText style={styles.center}>
        {`Your answer is on @${preview.owner}’s ${speciesName} sighting`}
        {answered.status ? `, which now shows “${STATUS_LABEL[answered.status]}”.` : '.'}
      </ThemedText>
      <OceanButton title="Done" onPress={close} style={styles.stretch} />
    </Screen>;
  }

  const complete = isCompleteCode(code);
  const photoUri = user && preview ? previewPhoto(preview, user.id) : undefined;

  return (
    <Screen scrollEnabled={!drawing}>
      <View style={styles.intro}>
        <Emblem icon="verified" />
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          A buddy sent you a code? Enter it to confirm something they saw, or to sign their dive. You’ll see what
          it’s for before you answer.
        </ThemedText>
      </View>

      {/* The code, typed in typewriter letters on a ticket. */}
      <Paper raised={!preview} style={styles.ticket}>
        <View style={styles.ticketLabel}>
          <Icon name="code" size={18} color={theme.textSecondary} wash={theme.textSecondary} washOpacity={0.2} />
          <ThemedText type="label" importantForAccessibility="no" accessibilityElementsHidden>
            Code from your buddy
          </ThemedText>
        </View>
        <TextInput
          value={code}
          onChangeText={(text) => {
            setCode(formatCode(text));
            setPreview(null);
            setDivePreview(null);
            setProblem(null);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="XXXXX-XXXXX"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          returnKeyType="search"
          onSubmitEditing={() => {
            if (user && isCompleteCode(code) && !busy) void lookUp();
          }}
          accessibilityLabel="Code from your buddy"
          style={[
            styles.code,
            {
              backgroundColor: theme.background,
              color: theme.text,
              borderColor: focused || complete ? theme.tint : theme.rule,
              borderStyle: focused || complete ? 'solid' : 'dashed',
            },
          ]}
        />

        {!user ? (
          <View style={styles.stack}>
            <ThemedText type="small" themeColor="textSecondary">
              Sign in first: your buddy will see your username next to your answer.
            </ThemedText>
            <OceanButton title="Sign in" icon="account" onPress={() => router.push('/auth')} />
          </View>
        ) : !preview && !divePreview ? (
          <OceanButton
            title={busy ? 'Looking it up…' : 'Look it up'}
            icon="search"
            disabled={busy || !complete}
            onPress={() => void lookUp()}
          />
        ) : null}
      </Paper>

      {user && divePreview ? (
        <RemoteSign
          client={client}
          code={code}
          preview={divePreview}
          siteName={diveSiteName}
          onSigned={() => setSignedDive(true)}
          onPreview={setDivePreview}
          onProblem={setProblem}
          onDrawing={setDrawing}
        />
      ) : null}

      {user && preview ? (
        <>
          {/* What the buddy logged, as a page from their logbook. */}
          <Paper raised padded={false}>
            <View style={styles.previewHead}>
              {species ? <SpeciesAvatar species={species} size={64} showRarityRing /> : null}
              <View style={styles.flex}>
                <ThemedText style={styles.speciesName}>{speciesName}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">Logged by @{preview.owner}</ThemedText>
              </View>
            </View>
            <Fact icon="pin" label="Site">{siteName}</Fact>
            <Fact icon="calendar" label="Date">{formatDate(preview.sightedOn)}</Fact>
            {preview.notes || photoUri ? (
              <View style={[styles.previewFoot, { borderTopColor: theme.rule }]}>
                {preview.notes ? <ThemedText type="caption">“{preview.notes}”</ThemedText> : null}
                {photoUri ? <Image source={{ uri: photoUri }} style={styles.photo} contentFit="cover" accessibilityLabel={`Photo by @${preview.owner}`} /> : null}
              </View>
            ) : null}
          </Paper>

          {preview.answered ? (
            <Paper tone="sand" style={styles.noteCard}>
              <Icon name="checkCircle" size={22} color={theme.tint} />
              <ThemedText style={styles.flex}>
                You’ve already answered: you said you {preview.answered === 'saw_it' ? 'saw it too' : preview.answered === 'did_not_see' ? 'didn’t see it' : 'weren’t on this dive'}.
              </ThemedText>
            </Paper>
          ) : (
            <>
              <Paper tone="sand" style={styles.noteCard}>
                <Icon name="info" size={22} wash={theme.sun} />
                <ThemedText type="small" style={styles.flex}>
                  Only say yes if you saw it yourself on this dive. @{preview.owner} will see your answer and your
                  username.
                </ThemedText>
              </Paper>
              <View style={styles.stack}>
                <ThemedText type="label">On this dive, you were…</ThemedText>
                <View style={styles.roles} accessibilityRole="radiogroup" accessibilityLabel="On this dive, you were">
                  {ROLES.map((r) => {
                    const selected = r === role;
                    return (
                      <Pressable
                        key={r}
                        onPress={() => setRole(r)}
                        accessibilityRole="radio"
                        aria-checked={selected}
                        style={({ pressed }) => [
                          styles.role,
                          {
                            backgroundColor: selected ? theme.text : pressed ? theme.backgroundSelected : theme.backgroundElement,
                            borderColor: selected ? theme.text : theme.rule,
                          },
                        ]}>
                        {/* A tick as well as the ink, so the choice isn't told by colour alone. */}
                        {selected ? <Icon name="check" size={14} color={theme.background} weight="bold" /> : null}
                        <ThemedText type="smallBold" style={{ fontFamily: Type.bodyHeavy, color: selected ? theme.background : theme.text }}>
                          {ROLE_LABEL[r]}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
                <ThemedText type="caption" themeColor="textSecondary">
                  ScubaGo doesn’t check this yet: it’s shown as what you said, not as a certification.
                </ThemedText>
              </View>
              <View style={styles.stack}>
                <OceanButton title="Yes, I saw it too" icon="check" disabled={busy} onPress={() => void answer('saw_it')} />
                <OceanButton title="No, I didn’t see it" icon="close" variant="secondary" disabled={busy} onPress={() => void answer('did_not_see')} />
                <Pressable
                  onPress={() => void answer('was_not_there')}
                  disabled={busy}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.link, { opacity: busy ? 0.4 : pressed ? 0.6 : 1 }]}>
                  <ThemedText type="smallBold" themeColor="textSecondary">
                    I wasn’t on this dive
                  </ThemedText>
                </Pressable>
              </View>
            </>
          )}
        </>
      ) : null}

      {problem ? (
        <View style={styles.problem}>
          <Icon name="warning" size={20} color={theme.danger} wash={theme.danger} washOpacity={0.2} />
          <ThemedText type="small" themeColor="danger" accessibilityLiveRegion="polite" style={styles.flex}>{problem}</ThemedText>
        </View>
      ) : null}
    </Screen>
  );
}

/** A large icon on a watercolour wash, heading the screen. */
function Emblem({ icon }: { icon: IconName }) {
  const theme = useTheme();
  return (
    <View style={styles.emblem}>
      <Wash width={112} height={78} color={theme.wash} seed={59} style={StyleSheet.absoluteFill} />
      <Icon name={icon} size={42} />
    </View>
  );
}

/** A ruled line of the preview: an icon, a typewriter label, and the value on the right. */
function Fact({ icon, label, children }: { icon: IconName; label: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.fact, { borderTopColor: theme.rule }]}>
      <Icon name={icon} size={18} color={theme.textSecondary} wash={theme.textSecondary} washOpacity={0.2} />
      <ThemedText type="label" style={styles.factLabel}>{label}</ThemedText>
      <ThemedText type="smallBold" style={styles.factValue}>{children}</ThemedText>
    </View>
  );
}

/** Their photo, if it's one ScubaGo stored for them (never an arbitrary URL). */
function previewPhoto(preview: CodePreview, viewerId: string): string | undefined {
  return preview.ownerId
    ? displayablePhoto({ photoUri: preview.photoUrl, userId: preview.ownerId }, viewerId, process.env.EXPO_PUBLIC_SUPABASE_URL)
    : undefined;
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  center: {
    textAlign: 'center',
  },
  stretch: {
    alignSelf: 'stretch',
  },
  centred: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
  },
  intro: {
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: Spacing.two,
  },
  emblem: {
    width: 112,
    height: 78,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ticket: {
    gap: 12,
  },
  ticketLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  code: {
    fontFamily: Type.label,
    fontSize: 28,
    letterSpacing: 3,
    textAlign: 'center',
    minHeight: 64,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.two,
    borderWidth: 1.5,
    borderRadius: Radius.md,
  },
  stack: {
    gap: 10,
  },
  previewHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: Spacing.three,
  },
  speciesName: {
    fontFamily: Type.display,
    fontSize: 22,
    lineHeight: 28,
  },
  fact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: Spacing.three,
    borderTopWidth: 1,
  },
  factLabel: {
    minWidth: 44,
  },
  factValue: {
    flex: 1,
    textAlign: 'right',
  },
  previewFoot: {
    gap: 10,
    padding: Spacing.three,
    borderTopWidth: 1,
  },
  photo: {
    width: '100%',
    height: 200,
    borderRadius: Radius.md,
  },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  roles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  role: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: Radius.sm,
    paddingHorizontal: 14,
    minHeight: 44,
  },
  link: {
    alignSelf: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    minHeight: 44,
    justifyContent: 'center',
  },
  problem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
});
