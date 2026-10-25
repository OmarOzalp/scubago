import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent, type ViewInstance } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView, type GestureTouchEvent } from 'react-native-gesture-handler';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { SanctuaryScene } from '@/components/home/sanctuary-scene';
import { ExplorerCamera } from '@/components/home/three/explorer-camera';
import { WATER } from '@/components/home/three/sanctuary-environment';
import { tapScaleAt } from '@/components/home/three/tap-target';
import { useTip } from '@/components/home/use-tip';
import { Icon, type IconName } from '@/components/icon';
import { Type } from '@/constants/theme';
import { useHomePreferences } from '@/hooks/use-home-preferences';
import { CATALOG_BY_ID } from '@/lib/catalog';
import { createExplorer, EXPLORER, waterReach } from '@/lib/explorer-view';
import { AREAS, foundIslands, HOME_ISLAND, ISLAND_PLACES, ISLANDS, isIsland, islandResidents } from '@/lib/archipelago';
import { deriveHome } from '@/lib/home';
import { macroResidents } from '@/lib/macro-life';
import { useAppStore, useMySightings, useMyUserId } from '@/lib/store';
import type { MarineModel } from '@/lib/swimming';

/** Ink on the island's water (the scene's own colours, the same in both schemes). */
const ON_WATER = '#1F4B40';
/** How to look about, shown when the explorer opens: the first three times, then never (the islands' own buttons say how to sail between them). */
const MEET = 'Tap an animal to meet it.';
const LOOK = 'Pinch to zoom, drag to look around.';
const HINT_KEY = 'scubago.explorerHintShown.v1';
const HINT_TIMES = 3;
/** How long the hint stays before it fades (ms): long enough to read its two lines. */
const HINT_MS = 7000;

/**
 * The island explorer: the diver's archipelago full screen, every island they have found in one
 * ocean (ISLAND_PLACES in archipelago.ts), to sail between, zoom in on and look around. It opens on
 * the island chosen on Home (`?island=`), its whole ocean and every animal in view, the water
 * filling the screen. Pinch (or the mouse wheel, on the web) zooms in about the fingers to see the
 * smaller things, and back out; a drag moves across the water (and glides on, let go fast), over to
 * the next island; a double tap zooms in on that spot (and back out once as close as it goes);
 * buttons do the same for anyone who can't pinch, and a button for each island sails there. The
 * label names the island in view. Tapping an animal opens its page, as on Home. The islands, their
 * animals and their behavior are Home's; only the camera and the reach of the water are the
 * explorer's (explorer-view.ts).
 */
