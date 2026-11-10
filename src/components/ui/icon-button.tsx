import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { usePressScale } from '@/components/ui/press';
import { Elevation, Size } from '@/constants/theme';
import { useSchemeName, useTheme } from '@/hooks/use-theme';

export type IconButtonProps = {
  icon: IconName;
  onPress: () => void;
  /** What it does: required, since the button has no words. */
  accessibilityLabel: string;
  accessibilityHint?: string;
  /** `page` (default): a white circle with a card shadow, on the page. `bar`: plain, on a bar or a card. */
  on?: 'page' | 'bar';
  role?: 'button' | 'link';
  disabled?: boolean;
  /** The icon's colour; the theme's ink by default. */
  color?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/** One icon in a 40 circle, 44 to hit. */
export function IconButton({ icon, onPress, accessibilityLabel, accessibilityHint, on = 'page', role = 'button', disabled = false, color, testID, style }: IconButtonProps) {
  const theme = useTheme();
  const scheme = useSchemeName();
  const scale = usePressScale();
  const onPage = on === 'page';
  const dark = Elevation[scheme].cardBorder;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.hit, { opacity: disabled ? 0.4 : 1 }, scale(pressed && !disabled), style]}>
      {({ pressed }) => (
        <View
          style={[
            styles.circle,
            onPage
              ? { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement, boxShadow: Elevation[scheme].card, ...(dark ? { borderWidth: 1, borderColor: theme.cardBorder } : null) }
              : { backgroundColor: pressed ? theme.backgroundSelected : 'transparent' },
          ]}>
          <Icon name={icon} size={Size.icon} color={color ?? theme.text} weight={icon === 'more' ? 'bold' : 'regular'} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    width: Size.hit,
    height: Size.hit,
    minHeight: Size.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    width: Size.iconButton,
    height: Size.iconButton,
    borderRadius: Size.iconButton / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
