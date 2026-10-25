import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, type ListRenderItemInfo, type StyleProp, type ViewStyle } from 'react-native';

import { ExternalLink } from '@/components/external-link';
import { Icon } from '@/components/icon';
import { Paper, PaperButton } from '@/components/journal/paper';
import { Wash } from '@/components/journal/wash';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Radius, Spacing, TabBarOverhang, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { hasImportedSites } from '@/lib/site-clusters';
import { OSM_ATTRIBUTION } from '@/lib/site-import';
import type { DiveSite } from '@/lib/types';
import { hashSeed } from '@/lib/wash';

/** OpenStreetMap's own page on how its data may be used and credited. */
export const OSM_COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright';
/** What the map and the lists say when they show sites imported from OpenStreetMap (docs/osm-sites.md). */
export const OSM_CREDIT = `Dive sites ${OSM_ATTRIBUTION}`;

/**
 * The credit OpenStreetMap's licence asks for wherever its sites are shown: a small link to the
 * copyright page. On the map it is a little label that sits at the top, clear of the map provider's
 * own logo and legal link at the bottom; under a list it is a plain line. The words stay small and
 * exactly as the licence has them; under a list the padding round them makes the link 44 points to hit
 * (the chip on the map is a 28 point box of its own, as small as the map provider's).
 */
export function OsmCredit({ onMap = false, style }: { onMap?: boolean; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View
      style={[
        onMap
          ? [styles.creditOnMap, { backgroundColor: `${theme.backgroundElement}E6`, borderColor: theme.cardBorder }]
          : styles.creditInList,
        style,
      ]}>
      <ExternalLink
        href={OSM_COPYRIGHT_URL}
        rel="noopener noreferrer"
        accessibilityLabel={`${OSM_CREDIT}. Opens OpenStreetMap’s copyright page`}
        maxFontSizeMultiplier={1.3}
        style={[styles.creditText, !onMap && styles.creditTextInList, { color: onMap ? theme.tint : theme.textSecondary }]}>
        {OSM_CREDIT}
      </ExternalLink>
    </View>
  );
}

/**
 * Where a site is, in the list: "Red Sea, Egypt", the broad region and the country. A site's own
 * sub-region ("Sinai", "Marsa Alam & the south") only shows when two sites share a name (`full`), as
 * the one thing that tells them apart.
 */
export function siteWhere(region: string, country: string, full = false): string {
  const broad = full ? region : (region.split(', ').pop() ?? region);
  return broad === country ? country : `${broad}, ${country}`;
}

/**
 * Dive sites as a plain list: the web app's map (the interactive map is native-only), and the
 * "List" view on phones, which screen-reader users can move through one site at a time.
 *
 * It is a windowed FlatList: with several hundred sites only the rows near the screen are built.
 * Rows differ in height (a long name takes two lines, and text can be scaled up), so there is no
 * `getItemLayout`: a wrong guess would put rows in the wrong place.
 */