export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const mine = useMySightings();
  const owner = useMyUserId();
  const ready = useAppStore((s) => s.ready);
  const home = useMemo(() => deriveHome(mine, CATALOG_BY_ID), [mine]);
  // Every island found so far (src/lib/archipelago.ts), each at its place in the one ocean with its own shores and
  // animals; it opens on the one named (Home's unless another is).
  const params = useLocalSearchParams<{ island?: string }>();
  const islands = useMemo(() => foundIslands(home.residents), [home.residents]);
  const places = useMemo(() => islands.map((id) => ({
    key: id, habitat: ISLANDS[id], x: ISLAND_PLACES[id][0], z: ISLAND_PLACES[id][1], residents: islandResidents(home.residents, id),
  })), [islands, home.residents]);
  const centres = useMemo(() => places.map((place) => [place.x, place.z] as const), [places]);
  const opening = Math.max(0, params.island && isIsland(params.island) ? islands.indexOf(params.island) : 0);
  const habitat = ISLANDS[HOME_ISLAND];
  const saved = useHomePreferences(owner);
  const loading = !ready || saved.loading;

  const [explorer] = useState(() => createExplorer({ width: 1, height: 1, level: home.level, islands: centres }, opening));
  const [tapScale, setTapScale] = useState(() => tapScaleAt(explorer.view.zoom));
  useEffect(() => explorer.subscribe((zoom) => setTapScale(tapScaleAt(zoom))), [explorer]);
  // With reduced motion the view doesn't sweep: zoom buttons and double taps jump, and drags don't glide on.
  const reduced = useReducedMotion();
  useEffect(() => explorer.holdStill(reduced), [explorer, reduced]);
  // The screen's size in points (the explorer keeps it, for its limits and the gestures' focal points).
  const [size, setSize] = useState({ width: 1, height: 1 });
  const onLayout = ({ nativeEvent: { layout } }: LayoutChangeEvent) => {
    if (layout.width > 0 && layout.height > 0) {
      explorer.resize({ width: layout.width, height: layout.height, level: home.level, islands: centres });
      setSize({ width: layout.width, height: layout.height });
    }
  };
  useEffect(() => {
    const { width, height, level, islands: was } = explorer.frame;
    if (width > 1 && height > 1 && (level !== home.level || was !== centres)) explorer.resize({ width, height, level: home.level, islands: centres });
  }, [explorer, home.level, centres]);
  // The water reaches past every edge of the screen (farther on a wide one), rebuilt only when that changes.
  const wide = waterReach({ ...size, level: home.level, islands: centres });
  const reach = useMemo(() => ({ x: wide.x, z: wide.z }), [wide.x, wide.z]);
  // Islands known only now (the collection still loading as it opened): open on the one asked for after all.
  useEffect(() => { explorer.open(opening); }, [explorer, opening]);
  // The island in view, named in the label (and marked among the islands' buttons); out between two, the archipelago.
  const [over, setOver] = useState(() => explorer.island);
  useEffect(() => explorer.near(setOver), [explorer]);
  const shown = places[over];
  const nameOf = (id: string) => (id === HOME_ISLAND ? saved.preferences.name : AREAS.find((a) => a.id === id)!.name);

  const gesture = useMemo(() => {
    const fromMiddle = (x: number, y: number) => [x - explorer.frame.width / 2, y - explorer.frame.height / 2] as const;
    // The fingers down (points from the middle of the screen); a lifting finger is still listed with the touch that lifts it.
    const fingers = (event: GestureTouchEvent, lifting = false) => {
      const gone = new Set(lifting ? event.changedTouches.map((t) => t.id) : []);
      return event.allTouches.filter((t) => !gone.has(t.id)).map((t) => { const [x, y] = fromMiddle(t.x, t.y); return { id: t.id, x, y }; });
    };
    // The explorer follows the fingers themselves, from the first touch: their middle drags the water and their
    // spread zooms, so the view never waits for a gesture to be recognized and then jumps to catch up. It tells
    // a double tap from them too (a tap gesture here would count two quick pinches as one). The drag and the
    // pinch are here to claim the touch once it moves or spreads, so it never also taps an animal.
    const drag = Gesture.Pan().runOnJS(true).minDistance(6).averageTouches(true)
      .onTouchesDown((event) => explorer.touch(fingers(event)))
      .onTouchesMove((event) => explorer.touch(fingers(event)))
      .onTouchesUp((event) => explorer.touch(fingers(event, true)))
      .onTouchesCancelled(() => explorer.touch([], undefined, true));
    const pinch = Gesture.Pinch();
    return Gesture.Simultaneous(drag, pinch);
  }, [explorer]);

  // The web: the mouse wheel (and a trackpad's pinch, which arrives as a wheel with ctrl held) zooms about the pointer.
  const surface = useRef<ViewInstance>(null);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = surface.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const box = node.getBoundingClientRect();
      explorer.zoomAt(Math.exp(-event.deltaY * (event.ctrlKey ? .01 : .0015)), event.clientX - box.left - box.width / 2, event.clientY - box.top - box.height / 2);
    };
    node.addEventListener('wheel', wheel, { passive: false });
    return () => node.removeEventListener('wheel', wheel);
  }, [explorer]);

  // The hint fades once it has been read (or simply goes, with reduced motion), and is there only the first few times the explorer opens.
  const tip = useTip(HINT_KEY, { times: HINT_TIMES });
  const [hint] = useState(() => new Animated.Value(1));
  useEffect(() => {
    const timer = setTimeout(() => Animated.timing(hint, { toValue: 0, duration: reduced ? 0 : 600, useNativeDriver: Platform.OS !== 'web' }).start(), HINT_MS);
    return () => clearTimeout(timer);
  }, [hint, reduced]);

  // The reef's small life shows only up close: say it is there to find.
  const hiding = places.reduce((sum, place) => sum + macroResidents(place.residents).length, 0);
  const small = hiding === 0 ? '' : hiding === 1 ? 'A small creature lives on the reef. Zoom in to find it.' : `${hiding} small creatures live on the reef. Zoom in to find them.`;
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const inspect = (model: MarineModel) => router.push({ pathname: '/inspect', params: { model, preview: '1' } });
  const button = (icon: IconName, label: string, onPress: () => void) => (
    <Pressable key={label} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6}
      style={({ pressed }) => [styles.button, { opacity: pressed ? 0.7 : 1 }]}>
      <Icon name={icon} size={22} color={ON_WATER} wash="#FFFFFF" washOpacity={0.6} weight="bold" />
    </Pressable>
  );

  return <GestureHandlerRootView style={[styles.root, { backgroundColor: WATER[habitat] }]}>
    <GestureDetector gesture={gesture}>
      <View ref={surface} style={styles.root} onLayout={onLayout} collapsable={false}>
        <SanctuaryScene habitat={habitat} level={home.level} residents={home.residents} islands={places} loading={loading} onInspect={inspect}
          explorer={{ camera: <ExplorerCamera explorer={explorer} />, tapScale, reach, zoom: () => explorer.view.zoom, focus: (x, z, zoom) => explorer.focus(x, z, zoom) }} />
      </View>
    </GestureDetector>
    <View style={[styles.top, { paddingTop: insets.top + 10 }]} pointerEvents="box-none">
      {button('close', 'Close the explorer', close)}
      {/* The island in view, by its name alone (a screen reader hears whose ocean it is). A very long name is cut short with an ellipsis rather than run on into the buttons either side. */}
      <View style={styles.pill} accessible accessibilityLabel={`Your ocean, ${shown ? nameOf(shown.key) : 'your archipelago'}`} accessibilityLiveRegion="polite"><Text numberOfLines={1} style={styles.pillText}>{shown ? nameOf(shown.key) : 'Your archipelago'}</Text></View>
      <View style={styles.spacer} />
    </View>
    {places.length > 1 && <View style={[styles.islands, { top: insets.top + 64 }]} pointerEvents="box-none">
      {places.map((place, i) => {
        const here = i === over, area = AREAS.find((a) => a.id === place.key)!;
        return <Pressable key={place.key} accessibilityRole="button" accessibilityState={{ selected: here }}
          accessibilityLabel={`${area.name}${here ? ', in view' : ''}. Sail there`} onPress={() => explorer.visit(i)} hitSlop={4}
          style={({ pressed }) => [styles.island, here && styles.islandHere, { opacity: pressed ? 0.7 : 1 }]}>
          <View style={[styles.dot, { backgroundColor: area.color }]} />
          <Text style={styles.islandText}>{area.name}</Text>
        </Pressable>;
      })}
    </View>}
    <View style={[styles.controls, { paddingBottom: insets.bottom + 18, paddingRight: insets.right + 14 }]} pointerEvents="box-none">
      {button('plus', 'Zoom in', () => explorer.zoomBy(EXPLORER.step))}
      {button('minus', 'Zoom out', () => explorer.zoomBy(1 / EXPLORER.step))}
      {button('locate', 'Show the whole ocean', () => explorer.showAll())}
    </View>
    {tip.show && <Animated.View style={[styles.hint, { bottom: insets.bottom + 26, opacity: hint }]} pointerEvents="none">
      <Text style={styles.hintText}>{[MEET, small || LOOK].join('\n')}</Text>
    </Animated.View>}
  </GestureHandlerRootView>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  spacer: { width: 44 },
  pill: { flexShrink: 1, minWidth: 0, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.55)' },
  islands: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, paddingHorizontal: 14 },
  island: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.6)', borderWidth: 1, borderColor: 'rgba(31,75,64,0.12)' },
  islandHere: { backgroundColor: 'rgba(255,255,255,0.88)', borderColor: ON_WATER },
  dot: { width: 8, height: 8, borderRadius: 4 },
  islandText: { color: ON_WATER, fontSize: 14, fontFamily: Type.bodySemiBold },
  pillText: { color: ON_WATER, fontSize: 17, lineHeight: 24, fontFamily: Type.display },
  controls: { position: 'absolute', right: 0, bottom: 0, gap: 10 },
  button: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: 'rgba(31,75,64,0.18)', alignItems: 'center', justifyContent: 'center' },
  hint: { position: 'absolute', left: 16, right: 76, alignItems: 'center' },
  hintText: { color: ON_WATER, fontSize: 14, lineHeight: 20, fontFamily: Type.bodySemiBold, textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.55)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, overflow: 'hidden' },
});
