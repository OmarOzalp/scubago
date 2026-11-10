import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { openExternalUrl } from '@/components/sightings/open-external';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { List, ListRow } from '@/components/ui/list';
import { Screen, ScreenTitle, Section } from '@/components/ui/screen';
import { Radius, Space, TypeScale } from '@/constants/theme';
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
      <ScreenTitle title="Data & credits" />
      <ThemedText>
        ScubaGo’s own sightings are the ones divers log in the app. Everything on this page is public data made by other people and organisations. It is shown with credit, and ScubaGo hasn’t checked it.
      </ThemedText>

      <Section title="iNaturalist and its observers">
        <Card style={styles.card}>
          <ThemedText>{INATURALIST_CREDIT.description}</ThemedText>
          <Rule />
          <ThemedText type="subheadStrong" accessibilityRole="header">
            Licence policy
          </ThemedText>
          <Bullets
            items={[
              'Individual observations and photos: CC0 or CC BY only. Anything else is left out, not shown.',
              'Counts of observations near a site include every research-grade observation, whatever its licence, because a count is a fact and not a record.',
            ]}
          />
        </Card>
        <Links
          links={[
            { label: LICENCES.cc0.name, url: LICENCES.cc0.url },
            { label: LICENCES['cc-by'].name, url: LICENCES['cc-by'].url },
            { label: 'iNaturalist', url: INATURALIST_CREDIT.homepage },
            { label: 'iNaturalist terms of use', url: INATURALIST_CREDIT.termsUrl },
            { label: 'iNaturalist recommended practices for apps', url: INATURALIST_CREDIT.guidelinesUrl },
          ]}
        />
      </Section>

      <Section title="OBIS and its data providers">
        <Card style={styles.card}>
          <ThemedText>{OBIS_CREDIT.description}</ThemedText>
          <Rule />
          <ThemedText type="subheadStrong" accessibilityRole="header">
            How OBIS asks to be cited
          </ThemedText>
          <View style={[styles.citation, { backgroundColor: theme.backgroundSelected }]}>
            <Text selectable style={[TypeScale.callout, { color: theme.text }]}>
              {OBIS_CITATION}
            </Text>
          </View>
        </Card>
        <Links
          links={[
            { label: 'OBIS', url: OBIS_CREDIT.homepage },
            { label: 'OBIS data policy', url: OBIS_CREDIT.termsUrl },
            { label: 'How to cite OBIS', url: OBIS_CREDIT.guidelinesUrl },
          ]}
        />
      </Section>

      <Section title="How rare each animal is">
        <Card style={styles.card}>
          <ThemedText>
            {REAL_RARITY.size > 0
              ? 'Each animal’s rarity comes from how often it is recorded at dive sites in its own waters: of the dive sites in the ocean basins where the animal lives, the share with a research-grade iNaturalist observation or an OBIS record of it nearby. Animals are ranked across the whole catalogue. The worldwide counts shown beside a tier are supporting evidence only, and set no tier.'
              : 'Each animal’s rarity is ScubaGo’s own estimate for now. It will come from how often the animal is recorded at dive sites in its own waters, on iNaturalist and in OBIS, once those records have been fetched.'}
          </ThemedText>
          <Rule />
          <Bullets items={[REAL_RARITY_SOURCES.inaturalist.licence, REAL_RARITY_SOURCES.obis.licence]} />
        </Card>
      </Section>

      <Section title="OpenStreetMap">
        <Card>
          <ThemedText>Dive site locations © OpenStreetMap contributors, available under the Open Database License (ODbL).</ThemedText>
        </Card>
        <Links
          links={[
            { label: 'OpenStreetMap copyright and licence', url: OSM_COPYRIGHT },
            { label: 'Open Database License 1.0', url: ODBL },
          ]}
        />
      </Section>

      <Section title="Species photographs">
        <Card>
          <ThemedText>
            The photographs on a species’ page come from iNaturalist, under licences that allow any use with credit (CC0, CC BY or CC BY-SA). Each one is credited to its photographer beneath the photo, and the credit opens the photo on iNaturalist, where its licence is stated. Photos inside a site’s recent observations follow the stricter rule above: CC0 or CC BY only, each with its credit.
          </ThemedText>
        </Card>
      </Section>

      <ThemedText type="footnote" themeColor="textSecondary">
        {REAL_SIGHTINGS_FOOTNOTE}
      </ThemedText>
    </Screen>
  );
}

/** Pages that open in the browser: one grouped list, each row a link. */
function Links({ links }: { links: { label: string; url: string }[] }) {
  const theme = useTheme();
  return (
    <List>
      {links.map((link) => (
        <ListRow
          key={link.label}
          title={link.label}
          titleLines={2}
          accessibilityRole="link"
          accessibilityLabel={link.label}
          accessibilityHint="Opens in your browser"
          trailing={<Icon name="external" size={18} color={theme.tint} />}
          onPress={() => void openExternalUrl(link.url)}
        />
      ))}
    </List>
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
          <Text style={[TypeScale.subhead, { color: theme.textSecondary }]}>•</Text>
          <ThemedText type="subhead" style={styles.bulletText}>
            {item}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Space.s3,
  },
  rule: {
    height: StyleSheet.hairlineWidth,
  },
  bullets: {
    gap: Space.s2,
  },
  bullet: {
    flexDirection: 'row',
    gap: Space.s2,
  },
  bulletText: {
    flex: 1,
  },
  citation: {
    borderRadius: Radius.sm,
    padding: Space.s3,
  },
});