export const SiteList = memo(function SiteList({
  sites,
  highlightedSiteIds,
  onSelectSite,
  note,
  onDismissNote,
  topInset = 0,
  reveal = null,
  selectedSiteId = null,
}: {
  sites: DiveSite[];
  highlightedSiteIds: Set<string> | null;
  onSelectSite: (siteId: string) => void;
  note?: string;
  /** With a `note`: the way to close it for good. */
  onDismissNote?: () => void;
  topInset?: number;
  /**
   * Scroll to this site (or to the top, for a null `siteId`) when a new one is given: where the map
   * would fly to the site the search picked. Compared by identity.
   */
  reveal?: { siteId: string | null } | null;
  /** The site whose card is open: its row is edged in coral. */
  selectedSiteId?: string | null;
}) {
  const theme = useTheme();
  const listRef = useRef<FlatList<DiveSite>>(null);
  const visible = useMemo(
    () => (highlightedSiteIds === null ? sites : sites.filter((s) => highlightedSiteIds.has(s.id))),
    [sites, highlightedSiteIds],
  );
  const credit = useMemo(() => hasImportedSites(sites), [sites]);
  // Names more than one site has: those rows keep their full region, which is what tells them apart.
  const sharedNames = useMemo(() => {
    const seen = new Set<string>();
    const shared = new Set<string>();
    for (const site of sites) (seen.has(site.name) ? shared : seen).add(site.name);
    return shared;
  }, [sites]);

  // Rows differ in height, so a row that hasn't been drawn yet has no known place: `onScrollToIndexFailed`
  // jumps to where the average row height puts it, and then asks again once rows there exist.
  const revealed = useRef<typeof reveal>(null);
  useEffect(() => {
    // Once per request, even if the sites shown change under it.
    if (!reveal || revealed.current === reveal) return;
    const list = listRef.current;
    const index = reveal.siteId === null ? 0 : visible.findIndex((s) => s.id === reveal.siteId);
    if (!list || index < 0) return;
    revealed.current = reveal;
    // After this render's rows are laid out. Not cancelled when `visible` changes: it is asked for once.
    setTimeout(() => {
      try {
        if (reveal.siteId === null) list.scrollToOffset({ offset: 0, animated: false });
        else list.scrollToIndex({ index, animated: true, viewPosition: 0.1 });
      } catch {
        // The list isn't ready to scroll (gone, or not laid out yet): staying where it is does no harm.
      }
    }, 50);
  }, [reveal, visible]);
  const handleScrollFailed = useCallback((info: { index: number; averageItemLength: number }) => {
    listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
    setTimeout(() => {
      try {
        listRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.1 });
      } catch {
        // Gave up: the average put it near enough.
      }
    }, 120);
  }, []);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<DiveSite>) => (
      <SiteRow
        id={item.id}
        name={item.name}
        region={item.region}
        country={item.country}
        full={sharedNames.has(item.name)}
        selected={item.id === selectedSiteId}
        onSelect={onSelectSite}
      />
    ),
    [onSelectSite, selectedSiteId, sharedNames],
  );

  return (
    <FlatList
      ref={listRef}
      data={visible}
      onScrollToIndexFailed={handleScrollFailed}
      keyExtractor={siteKey}
      renderItem={renderItem}
      ItemSeparatorComponent={Separator}
      initialNumToRender={12}
      maxToRenderPerBatch={12}
      windowSize={7}
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
              {onDismissNote ? (
                <Pressable
                  onPress={onDismissNote}
                  accessibilityRole="button"
                  accessibilityLabel="Close this note"
                  style={({ pressed }) => [styles.noteClose, pressed && { backgroundColor: theme.backgroundSelected }]}>
                  <Icon name="close" size={16} color={theme.textSecondary} weight="bold" />
                </Pressable>
              ) : null}
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
      ListFooterComponent={credit ? <OsmCredit style={styles.footerCredit} /> : null}
    />
  );
});

const siteKey = (site: DiveSite) => site.id;

function Separator() {
  return <View style={styles.separator} />;
}

/** One site. Takes plain values and a stable callback, so a row is only rebuilt when its own site changes. */
const SiteRow = memo(function SiteRow({
  id,
  name,
  region,
  country,
  full,
  selected,
  onSelect,
}: {
  id: string;
  name: string;
  region: string;
  country: string;
  /** Another site has this name: show the whole region. */
  full: boolean;
  selected: boolean;
  onSelect: (siteId: string) => void;
}) {
  const theme = useTheme();
  const seed = useMemo(() => hashSeed(id), [id]);
  return (
    <PaperButton
      onPress={() => onSelect(id)}
      accessibilityLabel={`${name}, ${region}, ${country}`}
      accessibilityState={{ selected }}
      style={selected ? [styles.row, { borderColor: theme.coral, boxShadow: `0px 0px 0px 1px ${theme.coral}` }] : styles.row}>
      {/* Each site gets its own watercolour blob behind the pin, so the list isn't one repeated mark. */}
      <View style={styles.pin}>
        <Wash width={46} height={38} color={theme.wash} seed={seed} style={StyleSheet.absoluteFill} />
        <Icon name="pin" size={22} wash={theme.coral} washOpacity={0.45} />
      </View>
      <View style={styles.body}>
        <Text numberOfLines={2} style={[styles.name, { color: theme.text }]}>
          {name}
        </Text>
        <Text numberOfLines={1} style={[styles.where, { color: theme.textSecondary }]}>
          {siteWhere(region, country, full)}
        </Text>
      </View>
      <Icon name="chevronRight" size={18} color={theme.textSecondary} weight="bold" />
    </PaperButton>
  );
});

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
  },
  header: {
    gap: 12,
    marginBottom: 12,
  },
  separator: {
    height: 10,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    paddingLeft: 12,
    paddingRight: 4,
  },
  noteClose: {
    width: 44,
    height: 44,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    textAlign: 'center',
    paddingVertical: Spacing.four,
  },
  footerCredit: {
    marginTop: Spacing.three,
  },
  creditOnMap: {
    alignSelf: 'flex-start',
    minHeight: 28,
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderWidth: 1,
    borderRadius: Radius.xs,
  },
  creditInList: {
    alignItems: 'center',
    paddingVertical: Spacing.one,
  },
  creditText: {
    fontFamily: Type.bodyBold,
    fontSize: 11,
    lineHeight: 15,
    textDecorationLine: 'underline',
  },
  // Padding is part of a link's hit area: 15 + 2 x 15 is 45 tall under a list.
  creditTextInList: {
    paddingVertical: 15,
    paddingHorizontal: 8,
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
