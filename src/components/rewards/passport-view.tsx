import { StyleSheet, Text, View } from 'react-native';

import { ProgressBar } from '@/components/journal/progress-bar';
import { Paper } from '@/components/journal/paper';
import { Wash } from '@/components/journal/wash';
import { OceanButton } from '@/components/ocean-button';
import { plural } from '@/components/rewards/format';
import { SiteStamp } from '@/components/rewards/site-stamp';
import { ThemedText } from '@/components/themed-text';
import { Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { PassportGroup } from '@/lib/rewards';
import { hashSeed } from '@/lib/wash';

/** "3 of 41 sites", or "1 site" when the lookup knows no more than the diver has visited. */
export function sitesLine(group: Pick<PassportGroup, 'stamps' | 'knownSites'>): string {
  const visited = group.stamps.length;
  const known = Math.max(group.knownSites, visited);
  return `${visited.toLocaleString('en')} of ${plural(known, 'site')}`;
}

/**
 * One page of the passport: a region (or country), its progress, and a stamp for every site visited.
 * Each stamp has its own date, so the page keeps no dates or "still to stamp" footer of its own.
 */
export function PassportPage({
  group,
  onOpenSite,
  animateFirst = false,
}: {
  group: PassportGroup;
  onOpenSite?: (siteId: string) => void;
  animateFirst?: boolean;
}) {
  const theme = useTheme();
  const visited = group.stamps.length;
  const known = Math.max(group.knownSites, visited);
  return (
    <Paper tone="sand" padded={false} raised style={styles.page}>
      <Wash width={190} height={110} color={theme.wash} seed={hashSeed(group.id)} opacity={0.55} style={styles.wash} />
      <View style={[styles.frame, { borderColor: theme.rule }]}>
        <ThemedText type="display" accessibilityRole="header" style={styles.name}>
          {group.name}
        </ThemedText>
        <View style={styles.progress}>
          <Text accessibilityLabel={`${sitesLine(group)} stamped`} style={[styles.sites, { color: theme.text }]}>
            {sitesLine(group)} <Text style={{ fontFamily: Type.body, color: theme.textSecondary }}>stamped</Text>
          </Text>
          <ProgressBar fraction={known > 0 ? visited / known : 0} max={known} now={visited} accessibilityLabel={`${sitesLine(group)} stamped`} />
        </View>
        <View style={styles.stamps}>
          {group.stamps.map((stamp, index) => (
            <View key={stamp.siteId} style={styles.cell}>
              <SiteStamp stamp={stamp} animate={animateFirst && index === 0} delay={350} onPress={onOpenSite ? () => onOpenSite(stamp.siteId) : undefined} />
            </View>
          ))}
        </View>
        {/* Said once: a full page is a moment worth a line. The count of what is left is in the progress line above. */}
        {known > 0 && visited >= known ? (
          <ThemedText type="caption" themeColor="textSecondary" style={styles.foot}>
            Every site here is stamped.
          </ThemedText>
        ) : null}
      </View>
    </Paper>
  );
}

/** The passport, a page for each place the diver has been; a blank page with dashed outlines when they have not. */
export function PassportView({ groups, onOpenSite, onLog }: { groups: readonly PassportGroup[]; onOpenSite?: (siteId: string) => void; onLog?: () => void }) {
  const theme = useTheme();
  if (groups.length === 0) {
    return (
      <Paper tone="sand" style={styles.blank}>
        <View style={styles.ghosts}>
          {[-6, 5].map((rotate) => (
            <View key={rotate} style={[styles.ghost, { borderColor: theme.textSecondary, transform: [{ rotate: `${rotate}deg` }] }]}>
              <Text style={[styles.ghostText, { color: theme.textSecondary }]}>SITE</Text>
              <View style={[styles.ghostRule, { backgroundColor: theme.textSecondary }]} />
              <Text style={[styles.ghostText, { color: theme.textSecondary }]}>DD MMM YYYY</Text>
            </View>
          ))}
        </View>
        <ThemedText type="heading" style={styles.center}>
          Your passport is blank
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          Each dive site you log gets a stamp here.
        </ThemedText>
        {onLog ? <OceanButton title="Log a dive" variant="log" icon="plus" onPress={onLog} style={styles.cta} /> : null}
      </Paper>
    );
  }
  return (
    <View style={styles.pages}>
      {groups.map((group, index) => (
        <PassportPage key={group.id} group={group} onOpenSite={onOpenSite} animateFirst={index === 0} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pages: {
    gap: 20,
  },
  page: {
    overflow: 'hidden',
    padding: 7,
  },
  wash: {
    position: 'absolute',
    top: -14,
    right: -30,
  },
  frame: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 13,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 8,
  },
  name: {
    fontSize: 30,
    lineHeight: 36,
  },
  progress: {
    gap: 6,
  },
  sites: {
    fontFamily: Type.bodyHeavy,
    fontSize: 16,
    lineHeight: 21,
  },
  stamps: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 6,
    marginHorizontal: -4,
  },
  cell: {
    width: '50%',
    paddingVertical: 4,
  },
  foot: {
    marginTop: 4,
  },
  blank: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 24,
  },
  ghosts: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 6,
  },
  ghost: {
    width: 118,
    height: 72,
    borderRadius: 10,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    opacity: 0.6,
  },
  ghostText: {
    fontFamily: Type.label,
    fontSize: 12,
    lineHeight: 14,
    letterSpacing: 1,
  },
  ghostRule: {
    height: 1,
    width: '60%',
    opacity: 0.7,
  },
  center: {
    textAlign: 'center',
  },
  cta: {
    alignSelf: 'stretch',
    marginTop: 6,
  },
});
