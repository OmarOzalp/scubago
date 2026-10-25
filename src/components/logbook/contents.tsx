import { FlatList, Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View, type TextStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { type Leaf, leafAnnouncement } from '@/components/logbook/book';
import { SpeciesAvatar } from '@/components/species-avatar';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { milestoneAt, signaturesOf } from '@/lib/dives';
import type { Dive, Species } from '@/lib/types';

/** "Oct 21" (or "21 Oct"), with the year when it isn't this year's: the right-hand column of a book's contents. */
function contentsDate(isoDate: string, thisYear = new Date().getFullYear()): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: y === thisYear ? undefined : 'numeric', timeZone: 'UTC' });
}

/** Dots from the site to the date, as in the contents of a book. Decorative: the row's label says it all. */
const LEADERS = '· '.repeat(80);
/**
 * Every row is the same height (a line for the site and date, a line for the animals), scaled with the
 * text size, so the list knows where each one is: it opens at the open page and draws only the rows in
 * view, however long the log. A site's name too long for its line ends in "…" (the page has it in full).
 */
export function contentsRowHeight(fontScale: number): number {
  const margin = (NUMBER_LABEL_LINE + NUMBER_LINE) * fontScale;
  const body = SITE_LINE * fontScale + BODY_GAP + Math.max(AVATAR_LINE, SITE_LINE * fontScale);
  return Math.ceil(Math.max(margin, body) + 2 * ROW_PADDING);
}
const NUMBER_LABEL_LINE = 15;
const NUMBER_LINE = 26;
const SITE_LINE = 20;
const BODY_GAP = 6;
const AVATAR_LINE = 28;
const ROW_PADDING = 10;
/** Rows above the open page's that are in view when the contents open. */
const ROWS_ABOVE = 3;
/** The web ends a one-line text cut short with "…"; the dots just stop. */
const clip = (Platform.OS === 'web' ? { textOverflow: 'clip' } : {}) as TextStyle;

/**
 * The book's contents: the cover, then every page in the order you turn them, each a row with its
 * number, site and date and the animals on it. A tap turns to that page. It opens at the page the
 * book is open at, and it is the quickest way through the book with a screen reader.
 */
export function Contents({
  leaves,
  currentKey,
  siteName,
  speciesByDive,
  pending,
  onPick,
  onClose,
}: {
  leaves: readonly Leaf[];
  /** The leaf the book is open at. */
  currentKey: string | null;
  siteName: (siteId: string) => string;
  speciesByDive: ReadonlyMap<string, Species[]>;
  pending: (dive: Dive) => boolean;
  onPick: (key: string) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { fontScale } = useWindowDimensions();
  const rowHeight = contentsRowHeight(fontScale || 1);
  const rows = leaves.filter((l) => l.kind !== 'blank');
  const current = rows.findIndex((l) => l.key === currentKey);
  // Open at the page the book is open at, with a few rows above it (from the top while it is among the first).
  const start = current > ROWS_ABOVE * 2 ? current - ROWS_ABOVE : 0;

  return (
    // A sheet over the book (on iPhone, swiped down to close, like any sheet).
    <Modal visible animationType={reduced ? 'none' : 'slide'} presentationStyle="pageSheet" allowSwipeDismissal onRequestClose={onClose}>
      <View style={[styles.screen, { backgroundColor: theme.background, paddingTop: Platform.OS === 'ios' ? Spacing.four : insets.top + Spacing.three }]}>
        <View style={styles.header}>
          <ThemedText type="display" accessibilityRole="header" style={styles.flex}>
            Contents
          </ThemedText>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={({ pressed }) => [styles.close, { borderColor: theme.rule, backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement }]}>
            <Icon name="close" size={20} weight="bold" />
          </Pressable>
        </View>
        <FlatList
          data={rows}
          keyExtractor={(l) => l.key}
          getItemLayout={(_, i) => ({ length: rowHeight, offset: rowHeight * i, index: i })}
          initialScrollIndex={start > 0 ? start : undefined}
          initialNumToRender={14}
          // Rows drawn ahead: about five screens either way (a fast fling on the web can outrun a narrow window).
          windowSize={11}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + Spacing.five }]}
          renderItem={({ item, index }) => (
            <ContentsRow
              leaf={item}
              height={rowHeight}
              current={index === current}
              siteName={item.kind === 'page' ? siteName(item.dive.siteId) : ''}
              species={item.kind === 'page' ? (speciesByDive.get(item.dive.id) ?? []) : []}
              pending={item.kind === 'page' && pending(item.dive)}
              label={leafAnnouncement(item, siteName)}
              onPress={() => onPick(item.key)}
            />
          )}
        />
      </View>
    </Modal>
  );
}

