import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SectionHeader } from '@/components/journal/screen';
import { buildModel, creditLine } from '@/components/sightings/format';
import { openExternalUrl } from '@/components/sightings/open-external';
import { RecentObservations } from '@/components/sightings/recent-observations';
import { SpeciesEvidenceList } from '@/components/sightings/species-evidence-list';
import { SightingsEmpty, SightingsNotices, SightingsPlaceholder, SightingsUnavailable, UpdatedLine } from '@/components/sightings/states';
import { OceanButton } from '@/components/ocean-button';
import { ThemedText } from '@/components/themed-text';
import { Type } from '@/constants/theme';
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
  return (
    <View style={styles.section}>
      <SectionHeader eyebrow="Public records" title="Marine life recorded here" />
      <ThemedText type="caption" themeColor="textSecondary">
        {`Records within about ${model.radiusKm} km of this site, from iNaturalist observers and OBIS scientific datasets. Not ScubaGo sightings, and not checked by ScubaGo.`}
      </ThemedText>

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
              <ThemedText type="label" accessibilityRole="header">
                {`Animals recorded nearby · ${model.species.length}`}
              </ThemedText>
              <SpeciesEvidenceList species={model.species} onOpenSpecies={onOpenSpecies} />
            </View>
          ) : null}

          {model.recent.length > 0 ? (
            <View style={styles.block}>
              <ThemedText type="label" accessibilityRole="header">
                Recent observations
              </ThemedText>
              <RecentObservations recent={model.recent} onOpenUrl={onOpenUrl} />
            </View>
          ) : model.inatAnswered && hasInatSpecies ? (
            <View style={styles.block}>
              <ThemedText type="label" accessibilityRole="header">
                Recent observations
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                iNaturalist has records here, but none recent that are openly licensed for ScubaGo to show.
              </ThemedText>
            </View>
          ) : null}

          {model.exploreUrl ? (
            <OceanButton
              title="See more on iNaturalist"
              variant="secondary"
              icon="external"
              onPress={() => onOpenUrl(model.exploreUrl as string)}
              accessibilityHint="Opens iNaturalist in your browser"
            />
          ) : null}

          <Pressable
            onPress={onOpenCredits}
            accessibilityRole="link"
            accessibilityLabel={`${creditLine(model.credited)}. Data and credits`}
            accessibilityHint="Opens the data and credits page"
            style={[styles.footer, { borderTopColor: theme.rule }]}>
            <Text style={[styles.credit, { color: theme.textSecondary }]}>
              {`${creditLine(model.credited)} · `}
              <Text style={[styles.creditLink, { color: theme.tint }]}>Data & credits</Text>
            </Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 14,
  },
  block: {
    gap: 8,
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
});
