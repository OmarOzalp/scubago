import { StyleSheet, Text, View } from 'react-native';

import { plural } from '@/components/rewards/format';
import { SiteStamp } from '@/components/rewards/site-stamp';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/notice';
import { ProgressBar } from '@/components/ui/progress';
import { Space, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { PassportGroup } from '@/lib/rewards';

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
    <Card style={styles.page}>
      <ThemedText type="title" accessibilityRole="header">
        {group.name}
      </ThemedText>
      <View style={styles.progress}>
        <Text accessibilityLabel={`${sitesLine(group)} stamped`} style={[TypeScale.bodyStrong, { color: theme.text }]}>
          {sitesLine(group)} <Text style={[TypeScale.body, { color: theme.textSecondary }]}>stamped</Text>
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
        <ThemedText type="subhead" themeColor="textSecondary">
          Every site here is stamped.
        </ThemedText>
      ) : null}
    </Card>
  );
}

/** The passport, a page for each place the diver has been; a blank page when they have not. */
export function PassportView({ groups, onOpenSite, onLog }: { groups: readonly PassportGroup[]; onOpenSite?: (siteId: string) => void; onLog?: () => void }) {
  if (groups.length === 0) {
    return (
      <EmptyState
        icon="stamp"
        title="Your passport is blank"
        message="Each dive site you log gets a stamp here."
        action={onLog ? { title: 'Log a dive', onPress: onLog, variant: 'log', icon: 'plus' } : undefined}
      />
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
    gap: Space.s4,
  },
  page: {
    gap: Space.s3,
  },
  progress: {
    gap: Space.s2,
  },
  stamps: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: Space.s1,
    marginHorizontal: -Space.s1,
  },
  cell: {
    width: '50%',
    paddingVertical: Space.s1,
  },
});
