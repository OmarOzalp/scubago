import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Elevation, Radius, Size, TypeScale } from '@/constants/theme';
import { continuous } from '@/components/ui/surface';
import { useSchemeName, useTheme } from '@/hooks/use-theme';

export type SegmentedProps<T extends string> = {
  /** `accessibilityLabel` is read instead of the label when the label is short for what it says ("Badges 18/51"). */
  options: { value: T; label: string; accessibilityLabel?: string }[];
  value: T;
  onChange: (value: T) => void;
  /** What the choice is about, read before the options (e.g. "Account"). */
  accessibilityLabel?: string;
  /** 'tabs' switches between views (the default); 'choice' picks a setting, read as radio buttons. */
  kind?: 'tabs' | 'choice';
};

/** Track and thumb: a sunken 40 track, the chosen segment a white thumb with a card shadow. 44 to hit. */
export function Segmented<T extends string>({ options, value, onChange, accessibilityLabel, kind = 'tabs' }: SegmentedProps<T>) {
  const theme = useTheme();
  const scheme = useSchemeName();
  const choice = kind === 'choice';
  return (
    <View accessibilityRole={choice ? 'radiogroup' : 'tablist'} accessibilityLabel={accessibilityLabel} style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            accessibilityRole={choice ? 'radio' : 'tab'}
            accessibilityLabel={opt.accessibilityLabel}
            accessibilityState={choice ? { checked: selected } : { selected }}
            aria-checked={choice ? selected : undefined}
            aria-selected={choice ? undefined : selected}
            // The thumb is 34; 5 more above and below make it 44 to hit.
            hitSlop={{ top: 5, bottom: 5 }}
            style={[
              styles.segment,
              selected && { backgroundColor: theme.backgroundElement, boxShadow: Elevation[scheme].card,...(Elevation[scheme].cardBorder ? { borderColor: theme.cardBorder } : null) },
            ]}>
            <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={[styles.label, { color: selected ? theme.text : theme.textSecondary }]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    minHeight: Size.segmented,
    borderRadius: Radius.md,
    ...continuous,
    padding: 3,
    gap: 3,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderRadius: Radius.md - 3,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  label: {
    ...TypeScale.subheadStrong,
  },
});
