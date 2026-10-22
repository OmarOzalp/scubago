import { StyleSheet, Text, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { Paper } from '@/components/journal/paper';
import type { Notice } from '@/components/sightings/format';
import { OceanButton } from '@/components/ocean-button';
import { ThemedText } from '@/components/themed-text';
import { Radius, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** A quiet stand-in while the first look-up runs: three ruled lines, no spinner. It breathes unless Reduce Motion is on. */
export function SightingsPlaceholder() {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const breathe = reduced
    ? {}
    : ({
        animationName: { '0%': { opacity: 0.5 }, '50%': { opacity: 1 }, '100%': { opacity: 0.5 } },
        animationDuration: '2200ms',
        animationIterationCount: 'infinite',
        animationTimingFunction: 'ease-in-out',
      } as object);
  return (
    <View
      accessible
      accessibilityLabel="Looking up public records near this site"
      accessibilityState={{ busy: true }}
      aria-busy
      accessibilityLiveRegion="polite">
      <Paper padded={false}>
        <Animated.View style={breathe}>
          {[0, 1, 2].map((index) => (
            <View key={index} style={[styles.ghostRow, index > 0 && { borderTopWidth: 1, borderTopColor: theme.rule }]}>
              <View style={[styles.ghostPlate, { backgroundColor: theme.backgroundSelected }]} />
              <View style={styles.ghostText}>
                <View style={[styles.ghostBar, { width: index === 1 ? '48%' : '62%', backgroundColor: theme.backgroundSelected }]} />
                <View style={[styles.ghostBar, { width: '82%', height: 10, backgroundColor: theme.rule }]} />
              </View>
            </View>
          ))}
        </Animated.View>
      </Paper>
      <ThemedText type="caption" themeColor="textSecondary" style={styles.placeholderNote}>
        Looking up public records…
      </ThemedText>
    </View>
  );
}

/** Nothing saved and no way to reach the records: say so kindly, and offer another go. */
export function SightingsUnavailable({ offline, onRetry }: { offline: boolean; onRetry: () => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.box, { borderColor: theme.rule }]} accessibilityLiveRegion="polite">
      <Icon name="waves" size={30} />
      <ThemedText type="caption" themeColor="textSecondary" style={styles.center}>
        Couldn’t reach the public records right now.
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
        {offline ? 'You seem to be offline. They’ll show here once you’re connected.' : 'Check your connection and try again in a moment.'}
      </ThemedText>
      <OceanButton title="Try again" variant="secondary" icon="sync" onPress={onRetry} style={styles.retryCentred} />
    </View>
  );
}

/** Both sources answered (or one did, and the other is named elsewhere) and know no catalogue animal near the site. */
export function SightingsEmpty({ radiusKm, answered, total, hasCuratedSpecies }: { radiusKm: number; answered: string[]; total: number; hasCuratedSpecies: boolean }) {
  const theme = useTheme();
  const partial = answered.length > 0 && answered.length < total;
  const text = partial
    ? `No records of catalogue species from ${answered.join(' or ')} within ${radiusKm} km yet.`
    : `No public records of catalogue species within ${radiusKm} km yet.`;
  return (
    <View style={[styles.box, { borderColor: theme.rule }]}>
      <Icon name="binoculars" size={30} />
      <ThemedText type="caption" themeColor="textSecondary" style={styles.center}>
        {text}
      </ThemedText>
      {hasCuratedSpecies ? null : (
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          ScubaGo has no species list for this site yet either.
        </ThemedText>
      )}
    </View>
  );
}

/** What is not quite right with the records on show: an old copy, a source that did not answer, a cut-off list. */
export function SightingsNotices({ notices, canRetry, onRetry }: { notices: Notice[]; canRetry: boolean; onRetry: () => void }) {
  if (notices.length === 0) return null;
  return (
    <Paper tone="sand" style={styles.notices}>
      <View accessibilityLiveRegion="polite" style={styles.noticeList}>
        {notices.map((notice) => (
          <View key={notice.key} style={styles.notice}>
            <Icon name={notice.kind === 'refreshFailed' ? 'warning' : 'info'} size={20} style={styles.noticeIcon} />
            <ThemedText type="small" style={styles.noticeText}>
              {notice.text}
            </ThemedText>
          </View>
        ))}
      </View>
      {canRetry ? <OceanButton title="Try again" variant="secondary" icon="sync" onPress={onRetry} style={styles.retry} /> : null}
    </Paper>
  );
}

/** "Updated 3 days ago", and "refreshing" while a newer copy is on its way. */
export function UpdatedLine({ text, refreshing }: { text: string; refreshing: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.updated} accessibilityLiveRegion="polite">
      <Icon name={refreshing ? 'sync' : 'clock'} size={16} color={theme.textSecondary} />
      <Text style={[styles.updatedText, { color: theme.textSecondary }]}>{refreshing ? `${text} · refreshing…` : text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  ghostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  ghostPlate: {
    width: 56,
    height: 56,
    borderRadius: Radius.md,
  },
  ghostText: {
    flex: 1,
    gap: 10,
  },
  ghostBar: {
    height: 14,
    borderRadius: Radius.xs,
  },
  placeholderNote: {
    marginTop: 8,
  },
  box: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: Radius.lg,
    paddingVertical: 20,
    paddingHorizontal: 14,
    alignItems: 'center',
    gap: 8,
  },
  center: {
    textAlign: 'center',
  },
  retry: {
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  retryCentred: {
    alignSelf: 'center',
    marginTop: 6,
  },
  notices: {
    gap: 10,
    padding: 14,
  },
  noticeList: {
    gap: 10,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  noticeIcon: {
    marginTop: 0,
  },
  noticeText: {
    flex: 1,
  },
  updated: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  updatedText: {
    fontFamily: Type.body,
    fontSize: 13,
    lineHeight: 18,
  },
});
