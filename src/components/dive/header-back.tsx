import { Pressable, StyleSheet, type ColorValue } from 'react-native';

import { Icon } from '@/components/icon';
import { useTheme } from '@/hooks/use-theme';

/**
 * The header's back arrow for a screen that has steps inside it: the navigator's own button would
 * leave the screen, and this one goes back a step first. `label` says where it goes ("Close" when
 * it leaves).
 */
export function HeaderBack({ onPress, label, tintColor }: { onPress: () => void; label: string; tintColor?: ColorValue }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => [styles.button, { opacity: pressed ? 0.6 : 1 }]}>
      <Icon name="back" size={24} color={tintColor ?? theme.text} weight="regular" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
