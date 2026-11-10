import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text, View } from 'react-native';

import { continuous } from '@/components/ui/surface';
import { Elevation, OnWater, Radius, Space, TypeScale } from '@/constants/theme';

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

/** Across the top of the island: "Island level 4. New growth unlocked.", and what the level brings. */
export function LevelUpBanner({ level, reward, visible, still }: { level: number; reward: string; visible: boolean; still: boolean }) {
  const shown = useShown(visible, still);
  useEffect(() => {
    if (visible) AccessibilityInfo.announceForAccessibility(`Island level ${level}. New growth unlocked: ${reward}.`);
  }, [visible, level, reward]);
  return <Animated.View style={[styles.banner, { pointerEvents: 'none',
    opacity: shown,
    transform: still ? [] : [{ translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }) }],
  }]}>
    <Text style={styles.bannerTitle}>Island level {level}. New growth unlocked.</Text>
    <Text style={styles.bannerDetail}>{reward}</Text>
  </Animated.View>;
}

/** A short note along the bottom of the island (new species it can't show as an animal). */
export function DiscoveryNote({ text, visible, still }: { text: string; visible: boolean; still: boolean }) {
  const shown = useShown(visible, still);
  useEffect(() => {
    if (visible) AccessibilityInfo.announceForAccessibility(text);
  }, [visible, text]);
  return <Animated.View style={[styles.note, { pointerEvents: 'none', opacity: shown }]}>
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
  return <Animated.View onLayout={(event) => onWidth(event.nativeEvent.layout.width)}
    style={[styles.tag, { pointerEvents: 'none', opacity: Animated.multiply(shown, inView), transform: [{ translateX: x }, { translateY: y }] }]}>
    <View style={styles.tagDot} />
    <Text style={styles.tagText} numberOfLines={1}><Text style={styles.tagNew}>New </Text>{label}</Text>
  </Animated.View>;
}

// Over the island's own water (the same in both schemes): a near-opaque white panel, dark-green ink.
const styles = StyleSheet.create({
  banner: {
    position: 'absolute', top: Space.s2, left: Space.s4, right: Space.s4, alignItems: 'center', gap: 2,
    paddingVertical: Space.s3, paddingHorizontal: Space.s4, borderRadius: Radius.md, ...continuous,
    backgroundColor: OnWater.panel, boxShadow: Elevation.light.raised,
  },
  bannerTitle: { ...TypeScale.subheadStrong, color: OnWater.ink, textAlign: 'center' },
  bannerDetail: { ...TypeScale.footnote, color: OnWater.inkSoft, textAlign: 'center' },
  note: {
    position: 'absolute', bottom: Space.s3, left: Space.s4, right: Space.s4, alignItems: 'center',
    paddingVertical: Space.s2, paddingHorizontal: Space.s3, borderRadius: Radius.md, ...continuous,
    backgroundColor: OnWater.panel, boxShadow: Elevation.light.card,
  },
  noteText: { ...TypeScale.footnote, color: OnWater.ink, textAlign: 'center' },
  tag: {
    position: 'absolute', left: 0, top: 0, maxWidth: 200, flexDirection: 'row', alignItems: 'center', gap: Space.s1,
    paddingVertical: Space.s1, paddingHorizontal: Space.s2, borderRadius: Radius.pill,
    backgroundColor: OnWater.panel, boxShadow: Elevation.light.card,
  },
  tagDot: { width: Space.s2, height: Space.s2, borderRadius: Radius.pill, backgroundColor: OnWater.accent },
  tagText: { ...TypeScale.footnote, color: OnWater.ink, flexShrink: 1 },
  tagNew: { ...TypeScale.footnoteStrong, color: OnWater.accent },
});
