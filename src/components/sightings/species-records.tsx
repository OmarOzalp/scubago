import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Disclosure } from '@/components/journal/disclosure';
import { Paper } from '@/components/journal/paper';
import { SectionHeader } from '@/components/journal/screen';
import { creditLine, inatCountText, isIsoDate } from '@/components/sightings/format';
import { formatDate } from '@/components/sighting-row';
import { ThemedText } from '@/components/themed-text';
import { Radius, Type } from '@/constants/theme';
import {
  useSpeciesRecords,
  type RecordSite,
  type SpeciesRecordsStatus,
  type SpeciesSiteRecord,
} from '@/hooks/use-species-records';
import { useTheme } from '@/hooks/use-theme';
import type { SourceId } from '@/lib/external-sightings/types';
import type { Species } from '@/lib/types';

/** How many sites show before "Show all". */
export const SITES_SHOWN = 6;

const count = (n: number) => n.toLocaleString('en-US');

/** "38 iNaturalist observations", "1 iNaturalist observation". */
const observationsText = (n: number) => inatCountText(n);
/** "12 OBIS records", "1 OBIS record". */
const recordsText = (n: number) => `${count(n)} OBIS record${n === 1 ? '' : 's'}`;
const kmText = (km: number) => (Number.isInteger(km) ? String(km) : km.toFixed(1));

/** The radius every listed site was searched with, or undefined when they differ (each row then says its own). */
export function commonRadius(sites: readonly Pick<SpeciesSiteRecord, 'radiusKm'>[]): number | undefined {
  const first = sites[0]?.radiusKm;
  return first !== undefined && sites.every((site) => site.radiusKm === first) ? first : undefined;
}

/** The evidence phrases for one site, one per source that has records. */
export function evidencePhrases(site: Pick<SpeciesSiteRecord, 'observations' | 'records'>): string[] {
  const phrases: string[] = [];
  if (site.observations) phrases.push(observationsText(site.observations));
  if (site.records) phrases.push(recordsText(site.records));
  return phrases;
}

/** The sources whose records are on show, for the credit line. */
export function creditedSources(sites: readonly Pick<SpeciesSiteRecord, 'observations' | 'records'>[]): SourceId[] {
  const sources: SourceId[] = [];
  if (sites.some((site) => site.observations)) sources.push('inaturalist');
  if (sites.some((site) => site.records)) sources.push('obis');
  return sources;
}

/** "Recorded near 3 of the 12 sites you’ve opened". */
export function recordedNearText(found: number, checked: number): string {
  const total = Math.max(found, checked);
  if (found === total) return found === 1 ? 'Recorded near the 1 site you’ve opened' : `Recorded near all ${found} sites you’ve opened`;
  return `Recorded near ${found} of the ${total} sites you’ve opened`;
}

interface Props {
  status: SpeciesRecordsStatus;
  sites: SpeciesSiteRecord[];
  /** How many saved site summaries were looked through. */
  checked: number;
  speciesName: string;
  onOpenSite: (siteId: string) => void;
  onOpenCredits: () => void;
  /** How many sites show before "Show all". */
  shown?: number;
}

/**
 * "Recorded near dive sites": where public records place this animal, read only from the summaries
 * saved on this phone for dive sites the diver has already opened. It takes its data as props, so
 * every state can be drawn without the network or the cache. These are not the diver's sightings and
 * ScubaGo has not checked them, and the section says so before it shows anything.
 */
export function SpeciesRecords({ status, sites, checked, speciesName, onOpenSite, onOpenCredits, shown = SITES_SHOWN }: Props) {
  const radius = status === 'ready' ? commonRadius(sites) : undefined;
  return (
    <View style={styles.section}>
      <SectionHeader title="Recorded near dive sites" />
      {/* The explanation waits behind a row: what these are, where they are kept, and that they are not the diver's own. */}
      <Disclosure label="About these records" hint="Shows where these records come from">
        <ThemedText type="caption" themeColor="textSecondary">
          {recordsExplainer(speciesName, radius, status === 'empty' && checked > 0)}
        </ThemedText>
      </Disclosure>

      {status === 'loading' ? <RecordsPlaceholder /> : null}
      {status === 'error' ? <RecordsError /> : null}
      {status === 'empty' ? <RecordsEmpty checked={checked} /> : null}
      {status === 'ready' ? (
        <>
          <ThemedText type="label" accessibilityRole="header">
            {recordedNearText(sites.length, checked)}
          </ThemedText>
          <SiteRecordList sites={sites} onOpenSite={onOpenSite} shown={shown} showRadius={radius === undefined} />
          <CreditFooter sources={creditedSources(sites)} onOpenCredits={onOpenCredits} />
        </>
      ) : null}
    </View>
  );
}

