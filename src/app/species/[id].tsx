import { Image } from 'expo-image';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Disclosure } from '@/components/journal/disclosure';
import { Ledger } from '@/components/journal/ledger';
import { Paper, PaperButton } from '@/components/journal/paper';
import { Screen, SectionHeader } from '@/components/journal/screen';
import { Wash } from '@/components/journal/wash';
import { OceanButton } from '@/components/ocean-button';
import { RarityChip } from '@/components/rarity-chip';
import { ShareDiscoveryButton } from '@/components/share/share-buttons';
import { shortPhotoCredit } from '@/components/sightings/format';
import { openExternalUrl } from '@/components/sightings/open-external';
import { RaritySource } from '@/components/sightings/rarity-source';
import { SpeciesRecordsSection } from '@/components/sightings/species-records';
import { formatDate, SightingRow } from '@/components/sighting-row';
import { SpeciesArt } from '@/components/species-art';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, Type } from '@/constants/theme';
import { canonicalSiteId } from '@/data/sites';
import { useSchemeName, useTheme } from '@/hooks/use-theme';
import { announce } from '@/lib/announce';
import { CATALOG, CATALOG_BY_ID } from '@/lib/catalog';
import { confirmAction } from '@/lib/confirm';
import { CATEGORY_LABEL } from '@/lib/rarity';
import { rarityObservedNote, realRarityEntry } from '@/lib/real-rarity';
import { darken, lighten } from '@/lib/art-color';
import { artFor } from '@/lib/species-art';
import { useAllSites, useAppStore, useMyUserId, useSiteById } from '@/lib/store';
import { speciesMarineModel } from '@/lib/swimming';
import type { DiveSite, Species } from '@/lib/types';

/**
 * A species' page in the field guide: its plate, what it is, and the diver's own record of it (each of
 * their sightings, and a way to delete the whole log, which takes the animal off their islands). Tapping
 * an animal on an island opens it.
 */
/**
 * The web build pre-renders a page for every species in the catalogue, so each one's HTML matches
 * what the app draws for it (one shared page for all would not, and React would redraw it).
 */
export function generateStaticParams(): { id: string }[] {
  return CATALOG.map((s) => ({ id: s.id }));
}

