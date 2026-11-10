import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FieldLabel } from '@/components/form-field';
import { Disclosure } from '@/components/journal/disclosure';
import { creditLine, inatCountText, isIsoDate } from '@/components/sightings/format';
import { CreditFooter, GhostRows, QuietCard, ShowAllRow } from '@/components/sightings/parts';
import { formatDate } from '@/components/sighting-row';
import { List, ListRow } from '@/components/ui/list';
import { Section } from '@/components/ui/screen';
import { Space, TypeScale } from '@/constants/theme';
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
  const theme = useTheme();
  const radius = status === 'ready' ? commonRadius(sites) : undefined;
  return (
    <Section title="Recorded near dive sites" flush style={styles.section}>
      {/* The explanation waits behind a row: what these are, where they are kept, and that they are not the diver's own. */}
      <Disclosure label="About these records" hint="Shows where these records come from">
        <Text style={[TypeScale.callout, { color: theme.textSecondary }]}>{recordsExplainer(speciesName, radius, status === 'empty' && checked > 0)}</Text>
      </Disclosure>

      {status === 'loading' ? <RecordsPlaceholder /> : null}
      {status === 'error' ? <RecordsError /> : null}
      {status === 'empty' ? <RecordsEmpty checked={checked} /> : null}
      {status === 'ready' ? (
        <>
          <FieldLabel header>{recordedNearText(sites.length, checked)}</FieldLabel>
          <SiteRecordList sites={sites} onOpenSite={onOpenSite} shown={shown} showRadius={radius === undefined} />
          <CreditFooter credit={creditLine(creditedSources(sites))} onOpenCredits={onOpenCredits} />
        </>
      ) : null}
    </Section>
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
  const [all, setAll] = useState(false);
  const visible = all ? sites : sites.slice(0, shown);
  const expandable = sites.length > shown;
  return (
    <List>
      {visible.map((site, index) => (
        <SiteRecordRow key={site.siteId} site={site} first={index === 0} showRadius={showRadius} onPress={() => onOpenSite(site.siteId)} />
      ))}
      {expandable ? (
        <ShowAllRow expanded={all} label={all ? 'Show fewer' : `Show all ${sites.length}`} accessibilityLabel={all ? 'Show fewer dive sites' : `Show all ${sites.length} dive sites`} onPress={() => setAll((value) => !value)} />
      ) : null}
    </List>
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
  const label = [`${site.name}, ${site.region}, ${site.country}`, evidence.join(', '), radius, newest ? `newest on file ${newest}` : null].filter(Boolean).join(', ');
  return (
    <ListRow
      leading="pin"
      title={site.name}
      titleLines={2}
      subtitle={`${site.region}, ${site.country}`}
      subtitleLines={2}
      below={
        <View>
          {evidence.map((phrase) => (
            <Text key={phrase} style={[TypeScale.subheadStrong, { color: theme.text }]}>
              {phrase}
            </Text>
          ))}
          {details.map((detail) => (
            <Text key={detail} style={[TypeScale.subhead, { color: theme.textSecondary }]}>
              {detail}
            </Text>
          ))}
        </View>
      }
      accessibilityLabel={label}
      accessibilityHint="Opens the dive site page"
      separator={!first}
      inGroup
      onPress={onPress}
    />
  );
}

/** Reading the phone's own storage takes a moment at most: two quiet ruled lines, no spinner. */
function RecordsPlaceholder() {
  const theme = useTheme();
  return (
    <View accessible accessibilityLabel="Checking the public records saved on this phone" accessibilityState={{ busy: true }} aria-busy style={styles.placeholder}>
      <GhostRows
        widths={[
          ['56%', '78%'],
          ['44%', '78%'],
        ]}
      />
      <Text style={[TypeScale.callout, { color: theme.textSecondary }]}>Checking the records saved on this phone…</Text>
    </View>
  );
}

function RecordsError() {
  const theme = useTheme();
  return (
    <QuietCard live>
      <Text style={[TypeScale.callout, styles.center, { color: theme.textSecondary }]} accessibilityLabel="Couldn’t read the public records saved on this phone just now.">
        Couldn’t read the saved records.
      </Text>
    </QuietCard>
  );
}

/** Nothing saved yet, or nothing saved that mentions this animal. Either way: not a claim that it isn't there. */
function RecordsEmpty({ checked }: { checked: number }) {
  const theme = useTheme();
  return (
    <QuietCard>
      <Text style={[TypeScale.callout, styles.center, { color: theme.textSecondary }]}>
        {checked === 0 ? 'Open a dive site to see records.' : `No records at the ${checked === 1 ? '1 site' : `${checked} sites`} you’ve opened.`}
      </Text>
    </QuietCard>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Space.s3,
  },
  placeholder: {
    gap: Space.s2,
  },
  center: {
    textAlign: 'center',
  },
});