/**
 * What the records are, in under 40 words (it sits behind "About these records"). With one radius for
 * every site it also says what the counts cover; with none found it says that is not a claim.
 */
export function recordsExplainer(speciesName: string, radiusKm?: number, noneFound = false): string {
  const base = `Public records of ${speciesName} from iNaturalist and OBIS, for sites you’ve opened. Saved on this phone. Not your sightings, and not checked by ScubaGo.`;
  if (radiusKm !== undefined) return `${base} Counts cover ${kmText(radiusKm)} km around each site (OBIS: a ${kmText(radiusKm * 2)} km square).`;
  return noneFound ? `${base} Not finding one doesn’t mean it isn’t there.` : base;
}

/** The connected section for a species page: reads the cache (never the network) and links to the site and credits pages. */
export function SpeciesRecordsSection({ species, sites }: { species: Pick<Species, 'id' | 'commonName'>; sites: readonly RecordSite[] }) {
  const records = useSpeciesRecords(species.id, sites);
  return (
    <SpeciesRecords
      status={records.status}
      sites={records.sites}
      checked={records.checked}
      speciesName={species.commonName}
      onOpenSite={(siteId) => router.push(`/site/${siteId}`)}
      onOpenCredits={() => router.push('/credits')}
    />
  );
}

function SiteRecordList({ sites, onOpenSite, shown, showRadius }: { sites: SpeciesSiteRecord[]; onOpenSite: (siteId: string) => void; shown: number; showRadius: boolean }) {
  const theme = useTheme();
  const [all, setAll] = useState(false);
  const visible = all ? sites : sites.slice(0, shown);
  const expandable = sites.length > shown;
  return (
    <Paper padded={false} style={styles.paper}>
      {visible.map((site, index) => (
        <SiteRecordRow key={site.siteId} site={site} first={index === 0} showRadius={showRadius} onPress={() => onOpenSite(site.siteId)} />
      ))}
      {expandable ? (
        <Pressable
          onPress={() => setAll((value) => !value)}
          accessibilityRole="button"
          aria-expanded={all}
          accessibilityState={{ expanded: all }}
          accessibilityLabel={all ? 'Show fewer dive sites' : `Show all ${sites.length} dive sites`}
          style={({ pressed }) => [styles.more, { borderTopColor: theme.rule, backgroundColor: pressed ? theme.backgroundSelected : 'transparent' }]}>
          <Text style={[styles.moreText, { color: theme.tint }]}>{all ? 'Show fewer' : `Show all ${sites.length}`}</Text>
          <Icon name="chevronDown" size={16} color={theme.tint} weight="bold" style={all ? styles.flipped : undefined} />
        </Pressable>
      ) : null}
    </Paper>
  );
}

function SiteRecordRow({ site, first, showRadius, onPress }: { site: SpeciesSiteRecord; first: boolean; showRadius: boolean; onPress: () => void }) {
  const theme = useTheme();
  const evidence = evidencePhrases(site);
  const newest = isIsoDate(site.newestOn) ? formatDate(site.newestOn) : undefined;
  // iNaturalist is searched in a circle, OBIS in a square whose half-side is the radius (geo.ts).
  const radius = `within ${kmText(site.radiusKm)} km, OBIS in a ${kmText(site.radiusKm * 2)} km square`;
  // One line per fact, so a count never breaks across two lines.
  const details = [showRadius ? `Within ${kmText(site.radiusKm)} km (OBIS: ${kmText(site.radiusKm * 2)} km square)` : null, newest ? `Newest on file: ${newest}` : null].filter((part): part is string => part !== null);
  const label = [
    `${site.name}, ${site.region}, ${site.country}`,
    evidence.join(', '),
    radius,
    newest ? `newest on file ${newest}` : null,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens the dive site page"
      style={({ pressed }) => [
        styles.row,
        { borderTopColor: theme.rule, borderTopWidth: first ? 0 : 1, backgroundColor: pressed ? theme.backgroundSelected : 'transparent' },
      ]}>
      <View style={[styles.pin, { backgroundColor: theme.backgroundSelected }]}>
        <Icon name="pin" size={22} />
      </View>
      <View style={styles.body}>
        <Text numberOfLines={2} style={[styles.name, { color: theme.text }]}>
          {site.name}
        </Text>
        <Text numberOfLines={2} style={[styles.meta, { color: theme.textSecondary }]}>
          {`${site.region}, ${site.country}`}
        </Text>
        <View style={styles.evidenceList}>
          {evidence.map((phrase) => (
            <Text key={phrase} style={[styles.evidence, { color: theme.text }]}>
              {phrase}
            </Text>
          ))}
        </View>
        {details.map((detail) => (
          <Text key={detail} style={[styles.meta, { color: theme.textSecondary }]}>
            {detail}
          </Text>
        ))}
      </View>
      <Icon name="chevronRight" size={18} color={theme.textSecondary} weight="bold" />
    </Pressable>
  );
}

