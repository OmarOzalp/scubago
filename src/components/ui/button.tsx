import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { usePressScale } from '@/components/ui/press';
import { continuous } from '@/components/ui/surface';
import { OnFill, Radius, Size, Space, TypeScale } from '@/constants/theme';
import { useSchemeName, useTheme } from '@/hooks/use-theme';

/** `quiet` is the old name of `plain`, kept for unmigrated screens. */
export type ButtonVariant = 'primary' | 'log' | 'secondary' | 'plain' | 'destructive' | 'destructivePlain' | 'quiet';

export type ButtonProps = {
  title: string;
  onPress: () => void;
  /**
   * primary: lagoon fill, the screen's main action. log: coral, logging a dive only. secondary: lagoonSoft
   * fill, tint label. plain: tint label, no fill. destructive: dangerSoft fill, danger label;
   * destructivePlain: danger label, no fill.
   */
  variant?: ButtonVariant;
  /** lg 52 (default) or md 44. */
  size?: 'lg' | 'md';
  /** A leading icon, 20. */
  icon?: IconName;
  /** Shows a spinner in place of the icon and stops presses; the label stays. */
  loading?: boolean;
  disabled?: boolean;
  /** Read instead of the title when the title alone is unclear out of context. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  /** Layout from the parent (flex, margins, alignSelf). A button stretches in a column, and sizes to its label in a row. */
  style?: StyleProp<ViewStyle>;
};

/** The one button family. Radius md, label Figtree 700 16, no outlines; disabled at 40%. */
export function Button({ title, onPress, variant = 'primary', size = 'lg', icon, loading = false, disabled = false, accessibilityLabel, accessibilityHint, testID, style }: ButtonProps) {
  const theme = useTheme();
  const scheme = useSchemeName();
  const scale = usePressScale();
  const { fill, ink } = colours(variant, theme, OnFill[scheme]);
  const inactive = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      aria-disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        { minHeight: size === 'lg' ? Size.buttonLg : Size.buttonMd, backgroundColor: fill, opacity: disabled ? 0.4 : 1 },
        (variant === 'plain' || variant === 'quiet' || variant === 'destructivePlain') && styles.plain,
        scale(pressed && !inactive),
        style,
      ]}>
      <View style={styles.row}>
        {loading ? <ActivityIndicator size="small" color={ink} /> : icon ? <Icon name={icon} size={20} color={ink} weight={icon === 'plus' ? 'bold' : 'regular'} /> : null}
        <Text numberOfLines={2} maxFontSizeMultiplier={1.4} style={[styles.label, { color: ink }]}>
          {title}
        </Text>
      </View>
    </Pressable>
  );
}

function colours(variant: ButtonVariant, theme: ReturnType<typeof useTheme>, on: (typeof OnFill)['light' | 'dark']) {
  switch (variant) {
    case 'log':
      return { fill: theme.coral, ink: on.coral };
    case 'secondary':
      return { fill: theme.lagoonSoft, ink: theme.tint };
    case 'plain':
    case 'quiet':
      return { fill: 'transparent', ink: theme.tint };
    case 'destructive':
      return { fill: theme.dangerSoft, ink: theme.danger };
    case 'destructivePlain':
      return { fill: 'transparent', ink: theme.danger };
    default:
      return { fill: theme.lagoon, ink: on.lagoon };
  }
}

const styles = StyleSheet.create({
  button: {
    borderRadius: Radius.md,
    ...continuous,
    paddingHorizontal: Space.s5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plain: {
    paddingHorizontal: Space.s3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.s2,
  },
  label: {
    ...TypeScale.button,
    textAlign: 'center',
    flexShrink: 1,
  },
});