function ContentsRow({
  leaf,
  height,
  current,
  siteName,
  species,
  pending,
  label,
  onPress,
}: {
  leaf: Leaf;
  height: number;
  current: boolean;
  siteName: string;
  species: Species[];
  pending: boolean;
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  const rowStyle = ({ pressed }: { pressed: boolean }) => [
    styles.row,
    { height, borderBottomColor: theme.rule, backgroundColor: pressed || current ? theme.backgroundSelected : 'transparent' },
  ];
  if (leaf.kind !== 'page') {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: current }} style={rowStyle}>
        <View style={styles.margin}>
          <Icon name="logbook" size={22} color={theme.textSecondary} />
        </View>
        <Text style={[styles.site, { color: theme.text }]}>Cover</Text>
      </Pressable>
    );
  }
  const { dive } = leaf;
  const signed = signaturesOf(dive).length > 0;
  const milestone = milestoneAt(dive.number);
  const shown = species.slice(0, 5);
  const fullLabel = [
    label,
    species.length ? `${species.length} species seen` : null,
    signed ? 'signed' : null,
    dive.centreName ? `stamp from ${dive.centreName}` : null,
    milestone ? 'milestone' : null,
    pending ? 'waiting to sync' : null,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={fullLabel} accessibilityState={{ selected: current }} style={rowStyle}>
      <View style={styles.margin}>
        <Text style={[styles.no, { color: theme.textSecondary }]}>NO.</Text>
        <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.number, { color: theme.text }]}>
          {dive.number.toLocaleString('en')}
        </Text>
      </View>
      <View style={styles.body}>
        <View style={styles.titleLine}>
          <Text numberOfLines={1} style={[styles.site, styles.shrink, { color: theme.text }]}>
            {siteName}
          </Text>
          <Text numberOfLines={1} ellipsizeMode="clip" style={[styles.leaders, clip, { color: theme.textSecondary }]}>
            {LEADERS}
          </Text>
          <Text numberOfLines={1} style={[styles.date, { color: theme.textSecondary }]}>
            {contentsDate(dive.divedOn)}
          </Text>
        </View>
        {/* The animals' line is there even when empty, so every row is one height. */}
        <View style={styles.subLine}>
          {shown.map((s, i) => (
            <View key={`${s.id}-${i}`} style={[styles.avatar, i > 0 && styles.overlap, { borderColor: current ? theme.backgroundSelected : theme.background }]}>
              <SpeciesAvatar species={s} size={24} />
            </View>
          ))}
          {species.length > shown.length ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.more}>
              +{species.length - shown.length}
            </ThemedText>
          ) : null}
          <View style={styles.marks}>
            {milestone ? <Icon name="medal" size={16} wash={theme.sun} washOpacity={0.9} /> : null}
            {signed ? <Icon name="signature" size={16} color={theme.textSecondary} /> : null}
            {dive.centreName ? <Icon name="stamp" size={16} color={theme.stamp} /> : null}
            {pending ? <Icon name="sync" size={14} color={theme.textSecondary} /> : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  close: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  list: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', paddingHorizontal: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    overflow: 'hidden',
    paddingVertical: ROW_PADDING,
    paddingHorizontal: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  margin: { width: 48, alignItems: 'center' },
  no: { fontFamily: Type.label, fontSize: 12, lineHeight: NUMBER_LABEL_LINE, letterSpacing: 1 },
  number: { fontFamily: Type.display, fontSize: 22, lineHeight: NUMBER_LINE },
  body: { flex: 1, gap: BODY_GAP },
  titleLine: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  site: { fontFamily: Type.bodyHeavy, fontSize: 15, lineHeight: SITE_LINE },
  shrink: { flexShrink: 1 },
  leaders: { flex: 1, minWidth: 16, fontSize: 13, lineHeight: 20, opacity: 0.55 },
  date: { flexShrink: 0, fontFamily: Type.label, fontSize: 12, lineHeight: 20, letterSpacing: 0.6 },
  subLine: { minHeight: AVATAR_LINE, flexDirection: 'row', alignItems: 'center' },
  avatar: { borderWidth: 2, borderRadius: 14 },
  overlap: { marginLeft: -7 },
  more: { marginLeft: 6 },
  marks: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 'auto', paddingLeft: 8 },
});
