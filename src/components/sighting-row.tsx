import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SpeciesAvatar } from '@/components/species-avatar';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { DiveSite, Sighting, Species } from '@/lib/types';

interface Props {
  sighting: Sighting;
  species: Species;
  site?: DiveSite;
  /** Show who logged it (used on site details); My Log hides it. */
  showUsername?: boolean;
  /** The diver's change hasn't reached the server yet (My Log, when signed in). */
  pending?: boolean;
  onPress?: () => void;
}

export function SightingRow({ sighting, species, site, showUsername = false, pending = false, onPress }: Props) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
      ]}>
      <SpeciesAvatar species={species} size={44} showRarityRing />
      <View style={styles.body}>
        <View style={styles.title}>
          <ThemedText type="smallBold" numberOfLines={1} style={styles.name}>
            {species.commonName}
          </ThemedText>
          {/* Demo community data (local-only builds): never passed off as another diver's report. */}
          {sighting.isDemo ? (
            <View style={[styles.example, { borderColor: theme.textSecondary }]} accessibilityLabel="Example data, not a real sighting">
              <Text style={[styles.exampleLabel, { color: theme.textSecondary }]}>Example</Text>
            </View>
          ) : null}
          {pending ? (
            <View style={[styles.example, { borderColor: theme.textSecondary, borderStyle: 'dashed' }]} accessibilityLabel="Waiting to sync">
              <Text style={[styles.exampleLabel, { color: theme.textSecondary }]}>
                {sighting.syncError ? 'Not synced' : 'Waiting to sync'}
              </Text>
            </View>
          ) : null}
        </View>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {showUsername && !sighting.isDemo ? `@${sighting.username} · ` : ''}
          {site ? `${site.name} · ` : ''}
          {formatDate(sighting.sightedOn)}
        </ThemedText>
      </View>
      {sighting.photoUri ? <ThemedText type="small">📷</ThemedText> : null}
    </Pressable>
  );
}

export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.two + 2,
    borderRadius: 14,
  },
  body: {
    flex: 1,
    gap: 1,
  },
  title: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  name: {
    flexShrink: 1,
  },
  example: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  exampleLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
});
