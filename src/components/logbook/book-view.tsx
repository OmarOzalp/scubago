import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
  type ViewStyle,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DivePage } from '@/components/dive/dive-page';
import { BlankPage } from '@/components/logbook/blank-page';
import { type Leaf, keepPlace, leafAnnouncement, openingIndex, pageCount, indexOfKey } from '@/components/logbook/book';
import { BookBar } from '@/components/logbook/book-bar';
import { Contents } from '@/components/logbook/contents';
import { DESK, Sheet } from '@/components/logbook/sheet';
import { MaxContentWidth, Spacing, TabBarOverhang } from '@/constants/theme';
import { useSchemeName } from '@/hooks/use-theme';
import { announce } from '@/lib/announce';
import type { Dive, Species } from '@/lib/types';

/** Room at each side of a page, for its edge and shadow. */
const SIDE = 12;

/** How far either side of the open page a page is drawn in full; a little further, its blank sheet. */
const LIVE_PAGES = 1;
const SHEET_PAGES = 2;

/**
 * The Logbook as a book you swipe through: the cover, then a page per dive, opening at the newest
 * (the last page). A swipe to the right turns back to older pages and the cover; to the left, on to
 * newer ones. Above it, the Contents button and the page count. A page that is longer than the
 * screen scrolls inside its sheet.
 *
 * It is a horizontal scroll view that pages, on iOS, Android and the web alike. Every leaf has its
 * own slot, one page wide, so each is a place to stop (on the web, a scroll-snap point: a list's
 * stand-in for the pages it hasn't drawn would be one too, and a jump to a page could stop on it);
 * only the open page and the ones beside it are drawn, so a log of hundreds of pages opens as fast
 * as a short one.
 */
export function Book({
  leaves,
  cover,
  siteName,
  speciesByDive,
  pending,
}: {
  leaves: Leaf[];
  /** What the cover holds (the Logbook's totals and links). */
  cover: ReactNode;
  siteName: (siteId: string) => string;
  speciesByDive: ReadonlyMap<string, Species[]>;
  pending: (dive: Dive) => boolean;
}) {
  const insets = useSafeAreaInsets();
  const scheme = useSchemeName();
  const reduced = useReducedMotion();
  const window = useWindowDimensions();
  // The room for the pages, measured; the window's width (and a guess at the height) until then.
  // On the web the page is first drawn ahead of time, with no window to measure, and the browser keeps what was
  // drawn then; so there the pages wait for their measured room (a frame), rather than draw at a width of 0.
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const box = size ?? (Platform.OS === 'web' ? null : { width: window.width, height: Math.max(320, window.height - insets.top - 200) });
  const width = box?.width ?? 0;
  const height = box?.height ?? 0;
  const scroll = useRef<ScrollViewInstance>(null);
  const [index, setIndex] = useState(() => openingIndex(leaves));
  // Where the scroll view starts (iOS and Android; the web scrolls there once it is laid out).
  const [startAt] = useState(() => ({ x: index * width, y: 0 }));
  // The leaf in view, kept for the scroll handler and for when the leaves change under it.
  const at = useRef({ index, key: leaves[index]?.key ?? null });
  const [contentsOpen, setContentsOpen] = useState(false);
  const last = leaves.length - 1;
  const current = Math.max(0, Math.min(index, last));
  const leaf = leaves[current];

  const show = useCallback(
    (i: number) => {
      at.current = { index: i, key: leaves[i]?.key ?? null };
      setIndex(i);
    },
    [leaves],
  );

  // A jump (to the newest page, to a page from the contents) is held until the pages are laid out: a scroll
  // asked for before there is room for it stops short, so it is asked again as the content grows. Until the
  // jump lands (or a second has passed, or the diver touches the page) the scroll doesn't move the count.
  const jumping = useRef<{ index: number; until: number } | null>(null);
  const place = useCallback(
    (i: number, animated: boolean) => {
      jumping.current = animated ? null : { index: i, until: Date.now() + 1000 };
      scroll.current?.scrollTo({ x: i * width, y: 0, animated });
    },
    [width],
  );
  // Opening at the last page is such a jump too.
  useEffect(() => {
    jumping.current = { index: at.current.index, until: Date.now() + 1000 };
  }, []);

  /** Turn to a leaf: one page with the paper sliding across (none under Reduce Motion), a jump at once. */
  const turnTo = useCallback(
    (i: number, animated: boolean) => {
      const target = Math.max(0, Math.min(i, leaves.length - 1));
      place(target, animated && !reduced);
      show(target);
    },
    [leaves.length, reduced, show, place],
  );
  const onTurn = useCallback((i: number) => turnTo(i, true), [turnTo]);

  // The leaves changed (a page logged, synced, deleted or renumbered): stay on the same page, except that a
  // newly written last page is turned to, so coming back to the Logbook after logging a dive shows it.
  const shown = useRef(leaves);
  useEffect(() => {
    const before = shown.current;
    if (before === leaves) return;
    shown.current = leaves;
    const newest = leaves[leaves.length - 1];
    const fresh = newest?.kind === 'page' && !before.some((l) => l.key === newest.key);
    const target = fresh ? leaves.length - 1 : keepPlace(leaves, at.current.key, at.current.index);
    if (target !== at.current.index) place(target, false);
    show(target);
  }, [leaves, show, place]);

  // A new width (a turned phone, a resized window): the same page, at the new width.
  const measured = useRef(width);
  useEffect(() => {
    if (measured.current === width) return;
    measured.current = width;
    place(at.current.index, false);
  }, [width, place]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setSize((was) => (was && Math.abs(was.width - w) < 1 && Math.abs(was.height - h) < 1 ? was : { width: w, height: h }));
  }, []);

  // The page in view follows the scroll: a swipe, an arrow, the contents, or a screen reader's three-finger swipe.
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    const jump = jumping.current;
    if (jump && jump.index !== i && Date.now() < jump.until) return;
    jumping.current = null;
    if (i !== at.current.index && i >= 0 && i < leaves.length) show(i);
  };
  const onContentSizeChange = () => {
    const jump = jumping.current;
    if (jump && Date.now() < jump.until) scroll.current?.scrollTo({ x: Math.min(jump.index, leaves.length - 1) * width, y: 0, animated: false });
  };

  // Say where the book is open once a turn settles: "Page 6 of 6, Cod Hole, 21 October". The web has no
  // announcement call, so it says it through a polite live region instead.
  const where = leafAnnouncement(leaf, siteName);
  const said = useRef(where);
  const [live, setLive] = useState('');
  useEffect(() => {
    if (said.current === where) return;
    said.current = where;
    const timer = setTimeout(() => (Platform.OS === 'web' ? setLive(where) : announce(where)), 350);
    return () => clearTimeout(timer);
  }, [where]);

  const hasPages = leaves.some((l) => l.kind === 'page');
  const pick = (key: string) => {
    setContentsOpen(false);
    const i = indexOfKey(leaves, key);
    if (i >= 0) turnTo(i, false);
  };

  return (
    <View style={[styles.desk, { backgroundColor: DESK[scheme], paddingTop: insets.top + Spacing.two }]}>
      <BookBar
        count={pageCount(leaf)}
        where={where}
        canBack={current > 0}
        canOn={current < last}
        onBack={() => turnTo(current - 1, true)}
        onOn={() => turnTo(current + 1, true)}
        onContents={hasPages ? () => setContentsOpen(true) : undefined}
      />
      <View style={styles.pages} onLayout={onLayout}>
        {box ? (
          <ScrollView
            ref={scroll}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            contentOffset={startAt}
            onScroll={onScroll}
            onContentSizeChange={onContentSizeChange}
            onTouchStart={() => (jumping.current = null)}
            scrollEventThrottle={32}
            keyboardShouldPersistTaps="handled">
            {leaves.map((l, i) => (
              <LeafView
                key={l.key}
                leaf={l}
                index={i}
                count={leaves.length}
                current={i === current}
                draw={Math.abs(i - current) <= LIVE_PAGES ? 'page' : Math.abs(i - current) <= SHEET_PAGES ? 'sheet' : 'none'}
                width={width}
                height={height}
                cover={l.kind === 'cover' ? cover : null}
                onTurn={onTurn}
              />
            ))}
          </ScrollView>
        ) : null}
      </View>
      {Platform.OS === 'web' ? (
        <Text accessibilityLiveRegion="polite" style={styles.offscreen}>
          {live}
        </Text>
      ) : null}
      {contentsOpen ? (
        <Contents
          leaves={leaves}
          currentKey={leaf?.key ?? null}
          siteName={siteName}
          speciesByDive={speciesByDive}
          pending={pending}
          onPick={pick}
          onClose={() => setContentsOpen(false)}
        />
      ) : null}
    </View>
  );
}

