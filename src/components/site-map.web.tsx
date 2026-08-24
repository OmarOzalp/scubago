import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { SiteMapProps } from '@/components/site-map';

/** Web fallback: the interactive map is native-only, so show a browsable site list. */
export function SiteMap({ sites, highlightedSiteIds, onSelectSite }: SiteMapProps) {
  const theme = useTheme();
  const visible =
    highlightedSiteIds === null ? sites : sites.filter((s) => highlightedSiteIds.has(s.id));

  return (
    <View style={styles.container}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
        The dive map is available in the iOS and Android apps — here’s the site list.
      </ThemedText>
      <FlatList
        data={visible}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ gap: Spacing.two, padding: Spacing.three }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onSelectSite(item.id)}
            style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="smallBold">{item.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {item.region}, {item.country}
            </ThemedText>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: Spacing.six,
  },
  note: {
    paddingHorizontal: Spacing.three,
  },
  row: {
    borderRadius: 14,
    padding: Spacing.three,
    gap: 2,
  },
});
