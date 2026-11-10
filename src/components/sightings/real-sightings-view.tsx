import { StyleSheet, Text, View } from 'react-native';

import { FieldLabel } from '@/components/form-field';
import { Disclosure } from '@/components/journal/disclosure';
import { buildModel, creditLine } from '@/components/sightings/format';
import { openExternalUrl } from '@/components/sightings/open-external';
import { CreditFooter } from '@/components/sightings/parts';
import { RecentObservations } from '@/components/sightings/recent-observations';
import { SpeciesEvidenceList } from '@/components/sightings/species-evidence-list';
import { SightingsEmpty, SightingsNotices, SightingsPlaceholder, SightingsUnavailable, UpdatedLine } from '@/components/sightings/states';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/ui/screen';
import { Space, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { SightingsStatus, SiteSightings } from '@/lib/external-sightings/types';

interface Props {
  summary: SiteSightings | null;
  status: SightingsStatus;
  /** "Try again": fetch the records once more. */
  onRefresh: () => void;
  onOpenSpecies: (speciesId: string) => void;
  onOpenCredits: () => void;
  /** Open an iNaturalist page (replaceable in tests and the preview). */
  onOpenUrl?: (url: string) => void;
  /** The site has a hand-made species list ("What divers see here"). */
  hasCuratedSpecies?: boolean;
  /** The time to measure "Updated N days ago" from. */
  now?: number;
}

/** What the records near a site are (it sits behind "About these records"): where they come from, how far, and whose they are. */
export function recordsNearSiteText(radiusKm: number): string {
  return `Public records near this site: iNaturalist within ${radiusKm} km, OBIS in a ${radiusKm * 2} km square. Not your sightings, and not checked by ScubaGo.`;
}

/**
 * "Marine life recorded here": what iNaturalist observers and OBIS datasets have recorded near a
 * dive site. It takes its data as props, so every state can be drawn without the network. These are
 * public records, kept apart from ScubaGo's own sightings and labelled as not checked by ScubaGo.
 */
export function RealSightingsView({ summary, status, onRefresh, onOpenSpecies, onOpenCredits, onOpenUrl = openExternalUrl, hasCuratedSpecies = true, now }: Props) {
  const theme = useTheme();
  const model = buildModel(summary, status, now);
  if (model.kind === 'hidden') return null;

  const empty = model.species.length === 0 && model.recent.length === 0;
  const hasInatSpecies = model.species.some((entry) => !!entry.inaturalist);
  // With no recent observation to show, say why: the request failed, or none of them is openly licensed.
  const recentGap = model.recentFailed
    ? 'Recent observations couldn’t be loaded.'
    : model.inatAnswered && hasInatSpecies
      ? 'iNaturalist has records here, but none recent that are openly licensed for ScubaGo to show.'
      : null;
  return (
    <Section title="Marine life recorded here" flush style={styles.section}>
      {/* OBIS is searched in a box whose half-side is the radius (geo.ts), so its corners reach further. */}
      <Disclosure label="About these records" hint="Shows where these records come from">
        <Text style={[TypeScale.callout, { color: theme.textSecondary }]}>{recordsNearSiteText(model.radiusKm)}</Text>
      </Disclosure>

      {model.kind === 'loading' ? <SightingsPlaceholder /> : null}
      {model.kind === 'unavailable' ? <SightingsUnavailable offline={model.offline} onRetry={onRefresh} /> : null}

      {model.kind === 'content' ? (
        <>
          {model.updated && !model.canRetry ? <UpdatedLine text={model.updated} refreshing={model.refreshing} /> : null}
          <SightingsNotices notices={model.notices} canRetry={model.canRetry} onRetry={onRefresh} />

          {empty ? (
            <SightingsEmpty radiusKm={model.radiusKm} answered={model.answered} total={summary?.sources.length ?? 2} hasCuratedSpecies={hasCuratedSpecies} />
          ) : null}

          {model.species.length > 0 ? (
            <View style={styles.block}>
              <FieldLabel header>{`Animals recorded nearby · ${model.species.length}`}</FieldLabel>
              <SpeciesEvidenceList species={model.species} onOpenSpecies={onOpenSpecies} />
            </View>
          ) : null}

          {model.recent.length > 0 ? (
            <View style={styles.block}>
              <FieldLabel header>Recent observations</FieldLabel>
              <RecentObservations recent={model.recent} onOpenUrl={onOpenUrl} />
            </View>
          ) : recentGap ? (
            <View style={styles.block}>
              <FieldLabel header>Recent observations</FieldLabel>
              <Text style={[TypeScale.subhead, { color: theme.textSecondary }]}>{recentGap}</Text>
            </View>
          ) : null}

          {model.exploreUrl ? (
            <Button
              title="See more on iNaturalist"
              variant="secondary"
              icon="external"
              onPress={() => onOpenUrl(model.exploreUrl as string)}
              accessibilityHint="Opens iNaturalist in your browser"
            />
          ) : null}

          <CreditFooter credit={creditLine(model.credited)} onOpenCredits={onOpenCredits} />
        </>
      ) : null}
    </Section>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Space.s3,
  },
  block: {
    gap: Space.s2,
  },
});