export default function SpeciesDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const scheme = useSchemeName();
  const sites = useAllSites();
  // Any site a sighting names: the list on offer has only the listed ones, not a hidden or retired one logged at before.
  const siteById = useSiteById();
  const sightings = useAppStore((s) => s.sightings);
  const myUserId = useMyUserId();
  const user = useAppStore((s) => s.user);
  const deleteSpeciesLog = useAppStore((s) => s.deleteSpeciesLog);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The plate's inner width, measured: a phone's to begin with (the static web render has no window).
  const [plateWidth, setPlateWidth] = useState(320);

  const species = id ? CATALOG_BY_ID.get(id) : undefined;

  const speciesSightings = useMemo(
    () => sightings.filter((s) => s.speciesId === id),
    [sightings, id],
  );
  const mine = speciesSightings.filter((s) => s.userId === myUserId && !s.isDemo);

  /** Sites where this species has been seen, most sightings first; one logged at a hidden copy of a site counts at the site. */
  const seenAt = useMemo(() => {
    const bySite = new Map<string, { count: number; last: string }>();
    for (const s of speciesSightings) {
      const siteId = canonicalSiteId(s.siteId);
      const cur = bySite.get(siteId);
      if (cur) {
        cur.count++;
        if (s.sightedOn > cur.last) cur.last = s.sightedOn;
      } else {
        bySite.set(siteId, { count: 1, last: s.sightedOn });
      }
    }
    return [...bySite.entries()]
      .map(([siteId, stats]) => ({ site: siteById(siteId), ...stats }))
      .filter((x): x is { site: NonNullable<typeof x.site>; count: number; last: string } => !!x.site)
      .sort((a, b) => b.count - a.count);
  }, [speciesSightings, siteById]);
  // The sites the sightings name, for the share card to say where it was first seen.
  const sightingSites = useMemo(
    () => [...new Set(speciesSightings.map((s) => s.siteId))].map((siteId) => siteById(siteId)).filter((site): site is DiveSite => !!site),
    [speciesSightings, siteById],
  );

  if (!species) {
    return (
      <View style={[styles.missing, { backgroundColor: theme.background }]}>
        <View style={styles.missingArt}>
          <Wash width={112} height={78} color={theme.wash} seed={31} style={StyleSheet.absoluteFill} />
          <Icon name="fieldGuide" size={40} />
        </View>
        <ThemedText type="heading" style={styles.center}>
          Species not found.
        </ThemedText>
      </View>
    );
  }

  const seen = mine.length > 0;
  const { wash, seed } = artFor(species);
  const artWidth = Math.min(380, Math.round(plateWidth * 0.8));
  const artHeight = Math.round(artWidth * 0.64);
  const plateNumber = CATALOG.findIndex((s) => s.id === species.id) + 1;
  const firstSeen = seen ? formatDate([...mine].sort((a, b) => a.sightedOn.localeCompare(b.sightedOn))[0].sightedOn) : '';
  const mySites = new Set(mine.map((s) => canonicalSiteId(s.siteId))).size;
  // Where the tier comes from: the counts behind a real tier, or nothing when it is only ScubaGo's own estimate.
  const rarityEntry = realRarityEntry(species.id);
  const observedNote = rarityEntry ? rarityObservedNote(rarityEntry) : undefined;
  const newestFirst = [...mine].sort((a, b) => b.sightedOn.localeCompare(a.sightedOn) || b.createdAt.localeCompare(a.createdAt));

  const removeLog = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteSpeciesLog(species.id);
      announce(`${species.commonName} removed from your log`);
      setBusy(false);
      // Back to where the diver came from (an island, the field guide), where it has gone.
      if (router.canGoBack()) router.back();
    } catch (e: any) {
      const message = e.message ?? `Could not delete your ${species.commonName} log`;
      setError(message);
      announce(message);
      setBusy(false);
    }
  };
  const confirmRemoveLog = async () => {
    const n = mine.length;
    const ok = await confirmAction({
      title: `Delete your ${species.commonName} log?`,
      message: `${n === 1 ? `Your ${species.commonName} sighting` : `All ${n} of your ${species.commonName} sightings`} will be removed from your log, your collection and community feeds, and it will leave your island. Your dive pages stay. This can’t be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (ok) await removeLog();
  };

  return (
    <Screen>
      {/* The title stays for the browser tab; the header shows only the back arrow, as the page names itself below. */}
      <Stack.Screen options={{ title: species.commonName, headerTitle: '' }} />

      {/* The plate: painted once the diver has seen one, a pencil sketch until then. */}
      <Paper raised padded={false} style={styles.plateCard}>
        <View
          onLayout={(e) => setPlateWidth(Math.floor(e.nativeEvent.layout.width))}
          accessible
          accessibilityLabel={seen ? CATEGORY_LABEL[species.category] : `${CATEGORY_LABEL[species.category]}, not seen yet`}
          style={[
            styles.mount,
            seen
              ? { borderColor: theme.text, backgroundColor: `${wash}14` }
              : { borderColor: theme.rule, borderStyle: 'dashed' },
          ]}>
          <View style={styles.plateTop}>
            <ThemedText type="label">{CATEGORY_LABEL[species.category]}</ThemedText>
            {plateNumber > 0 ? (
              <ThemedText type="label" importantForAccessibility="no" accessibilityElementsHidden>
                No. {plateNumber}
              </ThemedText>
            ) : null}
          </View>
          <View style={[styles.art, { width: artWidth, height: artHeight }]}>
            {seen ? (
              <Wash
                width={artWidth + 36}
                height={artHeight + 20}
                color={scheme === 'dark' ? darken(wash, 0.35) : lighten(wash, 0.5)}
                seed={seed}
                opacity={0.55}
                style={{ position: 'absolute', left: -18, top: -6 }}
              />
            ) : null}
            <SpeciesArt species={species} width={artWidth} found={seen} />
          </View>
          {!seen ? (
            <ThemedText type="caption" themeColor="textSecondary" style={styles.pencilNote}>
              Not seen yet
            </ThemedText>
          ) : null}
        </View>

        <View style={styles.names}>
          <ThemedText type="display" accessibilityRole="header" style={styles.center}>
            {species.commonName}
          </ThemedText>
          <ThemedText type="caption" themeColor="textSecondary" style={styles.center}>
            {species.scientificName}
          </ThemedText>
          {/* The tag and the row that opens where it comes from, side by side. All of it is still here, with the link to Data & credits. */}
          <View style={styles.tags}>
            <Disclosure
              align="center"
              label="How rare?"
              hint="Shows where the rarity comes from"
              lead={
                // In a box of its own: the tag pins itself to the top of whatever row it is in.
                <View>
                  <RarityChip rarity={species.rarity} />
                </View>
              }>
              <View style={styles.raritySource}>
                <RaritySource entry={rarityEntry} onOpenCredits={() => router.push('/credits')} />
              </View>
            </Disclosure>
          </View>
        </View>
      </Paper>

      <ThemedText>{species.blurb}</ThemedText>

      {/* What the page is for comes first: the diver's own record and the way to add to it, or for an animal
          not seen yet the button to log it. The photo and the 3D view come after, so they never push it down. */}
      {seen ? (
        <>
          <SectionHeader title="In your log" />
          <Ledger
            items={[
              {
                value: String(mine.length),
                label: mine.length === 1 ? 'Sighting' : 'Sightings',
                accessibilityLabel: `In your log ${mine.length} ${mine.length === 1 ? 'time' : 'times'}`,
              },
              { value: firstSeen, label: 'First seen', accessibilityLabel: `First seen ${firstSeen}` },
              { value: String(mySites), label: mySites === 1 ? 'Site' : 'Sites' },
            ]}
          />
          {/* Each of the diver's sightings opens its own page, to edit or delete just that one. */}
          <View style={styles.mine}>
            {newestFirst.map((s) => (
              <SightingRow
                key={s.id}
                sighting={s}
                species={species}
                site={siteById(s.siteId)}
                pending={!!user && !s.synced}
                quiet
                onPress={() => router.push(`/sighting/${s.id}`)}
              />
            ))}
          </View>
          <OceanButton
            title="Log another sighting"
            variant="log"
            icon="plus"
            onPress={() =>
              router.push({ pathname: '/log/new', params: { speciesId: species.id } })
            }
          />
          <ShareDiscoveryButton species={species} sightings={sightings} sites={sightingSites} ownerId={myUserId} observedNote={observedNote} />
        </>
      ) : (
        <OceanButton
          title="I saw one! Log it"
          variant="log"
          icon="plus"
          onPress={() =>
            router.push({ pathname: '/log/new', params: { speciesId: species.id } })
          }
        />
      )}

      {species.photoUrl ? (
        <View style={styles.photoBlock}>
          {/* Mounted like a print pasted into the guide. */}
          <Paper padded={false} style={styles.print}>
            <PhotoPrint species={species} uri={species.photoUrl} />
          </Paper>
          {species.photoAttribution && species.photoSource ? (
            // The credit opens the photo's page, where its licence is stated (as CC BY asks).
            <Pressable
              onPress={() => void openExternalUrl(species.photoSource!)}
              accessibilityRole="link"
              accessibilityLabel={`Photo ${species.photoAttribution}`}
              accessibilityHint="Opens the photo on iNaturalist"
              style={styles.creditLink}>
              <ThemedText type="caption" themeColor="textSecondary" style={styles.credit}>
                Photo: {shortPhotoCredit(species.photoAttribution)} · iNaturalist ›
              </ThemedText>
            </Pressable>
          ) : species.photoAttribution ? (
            <ThemedText type="caption" themeColor="textSecondary" style={styles.credit}>
              Photo: {shortPhotoCredit(species.photoAttribution)} · iNaturalist
            </ThemedText>
          ) : null}
        </View>
      ) : null}

      {speciesMarineModel(species.id) && <OceanButton
        title={`See ${species.commonName.toLowerCase()} in 3D`}
        variant="secondary"
        icon="eye"
        onPress={() => router.push({ pathname: '/inspect', params: { species: species.id } })}
      />}

      {/* Only where it says something new: for an animal the diver has seen, one site is the sighting row above. */}
      {seenAt.length >= (seen ? 2 : 1) ? (
        <>
          <SectionHeader title="Where it’s been seen" />
          <View style={styles.sites}>
            {seenAt.map(({ site, count, last }) => (
              <SiteCard key={site.id} site={site} count={count} last={last} />
            ))}
          </View>
        </>
      ) : null}

      {/* Public records saved on this phone: kept apart from the diver's own sightings above, and read from the cache only. */}
      <SpeciesRecordsSection species={species} sites={sites} />

      {/* Set apart below a rule: deleting the log can't be undone. */}
      {seen ? (
        <View style={[styles.dangerZone, { borderTopColor: theme.rule }]}>
          <Pressable
            onPress={confirmRemoveLog}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={`Delete your ${species.commonName} log`}
            accessibilityHint="Removes every sighting of it you logged, and takes it off your island"
            aria-disabled={busy}
            style={({ pressed }) => [
              styles.delete,
              { borderColor: theme.danger, backgroundColor: pressed ? theme.backgroundSelected : 'transparent', opacity: busy ? 0.4 : 1 },
            ]}>
            <Icon name="trash" size={18} color={theme.danger} wash={theme.danger} washOpacity={0.15} />
            <ThemedText type="smallBold" themeColor="danger">
              Delete my {species.commonName} log
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

/**
 * The photo of the animal. The photo comes from iNaturalist, so it can fail (offline, or taken
 * down): then a plain box says so, rather than leaving an empty card in the middle of the page.
 */
function PhotoPrint({ species, uri }: { species: Species; uri: string }) {
  const theme = useTheme();
  // Which address failed, so a page that is reused for another species starts afresh.
  const [failed, setFailed] = useState<string>();
  if (failed === uri) {
    return (
      <View
        accessible
        accessibilityLabel={`Photo of a ${species.commonName}: couldn’t be loaded`}
        style={[styles.photo, styles.photoMissing, { backgroundColor: theme.backgroundSelected }]}>
        <Icon name="image" size={28} color={theme.textSecondary} />
        <ThemedText type="caption" themeColor="textSecondary" style={styles.center}>
          The photo couldn’t be loaded.
        </ThemedText>
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={styles.photo}
      contentFit="cover"
      accessibilityLabel={`Photo of a ${species.commonName}`}
      onError={() => setFailed(uri)}
    />
  );
}

/** A site this species has been seen at: how many times, and when last. */
function SiteCard({ site, count, last }: { site: DiveSite; count: number; last: string }) {
  const theme = useTheme();
  return (
    <PaperButton
      onPress={() => router.push(`/site/${site.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${site.name}, ${site.region}, ${site.country}: seen ${count} ${count === 1 ? 'time' : 'times'}, last on ${formatDate(last)}`}
      style={styles.site}>
      <View style={[styles.siteIcon, { backgroundColor: theme.backgroundSelected }]}>
        <Icon name="pin" size={22} />
      </View>
      <View style={styles.siteBody}>
        <Text numberOfLines={1} style={[styles.siteName, { color: theme.text }]}>
          {site.name}
        </Text>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {site.region}, {site.country}
        </ThemedText>
      </View>
      <View style={styles.siteStats}>
        <Text style={[styles.siteCount, { color: theme.text }]}>×{count}</Text>
        <ThemedText type="small" themeColor="textSecondary">
          last {formatDate(last)}
        </ThemedText>
      </View>
    </PaperButton>
  );
}

const styles = StyleSheet.create({
  center: {
    textAlign: 'center',
  },
  mine: {
    gap: Spacing.two,
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
  },
  // The plate, set in a fine frame like the island on Home.
  plateCard: {
    padding: 8,
    paddingBottom: 18,
    gap: 14,
  },
  mount: {
    borderWidth: 1,
    borderRadius: Radius.md + 4,
    paddingTop: 12,
    paddingBottom: 18,
    paddingHorizontal: 14,
    alignItems: 'center',
    gap: 10,
  },
  plateTop: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  art: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 6,
  },
  pencilNote: {
    textAlign: 'center',
    marginTop: -4,
  },
  names: {
    paddingHorizontal: 12,
    gap: 4,
  },
  tags: {
    alignSelf: 'stretch',
    alignItems: 'center',
    marginTop: 2,
  },
  raritySource: {
    alignItems: 'center',
  },
  photoBlock: {
    gap: 6,
  },
  print: {
    padding: 6,
  },
  photo: {
    width: '100%',
    height: 220,
    borderRadius: Radius.md,
  },
  photoMissing: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  // The credit is a link: a 44 pt strip to tap, not just its line of text.
  creditLink: {
    minHeight: 44,
    justifyContent: 'center',
  },
  credit: {
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 4,
  },
  sites: {
    gap: 10,
  },
  site: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  siteIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  siteBody: {
    flex: 1,
    gap: 1,
  },
  siteName: {
    fontFamily: Type.bodyHeavy,
    fontSize: 15,
    lineHeight: 20,
  },
  siteStats: {
    alignItems: 'flex-end',
    gap: 1,
  },
  siteCount: {
    fontFamily: Type.display,
    fontSize: 20,
    lineHeight: 24,
  },
});
