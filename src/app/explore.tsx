import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView, type GestureTouchEvent } from 'react-native-gesture-handler';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { SanctuaryScene } from '@/components/home/sanctuary-scene';
import { ExplorerCamera } from '@/components/home/three/explorer-camera';
import { WATER } from '@/components/home/three/sanctuary-environment';
import { tapScaleAt } from '@/components/home/three/tap-target';
import { Icon, type IconName } from '@/components/icon';
import { Type } from '@/constants/theme';
import { useHomePreferences } from '@/hooks/use-home-preferences';
import { CATALOG_BY_ID } from '@/lib/catalog';
import { createExplorer, EXPLORER } from '@/lib/explorer-view';
import { deriveHome, HABITATS } from '@/lib/home';
import { macroResidents } from '@/lib/macro-life';
import { useAppStore, useMySightings, useMyUserId } from '@/lib/store';
import type { MarineModel } from '@/lib/swimming';

/** Ink on the island's water (the scene's own colours, the same in both schemes). */
const ON_WATER = '#1F4B40';
/** How to look about, shown when the explorer opens. */
const GESTURES = 'Pinch or double-tap to look closer · drag to look around';
/** How long the gesture hint stays before it fades (ms). */
const HINT_MS = 5000;

/**
 * The island explorer: the diver's island full screen, to zoom in on and look around. It opens all
 * the way out, the whole ocean and every animal in view, its water filling the screen. Pinch (or the
 * mouse wheel, on the web) zooms in about the fingers to see the smaller things, and back out; a drag
 * moves across the water (and glides on, let go fast); a double tap zooms in on that spot (and back
 * out once as close as it goes); buttons do the same for anyone who can't pinch. Tapping an animal
 * opens its page, as on Home. The island, its animals and their behavior are Home's; only the camera
 * and the reach of the water are the explorer's (explorer-view.ts).
 */
