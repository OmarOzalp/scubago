import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { OnFill, Radius, Size, TypeScale } from '@/constants/theme';
import { useSchemeName, useTheme } from '@/hooks/use-theme';

export type TagTone = 'neutral' | 'lagoon' | 'coral' | 'sun' | 'danger';

export type TagProps = {
  label: string;
  /** A meaning from the theme... */
  tone?: TagTone;
  /** ...or a colour of its own (a rarity tier): a soft fill of it, and `text` for the (contrast-checked) lettering. */
  color?: string;
  text?: string;
  /** A state that will change (waiting to sync): a dashed edge. */
  dashed?: boolean;
  /** Kept for old callers: tags are one size (13 is the floor). */
  small?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/** A 24 pill naming a state: soft fill, strong text. "New" is `tone="sun"`. */
export function Tag({ label, tone = 'neutral', color, text, dashed = false, accessibilityLabel, style }: TagProps) {
  const theme = useTheme();
  const scheme = useSchemeName();
  const tones: Record<TagTone, { fill: string; ink: string }> = {
    neutral: { fill: theme.backgroundSelected, ink: theme.textSecondary },
    lagoon: { fill: theme.lagoonSoft, ink: theme.tint },
    coral: { fill: theme.coralSoft, ink: theme.stamp },
    sun: { fill: theme.sun, ink: OnFill[scheme].sun },
    danger: { fill: theme.dangerSoft, ink: theme.danger },
  };
  // A colour of its own is laid on at 15% (two hex digits of alpha), with its edge only when dashed.
  const fill = color ? `${color}26` : tones[tone].fill;
  const ink = text ?? (color ? theme.text : tones[tone].ink);
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[styles.tag, { backgroundColor: fill }, dashed && { borderWidth: 1, borderStyle: 'dashed', borderColor: color ?? theme.textTertiary }, style]}>
      <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={[styles.label, { color: ink }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    minHeight: Size.tag,
    borderRadius: Radius.pill,
    paddingHorizontal: 9,
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    ...TypeScale.footnoteStrong,
  },
});
