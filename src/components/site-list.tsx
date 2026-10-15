import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { DiveSite } from '@/lib/types';

/**
 * Dive sites as a plain list: the web app's map (the interactive map is native-only), and the
 * "List" view on phones, which screen-reader users can move through one site at a time.
 */
export function SiteList({
  sites,
  highlightedSiteIds,
  onSelectSite,
  note,
  topInset = 0,
}: {
  sites: DiveSite[];
  highlightedSiteIds: Set<string> | null;
  onSelectSite: (siteId: string) => void;
  note?: string;
  topInset?: number;
}) {
  const theme = useTheme();
  const visible = highlightedSiteIds === null ? sites : sites.filter((s) => highlightedSiteIds.has(s.id));

  return (
    <View style={[styles.container, { paddingTop: topInset, backgroundColor: theme.background }]}>
      {note ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
          {note}
        </ThemedText>
      ) : null}
      <FlatList
        data={visible}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ gap: Spacing.two, padding: Spacing.three, paddingBottom: 160 }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onSelectSite(item.id)}
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${item.region}, ${item.country}`}
            style={({ pressed }) => [styles.row, { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement }]}>
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
  container: { flex: 1 },
  note: { paddingHorizontal: Spacing.three },
  row: { borderRadius: 14, padding: Spacing.three, gap: 2, minHeight: 56 },
});
