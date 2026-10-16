import { FlatList, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Paper, PaperButton } from '@/components/journal/paper';
import { Wash } from '@/components/journal/wash';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing, TabBarOverhang, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { DiveSite } from '@/lib/types';
import { hashSeed } from '@/lib/wash';

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
    <FlatList
      data={visible}
      keyExtractor={(s) => s.id}
      style={[styles.list, { backgroundColor: theme.background }]}
      contentContainerStyle={[styles.content, { paddingTop: topInset + Spacing.one }]}
      ListHeaderComponent={
        <View style={styles.header}>
          {note ? (
            <Paper tone="sand" style={styles.note}>
              <Icon name="map" size={22} wash={theme.sun} />
              <ThemedText type="small" style={{ flex: 1 }}>
                {note}
              </ThemedText>
            </Paper>
          ) : null}
          <ThemedText type="label">
            {visible.length} {visible.length === 1 ? 'site' : 'sites'}
          </ThemedText>
        </View>
      }
      ListEmptyComponent={
        <ThemedText type="caption" themeColor="textSecondary" style={styles.empty}>
          No dive sites to show for this species yet.
        </ThemedText>
      }
      renderItem={({ item }) => (
        <PaperButton onPress={() => onSelectSite(item.id)} accessibilityLabel={`${item.name}, ${item.region}, ${item.country}`} style={styles.row}>
          {/* Each site gets its own watercolour blob behind the pin, so the list isn't one repeated mark. */}
          <View style={styles.pin}>
            <Wash width={46} height={38} color={theme.wash} seed={hashSeed(item.id)} style={StyleSheet.absoluteFill} />
            <Icon name="pin" size={22} wash={theme.coral} washOpacity={0.45} />
          </View>
          <View style={styles.body}>
            <Text numberOfLines={2} style={[styles.name, { color: theme.text }]}>
              {item.name}
            </Text>
            <Text numberOfLines={1} style={[styles.where, { color: theme.textSecondary }]}>
              {item.region}, {item.country}
            </Text>
          </View>
          <Icon name="chevronRight" size={18} color={theme.textSecondary} weight="bold" />
        </PaperButton>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    // Room for the raised "Log dive" button under the last row.
    paddingBottom: TabBarOverhang + Spacing.five,
    gap: 10,
  },
  header: {
    gap: 12,
    marginBottom: 2,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  empty: {
    textAlign: 'center',
    paddingVertical: Spacing.four,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  pin: {
    width: 46,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 1,
  },
  name: {
    fontFamily: Type.display,
    fontSize: 17,
    lineHeight: 22,
  },
  where: {
    fontFamily: Type.body,
    fontSize: 14,
    lineHeight: 19,
  },
});
