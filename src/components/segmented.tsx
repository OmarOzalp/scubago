import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface Props<T extends string> {
  /** `accessibilityLabel` is read instead of the label when the label is short for what it says ("Badges 18/51"). */
  options: { value: T; label: string; accessibilityLabel?: string }[];
  value: T;
  onChange: (value: T) => void;
  /** What the choice is about, read before the options (e.g. "Account"). */
  accessibilityLabel?: string;
  /** 'tabs' switches between views (the default); 'choice' picks a setting, read as radio buttons. */
  kind?: 'tabs' | 'choice';
}

export function Segmented<T extends string>({ options, value, onChange, accessibilityLabel, kind = 'tabs' }: Props<T>) {
  const theme = useTheme();
  const choice = kind === 'choice';
  return (
    <View
      accessibilityRole={choice ? 'radiogroup' : 'tablist'}
      accessibilityLabel={accessibilityLabel}
      style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            accessibilityRole={choice ? 'radio' : 'tab'}
            accessibilityLabel={opt.accessibilityLabel}
            aria-checked={choice ? selected : undefined}
            aria-selected={choice ? undefined : selected}
            style={[
              styles.segment,
              // The outline keeps the choice visible where the two greys are too close to tell apart.
              selected && { backgroundColor: theme.backgroundElement, borderColor: theme.text },
            ]}>
            <ThemedText type="smallBold" themeColor={selected ? 'text' : 'textSecondary'} style={{ fontFamily: Type.bodyHeavy }}>
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
    borderRadius: Radius.md,
    padding: 3,
    gap: 3,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: Radius.sm,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
});