/** On the web a fling stops at the next page, as a swipe does on a phone. */
const snap = (Platform.OS === 'web' ? { scrollSnapAlign: 'start', scrollSnapStop: 'always' } : {}) as ViewStyle;

/**
 * One leaf's slot: its sheet, with the pages either side showing at its edges, and what is on it. Away
 * from the open page it is drawn as a blank sheet, or not at all.
 */
const LeafView = memo(function LeafView({
  leaf,
  index,
  count,
  current,
  draw,
  width,
  height,
  cover,
  onTurn,
}: {
  leaf: Leaf;
  index: number;
  count: number;
  current: boolean;
  draw: 'page' | 'sheet' | 'none';
  width: number;
  height: number;
  cover: ReactNode;
  onTurn: (index: number) => void;
}) {
  return (
    // The slot is always there, one page wide (a leaf drawn and later not would otherwise lose its width on the
    // web). Only the page in view is there for a screen reader; the count above and the page's own actions turn it.
    <View style={[snap, { width, height }]} aria-hidden={!current}>
      {draw === 'none' ? null : (
        <View style={styles.leaf}>
          <Sheet before={index} after={count - 1 - index} cover={leaf.kind === 'cover'}>
            {draw === 'sheet' ? null : (
              <ScrollView style={styles.flex} contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {leaf.kind === 'cover' ? (
                  cover
                ) : leaf.kind === 'blank' ? (
                  <BlankPage />
                ) : (
                  <DivePage
                    dive={leaf.dive}
                    actionsIn="page"
                    pageLabel={`Page ${leaf.page} of ${leaf.of}`}
                    turn={{ previous: () => onTurn(index - 1), next: index < count - 1 ? () => onTurn(index + 1) : undefined }}
                  />
                )}
              </ScrollView>
            )}
          </Sheet>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  desk: { flex: 1 },
  pages: { flex: 1 },
  leaf: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth + 2 * SIDE,
    alignSelf: 'center',
    paddingHorizontal: SIDE,
    paddingTop: 2,
    // Clear of the raised "Log dive" button, so the whole page, foot and all, shows above the tab bar.
    paddingBottom: TabBarOverhang + 10,
  },
  sheetContent: { flexGrow: 1, gap: 18, padding: Spacing.three, paddingBottom: Spacing.four },
  offscreen: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', left: -10000, top: 0 },
});
