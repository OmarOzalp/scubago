import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { CreatureArt } from './creature-art';
import { IslandArt } from './island-art';
import type { Habitat } from '@/lib/home';
import type { DexEntry, Species } from '@/lib/types';

function Resident({ species, index, total, width, active }: { species: Species; index: number; total: number; width: number; active: boolean }) {
  const phase = useRef(new Animated.Value(0)).current;
  const start = index / total;
  const inputRange = Array.from({ length: 33 }, (_, i) => i / 32);
  const angles = inputRange.map((value) => (value + start) * Math.PI * 2);
  const radiusX = width * (.37 + (index % 2) * .035);
  const radiusY = width * (.32 + (index % 3) * .013);
  useEffect(() => {
    if (!active) return;
    const animation = Animated.loop(Animated.timing(phase, { toValue: 1, duration: 48000 + (index % 3) * 6000, easing: Easing.linear, useNativeDriver: true, isInteraction: false }));
    animation.start();
    return () => { animation.stop(); phase.setValue(0); };
  }, [active, index, phase]);
  return <Animated.View style={[styles.resident, { left: width / 2 - 28, top: width * .49 - 21, transform: [
    { translateX: phase.interpolate({ inputRange, outputRange: angles.map((a) => Math.cos(a) * radiusX) }) },
    { translateY: phase.interpolate({ inputRange, outputRange: angles.map((a) => Math.sin(a) * radiusY) }) },
  ] }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${species.commonName}, view your sightings`} onPress={() => router.push(`/species/${species.id}`)} style={styles.touch}>
      <Animated.View style={{ transform: [{ scaleX: phase.interpolate({ inputRange, outputRange: angles.map((a) => Math.sin(a) > 0 ? -1 : 1) }) }] }}>
        <CreatureArt species={species} size={56} />
      </Animated.View>
    </Pressable>
  </Animated.View>;
}

export function IslandScene({ habitat, level, residents, paused = false }: { habitat: Habitat; level: number; residents: DexEntry[]; paused?: boolean }) {
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [reduced, setReduced] = useState(true);
  const [width, setWidth] = useState(360);
  const [page, setPage] = useState(0);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (mounted) setReduced(value); }).catch(() => {});
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    const app = AppState.addEventListener('change', (value) => setForeground(value === 'active'));
    return () => { mounted = false; motion.remove(); app.remove(); };
  }, []);
  const active = focused && foreground && !reduced && !paused;
  const pages = Math.ceil(residents.length / 12);
  useEffect(() => {
    if (!active || pages <= 1) return;
    const timer = setInterval(() => setPage((p) => (p + 1) % pages), 30000);
    return () => clearInterval(timer);
  }, [active, pages]);
  const visible = residents.slice((page % Math.max(1, pages)) * 12, (page % Math.max(1, pages)) * 12 + 12);
  return <View style={styles.scene} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
    <View pointerEvents="none" style={StyleSheet.absoluteFill} accessible accessibilityRole="image" accessibilityLabel={`Level ${level} ${habitat}, home to ${residents.length} discovered species`}>
      <IslandArt habitat={habitat} level={level} />
    </View>
    {visible.map((entry, index) => <Resident key={entry.species.id} species={entry.species} index={index} total={visible.length} width={width} active={active} />)}
  </View>;
}
const styles = StyleSheet.create({
  scene: { width: '100%', aspectRatio: 420 / 390 },
  resident: { position: 'absolute', width: 56, height: 44 },
  touch: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
