import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { formatFrameSnapshot, islandFrameStats, type FrameSnapshot } from '@/lib/frame-stats';

/**
 * The island's frame timing over its card (EXPO_PUBLIC_ISLAND_PERF=1, the EAS preview profile), so
 * a phone shows how the scene performs without a debugger attached, and a TestFlight screenshot
 * carries the numbers. Refreshes once a second from islandFrameStats (IslandPerfProbe feeds it).
 */
export function IslandPerfBadge() {
  const [snapshot, setSnapshot] = useState<FrameSnapshot | null>(null);
  useEffect(() => {
    const timer = setInterval(() => setSnapshot(islandFrameStats.latest()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (!snapshot) return null;
  const [first, second] = formatFrameSnapshot(snapshot);
  return <View pointerEvents="none" style={styles.badge}>
    <Text style={styles.text}>{first}</Text>
    <Text style={styles.text}>{second}</Text>
  </View>;
}

const styles = StyleSheet.create({
  badge: { position: 'absolute', left: 8, top: 8, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, backgroundColor: 'rgba(0, 20, 30, .55)' },
  text: { color: '#fff', fontSize: 10, lineHeight: 13, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) },
});
