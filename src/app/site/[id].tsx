import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ExternalLink } from '@/components/external-link';
import { Icon, type IconName } from '@/components/icon';
import { Disclosure } from '@/components/journal/disclosure';
import { LinkRow } from '@/components/journal/link-row';
import { Paper } from '@/components/journal/paper';
import { Screen, SectionHeader } from '@/components/journal/screen';
import { Wash } from '@/components/journal/wash';
import { OceanButton } from '@/components/ocean-button';
import { SiteSightingsSection } from '@/components/sightings/site-sightings-section';
import { formatDate, SightingRow } from '@/components/sighting-row';
import { cardWidthFor, onGridLayout, SpeciesCard } from '@/components/species-card';
import { ThemedText } from '@/components/themed-text';
import { Radius, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { regionPath } from '@/data/regions';
import { canonicalSiteId, SITES } from '@/data/sites';
import { CATALOG_BY_ID, speciesForSighting } from '@/lib/catalog';
import { deriveDex } from '@/lib/dex';
import { formatDepth, formatDiveNumber, formatMinutes, sortDives } from '@/lib/dives';
import { siteAddedBy, siteFacts, siteSourceList } from '@/lib/site-details';
import { useAppStore, useMyDives, useMySightings, useSiteById } from '@/lib/store';
import type { Dive, Species } from '@/lib/types';
import { hashSeed } from '@/lib/wash';

/** An icon for each of the facts siteFacts() can give. */
const FACT_ICON: Record<string, IconName> = {
  Depth: 'drop',
  Level: 'medal',
  Type: 'waves',
  Access: 'boat',
};

const GAP = 10;
/** The diver's own dives here that are listed before "Show all": a site they know well has many. */
const DIVES_SHOWN = 5;

/** A dive site's page in the journal: its facts ruled off like a log entry, what lives there, and who saw what. */
/**
 * The web build pre-renders a page for every curated site, so each one's HTML matches what the app
 * draws for it. Sites divers add aren't known at build time: they share the generic page.
 */
export function generateStaticParams(): { id: string }[] {
  return SITES.map((s) => ({ id: s.id }));
}

export default function SiteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const siteById = useSiteById();
  const sightings = useAppStore((s) => s.sightings);
  const userId = useAppStore((s) => s.user?.id);
  const mySightings = useMySightings();
  const myDives = useMyDives();
  const [allDives, setAllDives] = useState(false);
  // The column's width, measured: a phone's to begin with (the static web render has no window).
  const [inner, setInner] = useState(358);

  // A hidden copy's id (an old link, a sighting logged there) opens the listed site it stands for, so
  // its sightings are on the page and a new one is logged at the listed site.
  const site = siteById(canonicalSiteId(id));
  const addedBy = site ? siteAddedBy(site, userId) : null;

  // Sightings logged at a hidden copy of the site count here too.
  const siteSightings = useMemo(() => {
    const here = canonicalSiteId(id);
    return sightings
      .filter((s) => canonicalSiteId(s.siteId) === here)
      .sort((a, b) => b.sightedOn.localeCompare(a.sightedOn));
  }, [sightings, id]);

  // The diver's own dives here, newest first; a dive logged at a hidden copy of the site is one here too.
  const divesHere = useMemo(() => {
    const here = canonicalSiteId(id);
    return sortDives(myDives.filter((d) => canonicalSiteId(d.siteId) === here));
  }, [myDives, id]);
  // How many animals each of those dives has on its page, for the line under its date.
  const sightingsByDive = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of mySightings) if (s.diveId) counts.set(s.diveId, (counts.get(s.diveId) ?? 0) + 1);
    return counts;
  }, [mySightings]);

  const speciesCount = useMemo(
    () => new Set(siteSightings.map((s) => s.speciesId).filter((id) => CATALOG_BY_ID.has(id))).size,
    [siteSightings],
  );

  // How often the diver has seen each species anywhere: painted in once seen, in pencil until then,
  // as in the field guide.
  const myCounts = useMemo(
    () => new Map(deriveDex(mySightings, CATALOG_BY_ID).map((entry) => [entry.species.id, entry.count])),
    [mySightings],
  );

  if (!site) {
    return (
      <View style={[styles.missing, { backgroundColor: theme.background }]}>
        <View style={styles.missingArt}>
          <Wash width={120} height={84} color={theme.wash} seed={23} style={StyleSheet.absoluteFill} />
          <Icon name="pin" size={40} />
        </View>
        <ThemedText type="heading">Site not found.</ThemedText>
      </View>
    );
  }

  const facts = siteFacts(site);
  const sources = siteSourceList(site);
  const notable = site.notableSpecies.map((speciesId) => CATALOG_BY_ID.get(speciesId)).filter((s): s is Species => !!s);
  const hasNotes = facts.length > 0 || !!site.conditions;
  // The key facts on one line: only what is more than nothing ("2 dives · 5 animals seen"), no card of zeros.
  const keyFacts = [
    divesHere.length > 0 ? `${divesHere.length} ${divesHere.length === 1 ? 'dive' : 'dives'} here` : null,
    speciesCount > 0 ? `${speciesCount} ${speciesCount === 1 ? 'animal' : 'animals'} seen` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  // Every sighting here is the diver's own: "@you" and "Only you" on each row would say nothing.
  const mineIds = new Set(mySightings.map((s) => s.id));
  const allMine = siteSightings.every((s) => mineIds.has(s.id));
  // Three plates a row on a phone, more on a wide screen.
  const columns = Math.max(3, Math.min(6, Math.floor(inner / 150)));
  const cardWidth = cardWidthFor(inner, columns);

  return (
    <>
      {/* The title stays for the browser tab; the header shows only the back arrow, as the page names itself below. */}
      <Stack.Screen options={{ title: site.name, headerTitle: '' }} />
      <Screen>
        {/* The page's head: the site's name, where it is, and its own watercolour. */}
        <View style={styles.head}>
          <View style={styles.headText}>
            <ThemedText type="display" accessibilityRole="header">
              {site.name}
            </ThemedText>
            <View style={styles.place}>
              <Icon name="pin" size={16} color={theme.textSecondary} wash={theme.coral} washOpacity={0.4} style={styles.placeIcon} />
              <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }}>
                {regionPath(site.regionId) ?? site.region}, {site.country}
                {addedBy ? ` · added by ${addedBy}` : ''}
              </ThemedText>
            </View>
            {keyFacts ? (
              <ThemedText type="smallBold" accessibilityLabel={keyFacts}>
                {keyFacts}
              </ThemedText>
            ) : null}
          </View>
          <View style={styles.headArt}>
            <Wash width={84} height={64} color={theme.wash} seed={hashSeed(site.id)} style={StyleSheet.absoluteFill} />
            <Icon name="waves" size={34} />
          </View>
        </View>

        <ThemedText>{site.blurb}</ThemedText>

        {/* The log entry: what's known about the site, one ruled line each, with the totals at the foot. */}
        {hasNotes ? (
        <Paper style={styles.entry}>
          {/* Only facts with a source are ever filled in (src/data/__tests__/integrity.test.ts). */}
          {facts.map((fact, index) => (
            <View
              key={fact.label}
              accessible
              accessibilityLabel={`${fact.label} ${fact.value}`}
              style={[styles.fact, index > 0 && { borderTopWidth: 1, borderTopColor: theme.rule }]}>
              <Icon name={FACT_ICON[fact.label] ?? 'info'} size={20} />
              <ThemedText type="label" style={styles.factLabel}>
                {fact.label}
              </ThemedText>
              <Text style={[styles.factValue, { color: theme.text }]}>{fact.value}</Text>
            </View>
          ))}
          {site.conditions ? (
            <View style={[styles.conditions, facts.length > 0 && { borderTopWidth: 1, borderTopColor: theme.rule }]}>
              <View style={styles.conditionsTitle}>
                <Icon name="current" size={20} />
                <ThemedText type="label">Conditions</ThemedText>
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                {site.conditions}
              </ThemedText>
            </View>
          ) : null}
        </Paper>
        ) : null}

        {/* Right under the facts, so it is there on the first screen and not after the lists. */}
        <OceanButton
          title="Log a dive here"
          variant="log"
          icon="plus"
          onPress={() => router.push({ pathname: '/log/new', params: { siteId: site.id } })}
        />

        {divesHere.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader title="Your dives here" />
            <View style={styles.rows}>
              {(allDives ? divesHere : divesHere.slice(0, DIVES_SHOWN)).map((dive) => (
                <LinkRow
                  key={dive.id}
                  icon="logbook"
                  title={`${formatDiveNumber(dive.number)} · ${formatDate(dive.divedOn)}`}
                  detail={diveFacts(dive, sightingsByDive.get(dive.id) ?? 0)}
                  role="link"
                  onPress={() => router.push(`/dive/${dive.id}`)}
                />
              ))}
            </View>
            {divesHere.length > DIVES_SHOWN && !allDives ? (
              <OceanButton title={`Show all ${divesHere.length} dives here`} variant="quiet" onPress={() => setAllDives(true)} />
            ) : null}
          </View>
        ) : null}

        {notable.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader title="What divers see here" />
            <View style={styles.grid} onLayout={onGridLayout(setInner)}>
              {notable.map((species) => (
                <SpeciesCard
                  key={species.id}
                  species={species}
                  width={cardWidth}
                  count={myCounts.get(species.id) ?? 0}
                  onPress={() => router.push(`/species/${species.id}`)}
                />
              ))}
            </View>
          </View>
        ) : null}

        {/* What public records place here: kept apart from the page's own ScubaGo sightings, and the
            main answer to "what's here?" for a site that has no hand-made species list. */}
        <View>
          <Disclosure label="Records from science databases" hint="Shows the marine life public records place near this site">
            <SiteSightingsSection site={site} />
          </Disclosure>
        </View>

        {/* Nothing logged here yet: no empty box, the button above is the next step. */}
        {siteSightings.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader title="Recent sightings" />
            <View style={styles.rows}>
              {siteSightings.slice(0, 30).map((s) => {
                const species = speciesForSighting(s);
                if (!species) return null;
                return (
                  <SightingRow
                    key={s.id}
                    sighting={s}
                    species={species}
                    showUsername={!allMine}
                    quiet={allMine}
                    onPress={() => router.push(`/sighting/${s.id}`)}
                  />
                );
              })}
            </View>
          </View>
        ) : null}

        {sources.length > 0 ? (
          <View style={[styles.sources, { borderTopColor: theme.rule }]}>
            <ThemedText type="label">Sources</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {sources.map((source, i) => (
                <ThemedText key={source.source} type="small" themeColor="textSecondary">
                  {i > 0 ? ' · ' : ''}
                  {source.url ? (
                    <ExternalLink href={source.url} style={[styles.link, { color: theme.tint }]}>
                      {source.source}
                    </ExternalLink>
                  ) : (
                    source.source
                  )}
                  {source.license ? ` (${source.license})` : ''}
                </ThemedText>
              ))}
            </ThemedText>
            <Pressable
              onPress={() => router.push('/credits')}
              accessibilityRole="link"
              accessibilityLabel="Data and credits"
              style={styles.creditsLink}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.creditsText}>
                Data & credits
              </ThemedText>
            </Pressable>
          </View>
        ) : null}
      </Screen>
    </>
  );
}

