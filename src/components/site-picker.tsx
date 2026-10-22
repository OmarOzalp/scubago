import { router } from 'expo-router';
import { memo, useCallback, useDeferredValue, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, View, type ListRenderItemInfo } from 'react-native';

import { FormField } from '@/components/form-field';
import { Icon } from '@/components/icon';
import { PaperButton } from '@/components/journal/paper';
import { OceanButton } from '@/components/ocean-button';
import { OsmCredit } from '@/components/site-list';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { hasImportedSites } from '@/lib/site-clusters';
import { siteAddedBy } from '@/lib/site-details';
import { searchSites } from '@/lib/text-search';
import type { DiveSite } from '@/lib/types';

/** A line of the picker: a heading, or a site (the same site can be in "Recent" and in "All sites"). */
type Row = { kind: 'header'; key: string; title: string } | { kind: 'site'; key: string; site: DiveSite; recent: boolean };

/**
 * Choosing the dive site: a search, the diver's recent sites, then every site, and a way to add one
 * that isn't listed (it comes back through onSiteAdded in lib/site-added).
 *
 * The search stays at the top while the list scrolls under it. The list is a windowed FlatList (a few
 * hundred sites are no more work than a few dozen), and the search is run on a deferred copy of what
 * was typed, so the field keeps up with the keyboard while the matching catches up.
 *
 * Rows differ in height (a long name or region takes two lines, and text can be scaled up), so there
 * is no `getItemLayout`: a wrong guess would put rows in the wrong place.
 */
export function SitePicker({
  sites,
  recentSiteIds,
  userId,
  onPick,
}: {
  sites: DiveSite[];
  recentSiteIds: string[];
  userId: string | undefined;
  onPick: (site: DiveSite) => void;
}) {
  const [query, setQuery] = useState('');
  const typed = useDeferredValue(query);
  const searching = typed.trim().length > 0;

  // The newest onPick, so a row doesn't change (and rebuild) because its parent made a new function.
  const pick = useRef(onPick);
  useLayoutEffect(() => {
    pick.current = onPick;
  });
  const handlePick = useCallback((site: DiveSite) => pick.current(site), []);

  const byName = useMemo(() => [...sites].sort((a, b) => a.name.localeCompare(b.name)), [sites]);
  const byId = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites]);
  const listed = useMemo(() => (searching ? searchSites(sites, typed) : byName), [sites, typed, searching, byName]);

  // `recentSiteIds` is usually a new array each render; what is in it is what counts.
  const recentKey = recentSiteIds.join('\n');
  const rows = useMemo<Row[]>(() => {
    const recent = recentKey ? recentKey.split('\n').map((id) => byId.get(id)).filter((s): s is DiveSite => !!s) : [];
    const out: Row[] = [];
    if (!searching && recent.length > 0) {
      out.push({ kind: 'header', key: 'header:recent', title: 'Recent' });
      for (const site of recent) out.push({ kind: 'site', key: `recent:${site.id}`, site, recent: true });
      out.push({ kind: 'header', key: 'header:all', title: 'All sites' });
    }
    for (const site of listed) out.push({ kind: 'site', key: site.id, site, recent: false });
    return out;
  }, [recentKey, byId, searching, listed]);

  const credit = useMemo(() => hasImportedSites(sites), [sites]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Row>) =>
      item.kind === 'header' ? (
        <ThemedText type="label" accessibilityRole="header" style={styles.groupLabel}>
          {item.title}
        </ThemedText>
      ) : (
        <SiteRow site={item.site} userId={userId} recent={item.recent} onPick={handlePick} />
      ),
    [userId, handlePick],
  );

  return (
    <View style={styles.picker}>
      <View style={styles.search}>
        <FormField
          label="Where did you dive?"
          value={query}
          onChangeText={setQuery}
          placeholder="Search sites, regions, countries…"
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>
      <FlatList
        data={rows}
        keyExtractor={rowKey}
        renderItem={renderItem}
        ItemSeparatorComponent={Separator}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        contentContainerStyle={styles.content}
        ListEmptyComponent={
          searching ? (
            <ThemedText type="caption" themeColor="textSecondary" accessibilityLiveRegion="polite">
              No site matches “{typed.trim()}”.
            </ThemedText>
          ) : null
        }
        ListFooterComponent={
          <View style={styles.footer}>
            <OceanButton
              title="Can’t find it? Add a dive site"
              icon="addSite"
              variant="secondary"
              onPress={() => router.push({ pathname: '/add-site', params: { then: 'log', name: query.trim() } })}
            />
            {credit ? <OsmCredit /> : null}
          </View>
        }
      />
    </View>
  );
}

const rowKey = (row: Row) => row.key;

function Separator() {
  return <View style={styles.separator} />;
}

/** One site. It takes the site itself and a stable callback, so it is only rebuilt when its own site (or who is looking) changes. */
const SiteRow = memo(function SiteRow({
  site,
  userId,
  recent,
  onPick,
}: {
  site: DiveSite;
  userId: string | undefined;
  recent: boolean;
  onPick: (site: DiveSite) => void;
}) {
  const theme = useTheme();
  const addedBy = siteAddedBy(site, userId);
  const where = `${site.region}, ${site.country}${addedBy ? ` · added by ${addedBy}` : ''}`;
  return (
    <PaperButton onPress={() => onPick(site)} accessibilityLabel={`${site.name}, ${where}`} style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: recent ? `${theme.wash}66` : theme.backgroundSelected }]}>
        <Icon name={recent ? 'clock' : 'pin'} size={20} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text numberOfLines={2} style={[styles.rowTitle, { color: theme.text }]}>
          {site.name}
        </Text>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
          {where}
        </ThemedText>
      </View>
      <Icon name="chevronRight" size={16} color={theme.textSecondary} weight="bold" />
    </PaperButton>
  );
});

const styles = StyleSheet.create({
  picker: { flex: 1 },
  search: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two + 2 },
  content: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.three },
  separator: { height: Spacing.two + 2 },
  // Below the last row as the button used to sit: the list's 10 and a little more.
  footer: { marginTop: Spacing.three + 2, gap: Spacing.two },
  groupLabel: { marginTop: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: Radius.md,
    padding: 10,
    paddingRight: 12,
    minHeight: 64,
  },
  rowIcon: { width: 40, height: 40, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontFamily: Type.bodyHeavy, fontSize: 15, lineHeight: 20 },
});
