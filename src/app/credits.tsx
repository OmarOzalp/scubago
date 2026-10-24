import { StyleSheet, Text, View } from 'react-native';

import { Paper } from '@/components/journal/paper';
import { Screen, ScreenHeader, SectionHeader } from '@/components/journal/screen';
import { LinkLine } from '@/components/sightings/link-line';
import { ThemedText } from '@/components/themed-text';
import { Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { INATURALIST_CREDIT, LICENCES, OBIS_CITATION, OBIS_CREDIT, REAL_SIGHTINGS_FOOTNOTE } from '@/lib/external-sightings/attribution';
import { REAL_RARITY, REAL_RARITY_SOURCES } from '@/lib/real-rarity';

const OSM_COPYRIGHT = 'https://www.openstreetmap.org/copyright';
const ODBL = 'https://opendatacommons.org/licenses/odbl/1-0/';

/**
 * Data & credits: whose records, photographs and maps ScubaGo shows, under which terms. It is the
 * page every "public records" label links to.
 */
export default function CreditsScreen() {
  const theme = useTheme();
  return (
    <Screen>
      <ScreenHeader eyebrow="About the data" title="Data & credits" />
      <ThemedText>
        ScubaGo’s own sightings are the ones divers log in the app. Everything on this page is public data made by other people and organisations. It is shown with credit, and ScubaGo hasn’t checked it.
      </ThemedText>

      <View style={styles.section}>
        <SectionHeader eyebrow="Source" title="iNaturalist and its observers" />
        <Paper>
          <ThemedText>{INATURALIST_CREDIT.description}</ThemedText>
          <Rule />
          <ThemedText type="label" accessibilityRole="header">
            Licence policy
          </ThemedText>
          <Bullets
            items={[
              'Individual observations and photos: CC0 or CC BY only. Anything else is left out, not shown.',
              'Counts of observations near a site include every research-grade observation, whatever its licence, because a count is a fact and not a record.',
            ]}
          />
          <Rule />
          <LinkLine first label={LICENCES.cc0.name} url={LICENCES.cc0.url} />
          <LinkLine label={LICENCES['cc-by'].name} url={LICENCES['cc-by'].url} />
          <LinkLine label="iNaturalist" url={INATURALIST_CREDIT.homepage} />
          <LinkLine label="iNaturalist terms of use" url={INATURALIST_CREDIT.termsUrl} />
          <LinkLine label="iNaturalist recommended practices for apps" url={INATURALIST_CREDIT.guidelinesUrl} />
        </Paper>
      </View>

      <View style={styles.section}>
        <SectionHeader eyebrow="Source" title="OBIS and its data providers" />
        <Paper>
          <ThemedText>{OBIS_CREDIT.description}</ThemedText>
          <Rule />
          <ThemedText type="label" accessibilityRole="header">
            How OBIS asks to be cited
          </ThemedText>
          <View style={[styles.citation, { borderLeftColor: theme.rule }]}>
            <Text selectable style={[styles.citationText, { color: theme.text }]}>
              {OBIS_CITATION}
            </Text>
          </View>
          <Rule />
          <LinkLine first label="OBIS" url={OBIS_CREDIT.homepage} />
          <LinkLine label="OBIS data policy" url={OBIS_CREDIT.termsUrl} />
          <LinkLine label="How to cite OBIS" url={OBIS_CREDIT.guidelinesUrl} />
        </Paper>
      </View>

      <View style={styles.section}>
        <SectionHeader eyebrow="Rarity" title="How rare each animal is" />
        <Paper>
          <ThemedText>
            {REAL_RARITY.size > 0
              ? 'Each animal’s rarity comes from how often it is recorded at dive sites in its own waters: of the dive sites in the ocean basins where the animal lives, the share with a research-grade iNaturalist observation or an OBIS record of it nearby. Animals are ranked across the whole catalogue. The worldwide counts shown beside a tier are supporting evidence only, and set no tier.'
              : 'Each animal’s rarity is ScubaGo’s own estimate for now. It will come from how often the animal is recorded at dive sites in its own waters, on iNaturalist and in OBIS, once those records have been fetched.'}
          </ThemedText>
          <Rule />
          <Bullets items={[REAL_RARITY_SOURCES.inaturalist.licence, REAL_RARITY_SOURCES.obis.licence]} />
        </Paper>
      </View>

      <View style={styles.section}>
        <SectionHeader eyebrow="Source" title="OpenStreetMap" />
        <Paper>
          <ThemedText>Dive site locations © OpenStreetMap contributors, available under the Open Database License (ODbL).</ThemedText>
          <Rule />
          <LinkLine first label="OpenStreetMap copyright and licence" url={OSM_COPYRIGHT} />
          <LinkLine label="Open Database License 1.0" url={ODBL} />
        </Paper>
      </View>

      <View style={styles.section}>
        <SectionHeader eyebrow="Pictures" title="Species photographs" />
        <Paper>
          <ThemedText>
            The photographs on a species’ page come from iNaturalist, under licences that allow any use with credit (CC0, CC BY or CC BY-SA). Each one is credited to its photographer beneath the photo, and the credit opens the photo on iNaturalist, where its licence is stated. Photos inside a site’s recent observations follow the stricter rule above: CC0 or CC BY only, each with its credit.
          </ThemedText>
        </Paper>
      </View>

      <ThemedText type="caption" themeColor="textSecondary">
        {REAL_SIGHTINGS_FOOTNOTE}
      </ThemedText>
    </Screen>
  );
}

function Rule() {
  const theme = useTheme();
  return <View style={[styles.rule, { backgroundColor: theme.rule }]} />;
}

function Bullets({ items }: { items: string[] }) {
  const theme = useTheme();
  return (
    <View style={styles.bullets}>
      {items.map((item) => (
        <View key={item} style={styles.bullet}>
          <Text style={[styles.dot, { color: theme.textSecondary }]}>•</Text>
          <ThemedText type="small" style={styles.bulletText}>
            {item}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 14,
  },
  rule: {
    height: 1,
    marginVertical: 12,
  },
  bullets: {
    gap: 6,
    marginTop: 6,
  },
  bullet: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    fontFamily: Type.body,
    fontSize: 14,
    lineHeight: 20,
  },
  bulletText: {
    flex: 1,
  },
  citation: {
    borderLeftWidth: 3,
    paddingLeft: 12,
    marginTop: 8,
  },
  citationText: {
    fontFamily: Type.displayItalic,
    fontSize: 15,
    lineHeight: 22,
  },
});
