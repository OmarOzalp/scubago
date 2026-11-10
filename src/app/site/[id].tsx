import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ExternalLink } from '@/components/external-link';
import { Icon, type IconName } from '@/components/icon';
import { Disclosure } from '@/components/journal/disclosure';
import { SiteSightingsSection } from '@/components/sightings/site-sightings-section';
import { formatDate, SightingRow } from '@/components/sighting-row';
import { CARD_GAP, onGridLayout, SpeciesCard, useCardGrid } from '@/components/species-card';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { List, ListRow } from '@/components/ui/list';
import { EmptyState } from '@/components/ui/notice';
import { Screen, ScreenTitle, Section } from '@/components/ui/screen';
import { Size, Space, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { regionPath } from '@/data/regions';
import { canonicalSiteId, SITES } from '@/data/sites';
import { CATALOG_BY_ID, speciesForSighting } from '@/lib/catalog';
import { deriveDex } from '@/lib/dex';
import { formatDepth, formatDiveNumber, formatMinutes, sortDives } from '@/lib/dives';
import { siteAddedBy, siteFacts, siteSourceList } from '@/lib/site-details';
import { useAppStore, useMyDives, useMySightings, useSiteById } from '@/lib/store';
import type { Dive, Species } from '@/lib/types';

/** An icon for each of the facts siteFacts() can give. */
const FACT_ICON: Record<string, IconName> = {
  Depth: 'drop',
  Level: 'medal',
  Type: 'waves',
  Access: 'boat',
};

/** The diver's own dives here that are listed before "Show all": a site they know well has many. */
const DIVES_SHOWN = 5;

/** A dive site's page: its facts, what lives there, and who saw what. */
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

  const { cardWidth } = useCardGrid(inner);

  if (!site) {
    return (
      <Screen kind="pushed">
        <EmptyState icon="pin" title="Site not found." />
      </Screen>
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

  return (
    <>
      {/* The title stays for the browser tab; the header shows only the back arrow, as the page names itself below. */}
      <Stack.Screen options={{ title: site.name, headerTitle: '' }} />
      <Screen>
        {/* The page's head: the site's name, where it is, and what the diver has here. */}
        <View style={styles.head}>
          <ScreenTitle title={site.name} />
          <View style={styles.place}>
            <Icon name="pin" size={16} color={theme.textSecondary} style={styles.placeIcon} />
            <ThemedText type="subhead" themeColor="textSecondary" style={styles.flex}>
              {regionPath(site.regionId) ?? site.region}, {site.country}
              {addedBy ? ` · added by ${addedBy}` : ''}
            </ThemedText>
          </View>
          {keyFacts ? (
            <ThemedText type="subheadStrong" accessibilityLabel={keyFacts}>
              {keyFacts}
            </ThemedText>
          ) : null}
        </View>

        <ThemedText>{site.blurb}</ThemedText>

        {/* What's known about the site, one row each. Only facts with a source are ever filled in (src/data/__tests__/integrity.test.ts). */}
        {hasNotes ? (
          <List>
            {facts.map((fact) => (
              <ListRow
                key={fact.label}
                leading={FACT_ICON[fact.label] ?? 'info'}
                title={fact.label}
                value={fact.value}
                trailing="none"
                accessibilityLabel={`${fact.label} ${fact.value}`}
              />
            ))}
            {site.conditions ? (
              <View style={[styles.conditions, facts.length > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.rule }]}>
                <ThemedText type="footnoteStrong" themeColor="textSecondary">
                  Conditions
                </ThemedText>
                <ThemedText type="callout">{site.conditions}</ThemedText>
              </View>
            ) : null}
          </List>
        ) : null}

        {/* Right under the facts, so it is there on the first screen and not after the lists. */}
        <Button title="Log a dive here" variant="log" icon="plus" onPress={() => router.push({ pathname: '/log/new', params: { siteId: site.id } })} />

        {divesHere.length > 0 ? (
          <Section title="Your dives here">
            <List>
              {(allDives ? divesHere : divesHere.slice(0, DIVES_SHOWN)).map((dive) => (
                <ListRow
                  key={dive.id}
                  leading="logbook"
                  title={`${formatDiveNumber(dive.number)} · ${formatDate(dive.divedOn)}`}
                  subtitle={diveFacts(dive, sightingsByDive.get(dive.id) ?? 0) || undefined}
                  accessibilityRole="link"
                  onPress={() => router.push(`/dive/${dive.id}`)}
                />
              ))}
            </List>
            {divesHere.length > DIVES_SHOWN && !allDives ? (
              <Button title={`Show all ${divesHere.length} dives here`} variant="plain" size="md" onPress={() => setAllDives(true)} />
            ) : null}
          </Section>
        ) : null}

        {notable.length > 0 ? (
          <Section title="What divers see here">
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
          </Section>
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
          <Section title="Recent sightings">
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
          </Section>
        ) : null}

        {sources.length > 0 ? (
          <Section title="Sources">
            <ThemedText type="subhead" themeColor="textSecondary">
              {sources.map((source, i) => (
                <ThemedText key={source.source} type="subhead" themeColor="textSecondary">
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
            <Pressable onPress={() => router.push('/credits')} accessibilityRole="link" accessibilityLabel="Data and credits" style={styles.creditsLink}>
              <Text style={[TypeScale.subheadStrong, { color: theme.tint }]}>Data & credits</Text>
            </Pressable>
          </Section>
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
  flex: {
    flex: 1,
  },
  head: {
    gap: Space.s2,
  },
  place: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.s2,
  },
  placeIcon: {
    marginTop: 2,
  },
  conditions: {
    gap: Space.s1,
    padding: Space.s4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CARD_GAP,
  },
  rows: {
    gap: Space.s2,
  },
  link: {
    ...TypeScale.subheadStrong,
    textDecorationLine: 'underline',
  },
  creditsLink: {
    minHeight: Size.hit,
    alignSelf: 'flex-start',
    justifyContent: 'center',
  },
});
