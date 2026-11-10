import { forwardRef } from 'react';
import { Text, type TextInputInstance, type TextInputProps } from 'react-native';

import { TextField, type TextFieldProps } from '@/components/ui/text-field';
import { TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = TextInputProps & {
  /** Shown above the field and read by screen readers; a placeholder alone disappears once typing starts. */
  label: string;
  /** Stays visible below the field (e.g. "At least 6 characters"). */
  hint?: string;
  /** At the right end of the label's line: a link that goes with the field. */
  labelAccessory?: TextFieldProps['labelAccessory'];
  /** The label is only the field's accessible name: a heading above it already says what it is. */
  labelHidden?: boolean;
  /** Edge the field in danger (its message is shown elsewhere). */
  invalid?: boolean;
};

/**
 * A labelled text field: the design system's TextField under the name the forms already use. `style` is the
 * input's (a taller box for notes); the label is visible and is the field's accessible name.
 */
export const FormField = forwardRef<TextInputInstance, Props>(function FormField({ hint, style, ...rest }, ref) {
  return <TextField ref={ref} helper={hint} inputStyle={style as TextFieldProps['inputStyle']} {...rest} />;
});

/** The small label above a group of controls (a field's own label style), read as a header when it names a group. */
export function FieldLabel({ children, header = false }: { children: string; header?: boolean }) {
  const theme = useTheme();
  return (
    <Text accessibilityRole={header ? 'header' : undefined} importantForAccessibility={header ? 'auto' : 'no'} accessibilityElementsHidden={!header} style={[TypeScale.footnoteStrong, { color: theme.textSecondary }]}>
      {children}
    </Text>
  );
}
