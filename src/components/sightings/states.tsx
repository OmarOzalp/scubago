import { StyleSheet, Text, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import type { Notice as NoticeModel } from '@/components/sightings/format';
import { GhostRows, QuietCard } from '@/components/sightings/parts';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { Space, TypeScale } from '@/constants/theme';
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
      accessibilityLiveRegion="polite"
      style={styles.placeholder}>
      <Animated.View style={breathe}>
        <GhostRows
          widths={[
            ['62%', '82%'],
            ['48%', '82%'],
            ['62%', '82%'],
          ]}
        />
      </Animated.View>
      <Text style={[TypeScale.callout, { color: theme.textSecondary }]}>Looking up public records…</Text>
    </View>
  );
}

/** Nothing saved and no way to reach the records: say so kindly, and offer another go. */
export function SightingsUnavailable({ offline, onRetry }: { offline: boolean; onRetry: () => void }) {
  const theme = useTheme();
  return (
    <QuietCard live>
      {/* What the short line leaves out is in its label, so a screen reader still hears the reason. */}
      <Text
        style={[TypeScale.callout, styles.center, { color: theme.textSecondary }]}
        accessibilityLabel={`Couldn’t reach the public records right now. ${offline ? 'You seem to be offline: they’ll show here once you’re connected.' : 'Check your connection and try again in a moment.'}`}>
        Couldn’t reach records.
      </Text>
      <Button title="Try again" variant="secondary" size="md" icon="sync" onPress={onRetry} />
    </QuietCard>
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
    <QuietCard>
      <Icon name="binoculars" size={30} />
      <Text style={[TypeScale.callout, styles.center, { color: theme.textSecondary }]}>{text}</Text>
      {hasCuratedSpecies ? null : <Text style={[TypeScale.subhead, styles.center, { color: theme.textSecondary }]}>ScubaGo has no species list for this site yet either.</Text>}
    </QuietCard>
  );
}

/** What is not quite right with the records on show: an old copy, a source that did not answer, a cut-off list. */
export function SightingsNotices({ notices, canRetry, onRetry }: { notices: NoticeModel[]; canRetry: boolean; onRetry: () => void }) {
  if (notices.length === 0) return null;
  return (
    <View style={styles.notices}>
      <View accessibilityLiveRegion="polite" style={styles.noticeList}>
        {notices.map((notice) => (
          <Notice key={notice.key} icon={notice.kind === 'refreshFailed' ? 'warning' : 'info'}>
            {notice.text}
          </Notice>
        ))}
      </View>
      {canRetry ? <Button title="Try again" variant="secondary" size="md" icon="sync" onPress={onRetry} style={styles.retry} /> : null}
    </View>
  );
}

/** "Updated 3 days ago", and "refreshing" while a newer copy is on its way. */
export function UpdatedLine({ text, refreshing }: { text: string; refreshing: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.updated} accessibilityLiveRegion="polite">
      <Icon name={refreshing ? 'sync' : 'clock'} size={16} color={theme.textSecondary} />
      <Text style={[TypeScale.footnote, { color: theme.textSecondary }]}>{refreshing ? `${text} · refreshing…` : text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    gap: Space.s2,
  },
  center: {
    textAlign: 'center',
  },
  retry: {
    alignSelf: 'flex-start',
  },
  notices: {
    gap: Space.s3,
  },
  noticeList: {
    gap: Space.s2,
  },
  updated: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s2,
  },
});
