import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

interface Props<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** What the choice is about, read before the options (e.g. "Account"). */
  accessibilityLabel?: string;
}

export function Segmented<T extends string>({ options, value, onChange, accessibilityLabel }: Props<T>) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[styles.track, { backgroundColor: theme.backgroundElement }]}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            accessibilityRole="tab"
            aria-selected={selected}
            style={[
              styles.segment,
              // The outline keeps the choice visible where the two greys are too close to tell apart.
              selected && { backgroundColor: theme.background, borderColor: theme.textSecondary },
            ]}>
            <ThemedText type="smallBold" themeColor={selected ? 'text' : 'textSecondary'}>
              {opt.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 3,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'transparent',
  },
});
