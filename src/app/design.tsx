import { Stack } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SpeciesCard, useCardGrid, onGridLayout } from '@/components/species-card';
import { SpeciesAvatar } from '@/components/species-avatar';
import {
  Button,
  Card,
  Chip,
  ChipRow,
  EmptyState,
  IconButton,
  List,
  ListRow,
  Notice,
  ProgressBar,
  ProgressRing,
  Screen,
  ScreenTitle,
  SearchField,
  Section,
  Segmented,
  Tag,
  TextField,
} from '@/components/ui';
import { Colors, Radius, Space, TypeScale, type TypeName } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { CATALOG_BY_ID } from '@/lib/catalog';
import { RARITY_COLOR, RARITY_LABEL, RARITY_ORDER, RARITY_TEXT } from '@/lib/rarity';
import { useSchemeName } from '@/hooks/use-theme';

/**
 * The design system's gallery: every primitive in its states, in the scheme the phone is in. Not linked
 * from the app; open /design. What the design review looks at first (docs/design.md).
 */
export default function DesignGallery() {
  const theme = useTheme();
  const scheme = useSchemeName();
  const [chip, setChip] = useState('all');
  const [view, setView] = useState('animals');
  const [query, setQuery] = useState('manta');
  const [on, setOn] = useState(true);
  const [name, setName] = useState('');
  const [inner, setInner] = useState(358);
  const { cardWidth } = useCardGrid(inner);
  const species = ['grey-reef-shark', 'brownbanded-bamboo-shark', 'common-seahorse', 'oceanic-whitetip', 'tasselled-wobbegong', 'whale-shark'].map((id) => CATALOG_BY_ID.get(id)!);
  const swatches = ['background', 'backgroundElement', 'backgroundSelected', 'rule', 'text', 'textSecondary', 'textTertiary', 'tint', 'lagoon', 'lagoonSoft', 'coral', 'coralSoft', 'sun', 'sunSoft', 'turquoise', 'danger'] as const;
  const scale: TypeName[] = ['display', 'title', 'figure', 'headline', 'body', 'bodyStrong', 'callout', 'subhead', 'footnote', 'footnoteStrong'];
  return (
    <>
      <Stack.Screen options={{ title: 'Design', headerTitle: '' }} />
      <Screen>
        <ScreenTitle title="Design" subtitle="Tide, the ScubaGo design system" actions={<IconButton icon="share" accessibilityLabel="Share" onPress={() => {}} />} />

        <Section title="Colour" flush>
          <View style={styles.swatches}>
            {swatches.map((key) => (
              <View key={key} style={styles.swatch}>
                <View style={[styles.swatchFill, { backgroundColor: Colors[scheme][key], borderColor: theme.rule }]} />
                <Text numberOfLines={1} style={[TypeScale.footnote, styles.flex, { color: theme.textSecondary }]}>
                  {key}
                </Text>
              </View>
            ))}
          </View>
        </Section>

        <Section title="Type">
          <Card style={styles.stack}>
            {scale.map((type) => (
              <View key={type} style={styles.typeRow}>
                <Text style={[TypeScale[type], { color: theme.text }]} numberOfLines={1}>
                  {type === 'figure' ? '1,284' : type === 'display' ? 'Your island' : type === 'title' ? 'Grey Reef Shark' : 'Calm water, clear sight'}
                </Text>
                <Text style={[TypeScale.footnote, { color: theme.textTertiary }]}>
                  {type} {TypeScale[type].fontSize}/{TypeScale[type].lineHeight}
                </Text>
              </View>
            ))}
            <Text style={[TypeScale.scientific, { color: theme.textSecondary }]}>Carcharhinus amblyrhynchos</Text>
          </Card>
        </Section>

        <Section title="Buttons">
          <Button title="Save dive" onPress={() => {}} />
          <Button title="Log a dive" icon="plus" variant="log" onPress={() => {}} />
          <Button title="Add what you saw" icon="plus" variant="secondary" onPress={() => {}} />
          <View style={styles.row}>
            <Button title="Details" size="md" variant="secondary" onPress={() => {}} style={styles.flex} />
            <Button title="Log here" size="md" variant="log" onPress={() => {}} style={styles.flex} />
          </View>
          <View style={styles.row}>
            <Button title="Saving" size="md" loading onPress={() => {}} style={styles.flex} />
            <Button title="Disabled" size="md" disabled onPress={() => {}} style={styles.flex} />
          </View>
          <View style={styles.row}>
            <Button title="Cancel" variant="plain" size="md" onPress={() => {}} />
            <Button title="Delete page" variant="destructive" size="md" icon="trash" onPress={() => {}} style={styles.flex} />
          </View>
        </Section>

        <Section title="Icon buttons">
          <View style={styles.row}>
            <IconButton icon="share" accessibilityLabel="Share" onPress={() => {}} />
            <IconButton icon="account" accessibilityLabel="You" onPress={() => {}} />
            <IconButton icon="more" accessibilityLabel="More" onPress={() => {}} />
            <IconButton icon="edit" accessibilityLabel="Edit" onPress={() => {}} disabled />
            <Card padded={false} style={styles.bar}>
              <IconButton icon="close" on="bar" accessibilityLabel="Close" onPress={() => {}} />
              <IconButton icon="list" on="bar" accessibilityLabel="List" onPress={() => {}} />
            </Card>
          </View>
        </Section>

        <Section title="Chips">
          <ChipRow accessibilityLabel="Filter">
            {['seen', 'all', 'sharks', 'rays', 'turtles', 'reef fish', 'mammals'].map((value) => (
              <Chip key={value} label={value[0].toUpperCase() + value.slice(1)} selected={chip === value} onPress={() => setChip(value)} />
            ))}
          </ChipRow>
          <ChipRow accessibilityLabel="Islands">
            <Chip label="Coral Reef" dot={theme.turquoise} count={8} selected onPress={() => {}} />
            <Chip label="Kelp Forest" dot={RARITY_COLOR.uncommon} count={1} selected={false} onPress={() => {}} />
            <Chip label="Mangroves" dot={RARITY_COLOR.epic} count={3} selected={false} onPress={() => {}} />
          </ChipRow>
        </Section>

        <Section title="Segmented">
          <Segmented
            accessibilityLabel="Show"
            value={view}
            onChange={setView}
            options={[
              { value: 'animals', label: 'Animals' },
              { value: 'sets', label: 'Sets' },
              { value: 'badges', label: 'Badges' },
            ]}
          />
        </Section>

        <Section title="Fields">
          <SearchField value={query} onChangeText={setQuery} placeholder="Search by name" />
          <SearchField value="" onPress={() => {}} placeholder="Search dive sites or animals" />
          <TextField label="Dive site name" value={name} onChangeText={setName} placeholder="e.g. Blue Corner" helper="As the dive centre calls it." />
          <TextField label="Depth (m)" value="140" onChangeText={() => {}} error="Deeper than recreational limits: check the number." />
        </Section>

        <Section title="Tags and progress">
          <View style={styles.wrap}>
            <Tag label="New" tone="sun" />
            <Tag label="Verified" tone="lagoon" />
            <Tag label="Only you" />
            <Tag label="Waiting to sync" dashed />
            <Tag label="Removed" tone="danger" />
          </View>
          <View style={styles.wrap}>
            {RARITY_ORDER.map((r) => (
              <Tag key={r} label={RARITY_LABEL[r]} color={RARITY_COLOR[r]} text={RARITY_TEXT[scheme][r]} />
            ))}
          </View>
          <Card style={styles.progressCard}>
            <View style={styles.flexGap}>
              <Text style={[TypeScale.subheadStrong, { color: theme.text }]}>2 more animals for a lush island grove</Text>
              <ProgressBar fraction={0.66} accessibilityLabel="8 of 12 species" max={12} now={8} />
            </View>
            <ProgressRing fraction={0.4} label="4" accessibilityLabel="4 of 10" />
          </Card>
        </Section>

        <Section title="Cards">
          <Card>
            <Text style={[TypeScale.headline, { color: theme.text }]}>Card title</Text>
            <Text style={[TypeScale.callout, { color: theme.textSecondary, marginTop: Space.s1 }]}>Secondary reading text in a card: one surface, a soft shadow, no border.</Text>
          </Card>
          <Card onPress={() => {}} accessibilityLabel="A card you can tap">
            <Text style={[TypeScale.bodyStrong, { color: theme.text }]}>A card you can tap</Text>
            <Text style={[TypeScale.subhead, { color: theme.textSecondary }]}>Scales to 0.98 while pressed.</Text>
          </Card>
        </Section>

        <Section title="Lists" action={{ label: 'See all', onPress: () => {} }}>
          <List>
            <ListRow leading="sync" title="Back up and sync" subtitle="Sign in to keep your log safe" onPress={() => {}} />
            <ListRow leading="logbook" title="Dives before ScubaGo" value="21" onPress={() => {}} />
            <ListRow leading="waves" title="Animate the ocean" switchValue={on} onPress={() => setOn(!on)} />
            <ListRow
              leading={<SpeciesAvatar species={species[0]} size={44} />}
              title="Grey Reef Shark"
              subtitle="Seen at 3 sites, most recently at Richelieu Rock in the Andaman Sea"
              subtitleLines={2}
              onPress={() => {}}
            />
            <ListRow leading="pin" title="Richelieu Rock" subtitle="Andaman Sea, Thailand" meta={{ text: 'Stamped 4 Nov 2026 · 2 visits', color: theme.stamp }} selected onPress={() => {}} />
          </List>
        </Section>

        <Section title="Notices and empty states">
          <Notice icon="map" onDismiss={() => {}}>
            The map is in the iOS and Android apps.
          </Notice>
          <Card>
            <EmptyState icon="fieldGuide" title="No animals yet" message="Animals you log appear here." action={{ title: 'Log a dive', onPress: () => {}, variant: 'log', icon: 'plus' }} />
          </Card>
        </Section>

        <Section title="Species cards">
          <View style={styles.grid} onLayout={onGridLayout(setInner)}>
            {species.map((s, i) => (
              <SpeciesCard key={s.id} species={s} width={cardWidth} count={i % 2 === 0 ? i + 1 : 0} isNew={i === 0} onPress={() => {}} />
            ))}
          </View>
        </Section>

        <Section title="Radius">
          <View style={styles.row}>
            {(['sm', 'md', 'lg', 'xl'] as const).map((r) => (
              <View key={r} style={styles.radiusItem}>
                <View style={[styles.radiusBox, { borderRadius: Radius[r], backgroundColor: theme.lagoonSoft }]} />
                <Text style={[TypeScale.footnote, { color: theme.textSecondary }]}>
                  {r} {Radius[r]}
                </Text>
              </View>
            ))}
          </View>
        </Section>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  swatches: { flexDirection: 'row', flexWrap: 'wrap', rowGap: Space.s2, columnGap: Space.s3 },
  swatch: { width: '47%', flexDirection: 'row', alignItems: 'center', gap: Space.s2 },
  swatchFill: { width: 32, height: 32, borderRadius: Radius.sm, borderWidth: StyleSheet.hairlineWidth },
  stack: { gap: Space.s3 },
  typeRow: { gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.s3 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.s2 },
  flex: { flex: 1 },
  flexGap: { flex: 1, gap: Space.s2 },
  bar: { flexDirection: 'row', paddingHorizontal: Space.s1 },
  progressCard: { flexDirection: 'row', alignItems: 'center', gap: Space.s4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.s3 },
  radiusItem: { flex: 1, gap: Space.s1 },
  radiusBox: { height: 56 },
});
