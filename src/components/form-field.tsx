import { forwardRef } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = TextInputProps & {
  /** Shown above the field and read by screen readers; a placeholder alone disappears once typing starts. */
  label: string;
  /** Stays visible below the field (e.g. "At least 6 characters"). */
  hint?: string;
};

/** A labelled text field: the label is visible and is the field's accessible name. */
export const FormField = forwardRef<TextInput, Props>(function FormField({ label, hint, style, ...input }, ref) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold" importantForAccessibility="no" accessibilityElementsHidden>
        {label}
      </ThemedText>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        accessibilityHint={hint}
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }, style]}
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
  field: { gap: Spacing.one },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#8886',
    borderRadius: 10,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.two,
    minHeight: 48,
    fontSize: 16,
  },
});
