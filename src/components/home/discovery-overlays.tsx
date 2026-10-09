import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text, View } from 'react-native';

/** Fade (and, with motion, slide) in and out as `visible` changes; the view stays mounted. */
function useShown(visible: boolean, still: boolean) {
  const [shown] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const animation = Animated.timing(shown, { toValue: visible ? 1 : 0, duration: still ? 150 : visible ? 450 : 350, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [visible, still, shown]);
  return shown;
}

/** Across the top of the island: "Island Level 4 — New Growth Unlocked", and what the level brings. */
export function LevelUpBanner({ level, reward, visible, still }: { level: number; reward: string; visible: boolean; still: boolean }) {
  const shown = useShown(visible, still);
  useEffect(() => {
    if (visible) AccessibilityInfo.announceForAccessibility(`Island level ${level}. New growth unlocked: ${reward}.`);
  }, [visible, level, reward]);
  return <Animated.View pointerEvents="none" style={[styles.banner, {
    opacity: shown,
    transform: still ? [] : [{ translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }) }],
  }]}>
    <Text style={styles.bannerTitle}>Island Level {level} — New Growth Unlocked</Text>
    <Text style={styles.bannerDetail}>{reward}</Text>
  </Animated.View>;
}

/** A short note along the bottom of the island (new species it can't show as an animal). */
export function DiscoveryNote({ text, visible, still }: { text: string; visible: boolean; still: boolean }) {
  const shown = useShown(visible, still);
  useEffect(() => {
    if (visible) AccessibilityInfo.announceForAccessibility(text);
  }, [visible, text]);
  return <Animated.View pointerEvents="none" style={[styles.note, { opacity: shown }]}>
    <Text style={styles.noteText} numberOfLines={2}>{text}</Text>
  </Animated.View>;
}

/**
 * The small "New" tag over an arriving animal. The scene moves it every frame (`x`, `y`: its top left
 * in px over the canvas, and `inView`); `visible` fades it in and out as a whole.
 */
export function NewTag({ label, x, y, inView, visible, onWidth }: {
  label: string; x: Animated.Value; y: Animated.Value; inView: Animated.Value; visible: boolean; onWidth: (width: number) => void;
}) {
  const [shown] = useState(() => new Animated.Value(0));
  useEffect(() => {
    // Driven from JavaScript, like the position it's combined with.
    const animation = Animated.timing(shown, { toValue: visible ? 1 : 0, duration: visible ? 300 : 500, useNativeDriver: false });
    animation.start();
    return () => animation.stop();
  }, [visible, shown]);
  useEffect(() => {
    if (visible) AccessibilityInfo.announceForAccessibility(`New species: ${label} has arrived at your island.`);
  }, [visible, label]);
  return <Animated.View pointerEvents="none" onLayout={(event) => onWidth(event.nativeEvent.layout.width)}
    style={[styles.tag, { opacity: Animated.multiply(shown, inView), transform: [{ translateX: x }, { translateY: y }] }]}>
    <View style={styles.tagDot} />
    <Text style={styles.tagText} numberOfLines={1}><Text style={styles.tagNew}>New </Text>{label}</Text>
  </Animated.View>;
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute', top: 8, left: 16, right: 16, alignItems: 'center', gap: 2,
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 16, backgroundColor: 'rgba(255,255,255,.9)',
  },
  bannerTitle: { color: '#254C40', fontSize: 14, fontWeight: '600', letterSpacing: -.2, textAlign: 'center' },
  bannerDetail: { color: '#577467', fontSize: 11, textAlign: 'center' },
  note: {
    position: 'absolute', bottom: 12, left: 16, right: 16, alignItems: 'center',
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,.88)',
  },
  noteText: { color: '#254C40', fontSize: 12, textAlign: 'center' },
  tag: {
    position: 'absolute', left: 0, top: 0, maxWidth: 200, flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 4, paddingHorizontal: 9, borderRadius: 12, backgroundColor: 'rgba(255,255,255,.92)',
  },
  tagDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#E07A3F' },
  tagText: { color: '#254C40', fontSize: 11, flexShrink: 1 },
  tagNew: { fontWeight: '700', color: '#B45A28' },
});
