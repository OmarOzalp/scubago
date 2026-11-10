import { Image } from 'expo-image';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { BuddyVerification } from '@/components/buddy-verification';
import { Icon, type IconName } from '@/components/icon';
import { Disclosure } from '@/components/journal/disclosure';
import { RarityChip } from '@/components/rarity-chip';
import { formatEntryDate } from '@/components/sighting-row';
import { SpeciesAvatar } from '@/components/species-avatar';
import { StatusChip } from '@/components/status-chip';
import { SyncLine, useSyncLineShown } from '@/components/sync-line';
import { Card } from '@/components/ui/card';
import { IconButton } from '@/components/ui/icon-button';
import { List, ListRow } from '@/components/ui/list';
import { MoreMenu } from '@/components/ui/more-menu';
import { EmptyState } from '@/components/ui/notice';
import { Screen, ScreenTitle } from '@/components/ui/screen';
import { Size, Space, TypeScale } from '@/constants/theme';
import { usePhotoUrl } from '@/hooks/use-photo-url';
import { useTheme } from '@/hooks/use-theme';
import { announce } from '@/lib/announce';
import { UNLISTED_ID, speciesForSighting } from '@/lib/catalog';
import { confirmAction } from '@/lib/confirm';
import { formatDiveNumber } from '@/lib/dives';
import { leave } from '@/lib/leave';
import { isPrivateSighting, privacySummary, sharesNotes, sharesPhoto } from '@/lib/privacy';
import { canEditSighting, localIsoDate } from '@/lib/sighting-edit';
import { useAppStore, useMyUserId, useSiteById } from '@/lib/store';
import { displayablePhoto } from '@/lib/sync';
import type { Sighting, SightingStatus } from '@/lib/types';
import { STATUS_EXPLANATION, statusOf } from '@/lib/verification';

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

/**
 * The line at the foot about when the page was written. The diver's own, written on the day they saw it
 * and never changed, says nothing (the day is the page's title); otherwise: "Logged Oct 5, 2026 · edited
 * Oct 6, 2026". Another diver's says who logged it.
 */
function colophonText(sighting: Pick<Sighting, 'isDemo' | 'sightedOn' | 'createdAt' | 'updatedAt' | 'username'>, mine: boolean): string {
  if (sighting.isDemo) return 'Example data generated for this build, not a diver’s report.';
  const edited = sighting.updatedAt ? `edited ${formatTimestamp(sighting.updatedAt)}` : null;
  if (!mine) return [`Logged by @${sighting.username} in ScubaGo on ${formatTimestamp(sighting.createdAt)}`, edited].filter(Boolean).join(' · ');
  const later = localIsoDate(new Date(sighting.createdAt)) !== sighting.sightedOn ? `Logged ${formatTimestamp(sighting.createdAt)}` : null;
  const parts = [later, edited].filter((part): part is string => !!part);
  return parts.join(' · ').replace(/^./, (c) => c.toUpperCase());
}

