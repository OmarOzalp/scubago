import { useState, type ReactNode, type Ref } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputInstance, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';

import { Icon } from '@/components/icon';
import { continuous } from '@/components/ui/surface';
import { Radius, Size, Space, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type TextFieldProps = Omit<TextInputProps, 'style'> & {
  /** Above the field (footnoteStrong, secondary). Also what a screen reader calls the field. */
  label: string;
  /** Under the field (subhead, secondary). */
  helper?: string;
  /** Under the field in the danger colour, in place of the helper; edges the field in danger too. */
  error?: string;
  /** Edge the field in danger without a message of its own (the message is shown elsewhere, under a pair of fields). */
  invalid?: boolean;
  /** The label is only the field's accessible name: a heading above it already says what it is. */
  labelHidden?: boolean;
  /** At the right end of the label's line: a link that goes with the field. */
  labelAccessory?: ReactNode;
  /** The input's own layout or text look: a taller box for notes, or bigger, centred text for a code. */
  inputStyle?: StyleProp<TextStyle>;
  style?: StyleProp<ViewStyle>;
  ref?: Ref<TextInputInstance>;
};

/** A labelled text input: 52 tall, surface fill with a hairline, a 2px tint ring while focused. */
export function TextField({ label, helper, error, invalid, labelHidden, labelAccessory, inputStyle, style, onFocus, onBlur, multiline, ref, ...input }: TextFieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const failed = !!error || !!invalid;
  const edge = failed ? theme.danger : focused ? theme.tint : theme.cardBorder;
  return (
    <View style={[styles.field, style]}>
      {labelHidden ? null : labelAccessory ? (
        <View style={styles.labelRow}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
          {labelAccessory}
        </View>
      ) : (
        <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
      )}
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={theme.textTertiary}
        multiline={multiline}
        {...input}
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
          multiline && styles.multiline,
          {
            color: theme.text,
            backgroundColor: theme.backgroundElement,
            borderColor: edge,
            // A 1px border plus a 1px ring of the same colour: 2px, with nothing moving.
            boxShadow: focused || failed ? `0px 0px 0px 1px ${edge}` : undefined,
          },
          inputStyle,
        ]}
      />
      {error ? (
        <Text accessibilityRole="alert" style={[styles.helper, { color: theme.danger }]}>
          {error}
        </Text>
      ) : helper ? (
        <Text style={[styles.helper, { color: theme.textSecondary }]}>{helper}</Text>
      ) : null}
    </View>
  );
}

export type SearchFieldProps = {
  value: string;
  onChangeText?: (text: string) => void;
  placeholder: string;
  /** What a screen reader calls the field; the placeholder by default. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Label of the clear button. */
  clearLabel?: string;
  onSubmit?: () => void;
  autoFocus?: boolean;
  /** Shows "Cancel" after the field (a search that opened over the page). */
  onCancel?: () => void;
  /** Not a field but a button that looks like one and opens the search. */
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

/** A search box: sunken fill, no border, radius md, a magnifier, and a clear button once something is typed. */
export function SearchField({ value, onChangeText, placeholder, accessibilityLabel, accessibilityHint, clearLabel = 'Clear search', onSubmit, autoFocus, onCancel, onPress, style }: SearchFieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const box = [styles.search, { backgroundColor: theme.backgroundSelected, boxShadow: focused ? `0px 0px 0px 2px ${theme.tint}` : undefined }, style];
  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="search" accessibilityLabel={accessibilityLabel ?? placeholder} accessibilityHint={accessibilityHint} style={({ pressed }) => [box, pressed && { opacity: 0.7 }]}>
        <Icon name="search" size={20} color={theme.textSecondary} />
        <Text numberOfLines={1} style={[styles.placeholder, { color: theme.textSecondary }]}>
          {placeholder}
        </Text>
      </Pressable>
    );
  }
  return (
    <View style={styles.searchRow}>
      <View style={[box, styles.grow]}>
        <Icon name="search" size={20} color={focused ? theme.tint : theme.textSecondary} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          autoFocus={autoFocus}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityLabel={accessibilityLabel ?? placeholder}
          accessibilityHint={accessibilityHint}
          placeholder={placeholder}
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          submitBehavior={onSubmit ? 'submit' : undefined}
          onSubmitEditing={onSubmit}
          onKeyPress={(e) => {
            if (e.nativeEvent.key === 'Escape') onCancel?.();
          }}
          // The field's own ring is the focus ring: the web's would draw a second one inside it.
          style={[styles.searchInput, { color: theme.text }]}
        />
        {value ? (
          <Pressable onPress={() => onChangeText?.('')} accessibilityRole="button" accessibilityLabel={clearLabel} style={({ pressed }) => [styles.clear, { opacity: pressed ? 0.6 : 1 }]}>
            <View style={[styles.clearDot, { backgroundColor: theme.textTertiary }]}>
              <Icon name="close" size={11} color={theme.backgroundElement} weight="bold" />
            </View>
          </Pressable>
        ) : null}
      </View>
      {onCancel ? (
        <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel="Cancel search" style={({ pressed }) => [styles.cancel, { opacity: pressed ? 0.6 : 1 }]}>
          <Text style={[styles.cancelText, { color: theme.tint }]}>Cancel</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: 6,
  },
  label: {
    ...TypeScale.footnoteStrong,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: Space.s2,
  },
  input: {
    ...TypeScale.body,
    minHeight: Size.input,
    borderRadius: Radius.md,
    ...continuous,
    borderWidth: 1,
    paddingHorizontal: 14,
    outlineWidth: 0,
    // 'solid' at 0 wide: the web's own 'auto' focus ring ignores the width and would draw inside the field's ring.
    outlineStyle: 'solid',
  },
  multiline: {
    minHeight: 104,
    paddingTop: 14,
    paddingBottom: 14,
    textAlignVertical: 'top',
  },
  helper: {
    ...TypeScale.subhead,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s2,
  },
  grow: {
    flex: 1,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s2,
    minHeight: Size.hit,
    paddingLeft: Space.s3,
    paddingRight: 0,
    borderRadius: Radius.md,
    ...continuous,
  },
  placeholder: {
    ...TypeScale.body,
    flex: 1,
  },
  searchInput: {
    ...TypeScale.body,
    flex: 1,
    minHeight: Size.hit,
    outlineWidth: 0,
    // 'solid' at 0 wide: the web's own 'auto' focus ring ignores the width and would draw inside the field's ring.
    outlineStyle: 'solid',
  },
  clear: {
    width: Size.hit,
    height: Size.hit,
    minHeight: Size.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancel: {
    minHeight: Size.hit,
    minWidth: Size.hit,
    paddingHorizontal: Space.s1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    ...TypeScale.bodyStrong,
  },
});
