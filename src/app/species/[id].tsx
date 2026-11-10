import { Image } from 'expo-image';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Disclosure } from '@/components/journal/disclosure';
import { RarityChip } from '@/components/rarity-chip';
import { ShareDiscoveryButton } from '@/components/share/share-buttons';
import { shortPhotoCredit } from '@/components/sightings/format';
import { openExternalUrl } from '@/components/sightings/open-external';
import { RaritySource } from '@/components/sightings/rarity-source';
import { SpeciesRecordsSection } from '@/components/sightings/species-records';
import { formatDate, SightingRow } from '@/components/sighting-row';
import { SpeciesArt } from '@/components/species-art';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { mix } from '@/components/ui/color';
import { EmptyState } from '@/components/ui/notice';
import { IconTile, List, ListRow } from '@/components/ui/list';
import { MoreMenu } from '@/components/ui/more-menu';
import { Screen, Section } from '@/components/ui/screen';
import { Tag } from '@/components/ui/tag';
import { Radius, Size, Space, TypeScale } from '@/constants/theme';
import { canonicalSiteId } from '@/data/sites';
import { useSchemeName, useTheme } from '@/hooks/use-theme';
import { announce } from '@/lib/announce';
import { CATALOG, CATALOG_BY_ID } from '@/lib/catalog';
import { confirmAction } from '@/lib/confirm';
import { CATEGORY_LABEL, RARITY_COLOR } from '@/lib/rarity';
import { rarityObservedNote, realRarityEntry } from '@/lib/real-rarity';
import { useAllSites, useAppStore, useMyUserId, useSiteById } from '@/lib/store';
import { speciesMarineModel } from '@/lib/swimming';
import type { DiveSite, Species } from '@/lib/types';

