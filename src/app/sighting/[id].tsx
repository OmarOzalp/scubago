import { Image } from 'expo-image';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BuddyVerification } from '@/components/buddy-verification';
import { Icon, type IconName } from '@/components/icon';
import { Paper, PaperButton } from '@/components/journal/paper';
import { Screen } from '@/components/journal/screen';
import { Wash } from '@/components/journal/wash';
import { OceanButton } from '@/components/ocean-button';
import { RarityChip } from '@/components/rarity-chip';
import { formatEntryDate } from '@/components/sighting-row';
import { SpeciesAvatar } from '@/components/species-avatar';
import { StatusChip } from '@/components/status-chip';
import { SyncLine } from '@/components/sync-line';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, Type } from '@/constants/theme';
import { usePhotoUrl } from '@/hooks/use-photo-url';
import { useSchemeName, useTheme } from '@/hooks/use-theme';
import { announce } from '@/lib/announce';
import { UNLISTED_ID, speciesForSighting } from '@/lib/catalog';
import { confirmAction } from '@/lib/confirm';
import { formatDiveNumber } from '@/lib/dives';
import { isPrivateSighting, privacySummary, sharesNotes, sharesPhoto } from '@/lib/privacy';
import { canEditSighting } from '@/lib/sighting-edit';
import { useAppStore, useMyUserId, useSiteById } from '@/lib/store';
import { displayablePhoto } from '@/lib/sync';
import type { SightingStatus } from '@/lib/types';
import { STATUS_COLOR, STATUS_EXPLANATION, STATUS_TEXT, statusOf } from '@/lib/verification';

