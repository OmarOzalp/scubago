import { forwardRef, useState, type ReactNode } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = TextInputProps & {
  /** Shown above the field and read by screen readers; a placeholder alone disappears once typing starts. */
  label: string;
  /** Stays visible below the field (e.g. "At least 6 characters"). */
  hint?: string;
  /** At the right end of the label's line: a link that goes with the field. */
  labelAccessory?: ReactNode;
};

/**
 * A labelled text field: a typewriter label over a paper box that takes a lagoon edge while you type.
 * The label is visible and is the field's accessible name.
 */
export const FormField = forwardRef<TextInput, Props>(function FormField({ label, hint, labelAccessory, style, onFocus, onBlur, ...input }, ref) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      {labelAccessory ? (
        <View style={styles.labelRow}>
          <ThemedText type="label" importantForAccessibility="no" accessibilityElementsHidden>
            {label}
          </ThemedText>
          {labelAccessory}
        </View>
      ) : (
        <ThemedText type="label" importantForAccessibility="no" accessibilityElementsHidden>
          {label}
        </ThemedText>
      )}
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        accessibilityHint={hint}
        placeholderTextColor={theme.textSecondary}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          { backgroundColor: theme.backgroundElement, color: theme.text, borderColor: focused ? theme.tint : theme.rule },
          style,
        ]}
        {...input}
      />
      {hint ? (
        <ThemedText type="small" themeColor="textSecondary" importantForAccessibility="no" accessibilityElementsHidden>
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  field: { gap: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', columnGap: Spacing.two },
  input: {
    borderWidth: 1.5,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: Spacing.two + 2,
    minHeight: 50,
    fontSize: 16,
    fontFamily: Type.body,
  },
});
