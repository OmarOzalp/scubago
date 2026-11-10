import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { RemoteSign } from '@/components/dive/remote-sign';
import { Icon } from '@/components/icon';
import { Seal } from '@/components/journal/stamp';
import { formatDate } from '@/components/sighting-row';
import { SpeciesAvatar } from '@/components/species-avatar';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { IconTile, ListRow } from '@/components/ui/list';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { Segmented } from '@/components/ui/segmented';
import { TextField } from '@/components/ui/text-field';
import { Radius, Space, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { announce } from '@/lib/announce';
import { CATALOG_BY_ID } from '@/lib/catalog';
import { isDiveCode, lookUpDiveCode, SIGN_OUTCOME_MESSAGE, type DivePreview } from '@/lib/dive-signature-api';
import { formatDiveNumber } from '@/lib/dives';
import { useAppStore, useSiteById } from '@/lib/store';
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
  const siteById = useSiteById();
  const [code, setCode] = useState(() => formatCode(typeof params.code === 'string' ? params.code : ''));
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
    return <Screen kind="modal" contentStyle={styles.centred}>
      <IconTile icon="verified" size={56} />
      <ThemedText style={styles.center}>Buddy verification needs a ScubaGo account, and this build has no server to sign in to.</ThemedText>
    </Screen>;
  }

  const species = preview ? CATALOG_BY_ID.get(preview.speciesId) : undefined;
  const speciesName = species?.commonName ?? preview?.speciesId ?? '';
  const siteName = preview ? (siteById(preview.siteId)?.name ?? preview.siteName ?? 'a dive site') : '';

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
  const diveSiteName = divePreview ? (siteById(divePreview.siteId)?.name ?? divePreview.siteName ?? 'a dive site') : '';

  if (signedDive && divePreview) {
    return <Screen kind="modal" contentStyle={styles.centred}>
      <Seal label="Signed" size={104} rotate={-8} animate />
      <ThemedText type="title" style={styles.center} accessibilityRole="header">Thanks for signing</ThemedText>
      <ThemedText style={styles.center}>
        {`Your signature is on @${divePreview.owner}’s ${formatDiveNumber(divePreview.number)} at ${diveSiteName}. It appears in their logbook when it next syncs.`}
      </ThemedText>
      <Button title="Done" onPress={close} style={styles.stretch} />
    </Screen>;
  }

  if (answered && preview) {
    const confirmed = answered.decision === 'saw_it';
    return <Screen kind="modal" contentStyle={styles.centred}>
      {/* Their answer has just gone in: a "yes" is sealed (stamped in, unless Reduce Motion is on). */}
      {confirmed ? <Seal label="Confirmed" size={104} rotate={-8} animate /> : <IconTile icon="checkCircle" size={56} />}
      <ThemedText type="title" style={styles.center} accessibilityRole="header">{confirmed ? 'Thanks for confirming' : 'Thanks for answering'}</ThemedText>
      <ThemedText style={styles.center}>
        {`Your answer is on @${preview.owner}’s ${speciesName} sighting`}
        {answered.status ? `, which now shows “${STATUS_LABEL[answered.status]}”.` : '.'}
      </ThemedText>
      <Button title="Done" onPress={close} style={styles.stretch} />
    </Screen>;
  }

  const complete = isCompleteCode(code);
  const photoUri = user && preview ? previewPhoto(preview, user.id) : undefined;

  return (
    <Screen kind="modal" scrollEnabled={!drawing}>
      <View style={styles.intro}>
        <IconTile icon="verified" size={56} />
        <ThemedText type="callout" themeColor="textSecondary" style={styles.center}>
          A buddy code lets you confirm what your buddy logged. Enter the one they sent you.
        </ThemedText>
      </View>

      {/* The code, big and spaced so it can be checked against the message it came in. */}
      <Card style={styles.ticket}>
        <TextField
          label="Code from your buddy"
          value={code}
          onChangeText={(text) => {
            setCode(formatCode(text));
            setPreview(null);
            setDivePreview(null);
            setProblem(null);
          }}
          placeholder="XXXXX-XXXXX"
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          returnKeyType="search"
          onSubmitEditing={() => {
            if (user && isCompleteCode(code) && !busy) void lookUp();
          }}
          inputStyle={styles.code}
        />

        {!user ? (
          <View style={styles.stack}>
            <ThemedText type="subhead" themeColor="textSecondary">
              Sign in first: your buddy will see your username next to your answer.
            </ThemedText>
            <Button title="Sign in" icon="account" onPress={() => router.push('/auth')} />
          </View>
        ) : !preview && !divePreview ? (
          <Button title={busy ? 'Looking it up…' : 'Look it up'} icon="search" disabled={busy || !complete} onPress={() => void lookUp()} />
        ) : null}
      </Card>

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
          {/* What the buddy logged, as a card from their logbook. */}
          <Card padded={false}>
            <View style={styles.previewHead}>
              {species ? <SpeciesAvatar species={species} size={64} showRarityRing /> : null}
              <View style={styles.flex}>
                <ThemedText type="title" numberOfLines={2}>{speciesName}</ThemedText>
                <ThemedText type="subhead" themeColor="textSecondary">Logged by @{preview.owner}</ThemedText>
              </View>
            </View>
            <Fact icon="pin" label="Site" value={siteName} />
            <Fact icon="calendar" label="Date" value={formatDate(preview.sightedOn)} />
            {preview.notes || photoUri ? (
              <View style={[styles.previewFoot, { borderTopColor: theme.rule }]}>
                {preview.notes ? <ThemedText type="callout">“{preview.notes}”</ThemedText> : null}
                {photoUri ? <Image source={{ uri: photoUri }} style={styles.photo} contentFit="cover" accessibilityLabel={`Photo by @${preview.owner}`} /> : null}
              </View>
            ) : null}
          </Card>

          {preview.answered ? (
            <Notice icon="checkCircle">
              You’ve already answered: you said you {preview.answered === 'saw_it' ? 'saw it too' : preview.answered === 'did_not_see' ? 'didn’t see it' : 'weren’t on this dive'}.
            </Notice>
          ) : (
            <>
              <Notice>
                Only say yes if you saw it yourself on this dive. @{preview.owner} will see your answer and your username.
              </Notice>
              <View style={styles.stack}>
                <ThemedText type="subheadStrong">On this dive, you were…</ThemedText>
                <Segmented
                  kind="choice"
                  accessibilityLabel="On this dive, you were"
                  options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
                  value={role}
                  onChange={setRole}
                />
                <ThemedText type="footnote" themeColor="textSecondary">
                  Shown as what you said. ScubaGo doesn’t check it.
                </ThemedText>
              </View>
              <View style={styles.stack}>
                <Button title="Yes, I saw it too" icon="check" disabled={busy} onPress={() => void answer('saw_it')} />
                <Button title="No, I didn’t see it" icon="close" variant="secondary" disabled={busy} onPress={() => void answer('did_not_see')} />
                <Button title="I wasn’t on this dive" variant="plain" size="md" disabled={busy} onPress={() => void answer('was_not_there')} />
              </View>
            </>
          )}
        </>
      ) : null}

      {problem ? (
        <View style={styles.problem}>
          <Icon name="warning" size={20} color={theme.danger} />
          <ThemedText type="subhead" themeColor="danger" accessibilityLiveRegion="polite" style={styles.flex}>{problem}</ThemedText>
        </View>
      ) : null}
    </Screen>
  );
}

/** A line of the preview: an icon tile, what it is, and the value. */
function Fact({ icon, label, value }: { icon: 'pin' | 'calendar'; label: string; value: string }) {
  return <ListRow separator leading={icon} title={value} titleLines={2} subtitle={label} accessibilityLabel={`${label}: ${value}`} />;
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
    paddingHorizontal: Space.s4,
  },
  intro: {
    alignItems: 'center',
    gap: Space.s3,
    paddingHorizontal: Space.s2,
  },
  ticket: {
    gap: Space.s4,
  },
  code: {
    // The code reads as it does where it was made (the ticket on the buddy's page): typewriter letters.
    ...TypeScale.ticket,
    textAlign: 'center',
    minHeight: 64,
  },
  stack: {
    gap: Space.s3,
  },
  previewHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s4,
    padding: Space.s4,
  },
  previewFoot: {
    gap: Space.s3,
    padding: Space.s4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  photo: {
    width: '100%',
    height: 200,
    borderRadius: Radius.md,
  },
  problem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.s2,
  },
});