/** The mark beside each verification status. */
const STATUS_ICON: Record<SightingStatus, IconName> = {
  unverified: 'info',
  evidence_submitted: 'clock',
  confirmed: 'verified',
  accepted: 'verified',
  rejected: 'warning',
  disputed: 'warning',
};

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** One page of the logbook: what was seen, when and where, who can see it, and who has confirmed it. */
export default function SightingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const scheme = useSchemeName();
  const siteById = useSiteById();
  const sighting = useAppStore((s) => s.sightings.find((x) => x.id === id));
  // Only the diver's own pages are ever on the phone.
  const dive = useAppStore((s) => (sighting?.diveId ? s.dives.find((d) => d.id === sighting.diveId) : undefined));
  const myUserId = useMyUserId();
  const deleteSighting = useAppStore((s) => s.deleteSighting);
  const backendEnabled = useAppStore((s) => s.backendEnabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A private photo is shown through a short-lived link (only its owner can get one).
  const photo = usePhotoUrl(sighting ? displayablePhoto(sighting, myUserId, process.env.EXPO_PUBLIC_SUPABASE_URL) : undefined);

  const species = sighting ? speciesForSighting(sighting) : undefined;
  if (!sighting || !species) {
    return (
      <View style={[styles.missing, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: '' }} />
        <View style={styles.missingArt}>
          <Wash width={112} height={78} color={theme.wash} seed={23} style={StyleSheet.absoluteFill} />
          <Icon name="logbook" size={40} />
        </View>
        <ThemedText type="heading" style={styles.center}>
          This sighting isn’t here any more.
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          It may have been deleted.
        </ThemedText>
      </View>
    );
  }

  const site = siteById(sighting.siteId);
  const mine = canEditSighting(sighting, myUserId);
  const status = statusOf(sighting);
  const unlisted = sighting.speciesId === UNLISTED_ID;
  const entryDate = formatEntryDate(sighting.sightedOn);
  const photoPrivate = mine && backendEnabled && !sharesPhoto(sighting);
  const notesPrivate = mine && backendEnabled && !sharesNotes(sighting);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteSighting(sighting.id);
      router.back();
    } catch (e: any) {
      const message = e.message ?? 'Could not delete this sighting';
      setError(message);
      announce(message);
      setBusy(false);
    }
  };
  const confirmRemoval = async () => {
    const ok = await confirmAction({
      title: 'Delete this sighting?',
      message: `Your ${species.commonName} sighting will be removed from your log, your collection and community feeds. This can’t be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (ok) await remove();
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: species.commonName }} />

      {/* The top of the page, as in a paper logbook: the day, then the site. */}
      <View style={styles.entryHead}>
        <View accessible accessibilityRole="header" accessibilityLabel={`Logbook entry, ${entryDate}`} style={styles.entryTitles}>
          <ThemedText type="label">Logbook entry</ThemedText>
          <ThemedText type="heading">{entryDate}</ThemedText>
        </View>
        {site ? (
          <Pressable
            onPress={() => router.push(`/site/${site.id}`)}
            accessibilityRole="link"
            accessibilityLabel={`Site: ${site.name}`}
            style={({ pressed }) => [styles.siteLink, { opacity: pressed ? 0.6 : 1 }]}>
            <Icon name="pin" size={20} color={theme.tint} />
            <ThemedText type="smallBold" themeColor="tint" style={styles.shrink}>
              {site.name} ›
            </ThemedText>
          </Pressable>
        ) : (
          <View style={styles.siteLink}>
            <Icon name="pin" size={20} color={theme.textSecondary} wash={theme.textSecondary} washOpacity={0.2} />
            <ThemedText type="small" themeColor="textSecondary">
              Unknown site
            </ThemedText>
          </View>
        )}
        <View style={[styles.rule, { backgroundColor: theme.rule }]} />
      </View>

      {/* "Something else" has no species page: it isn't in the catalogue. */}
      <PaperButton
        onPress={unlisted ? undefined : () => router.push(`/species/${species.id}`)}
        disabled={unlisted}
        accessibilityRole={unlisted ? 'header' : 'button'}
        accessibilityLabel={unlisted ? `${species.commonName}, not in the catalogue` : `${species.commonName}. About this species`}
        style={styles.speciesCard}>
        <SpeciesAvatar species={species} size={84} showRarityRing={!unlisted} />
        <View style={styles.speciesText}>
          <Text style={[styles.speciesName, { color: theme.text }]}>{species.commonName}</Text>
          <ThemedText type="caption" themeColor="textSecondary">
            {species.scientificName}
          </ThemedText>
          {unlisted ? null : (
            <View style={styles.speciesTag}>
              <RarityChip rarity={species.rarity} small />
            </View>
          )}
        </View>
        {unlisted ? null : <Icon name="chevronRight" size={18} color={theme.textSecondary} weight="bold" />}
      </PaperButton>

      {photo ? (
        <View style={styles.photoBlock}>
          {/* Pasted in like a print. */}
          <Paper padded={false} style={styles.print}>
            <Image source={{ uri: photo }} style={styles.photo} contentFit="cover" accessibilityLabel="Photo from the dive" />
          </Paper>
          <View style={styles.photoCaption}>
            <Icon name={photoPrivate ? 'lock' : 'camera'} size={16} color={theme.textSecondary} wash={theme.textSecondary} washOpacity={0.2} />
            <ThemedText type="caption" themeColor="textSecondary" style={styles.flex}>
              {mine ? (photoPrivate ? 'Your photo · only you can see it' : 'Your photo') : `Photo by @${sighting.username}`}
            </ThemedText>
          </View>
        </View>
      ) : null}

      {sighting.notes ? (
        <View style={styles.block}>
          <View style={styles.labelRow}>
            <Icon name={notesPrivate ? 'lock' : 'notes'} size={18} color={theme.textSecondary} wash={theme.textSecondary} washOpacity={0.2} />
            <ThemedText type="label" accessibilityRole="header" style={styles.flex}>
              {notesPrivate ? 'Notes · only you can see them' : 'Notes'}
            </ThemedText>
          </View>
          <Paper tone="sand">
            <ThemedText>{sighting.notes}</ThemedText>
          </Paper>
        </View>
      ) : null}

      {/* Dives are private to their diver: only the owner sees which page a sighting is on. */}
      {mine ? (
        <Paper padded={false}>
          {dive ? (
            <Pressable onPress={() => router.push(`/dive/${dive.id}`)} accessibilityRole="link" accessibilityLabel={`On dive ${dive.number}. Open the page`}>
              {({ pressed }) => (
                <View style={{ opacity: pressed ? 0.6 : 1 }}>
                  <Fact icon="logbook" label="Dive">
                    <ThemedText type="smallBold" themeColor="tint">
                      {formatDiveNumber(dive.number)} · open the page ›
                    </ThemedText>
                  </Fact>
                </View>
              )}
            </Pressable>
          ) : (
            <Fact icon="logbook" label="Dive">
              <ThemedText type="small" themeColor="textSecondary">
                Not on a page of your log yet.
              </ThemedText>
            </Fact>
          )}
          {backendEnabled ? (
          <Fact icon={isPrivateSighting(sighting) ? 'lock' : 'everyone'} label="Who can see this" ruled>
            <ThemedText type="smallBold">{privacySummary(sighting)}</ThemedText>
            {isPrivateSighting(sighting) && !unlisted ? (
              <ThemedText type="small" themeColor="textSecondary">
                Only you can see this sighting. If you ask a buddy to confirm it, they’ll see the species, site and date, never your notes
                or photo.
              </ThemedText>
            ) : null}
          </Fact>
          ) : null}
        </Paper>
      ) : null}

      <Paper style={styles.verification}>
        <View style={styles.verificationHead}>
          <Icon name={STATUS_ICON[status]} size={24} color={STATUS_TEXT[scheme][status]} wash={STATUS_COLOR[status]} washOpacity={0.35} />
          <ThemedText type="label" accessibilityRole="header" style={styles.flex}>
            Verification
          </ThemedText>
          <StatusChip status={status} />
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {sighting.isDemo ? 'Example data: not a real sighting.' : STATUS_EXPLANATION[status]}
        </ThemedText>
        <View style={[styles.evidence, { borderTopColor: theme.rule }]}>
          <Icon name={sighting.photoUri ? 'camera' : 'image'} size={18} color={theme.textSecondary} wash={theme.textSecondary} washOpacity={0.2} />
          <ThemedText type="small" style={styles.flex}>
            <ThemedText type="smallBold">Evidence</ThemedText>
            {'  '}
            {sighting.photoUri ? 'Photo attached' : 'No photo'}
          </ThemedText>
        </View>
      </Paper>

      {mine && !sighting.isDemo && !unlisted ? <BuddyVerification sighting={sighting} speciesName={species.commonName} /> : null}

      <View style={styles.colophon}>
        <ThemedText type="caption" themeColor="textSecondary">
          {sighting.isDemo
            ? 'Example data generated for this build, not a diver’s report.'
            : `Logged by ${mine ? 'you' : `@${sighting.username}`} in ScubaGo on ${formatTimestamp(sighting.createdAt)}`}
          {sighting.updatedAt ? ` · edited ${formatTimestamp(sighting.updatedAt)}` : ''}
        </ThemedText>
        {mine ? <SyncLine item={sighting} /> : null}
      </View>

      {mine ? (
        <OceanButton
          title="Edit sighting"
          variant="secondary"
          icon="edit"
          disabled={busy}
          onPress={() => router.push({ pathname: '/log/new', params: { edit: sighting.id } })}
        />
      ) : null}

      {/* Set apart below a rule: deleting can't be undone. */}
      {mine ? (
        <View style={[styles.dangerZone, { borderTopColor: theme.rule }]}>
          <Pressable
            onPress={confirmRemoval}
            disabled={busy}
            accessibilityRole="button"
            aria-disabled={busy}
            style={({ pressed }) => [
              styles.delete,
              { borderColor: theme.danger, backgroundColor: pressed ? theme.backgroundSelected : 'transparent', opacity: busy ? 0.4 : 1 },
            ]}>
            <Icon name="trash" size={18} color={theme.danger} wash={theme.danger} washOpacity={0.15} />
            <ThemedText type="smallBold" themeColor="danger">
              Delete sighting
            </ThemedText>
          </Pressable>
          {error ? (
            <ThemedText type="small" themeColor="danger" accessibilityLiveRegion="polite" style={styles.center}>
              {error}
            </ThemedText>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

/** A ruled line of the entry: an icon, a typewriter label, and what goes there. */
function Fact({ icon, label, ruled = false, children }: { icon: IconName; label: string; ruled?: boolean; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.fact, ruled && { borderTopWidth: 1, borderTopColor: theme.rule }]}>
      <Icon name={icon} size={20} color={theme.textSecondary} wash={theme.textSecondary} washOpacity={0.2} style={styles.factIcon} />
      <View style={styles.factBody}>
        <ThemedText type="label">{label}</ThemedText>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  shrink: {
    flexShrink: 1,
  },
  center: {
    textAlign: 'center',
  },
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
  },
  missingArt: {
    width: 112,
    height: 78,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  entryHead: {
    gap: 2,
  },
  entryTitles: {
    gap: 2,
  },
  siteLink: {
    alignSelf: 'flex-start',
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rule: {
    height: 1,
    marginTop: 4,
  },
  speciesCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 12,
    paddingRight: 14,
  },
  speciesText: {
    flex: 1,
    gap: 2,
  },
  speciesName: {
    fontFamily: Type.display,
    fontSize: 24,
    lineHeight: 29,
  },
  speciesTag: {
    flexDirection: 'row',
    marginTop: 4,
  },
  photoBlock: {
    gap: 6,
  },
  print: {
    padding: 6,
  },
  photo: {
    width: '100%',
    height: 240,
    borderRadius: Radius.md,
  },
  photoCaption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
  },
  block: {
    gap: 8,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fact: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  factIcon: {
    marginTop: 1,
  },
  factBody: {
    flex: 1,
    gap: 3,
  },
  verification: {
    gap: 10,
  },
  verificationHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  evidence: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    paddingTop: 10,
  },
  colophon: {
    gap: 2,
  },
  dangerZone: {
    borderTopWidth: 1,
    paddingTop: Spacing.four,
    marginTop: Spacing.two,
    alignItems: 'center',
    gap: Spacing.two,
  },
  delete: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
    borderWidth: 1.5,
    borderRadius: Radius.md,
  },
});
