import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { DivePage } from '@/components/dive/dive-page';
import { Icon } from '@/components/icon';
import { Screen } from '@/components/journal/screen';
import { Wash } from '@/components/journal/wash';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDiveNumber, neighbours } from '@/lib/dives';
import { leave } from '@/lib/leave';
import { useAppStore, useMyDives, useSiteById } from '@/lib/store';
import type { Dive } from '@/lib/types';

/**
 * A page of the diver's logbook on its own, for links from elsewhere (a sighting's page, the saved
 * screen). The Logbook tab shows the same pages as a book you swipe through. Edit and Share are in
 * the header; the buttons at the foot turn to the page before and after.
 */
export default function DivePageScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const siteById = useSiteById();
  const dives = useMyDives();
  const ready = useAppStore((s) => s.ready);
  const live = dives.find((d) => d.id === id);
  const liveTurn = useMemo(() => (live ? neighbours(dives, live.id) : {}), [dives, live]);
  // Deleted from this screen: it goes on showing the page while it closes, rather than "This page isn't in your
  // log" sliding away (the store has dropped the page before the navigator has taken the screen down).
  const [leaving, setLeaving] = useState<{ dive: Dive; turn: typeof liveTurn } | null>(null);
  const dive = live ?? leaving?.dive;
  const turn = live ? liveTurn : (leaving?.turn ?? {});

  // Until the log has loaded, a page not found yet may still be there: say nothing rather than that it isn't.
  if (!dive && !ready) return <View style={[styles.flex, { backgroundColor: theme.background }]} />;
  if (!dive) {
    return (
      <View style={[styles.missing, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: '' }} />
        <View style={styles.missingArt}>
          <Wash width={112} height={78} color={theme.wash} seed={31} style={StyleSheet.absoluteFill} />
          <Icon name="logbook" size={40} />
        </View>
        <ThemedText type="heading" style={styles.center}>
          This page isn’t in your log.
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          It may have been deleted, or it belongs to another diver.
        </ThemedText>
      </View>
    );
  }

  const go = (to?: Dive) => to && router.replace(`/dive/${to.id}`);
  return (
    <Screen>
      <DivePage
        dive={dive}
        onDeleting={(deleting) => setLeaving(deleting && live ? { dive: live, turn: liveTurn } : null)}
        // Back where the diver came from; opened straight from a link (or a reload on the web), to the Logbook.
        onDeleted={() => leave('/logbook')}
        footer={
          // Turning the pages: the one before (a lower number) on the left, the next on the right.
          <View style={[styles.turn, { borderTopColor: theme.rule }]}>
            <TurnButton direction="older" dive={turn.older} siteName={siteById(turn.older?.siteId)?.name ?? ''} onPress={() => go(turn.older)} />
            <TurnButton direction="newer" dive={turn.newer} siteName={siteById(turn.newer?.siteId)?.name ?? ''} onPress={() => go(turn.newer)} />
          </View>
        }
      />
    </Screen>
  );
}

function TurnButton({ direction, dive, siteName, onPress }: { direction: 'older' | 'newer'; dive?: Dive; siteName: string; onPress: () => void }) {
  const theme = useTheme();
  const older = direction === 'older';
  if (!dive) return <View style={styles.turnButton} />;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={`${older ? 'Previous page' : 'Next page'}: dive ${dive.number}, ${siteName}`}
      style={({ pressed }) => [styles.turnButton, styles.turnBorder, { backgroundColor: pressed ? theme.backgroundSelected : 'transparent', borderColor: theme.rule }]}>
      {older ? <Icon name="chevronLeft" size={16} color={theme.tint} weight="bold" /> : null}
      <View style={[styles.flex, { alignItems: older ? 'flex-start' : 'flex-end' }]}>
        <ThemedText type="smallBold" themeColor="tint">
          {formatDiveNumber(dive.number)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {siteName}
        </ThemedText>
      </View>
      {older ? null : <Icon name="chevronRight" size={16} color={theme.tint} weight="bold" />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.four },
  missingArt: { width: 112, height: 78, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.one },
  turn: { flexDirection: 'row', gap: Spacing.two, borderTopWidth: 1, paddingTop: Spacing.three },
  turnButton: { flex: 1, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: Radius.md },
  turnBorder: { borderWidth: 1, paddingHorizontal: 10 },
});
