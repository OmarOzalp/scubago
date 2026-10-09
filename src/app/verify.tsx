import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { OceanButton } from '@/components/ocean-button';
import { formatDate } from '@/components/sighting-row';
import { SpeciesAvatar } from '@/components/species-avatar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Ocean } from '@/constants/palette';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CATALOG_BY_ID } from '@/lib/catalog';
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
const DANGER = '#c0392b';

/**
 * A buddy answers a code (`/verify?code=…`): signed in, they see the sighting it's for and say
 * whether they saw it too. The server checks the code, the diver and the answer (migration 0006).
 */
export default function VerifyScreen() {
  const params = useLocalSearchParams<{ code?: string }>();
  const theme = useTheme();
  const client = getSupabase();
  const user = useAppStore((s) => s.user);
  const sites = useAllSites();
  const [code, setCode] = useState(() => formatCode(typeof params.code === 'string' ? params.code : ''));
  const [preview, setPreview] = useState<CodePreview | null>(null);
  const [role, setRole] = useState<VerifierRole>('buddy');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [answered, setAnswered] = useState<{ decision: Decision; status?: SightingStatus } | null>(null);

  if (!client) {
    return <ThemedView style={styles.content}>
      <ThemedText>Buddy verification needs a ScubaGo account, and this build has no server to sign in to.</ThemedText>
    </ThemedView>;
  }

  const species = preview ? CATALOG_BY_ID.get(preview.speciesId) : undefined;
  const speciesName = species?.commonName ?? preview?.speciesId ?? '';
  const siteName = preview ? (sites.find((s) => s.id === preview.siteId)?.name ?? preview.siteName ?? 'a dive site') : '';

  const lookUp = async () => {
    setBusy(true);
    setProblem(null);
    setPreview(null);
    try {
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

  if (answered && preview) {
    const confirmed = answered.decision === 'saw_it';
    return <ThemedView style={{ flex: 1 }}>
      <View style={styles.content}>
        <ThemedText style={{ fontSize: 44, textAlign: 'center' }}>{confirmed ? '🤝' : '👍'}</ThemedText>
        <ThemedText type="subtitle" style={{ textAlign: 'center' }}>{confirmed ? 'Thanks for confirming' : 'Thanks for answering'}</ThemedText>
        <ThemedText style={{ textAlign: 'center' }}>
          {`Your answer is on @${preview.owner}’s ${speciesName} sighting`}
          {answered.status ? `, which now shows “${STATUS_LABEL[answered.status]}”.` : '.'}
        </ThemedText>
        <OceanButton title="Done" onPress={close} />
      </View>
    </ThemedView>;
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedText type="small" themeColor="textSecondary">
          A buddy logged something you both saw? Enter the code they sent you. You’ll see what they logged before
          you answer.
        </ThemedText>

        <TextInput
          value={code}
          onChangeText={(text) => {
            setCode(formatCode(text));
            setPreview(null);
            setProblem(null);
          }}
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
          style={[styles.code, { backgroundColor: theme.backgroundElement, color: theme.text }]}
        />

        {!user ? (
          <View style={{ gap: Spacing.two }}>
            <ThemedText type="small" themeColor="textSecondary">
              Sign in first: your buddy will see your username next to your answer.
            </ThemedText>
            <OceanButton title="Sign in" onPress={() => router.push('/auth')} />
          </View>
        ) : !preview ? (
          <OceanButton
            title={busy ? 'Looking it up…' : 'Look it up'}
            disabled={busy || !isCompleteCode(code)}
            onPress={() => void lookUp()}
          />
        ) : null}

        {user && preview ? (
          <View style={{ gap: Spacing.three }}>
            <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
              <View style={styles.header}>
                {species ? <SpeciesAvatar species={species} size={56} showRarityRing /> : null}
                <View style={{ flex: 1, gap: 2 }}>
                  <ThemedText type="subtitle" style={{ fontSize: 20, lineHeight: 26 }}>{speciesName}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">Logged by @{preview.owner}</ThemedText>
                </View>
              </View>
              <Fact label="Site">{siteName}</Fact>
              <Fact label="Date">{formatDate(preview.sightedOn)}</Fact>
              {preview.notes ? <ThemedText type="small">“{preview.notes}”</ThemedText> : null}
              <Photo preview={preview} viewerId={user.id} />
            </View>

            {preview.answered ? (
              <ThemedText>
                You’ve already answered: you said you {preview.answered === 'saw_it' ? 'saw it too' : preview.answered === 'did_not_see' ? 'didn’t see it' : 'weren’t on this dive'}.
              </ThemedText>
            ) : (
              <>
                <ThemedText type="small">
                  Only say yes if you saw it yourself on this dive. @{preview.owner} will see your answer and your
                  username.
                </ThemedText>
                <View style={{ gap: Spacing.one }}>
                  <ThemedText type="smallBold">On this dive, you were…</ThemedText>
                  <View style={styles.roles}>
                    {ROLES.map((r) => {
                      const selected = r === role;
                      return (
                        <Pressable
                          key={r}
                          onPress={() => setRole(r)}
                          accessibilityRole="radio"
                          accessibilityState={{ selected }}
                          style={[styles.role, { borderColor: selected ? Ocean.primary : theme.backgroundSelected, backgroundColor: selected ? `${Ocean.primary}22` : 'transparent' }]}>
                          <ThemedText type="small" style={selected ? { color: Ocean.primary, fontWeight: '700' } : undefined}>
                            {ROLE_LABEL[r]}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                  <ThemedText type="small" themeColor="textSecondary">
                    ScubaGo doesn’t check this yet: it’s shown as what you said, not as a certification.
                  </ThemedText>
                </View>
                <OceanButton title="Yes, I saw it too" disabled={busy} onPress={() => void answer('saw_it')} />
                <OceanButton title="No, I didn’t see it" variant="secondary" disabled={busy} onPress={() => void answer('did_not_see')} />
                <Pressable onPress={() => void answer('was_not_there')} disabled={busy} accessibilityRole="button" style={styles.link}>
                  <ThemedText type="small" themeColor="textSecondary" style={{ opacity: busy ? 0.4 : 1 }}>
                    I wasn’t on this dive
                  </ThemedText>
                </Pressable>
              </>
            )}
          </View>
        ) : null}

        {problem ? <ThemedText type="small" style={{ color: DANGER }}>{problem}</ThemedText> : null}
      </ScrollView>
    </ThemedView>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.fact}>
      <ThemedText type="small" themeColor="textSecondary" style={{ width: 44 }}>{label}</ThemedText>
      <ThemedText type="smallBold" style={{ flex: 1, textAlign: 'right' }}>{children}</ThemedText>
    </View>
  );
}

/** Their photo, if it's one ScubaGo stored for them (never an arbitrary URL). */
function Photo({ preview, viewerId }: { preview: CodePreview; viewerId: string }) {
  const uri = preview.ownerId
    ? displayablePhoto({ photoUri: preview.photoUrl, userId: preview.ownerId }, viewerId, process.env.EXPO_PUBLIC_SUPABASE_URL)
    : undefined;
  if (!uri) return null;
  return <Image source={{ uri }} style={styles.photo} contentFit="cover" accessibilityLabel={`Photo by @${preview.owner}`} />;
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  code: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 3,
    textAlign: 'center',
    paddingVertical: Spacing.three,
    borderRadius: 12,
  },
  card: {
    borderRadius: 14,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  fact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  photo: {
    width: '100%',
    height: 200,
    borderRadius: 12,
  },
  roles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  role: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
  },
  link: {
    alignSelf: 'center',
    paddingVertical: Spacing.two,
    minHeight: 44,
    justifyContent: 'center',
  },
});
