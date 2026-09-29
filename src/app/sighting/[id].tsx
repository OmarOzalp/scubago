import { Image } from 'expo-image';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BuddyVerification } from '@/components/buddy-verification';
import { OceanButton } from '@/components/ocean-button';
import { RarityChip } from '@/components/rarity-chip';
import { formatDate } from '@/components/sighting-row';
import { SpeciesAvatar } from '@/components/species-avatar';
import { StatusChip } from '@/components/status-chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Ocean } from '@/constants/palette';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CATALOG_BY_ID } from '@/lib/catalog';
import { canEditSighting } from '@/lib/sighting-edit';
import { useAllSites, useAppStore, useMyUserId } from '@/lib/store';
import { displayablePhoto } from '@/lib/sync';
import type { Sighting } from '@/lib/types';
import { isConnectionProblem, STATUS_EXPLANATION, statusOf } from '@/lib/verification';

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function SightingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const sites = useAllSites();
  const sighting = useAppStore((s) => s.sightings.find((x) => x.id === id));
  const myUserId = useMyUserId();
  const deleteSighting = useAppStore((s) => s.deleteSighting);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const species = sighting ? CATALOG_BY_ID.get(sighting.speciesId) : undefined;
  if (!sighting || !species) {
    return (
      <ThemedView style={styles.missing}>
        <Stack.Screen options={{ title: '' }} />
        <ThemedText>This sighting isn’t here any more.</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          It may have been deleted.
        </ThemedText>
      </ThemedView>
    );
  }

  const site = sites.find((s) => s.id === sighting.siteId);
  const mine = canEditSighting(sighting, myUserId);
  const status = statusOf(sighting);
  const photo = displayablePhoto(sighting, myUserId, process.env.EXPO_PUBLIC_SUPABASE_URL);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteSighting(sighting.id);
      router.back();
    } catch (e: any) {
      setError(e.message ?? 'Could not delete this sighting');
      setBusy(false);
    }
  };
  const confirmRemoval = () => {
    const message = `Your ${species.commonName} sighting will be removed from your log, your collection and community feeds. This can’t be undone.`;
    if (Platform.OS === 'web') {
      if (window.confirm(message)) remove();
      return;
    }
    Alert.alert('Delete this sighting?', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: remove },
    ]);
  };

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ title: species.commonName }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          onPress={() => router.push(`/species/${species.id}`)}
          accessibilityRole="button"
          accessibilityLabel={`About the ${species.commonName}`}
          style={[styles.header, { backgroundColor: theme.backgroundElement }]}>
          <SpeciesAvatar species={species} size={64} showRarityRing />
          <View style={{ flex: 1, gap: 2 }}>
            <ThemedText type="subtitle" style={{ fontSize: 22, lineHeight: 28 }}>
              {species.commonName}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={{ fontStyle: 'italic' }}>
              {species.scientificName}
            </ThemedText>
            <RarityChip rarity={species.rarity} small />
          </View>
          <ThemedText themeColor="textSecondary">›</ThemedText>
        </Pressable>

        {photo ? (
          <View style={{ gap: 4 }}>
            <Image source={{ uri: photo }} style={styles.photo} contentFit="cover" accessibilityLabel="Photo from the dive" />
            <ThemedText type="small" themeColor="textSecondary">
              {mine ? 'Your photo' : `Photo by @${sighting.username}`}
            </ThemedText>
          </View>
        ) : null}

        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <Fact label="Site">
            {site ? (
              <Pressable onPress={() => router.push(`/site/${site.id}`)} accessibilityRole="link" hitSlop={6}>
                <ThemedText type="smallBold" style={{ color: Ocean.primary }}>
                  {site.name} ›
                </ThemedText>
              </Pressable>
            ) : (
              <ThemedText type="small" themeColor="textSecondary">Unknown site</ThemedText>
            )}
          </Fact>
          <Fact label="Date">
            <ThemedText type="smallBold">{formatDate(sighting.sightedOn)}</ThemedText>
          </Fact>
          <Fact label="Dive">
            <ThemedText type="small" themeColor="textSecondary">Not linked to a dive (dive logs are coming)</ThemedText>
          </Fact>
        </View>

        {sighting.notes ? (
          <View style={{ gap: Spacing.one }}>
            <ThemedText type="smallBold">Notes</ThemedText>
            <ThemedText>{sighting.notes}</ThemedText>
          </View>
        ) : null}

        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <View style={styles.row}>
            <ThemedText type="smallBold">Verification</ThemedText>
            <StatusChip status={status} />
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {sighting.isDemo ? 'Example data: not a real sighting.' : STATUS_EXPLANATION[status]}
          </ThemedText>
          <ThemedText type="small">
            <ThemedText type="smallBold">Evidence</ThemedText>
            {'  '}
            {sighting.photoUri ? 'Photo attached' : 'No photo'}
          </ThemedText>
        </View>

        {mine && !sighting.isDemo ? <BuddyVerification sighting={sighting} speciesName={species.commonName} /> : null}

        <View style={{ gap: 2 }}>
          <ThemedText type="small" themeColor="textSecondary">
            {sighting.isDemo
              ? 'Example data generated for this build, not a diver’s report.'
              : `Logged by ${mine ? 'you' : `@${sighting.username}`} in ScubaGo on ${formatTimestamp(sighting.createdAt)}`}
            {sighting.updatedAt ? ` · edited ${formatTimestamp(sighting.updatedAt)}` : ''}
          </ThemedText>
          {mine ? <SyncLine sighting={sighting} /> : null}
        </View>

        {mine ? (
          <View style={{ gap: Spacing.two }}>
            <OceanButton
              title="Edit sighting"
              variant="secondary"
              disabled={busy}
              onPress={() => router.push({ pathname: '/log/new', params: { edit: sighting.id } })}
            />
            <Pressable onPress={confirmRemoval} disabled={busy} accessibilityRole="button" style={styles.delete}>
              <ThemedText type="small" style={{ color: DANGER, opacity: busy ? 0.4 : 1 }}>
                Delete sighting
              </ThemedText>
            </Pressable>
            {error ? (
              <ThemedText type="small" style={{ color: DANGER }}>
                {error}
              </ThemedText>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </ThemedView>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.factLabel}>
        {label}
      </ThemedText>
      <View style={{ flex: 1, alignItems: 'flex-end' }}>{children}</View>
    </View>
  );
}

/** Where the diver's change stands: saved here only, on its way, failing, or backed up. */
function SyncLine({ sighting }: { sighting: Sighting }) {
  const user = useAppStore((s) => s.user);
  const backendEnabled = useAppStore((s) => s.backendEnabled);
  const syncing = useAppStore((s) => s.syncing);
  const requestSync = useAppStore((s) => s.requestSync);

  if (!backendEnabled) {
    return <ThemedText type="small" themeColor="textSecondary">Saved on this device.</ThemedText>;
  }
  if (!user) {
    return (
      <Pressable onPress={() => router.push('/auth')} accessibilityRole="link">
        <ThemedText type="small" themeColor="textSecondary">
          Saved on this device only. <ThemedText type="small" style={{ color: Ocean.primary }}>Sign in to back it up ›</ThemedText>
        </ThemedText>
      </Pressable>
    );
  }
  if (sighting.synced) {
    return <ThemedText type="small" themeColor="textSecondary">✓ Backed up to your account</ThemedText>;
  }
  if (sighting.syncError && !syncing) {
    const offline = isConnectionProblem(sighting.syncError);
    return (
      <ThemedText type="small" themeColor="textSecondary" style={offline ? undefined : { color: DANGER }}>
        {offline
          ? 'Waiting for a connection. It will sync when you’re back online.'
          : `Couldn’t sync: ${sighting.syncError}. It will retry automatically.`}{' '}
        <ThemedText type="small" style={{ color: Ocean.primary }} onPress={() => void requestSync()}>
          Retry now
        </ThemedText>
      </ThemedText>
    );
  }
  return (
    <ThemedText type="small" themeColor="textSecondary">
      {syncing ? 'Syncing…' : 'Saved on this device, waiting to sync.'}
    </ThemedText>
  );
}

const DANGER = '#c0392b';

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    padding: Spacing.four,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: 16,
    padding: Spacing.three,
  },
  photo: {
    width: '100%',
    height: 240,
    borderRadius: 16,
  },
  card: {
    borderRadius: 14,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  factLabel: {
    width: 44,
  },
  delete: {
    alignSelf: 'center',
    paddingVertical: Spacing.two,
    minHeight: 44,
    justifyContent: 'center',
  },
});
