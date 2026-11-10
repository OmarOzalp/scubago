import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Card } from '@/components/ui/card';
import { Radius, Size, Space, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** The last row of a list that has more to show: "Show all 12", and "Show fewer" once open. */
export function ShowAllRow({ expanded, label, accessibilityLabel, onPress }: { expanded: boolean; label: string; accessibilityLabel: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      aria-expanded={expanded}
      accessibilityState={{ expanded }}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.more, { borderTopColor: theme.rule, backgroundColor: pressed ? theme.backgroundSelected : 'transparent' }]}>
      <Text style={[TypeScale.subheadStrong, { color: theme.tint }]}>{label}</Text>
      <Icon name="chevronDown" size={16} color={theme.tint} weight="bold" style={expanded ? styles.flipped : undefined} />
    </Pressable>
  );
}

/** Who the records are from, and the way to Data & credits. */
export function CreditFooter({ credit, onOpenCredits }: { credit: string; onOpenCredits: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onOpenCredits}
      accessibilityRole="link"
      accessibilityLabel={`${credit}. Data and credits`}
      accessibilityHint="Opens the data and credits page"
      style={[styles.footer, { borderTopColor: theme.rule }]}>
      <Text style={[TypeScale.footnote, { color: theme.textSecondary }]}>
        {`${credit} · `}
        <Text style={[TypeScale.footnoteStrong, styles.underline, { color: theme.tint }]}>Data & credits</Text>
      </Text>
    </Pressable>
  );
}

/** A quiet card with a short, centred message in it (nothing found, nothing to reach): no dashed box. */
export function QuietCard({ children, live = false }: { children: ReactNode; live?: boolean }) {
  return (
    <Card style={styles.quiet}>
      <View accessibilityLiveRegion={live ? 'polite' : undefined} style={styles.quietInner}>
        {children}
      </View>
    </Card>
  );
}

/** The ghost of a list while it loads: a grey tile and two bars for each row, ruled off like the real rows. */
export function GhostRows({ widths }: { widths: [string, string][] }) {
  const theme = useTheme();
  return (
    <Card padded={false} style={styles.ghostCard}>
      {widths.map(([top, bottom], index) => (
        <View key={index} style={[styles.ghostRow, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.rule }]}>
          <View style={[styles.ghostTile, { backgroundColor: theme.backgroundSelected }]} />
          <View style={styles.ghostText}>
            <View style={[styles.ghostBar, { width: top as `${number}%`, backgroundColor: theme.backgroundSelected }]} />
            <View style={[styles.ghostBar, styles.ghostThin, { width: bottom as `${number}%`, backgroundColor: theme.backgroundSelected }]} />
          </View>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  more: {
    minHeight: Size.hit,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.s2,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Space.s4,
  },
  flipped: {
    transform: [{ rotate: '180deg' }],
  },
  footer: {
    minHeight: Size.hit,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Space.s3,
    paddingBottom: Space.s2,
    justifyContent: 'center',
  },
  underline: {
    textDecorationLine: 'underline',
  },
  quiet: {
    alignItems: 'center',
  },
  quietInner: {
    alignItems: 'center',
    gap: Space.s2,
  },
  ghostCard: {
    overflow: 'hidden',
  },
  ghostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s3,
    paddingVertical: Space.s3,
    paddingHorizontal: Space.s4,
  },
  ghostTile: {
    width: Size.thumb,
    height: Size.thumb,
    borderRadius: Radius.sm,
  },
  ghostText: {
    flex: 1,
    gap: Space.s2,
  },
  ghostBar: {
    height: 14,
    borderRadius: Radius.sm,
  },
  ghostThin: {
    height: 10,
  },
});