export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const mine = useMySightings();
  const owner = useMyUserId();
  const ready = useAppStore((s) => s.ready);
  const home = useMemo(() => deriveHome(mine, CATALOG_BY_ID), [mine]);
  const saved = useHomePreferences(owner);
  const habitat = HABITATS.find((h) => h.id === saved.preferences.habitat)!;
  const loading = !ready || saved.loading;

  const [explorer] = useState(() => createExplorer({ width: 1, height: 1, level: home.level }));
  const [tapScale, setTapScale] = useState(() => tapScaleAt(explorer.view.zoom));
  useEffect(() => explorer.subscribe((zoom) => setTapScale(tapScaleAt(zoom))), [explorer]);
  // With reduced motion the view doesn't sweep: zoom buttons and double taps jump, and drags don't glide on.
  const reduced = useReducedMotion();
  useEffect(() => explorer.holdStill(reduced), [explorer, reduced]);
  // The screen's size in points (the explorer keeps it, for its limits and the gestures' focal points).
  const onLayout = ({ nativeEvent: { layout } }: LayoutChangeEvent) => {
    if (layout.width > 0 && layout.height > 0) explorer.resize({ width: layout.width, height: layout.height, level: home.level });
  };
  useEffect(() => {
    const { width, height, level } = explorer.frame;
    if (width > 1 && height > 1 && level !== home.level) explorer.resize({ width, height, level: home.level });
  }, [explorer, home.level]);

  const gesture = useMemo(() => {
    const fromMiddle = (x: number, y: number) => [x - explorer.frame.width / 2, y - explorer.frame.height / 2] as const;
    // The fingers down (points from the middle of the screen); a lifting finger is still listed with the touch that lifts it.
    const fingers = (event: GestureTouchEvent, lifting = false) => {
      const gone = new Set(lifting ? event.changedTouches.map((t) => t.id) : []);
      return event.allTouches.filter((t) => !gone.has(t.id)).map((t) => { const [x, y] = fromMiddle(t.x, t.y); return { id: t.id, x, y }; });
    };
    // The explorer follows the fingers themselves, from the first touch: their middle drags the water and their
    // spread zooms, so the view never waits for a gesture to be recognized and then jumps to catch up. The drag
    // and the pinch are here to claim the touch once it moves or spreads, so it never also taps an animal.
    const drag = Gesture.Pan().runOnJS(true).minDistance(6).averageTouches(true)
      .onTouchesDown((event) => explorer.touch(fingers(event)))
      .onTouchesMove((event) => explorer.touch(fingers(event)))
      .onTouchesUp((event) => explorer.touch(fingers(event, true)))
      .onTouchesCancelled(() => explorer.touch([], undefined, true));
    const pinch = Gesture.Pinch();
    const doubleTap = Gesture.Tap().runOnJS(true).numberOfTaps(2)
      .onEnd((event, success) => { if (success) { const [fx, fy] = fromMiddle(event.x, event.y); explorer.zoomToward(fx, fy); } });
    return Gesture.Simultaneous(drag, pinch, doubleTap);
  }, [explorer]);

  // The web: the mouse wheel (and a trackpad's pinch, which arrives as a wheel with ctrl held) zooms about the pointer.
  const surface = useRef<View>(null);
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

  // The hint fades once it has been read (or simply goes, with reduced motion).
  const [hint] = useState(() => new Animated.Value(1));
  useEffect(() => {
    const timer = setTimeout(() => Animated.timing(hint, { toValue: 0, duration: reduced ? 0 : 600, useNativeDriver: Platform.OS !== 'web' }).start(), HINT_MS);
    return () => clearTimeout(timer);
  }, [hint, reduced]);

  // The reef's small life shows only up close: say it is there to find.
  const hiding = macroResidents(home.residents).length;
  const small = hiding === 0 ? '' : hiding === 1 ? 'A small creature lives on the reef: zoom in close to find it' : `${hiding} small creatures live on the reef: zoom in close to find them`;
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const inspect = (model: MarineModel) => router.push({ pathname: '/inspect', params: { model, preview: '1' } });
  const button = (icon: IconName, label: string, onPress: () => void) => (
    <Pressable key={label} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6}
      style={({ pressed }) => [styles.button, { opacity: pressed ? 0.7 : 1 }]}>
      <Icon name={icon} size={22} color={ON_WATER} wash="#FFFFFF" washOpacity={0.6} weight="bold" />
    </Pressable>
  );

  return <GestureHandlerRootView style={[styles.root, { backgroundColor: WATER[habitat.id] }]}>
    <GestureDetector gesture={gesture}>
      <View ref={surface} style={styles.root} onLayout={onLayout} collapsable={false}>
        <SanctuaryScene habitat={habitat.id} level={home.level} residents={home.residents} loading={loading} onInspect={inspect}
          explorer={{ camera: <ExplorerCamera explorer={explorer} />, tapScale, zoom: () => explorer.view.zoom, focus: (x, z, zoom) => explorer.focus(x, z, zoom) }} />
      </View>
    </GestureDetector>
    <View style={[styles.top, { paddingTop: insets.top + 10 }]} pointerEvents="box-none">
      {button('close', 'Close the explorer', close)}
      <View style={styles.pill}><Text style={styles.pillText}>EXPLORING · {habitat.name.toUpperCase()}</Text></View>
      <View style={styles.spacer} />
    </View>
    <View style={[styles.controls, { paddingBottom: insets.bottom + 18, paddingRight: insets.right + 14 }]} pointerEvents="box-none">
      {button('plus', 'Zoom in', () => explorer.zoomBy(EXPLORER.step))}
      {button('minus', 'Zoom out', () => explorer.zoomBy(1 / EXPLORER.step))}
      {button('locate', 'Show the whole ocean', () => explorer.showAll())}
    </View>
    <Animated.View style={[styles.hint, { bottom: insets.bottom + 26, opacity: hint }]} pointerEvents="none">
      <Text style={styles.hintText}>{small ? `${GESTURES}\n${small}` : GESTURES}</Text>
    </Animated.View>
  </GestureHandlerRootView>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  spacer: { width: 44 },
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.55)' },
  pillText: { color: ON_WATER, letterSpacing: 1.4, fontSize: 12, fontFamily: Type.label },
  controls: { position: 'absolute', right: 0, bottom: 0, gap: 10 },
  button: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: 'rgba(31,75,64,0.18)', alignItems: 'center', justifyContent: 'center' },
  hint: { position: 'absolute', left: 16, right: 76, alignItems: 'center' },
  hintText: { color: ON_WATER, fontSize: 14, lineHeight: 20, fontFamily: Type.bodySemiBold, textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.55)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, overflow: 'hidden' },
});