/** One page of the logbook: what was seen, when and where, who can see it, and who has confirmed it. Edit is in the header, in reach from the top of the page. */
export default function SightingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const siteById = useSiteById();
  const live = useAppStore((s) => s.sightings.find((x) => x.id === id));
  // Deleted from this page: it goes on showing the sighting while it closes, rather than "This sighting isn't
  // here any more" sliding away (the store has dropped it before the navigator has taken the page down).
  const [leaving, setLeaving] = useState<Sighting | null>(null);
  const sighting = live ?? leaving ?? undefined;
  // Only the diver's own pages are ever on the phone.
  const dive = useAppStore((s) => (sighting?.diveId ? s.dives.find((d) => d.id === sighting.diveId) : undefined));
  const myUserId = useMyUserId();
  const deleteSighting = useAppStore((s) => s.deleteSighting);
  const backendEnabled = useAppStore((s) => s.backendEnabled);
  // Whether the sync line has anything to say (signed out, it says nothing: the Logbook's banner does).
  const syncShown = useSyncLineShown();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A private photo is shown through a short-lived link (only its owner can get one).
  const photo = usePhotoUrl(sighting ? displayablePhoto(sighting, myUserId, process.env.EXPO_PUBLIC_SUPABASE_URL) : undefined);

  const species = sighting ? speciesForSighting(sighting) : undefined;
  if (!sighting || !species) {
    return (
      <Screen contentStyle={styles.missing}>
        <Stack.Screen options={{ title: '' }} />
        <EmptyState icon="logbook" title="This sighting isn’t here any more." message="It may have been deleted." />
      </Screen>
    );
  }

  const site = siteById(sighting.siteId);
  const mine = canEditSighting(sighting, myUserId);
  const status = statusOf(sighting);
  const unlisted = sighting.speciesId === UNLISTED_ID;
  const entryDate = formatEntryDate(sighting.sightedOn);
  const photoPrivate = mine && backendEnabled && !sharesPhoto(sighting);
  const notesPrivate = mine && backendEnabled && !sharesNotes(sighting);
  // When it was written down, said only where it adds something: the date above is the day it was seen.
  const colophon = colophonText(sighting, mine);

  const remove = async () => {
    setBusy(true);
    setError(null);
    setLeaving(sighting);
    try {
      await deleteSighting(sighting.id);
      // Back where the diver came from; opened straight from a link, to its page (or the logbook).
      leave(sighting.diveId ? `/dive/${sighting.diveId}` : '/logbook');
    } catch (e: any) {
      const message = e.message ?? 'Could not delete this sighting';
      setLeaving(null);
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
      <Stack.Screen
        options={{
          // The title stays for the browser tab; the header shows only the back arrow (and Edit), as the page names itself below.
          title: species.commonName,
          headerTitle: '',
          headerRight: mine
            ? () => (
              <View style={styles.headerActions}>
                <IconButton icon="edit" accessibilityLabel="Edit sighting" disabled={busy} onPress={() => !busy && router.push({ pathname: '/log/new', params: { edit: sighting.id } })} />
                <MoreMenu
                  accessibilityLabel="More actions for this sighting"
                  disabled={busy}
                  items={[{ label: 'Delete sighting', icon: 'trash', destructive: true, onPress: () => void confirmRemoval() }]}
                />
              </View>
            )
            : undefined,
        }}
      />

      {/* The top of the page, as in a paper logbook: the day, then the site. */}
      <View style={styles.entryHead}>
        <ScreenTitle title={entryDate} />
        {site ? (
          <Pressable
            onPress={() => router.push(`/site/${site.id}`)}
            accessibilityRole="link"
            accessibilityLabel={`Site: ${site.name}`}
            style={({ pressed }) => [styles.siteLink, { opacity: pressed ? 0.6 : 1 }]}>
            <Icon name="pin" size={18} color={theme.tint} />
            <Text style={[TypeScale.subheadStrong, styles.shrink, { color: theme.tint }]}>{site.name} ›</Text>
          </Pressable>
        ) : (
          <View style={styles.siteLink}>
            <Icon name="pin" size={18} color={theme.textSecondary} />
            <Text style={[TypeScale.subhead, { color: theme.textSecondary }]}>Unknown site</Text>
          </View>
        )}
      </View>

      {/* "Something else" has no species page: it isn't in the catalogue. */}
      <Card
        onPress={unlisted ? undefined : () => router.push(`/species/${species.id}`)}
        accessibilityRole={unlisted ? 'header' : 'button'}
        accessibilityLabel={unlisted ? `${species.commonName}, not in the catalogue` : `${species.commonName}. About this species`}
        style={styles.speciesCard}>
        <SpeciesAvatar species={species} size={84} showRarityRing={!unlisted} />
        <View style={styles.speciesText}>
          <Text style={[TypeScale.title, { color: theme.text }]}>{species.commonName}</Text>
          <Text style={[TypeScale.scientific, { color: theme.textSecondary }]}>{species.scientificName}</Text>
          {unlisted ? null : (
            <View style={styles.speciesTag}>
              <RarityChip rarity={species.rarity} small />
            </View>
          )}
        </View>
        {unlisted ? null : <Icon name="chevronRight" size={16} color={theme.textTertiary} weight="bold" />}
      </Card>

      {photo ? (
        <View style={styles.photoBlock}>
          <Card padded={false} style={styles.print}>
            <Image source={{ uri: photo }} style={styles.photo} contentFit="cover" accessibilityLabel="Photo from the dive" />
          </Card>
          <View style={styles.photoCaption}>
            <Icon name={photoPrivate ? 'lock' : 'camera'} size={16} color={theme.textSecondary} />
            <Text style={[TypeScale.footnote, styles.flex, { color: theme.textSecondary }]}>
              {mine ? (photoPrivate ? 'Your photo · only you can see it' : 'Your photo') : `Photo by @${sighting.username}`}
            </Text>
          </View>
        </View>
      ) : null}

      {sighting.notes ? (
        <Card style={styles.notes}>
          <View style={styles.labelRow}>
            <Icon name={notesPrivate ? 'lock' : 'notes'} size={16} color={theme.textSecondary} />
            <Text accessibilityRole="header" style={[TypeScale.footnoteStrong, styles.flex, { color: theme.textSecondary }]}>
              {notesPrivate ? 'Notes · only you can see them' : 'Notes'}
            </Text>
          </View>
          <Text style={[TypeScale.body, { color: theme.text }]}>{sighting.notes}</Text>
        </Card>
      ) : null}

      {/* One card of up to three rows: the page, who sees it, and where it stands. What each means waits behind one row below. */}
      <List>
        {/* Dives are private to their diver: only the owner sees which page a sighting is on. */}
        {mine ? (
          dive ? (
            <ListRow
              leading="logbook"
              title="Dive"
              subtitle={`${formatDiveNumber(dive.number)} · open the page ›`}
              accessibilityRole="link"
              accessibilityLabel={`On dive ${dive.number}. Open the page`}
              onPress={() => router.push(`/dive/${dive.id}`)}
            />
          ) : (
            <ListRow leading="logbook" title="Dive" subtitle="Not on a page of your log yet." />
          )
        ) : null}
        {mine && backendEnabled ? <ListRow leading={isPrivateSighting(sighting) ? 'lock' : 'everyone'} title="Visible to" subtitle={privacySummary(sighting)} /> : null}
        <ListRow
          leading={STATUS_ICON[status]}
          title="Status"
          below={
            <View style={styles.statusLine}>
              <StatusChip status={status} />
              <Text style={[TypeScale.subhead, { color: theme.textSecondary }]}>{sighting.photoUri ? 'Photo attached' : 'No photo'}</Text>
            </View>
          }
        />
      </List>
      <Disclosure label="What does this mean?" hint="Explains who can see this and what the status means">
        <View style={styles.meaning}>
          {mine && backendEnabled && isPrivateSighting(sighting) && !unlisted ? (
            <Text style={[TypeScale.subhead, { color: theme.textSecondary }]}>
              Only you can see this sighting. If you ask a buddy to confirm it, they’ll see the species, site and date, never your notes or
              photo.
            </Text>
          ) : null}
          <Text style={[TypeScale.subhead, { color: theme.textSecondary }]}>{sighting.isDemo ? 'Example data: not a real sighting.' : STATUS_EXPLANATION[status]}</Text>
        </View>
      </Disclosure>

      {mine && !sighting.isDemo && !unlisted ? <BuddyVerification sighting={sighting} speciesName={species.commonName} /> : null}

      {colophon || (mine && syncShown) ? (
        <View style={styles.colophon}>
          {colophon ? <Text style={[TypeScale.footnote, { color: theme.textSecondary }]}>{colophon}</Text> : null}
          {mine ? <SyncLine item={sighting} /> : null}
        </View>
      ) : null}

      {error ? (
        <Text accessibilityLiveRegion="polite" style={[TypeScale.subhead, styles.center, { color: theme.danger }]}>
          {error}
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  center: { textAlign: 'center' },
  // The web's header has no margin at its right end (a phone's has its own).
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Space.s2, paddingRight: Platform.OS === 'web' ? Space.s4 : 0 },
  missing: { flexGrow: 1, justifyContent: 'center' },
  entryHead: { gap: Space.s1 },
  siteLink: { alignSelf: 'flex-start', minHeight: Size.hit, flexDirection: 'row', alignItems: 'center', gap: Space.s2 },
  speciesCard: { flexDirection: 'row', alignItems: 'center', gap: Space.s4 },
  speciesText: { flex: 1, gap: 2 },
  speciesTag: { flexDirection: 'row', marginTop: Space.s1 },
  photoBlock: { gap: Space.s2 },
  print: { overflow: 'hidden' },
  photo: { width: '100%', height: 240 },
  photoCaption: { flexDirection: 'row', alignItems: 'center', gap: Space.s2, paddingHorizontal: Space.s1 },
  notes: { gap: Space.s2 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: Space.s2 },
  statusLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: Space.s2, rowGap: 2, marginTop: Space.s1 },
  meaning: { gap: Space.s2, paddingBottom: Space.s1 },
  colophon: { gap: Space.s1 },
});
