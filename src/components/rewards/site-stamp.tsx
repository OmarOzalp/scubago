import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useStampIn } from '@/components/journal/stamp';
import { longDate, plural, stampDate } from '@/components/rewards/format';
import { Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { PassportStamp } from '@/lib/rewards';
import { hashSeed } from '@/lib/wash';

/** The tilt, ink and outline of a site's stamp: the same for the same site, every time. */
export function stampLook(siteId: string): { rotate: number; lagoon: boolean; oval: boolean; drop: number } {
  const h = hashSeed(siteId);
  return { rotate: ((h % 17) - 8) * 1.1, lagoon: h % 3 === 0, oval: (h >>> 4) % 3 === 0, drop: (h >>> 8) % 12 };
}

/** What a screen reader says for a stamp. */
export function stampLabel(stamp: PassportStamp): string {
  return `${stamp.siteName}. First visited ${longDate(stamp.firstVisitedOn)}, ${plural(stamp.visits, 'visit')}.`;
}

/**
 * A passport stamp for a dive site, as a dive centre's would be: double ruled, set at an angle that
 * comes from the site, inked in stamp red or lagoon. It carries the site's name, the day of the
 * first visit and the number of days visited. Opens the site's page.
 */
export function SiteStamp({ stamp, animate = false, delay = 0, onPress }: { stamp: PassportStamp; animate?: boolean; delay?: number; onPress?: () => void }) {
  const theme = useTheme();
  const look = stampLook(stamp.siteId);
  const ink = look.lagoon ? theme.tint : theme.stamp;
  const motion = useStampIn(look.rotate, delay);
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'link' : undefined}
      accessibilityLabel={stampLabel(stamp)}
      accessibilityHint={onPress ? 'Opens the site page' : undefined}
      style={({ pressed }) => [styles.press, { marginTop: look.drop, opacity: pressed ? 0.65 : 1 }]}>
      <Animated.View
        style={[
          styles.outer,
          { borderColor: ink, borderRadius: look.oval ? 54 : 10 },
          animate ? motion : { transform: [{ rotate: `${look.rotate}deg` }] },
        ]}>
        <View style={[styles.inner, { borderColor: ink, borderRadius: look.oval ? 50 : 7, paddingHorizontal: look.oval ? 16 : 10 }]}>
          <Text numberOfLines={3} style={[styles.name, { color: ink }]}>
            {stamp.siteName.toUpperCase()}
          </Text>
          <View style={[styles.rule, { backgroundColor: ink }]} />
          <Text style={[styles.line, { color: ink }]}>{stampDate(stamp.firstVisitedOn)}</Text>
          <Text style={[styles.small, { color: ink }]}>{plural(stamp.visits, 'visit').toUpperCase()}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  press: {
    alignSelf: 'center',
    minHeight: 44,
    maxWidth: '100%',
    padding: 6,
  },
  outer: {
    borderWidth: 2,
    padding: 2,
  },
  inner: {
    borderWidth: 1,
    paddingVertical: 8,
    alignItems: 'center',
    gap: 1,
    minWidth: 112,
  },
  name: {
    fontFamily: Type.label,
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: 1,
    textAlign: 'center',
  },
  rule: {
    height: 1,
    alignSelf: 'stretch',
    marginVertical: 3,
    opacity: 0.8,
  },
  line: {
    fontFamily: Type.label,
    fontSize: 12,
    lineHeight: 15,
    letterSpacing: 1,
  },
  small: {
    fontFamily: Type.label,
    fontSize: 12,
    lineHeight: 15,
    letterSpacing: 1.4,
  },
});
