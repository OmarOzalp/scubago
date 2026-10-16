import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { useStampIn } from '@/components/journal/stamp';
import { ThemedText } from '@/components/themed-text';
import { Radius, Type } from '@/constants/theme';
import { useSchemeName, useTheme } from '@/hooks/use-theme';
import { formatDiveNumber, milestoneName } from '@/lib/dives';

/** A small stable number from text, so a centre's stamp always lands the same way. */
function hashOf(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) >>> 0;
  return h;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const stampDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`;
};

/**
 * A dive centre's stamp, as in a passport: drawn by the app from the name the diver wrote, at an
 * angle and in an ink that depend on the name. It says on its face that it isn't verified: no
 * centre has stamped it.
 */
export function CentreStamp({ name, divedOn, number, animate = false, style }: { name: string; divedOn: string; number: number; animate?: boolean; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  const h = hashOf(name.toLowerCase());
  const rotate = ((h % 17) - 8) * 1.1;
  const ink = h % 3 === 0 ? theme.tint : theme.stamp;
  const oval = h % 2 === 0;
  const motion = useStampIn(rotate, 200);
  return (
    <Animated.View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Stamp: ${name}, ${stampDate(divedOn).toLowerCase()}, dive ${number}. Drawn from the name you wrote; not verified by the centre.`}
      style={[
        styles.stamp,
        { borderColor: ink, borderRadius: oval ? 60 : 10 },
        animate ? motion : { transform: [{ rotate: `${rotate}deg` }] },
        style,
      ]}>
      <View style={[styles.stampInner, { borderColor: ink, borderRadius: oval ? 56 : 7, paddingHorizontal: oval ? 22 : 12 }]}>
        <Text numberOfLines={2} style={[styles.stampName, { color: ink }]}>
          {name.toUpperCase()}
        </Text>
        <View style={[styles.stampRule, { backgroundColor: ink }]} />
        <Text style={[styles.stampLine, { color: ink }]}>{stampDate(divedOn)}</Text>
        <Text style={[styles.stampLine, { color: ink }]}>DIVE {formatDiveNumber(number).toUpperCase()}</Text>
        <Text style={[styles.stampSmall, { color: ink }]}>NOT VERIFIED</Text>
      </View>
    </Animated.View>
  );
}

/**
 * The bookplate on a milestone page (the 25th, 50th, 100th… dive): a framed card in the front of
 * the book, with a medal on a sun wash.
 */
export function Bookplate({ at, siteName, style }: { at: number; siteName?: string; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  const scheme = useSchemeName();
  const paper = scheme === 'light' ? '#FFF3D1' : '#2B2A22';
  return (
    <View
      accessible
      accessibilityLabel={`Milestone: your ${milestoneName(at)} dive${siteName ? `, at ${siteName}` : ''}`}
      style={[styles.plate, { backgroundColor: paper, borderColor: theme.text }, style]}>
      <View style={[styles.plateInner, { borderColor: theme.text }]}>
        <ThemedText type="label">Dive {formatDiveNumber(at)}</ThemedText>
        <Icon name="medal" size={40} wash={theme.sun} washOpacity={0.9} />
        <Text style={[styles.plateTitle, { color: theme.text }]}>Your {milestoneName(at)} dive</Text>
        {siteName ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
            Logged at {siteName}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stamp: { borderWidth: 2, padding: 2, alignSelf: 'flex-start', maxWidth: 240 },
  stampInner: { borderWidth: 1, paddingVertical: 8, alignItems: 'center', gap: 1 },
  stampName: { fontFamily: Type.label, fontSize: 14, lineHeight: 17, letterSpacing: 1.2, textAlign: 'center' },
  stampRule: { height: 1, alignSelf: 'stretch', marginVertical: 3, opacity: 0.8 },
  stampLine: { fontFamily: Type.label, fontSize: 12, lineHeight: 15, letterSpacing: 1 },
  stampSmall: { fontFamily: Type.label, fontSize: 12, lineHeight: 15, letterSpacing: 1.6, marginTop: 2 },
  plate: { borderWidth: 1.5, borderRadius: Radius.lg, padding: 5 },
  plateInner: { borderWidth: 1, borderRadius: Radius.md, paddingVertical: 16, paddingHorizontal: 12, alignItems: 'center', gap: 6 },
  plateTitle: { fontFamily: Type.displayItalic, fontSize: 26, lineHeight: 32, textAlign: 'center' },
  center: { textAlign: 'center' },
});