/** "28.5 m · 52 min · 3 sightings": what a dive's page holds, for the line under its date (only what is known). */
function diveFacts(dive: Dive, sightings: number): string {
  return [
    dive.maxDepthM !== undefined ? formatDepth(dive.maxDepthM) : null,
    dive.bottomTimeMin ? formatMinutes(dive.bottomTimeMin) : null,
    sightings > 0 ? `${sightings} ${sightings === 1 ? 'sighting' : 'sightings'}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

const styles = StyleSheet.create({
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  missingArt: {
    width: 120,
    height: 84,
    alignItems: 'center',
    justifyContent: 'center',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  headText: {
    flex: 1,
    gap: 2,
  },
  place: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 4,
  },
  placeIcon: {
    marginTop: 2,
  },
  headArt: {
    width: 84,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  entry: {
    paddingVertical: 4,
  },
  fact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    paddingVertical: 10,
  },
  factLabel: {
    minWidth: 64,
  },
  factValue: {
    flex: 1,
    textAlign: 'right',
    fontFamily: Type.bodyBold,
    fontSize: 15,
    lineHeight: 20,
  },
  conditions: {
    gap: 6,
    paddingVertical: 12,
  },
  conditionsTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  section: {
    gap: 14,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
  rows: {
    gap: 8,
  },
  sources: {
    borderTopWidth: 1,
    paddingTop: 14,
    marginTop: 4,
    gap: 4,
  },
  link: {
    fontFamily: Type.bodyBold,
    textDecorationLine: 'underline',
  },
  creditsLink: {
    minHeight: 44,
    alignSelf: 'flex-start',
    justifyContent: 'center',
  },
  creditsText: {
    textDecorationLine: 'underline',
  },
});
