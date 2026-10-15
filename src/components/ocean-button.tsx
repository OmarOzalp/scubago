import { Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';

import { Ocean } from '@/constants/palette';
import { useTheme } from '@/hooks/use-theme';

interface Props {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  style?: ViewStyle;
  /** Read instead of the title when the title alone is unclear out of context. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export function OceanButton({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  style,
  accessibilityLabel,
  accessibilityHint,
}: Props) {
  const theme = useTheme();
  const primary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.button,
        primary
          ? { backgroundColor: pressed ? Ocean.primaryPressed : Ocean.primary }
          : { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
        disabled && { opacity: 0.4 },
        style,
      ]}>
      <Text style={[styles.title, { color: primary ? Ocean.onPrimary : theme.text }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 14,
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
});