/** How strongly the hero's mat takes the species' rarity colour (the same as its tile in a grid). */
const MAT_TINT = { light: 0.14, dark: 0.18 };

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
      <Screen kind="pushed">
        <EmptyState icon="fieldGuide" title="Species not found." />
      </Screen>
    );
  }

  const seen = mine.length > 0;
  const artWidth = Math.min(380, Math.round(plateWidth * 0.8));
  const artHeight = Math.round(artWidth * 0.64);
  const oldestFirst = [...mine].sort((a, b) => a.sightedOn.localeCompare(b.sightedOn) || a.createdAt.localeCompare(b.createdAt));
  const firstSite = oldestFirst[0] ? siteById(oldestFirst[0].siteId) : undefined;
  // "Seen once, first on Nov 4, 2026 at Richelieu Rock": the whole record in one line.
  const inYourLog = seen
    ? `${mine.length === 1 ? 'Seen once' : `Seen ${mine.length} times`}, first on ${formatDate(oldestFirst[0].sightedOn)}${firstSite ? ` at ${firstSite.name}` : ''}`
    : '';
  const has3d = !!speciesMarineModel(species.id);
  const open3d = () => router.push({ pathname: '/inspect', params: { species: species.id } });
  // Where the tier comes from: the counts behind a real tier, or nothing when it is only ScubaGo's own estimate.
  const rarityEntry = realRarityEntry(species.id);
  const observedNote = rarityEntry ? rarityObservedNote(rarityEntry) : undefined;
  const newestFirst = [...mine].sort((a, b) => b.sightedOn.localeCompare(a.sightedOn) || b.createdAt.localeCompare(a.createdAt));
  // A species seen is on a soft tint of its rarity colour, as its tile in a grid; one still to find is on the page's own colour.
  const paper = scheme === 'dark' ? mix(theme.text, theme.backgroundElement, 0.3) : theme.backgroundElement;
  const mat = seen ? mix(paper, RARITY_COLOR[species.rarity], MAT_TINT[scheme]) : theme.background;

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
  const logIt = () => router.push({ pathname: '/log/new', params: { speciesId: species.id } });

  return (
    <Screen>
      {/* The title stays for the browser tab; the header shows only the back arrow, as the page names itself below. */}
      <Stack.Screen
        options={{
          title: species.commonName,
          headerTitle: '',
          headerRight: seen
            ? () => (
              <View style={styles.headerActions}>
                <MoreMenu
                  accessibilityLabel={`More actions for ${species.commonName}`}
                  disabled={busy}
                  items={[{ label: `Delete my ${species.commonName} log`, icon: 'trash', destructive: true, onPress: () => void confirmRemoveLog() }]}
                />
              </View>
            )
            : undefined,
        }}
      />

      {/* The hero: its plate (painted once the diver has seen one, a pencil sketch until then), its name, and its tier. */}
      <Card padded={false} style={styles.hero}>
        <View
          onLayout={(e) => setPlateWidth(Math.floor(e.nativeEvent.layout.width))}
          accessible
          accessibilityLabel={seen ? CATEGORY_LABEL[species.category] : `${CATEGORY_LABEL[species.category]}, not seen yet`}
          style={[styles.mat, { backgroundColor: mat }]}>
          <View style={styles.matTop}>
            <Tag label={CATEGORY_LABEL[species.category]} style={{ backgroundColor: theme.backgroundElement }} />
          </View>
          <View style={[styles.art, { width: artWidth, height: artHeight }]}>
            {has3d ? (
              // Tapping the drawing opens the animal in 3D, as the button below does.
              <Pressable onPress={open3d} accessibilityRole="button" accessibilityLabel={`See ${species.commonName.toLowerCase()} in 3D`} style={styles.artTap}>
                <SpeciesArt species={species} width={artWidth} found={seen} paper={mat} />
              </Pressable>
            ) : (
              <SpeciesArt species={species} width={artWidth} found={seen} paper={mat} />
            )}
          </View>
          {!seen ? <Tag label="Not seen yet" dashed style={styles.notSeen} /> : null}
        </View>

        <View style={styles.names}>
          <ThemedText type="display" accessibilityRole="header" style={styles.center}>
            {species.commonName}
          </ThemedText>
          <ThemedText type="scientific" themeColor="textSecondary" style={styles.center}>
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
      </Card>

      <ThemedText>{species.blurb}</ThemedText>

      {/* What the page is for comes first: the diver's own record and the way to add to it, or for an animal
          not seen yet the button to log it. The photo and the 3D view come after, so they never push it down. */}
      {seen ? (
        <>
          {mine.length === 1 ? (
            // One sighting: the line is the way to its page.
            <List>
              <ListRow
                title="In your log"
                subtitle={inYourLog}
                subtitleLines={2}
                accessibilityRole="link"
                accessibilityLabel={`In your log. ${inYourLog}. Open the sighting`}
                onPress={() => router.push(`/sighting/${mine[0].id}`)}
              />
            </List>
          ) : (
            <>
              <ThemedText type="bodyStrong" accessibilityLabel={`In your log. ${inYourLog}`}>
                {inYourLog}
              </ThemedText>
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
            </>
          )}
          <Button title="Log another sighting" variant="log" icon="plus" onPress={logIt} />
          <ShareDiscoveryButton species={species} sightings={sightings} sites={sightingSites} ownerId={myUserId} observedNote={observedNote} />
        </>
      ) : (
        <Button title="I saw one! Log it" variant="log" icon="plus" onPress={logIt} />
      )}

      {species.photoUrl ? (
        <View style={styles.photoBlock}>
          <Card padded={false} style={styles.print}>
            <PhotoPrint species={species} uri={species.photoUrl} />
          </Card>
          {species.photoAttribution && species.photoSource ? (
            // The credit opens the photo's page, where its licence is stated (as CC BY asks).
            <Pressable
              onPress={() => void openExternalUrl(species.photoSource!)}
              accessibilityRole="link"
              accessibilityLabel={`Photo ${species.photoAttribution}`}
              accessibilityHint="Opens the photo on iNaturalist"
              style={styles.creditLink}>
              <ThemedText type="footnote" themeColor="textSecondary">
                Photo: {shortPhotoCredit(species.photoAttribution)} · iNaturalist ›
              </ThemedText>
            </Pressable>
          ) : species.photoAttribution ? (
            <ThemedText type="footnote" themeColor="textSecondary" style={styles.credit}>
              Photo: {shortPhotoCredit(species.photoAttribution)} · iNaturalist
            </ThemedText>
          ) : null}
        </View>
      ) : null}

      {has3d ? <Button title={`See ${species.commonName.toLowerCase()} in 3D`} variant="secondary" icon="eye" onPress={open3d} /> : null}

      {/* Only where it says something new: for an animal the diver has seen, one site is the sighting row above. */}
      {seenAt.length >= (seen ? 2 : 1) ? (
        <Section title="Where it’s been seen">
          <List>
            {seenAt.map(({ site, count, last }) => (
              <SiteRow key={site.id} site={site} count={count} last={last} />
            ))}
          </List>
        </Section>
      ) : null}

      {/* Public records saved on this phone: kept apart from the diver's own sightings above, and read from the cache only. */}
      <SpeciesRecordsSection species={species} sites={sites} />

      {error ? (
        <ThemedText type="subhead" themeColor="danger" accessibilityLiveRegion="polite" style={styles.center}>
          {error}
        </ThemedText>
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
        <Icon name="image" size={Size.icon} color={theme.textSecondary} />
        <ThemedText type="callout" themeColor="textSecondary" style={styles.center}>
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
function SiteRow({ site, count, last }: { site: DiveSite; count: number; last: string }) {
  const theme = useTheme();
  return (
    <ListRow
      leading="pin"
      title={site.name}
      subtitle={`${site.region}, ${site.country}`}
      accessibilityLabel={`${site.name}, ${site.region}, ${site.country}: seen ${count} ${count === 1 ? 'time' : 'times'}, last on ${formatDate(last)}`}
      trailing={
        <View style={styles.siteStats}>
          <Text style={[TypeScale.bodyStrong, { color: theme.text }]}>×{count}</Text>
          <Text style={[TypeScale.footnote, { color: theme.textSecondary }]}>last {formatDate(last)}</Text>
        </View>
      }
      onPress={() => router.push(`/site/${site.id}`)}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    textAlign: 'center',
  },
  mine: {
    gap: Space.s2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: Platform.OS === 'web' ? Space.s3 : 0,
  },
  artTap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The hero: a mat for the plate, then the names, in one card.
  hero: {
    padding: Space.s2,
    paddingBottom: Space.s5,
    gap: Space.s4,
  },
  mat: {
    borderRadius: Radius.md,
    paddingTop: Space.s3,
    paddingBottom: Space.s4,
    paddingHorizontal: Space.s4,
    alignItems: 'center',
    gap: Space.s2,
    overflow: 'hidden',
  },
  matTop: {
    alignSelf: 'stretch',
    flexDirection: 'row',
  },
  art: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  notSeen: {
    alignSelf: 'center',
  },
  names: {
    paddingHorizontal: Space.s3,
    gap: Space.s1,
  },
  tags: {
    alignSelf: 'stretch',
    alignItems: 'center',
    marginTop: Space.s1,
  },
  raritySource: {
    alignItems: 'center',
  },
  photoBlock: {
    gap: Space.s1,
  },
  print: {
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    height: 220,
  },
  photoMissing: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.s2,
  },
  // The credit is a link: a 44 pt strip to tap, not just its line of text.
  creditLink: {
    minHeight: Size.hit,
    justifyContent: 'center',
    paddingHorizontal: Space.s1,
  },
  credit: {
    paddingHorizontal: Space.s1,
  },
  siteStats: {
    alignItems: 'flex-end',
  },
});
