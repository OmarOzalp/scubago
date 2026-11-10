import { router } from 'expo-router';
import { memo, useCallback, useDeferredValue, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, View, type ListRenderItemInfo } from 'react-native';

import { OsmCredit } from '@/components/site-list';
import { ListRow, type RowPosition } from '@/components/ui/list';
import { SectionLink } from '@/components/ui/screen';
import { SearchField } from '@/components/ui/text-field';
import { Space, TypeScale } from '@/constants/theme';
import { canonicalSiteId } from '@/data/sites';
import { useTheme } from '@/hooks/use-theme';
import { hasImportedSites } from '@/lib/site-clusters';
import { siteAddedBy } from '@/lib/site-details';
import { searchSites } from '@/lib/text-search';
import type { DiveSite } from '@/lib/types';

/** A line of the picker: a heading, or a site (the same site can be in "Recent" and in "All sites"). */
type Row = { kind: 'header'; key: string; title: string } | { kind: 'site'; key: string; site: DiveSite; recent: boolean; position: RowPosition };

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
  const theme = useTheme();
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
    // A hidden copy's id is the listed site it stands for (once, if both are recent).
    const recentIds = recentKey ? [...new Set(recentKey.split('\n').map(canonicalSiteId))] : [];
    const recent = recentIds.map((id) => byId.get(id)).filter((s): s is DiveSite => !!s);
    const out: Row[] = [];
    // A group's rows draw its corners and hairlines: each row says where it sits in its group.
    const place = (i: number, n: number): RowPosition => (n === 1 ? 'only' : i === 0 ? 'first' : i === n - 1 ? 'last' : 'middle');
    if (!searching && recent.length > 0) {
      out.push({ kind: 'header', key: 'header:recent', title: 'Recent' });
      recent.forEach((site, i) => out.push({ kind: 'site', key: `recent:${site.id}`, site, recent: true, position: place(i, recent.length) }));
      out.push({ kind: 'header', key: 'header:all', title: 'All sites' });
    }
    listed.forEach((site, i) => out.push({ kind: 'site', key: site.id, site, recent: false, position: place(i, listed.length) }));
    return out;
  }, [recentKey, byId, searching, listed]);

  const credit = useMemo(() => hasImportedSites(sites), [sites]);
  // Names more than one site has ("Blue Hole"): those rows keep the whole place, as it is what tells them apart.
  const sharedNames = useMemo(() => {
    const seen = new Set<string>();
    const shared = new Set<string>();
    for (const site of sites) {
      const key = site.name.toLowerCase();
      if (seen.has(key)) shared.add(key);
      seen.add(key);
    }
    return shared;
  }, [sites]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Row>) =>
      item.kind === 'header' ? (
        <Text accessibilityRole="header" style={[styles.groupLabel, { color: theme.text }]}>
          {item.title}
        </Text>
      ) : (
        <SiteRow site={item.site} userId={userId} recent={item.recent} position={item.position} sharedName={sharedNames.has(item.site.name.toLowerCase())} onPick={handlePick} />
      ),
    [userId, handlePick, sharedNames, theme.text],
  );

  return (
    <View style={styles.picker}>
      <View style={styles.search}>
        <Text accessibilityRole="header" style={[styles.question, { color: theme.text }]}>
          Where did you dive?
        </Text>
        <SearchField
          accessibilityLabel="Where did you dive?"
          value={query}
          onChangeText={setQuery}
          placeholder="Search sites, regions, countries…"
        />
        {/* Right under the search, where the diver is looking when the site isn't there, not at the end of a list of hundreds. */}
        <View style={styles.addSite}>
          <SectionLink
            label="Can’t find it? Add a dive site"
            role="button"
            onPress={() => router.push({ pathname: '/add-site', params: { then: 'log', name: query.trim() } })}
          />
        </View>
      </View>
      <FlatList
        data={rows}
        keyExtractor={rowKey}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        contentContainerStyle={styles.content}
        ListEmptyComponent={
          searching ? (
            <Text accessibilityLiveRegion="polite" style={[styles.empty, { color: theme.textSecondary }]}>
              No site matches “{typed.trim()}”.
            </Text>
          ) : undefined
        }
        ListFooterComponent={
          credit ? (
            <View style={styles.footer}>
              <OsmCredit />
            </View>
          ) : undefined
        }
      />
    </View>
  );
}

const rowKey = (row: Row) => row.key;

/** "Marsa Alam & the south, Red Sea" is "Red Sea" here: the last part is the sea or area people know. */
export function shortRegion(region: string): string {
  const parts = region.split(',').map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : region;
}

/** One site. It takes the site itself and a stable callback, so it is only rebuilt when its own site (or who is looking) changes. */
const SiteRow = memo(function SiteRow({
  site,
  userId,
  recent,
  position,
  sharedName,
  onPick,
}: {
  site: DiveSite;
  userId: string | undefined;
  recent: boolean;
  position: RowPosition;
  /** Another site has this name: show the whole place. */
  sharedName: boolean;
  onPick: (site: DiveSite) => void;
}) {
  const addedBy = siteAddedBy(site, userId);
  const suffix = addedBy ? ` · added by ${addedBy}` : '';
  // The row says "Red Sea, Egypt"; "Marsa Alam & the south, Red Sea, Egypt" is still what a screen reader hears.
  const where = `${sharedName ? site.region : shortRegion(site.region)}, ${site.country}${suffix}`;
  return (
    <ListRow
      position={position}
      leading={recent ? 'clock' : 'pin'}
      title={site.name}
      titleLines={2}
      subtitle={where}
      subtitleLines={2}
      accessibilityLabel={`${site.name}, ${site.region}, ${site.country}${suffix}`}
      onPress={() => onPick(site)}
    />
  );
});

const styles = StyleSheet.create({
  picker: { flex: 1 },
  search: { paddingHorizontal: Space.s4, paddingTop: Space.s4, paddingBottom: Space.s2, gap: Space.s3 },
  content: { paddingHorizontal: Space.s4, paddingBottom: Space.s4 },
  footer: { marginTop: Space.s4 },
  question: { ...TypeScale.headline },
  addSite: { alignSelf: 'flex-start' },
  groupLabel: { ...TypeScale.headline, marginTop: Space.s6, marginBottom: Space.s3 },
  empty: { ...TypeScale.callout },
});
