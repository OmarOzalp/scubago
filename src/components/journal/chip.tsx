import { Pressable, StyleSheet, Text } from 'react-native';

import { Radius, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** A filter you can switch on and off: ink when on, paper when off. */
export function Chip({ label, selected, onPress, accessibilityLabel }: { label: string; selected: boolean; onPress: () => void; accessibilityLabel?: string }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      aria-selected={selected}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? theme.text : theme.backgroundElement,
          borderColor: selected ? theme.text : theme.rule,
          transform: [{ translateY: pressed ? 1 : 0 }],
        },
      ]}>
      <Text style={[styles.label, { color: selected ? theme.background : theme.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    // 44pt is the least a finger should be asked to hit; the label stays 14pt, so the chip only gains a little padding.
    minHeight: 44,
    borderRadius: Radius.sm,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: Type.bodyHeavy,
    fontSize: 14,
  },
});
