import { Image } from 'expo-image';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Ledger } from '@/components/journal/ledger';
import { Paper, PaperButton } from '@/components/journal/paper';
import { Screen, SectionHeader } from '@/components/journal/screen';
import { Wash } from '@/components/journal/wash';
import { OceanButton } from '@/components/ocean-button';
import { RarityChip } from '@/components/rarity-chip';
import { ShareDiscoveryButton } from '@/components/share/share-buttons';
import { formatDate, SightingRow } from '@/components/sighting-row';
import { SpeciesArt } from '@/components/species-art';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useSchemeName, useTheme } from '@/hooks/use-theme';
import { announce } from '@/lib/announce';
import { CATALOG, CATALOG_BY_ID } from '@/lib/catalog';
import { confirmAction } from '@/lib/confirm';
import { CATEGORY_LABEL } from '@/lib/rarity';
import { darken, lighten } from '@/lib/art-color';
import { artFor } from '@/lib/species-art';
import { useAllSites, useAppStore, useMyUserId } from '@/lib/store';
import { speciesMarineModel } from '@/lib/swimming';
import type { DiveSite } from '@/lib/types';

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

  /** Sites where this species has been seen, most sightings first. */
  const seenAt = useMemo(() => {
    const bySite = new Map<string, { count: number; last: string }>();
    for (const s of speciesSightings) {
      const cur = bySite.get(s.siteId);
      if (cur) {
        cur.count++;
        if (s.sightedOn > cur.last) cur.last = s.sightedOn;
      } else {
        bySite.set(s.siteId, { count: 1, last: s.sightedOn });
      }
    }
    return [...bySite.entries()]
      .map(([siteId, stats]) => ({ site: sites.find((x) => x.id === siteId), ...stats }))
      .filter((x): x is { site: NonNullable<typeof x.site>; count: number; last: string } => !!x.site)
      .sort((a, b) => b.count - a.count);
  }, [speciesSightings, sites]);

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
  const mySites = new Set(mine.map((s) => s.siteId)).size;
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
      <Stack.Screen options={{ title: species.commonName }} />

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
          <View style={styles.tags}>
            <RarityChip rarity={species.rarity} />
          </View>
        </View>
      </Paper>

      <ThemedText>{species.blurb}</ThemedText>

      {species.photoUrl ? (
        <View style={styles.photoBlock}>
          {/* Mounted like a print pasted into the guide. */}
          <Paper padded={false} style={styles.print}>
            <Image source={{ uri: species.photoUrl }} style={styles.photo} contentFit="cover" accessibilityLabel={`Photo of a ${species.commonName}`} />
          </Paper>
          {species.photoAttribution ? (
            <ThemedText type="caption" themeColor="textSecondary" style={styles.credit}>
              {species.photoAttribution} · iNaturalist
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
                site={sites.find((x) => x.id === s.siteId)}
                pending={!!user && !s.synced}
                onPress={() => router.push(`/sighting/${s.id}`)}
              />
            ))}
          </View>
          <ShareDiscoveryButton species={species} sightings={sightings} sites={sites} ownerId={myUserId} />
          <OceanButton
            title="Log another sighting"
            variant="secondary"
            icon="plus"
            onPress={() =>
              router.push({ pathname: '/log/new', params: { speciesId: species.id } })
            }
          />
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

      <SectionHeader title="Where it’s been seen" />
      {seenAt.length === 0 ? (
        <View style={[styles.empty, { borderColor: theme.rule }]}>
          <Icon name="binoculars" size={26} color={theme.textSecondary} />
          <ThemedText type="caption" themeColor="textSecondary" style={styles.center}>
            No logged sightings yet — it’s out there somewhere.
          </ThemedText>
        </View>
      ) : (
        <View style={styles.sites}>
          {seenAt.map(({ site, count, last }) => (
            <SiteCard key={site.id} site={site} count={count} last={last} />
          ))}
        </View>
      )}

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
          <ThemedText type="caption" themeColor="textSecondary" style={styles.center}>
            {mine.length === 1 ? 'Your sighting goes' : `All ${mine.length} of your sightings go`}, and it leaves your island.
          </ThemedText>
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
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 6,
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
  credit: {
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 4,
  },
  empty: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: Radius.lg,
    padding: 20,
    alignItems: 'center',
    gap: 8,
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