function CreditFooter({ sources, onOpenCredits }: { sources: SourceId[]; onOpenCredits: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onOpenCredits}
      accessibilityRole="link"
      accessibilityLabel={`${creditLine(sources)}. Data and credits`}
      accessibilityHint="Opens the data and credits page"
      style={[styles.footer, { borderTopColor: theme.rule }]}>
      <Text style={[styles.credit, { color: theme.textSecondary }]}>
        {`${creditLine(sources)} · `}
        <Text style={[styles.creditLink, { color: theme.tint }]}>Data & credits</Text>
      </Text>
    </Pressable>
  );
}

/** Reading the phone's own storage takes a moment at most: two quiet ruled lines, no spinner. */
function RecordsPlaceholder() {
  const theme = useTheme();
  return (
    <View accessible accessibilityLabel="Checking the public records saved on this phone" accessibilityState={{ busy: true }} aria-busy>
      <Paper padded={false}>
        {[0, 1].map((index) => (
          <View key={index} style={[styles.ghostRow, index > 0 && { borderTopWidth: 1, borderTopColor: theme.rule }]}>
            <View style={[styles.pin, { backgroundColor: theme.backgroundSelected }]} />
            <View style={styles.ghostText}>
              <View style={[styles.ghostBar, { width: index === 0 ? '56%' : '44%', backgroundColor: theme.backgroundSelected }]} />
              <View style={[styles.ghostBar, { width: '78%', height: 10, backgroundColor: theme.rule }]} />
            </View>
          </View>
        ))}
      </Paper>
      <ThemedText type="caption" themeColor="textSecondary" style={styles.placeholderNote}>
        Checking the records saved on this phone…
      </ThemedText>
    </View>
  );
}

function RecordsError() {
  const theme = useTheme();
  return (
    <View style={[styles.box, { borderColor: theme.rule }]} accessibilityLiveRegion="polite">
      <ThemedText type="caption" themeColor="textSecondary" style={styles.center} accessibilityLabel="Couldn’t read the public records saved on this phone just now.">
        Couldn’t read the saved records.
      </ThemedText>
    </View>
  );
}

/** Nothing saved yet, or nothing saved that mentions this animal. Either way: not a claim that it isn't there. */
function RecordsEmpty({ checked }: { checked: number }) {
  const theme = useTheme();
  return (
    <View style={[styles.box, { borderColor: theme.rule }]}>
      <ThemedText type="caption" themeColor="textSecondary" style={styles.center}>
        {checked === 0 ? 'Open a dive site to see records.' : `No records at the ${checked === 1 ? '1 site' : `${checked} sites`} you’ve opened.`}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 14,
  },
  paper: {
    overflow: 'hidden',
  },
  row: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  pin: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 1,
  },
  name: {
    fontFamily: Type.bodyHeavy,
    fontSize: 16,
    lineHeight: 21,
  },
  evidenceList: {
    marginVertical: 2,
  },
  evidence: {
    fontFamily: Type.bodySemiBold,
    fontSize: 14,
    lineHeight: 19,
  },
  meta: {
    fontFamily: Type.body,
    fontSize: 14,
    lineHeight: 19,
  },
  more: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderTopWidth: 1,
    paddingHorizontal: 14,
  },
  moreText: {
    fontFamily: Type.bodyHeavy,
    fontSize: 15,
  },
  flipped: {
    transform: [{ rotate: '180deg' }],
  },
  footer: {
    minHeight: 44,
    borderTopWidth: 1,
    paddingTop: 12,
    paddingBottom: 6,
    justifyContent: 'center',
  },
  credit: {
    fontFamily: Type.body,
    fontSize: 13,
    lineHeight: 19,
  },
  creditLink: {
    fontFamily: Type.bodyBold,
    textDecorationLine: 'underline',
  },
  ghostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  ghostText: {
    flex: 1,
    gap: 10,
  },
  ghostBar: {
    height: 14,
    borderRadius: Radius.xs,
  },
  placeholderNote: {
    marginTop: 8,
  },
  box: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: Radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  center: {
    textAlign: 'center',
  },
});
