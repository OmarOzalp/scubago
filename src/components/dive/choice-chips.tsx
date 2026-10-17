import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Option<T extends string> = { id: T; label: string };

/**
 * A row of choices under a typewriter label. One choice (read as radio buttons; tap the chosen one
 * again to clear it, since every field on a page is optional) or several (`multi`, checkboxes).
 * The chosen ones are inked in and ticked, so the choice isn't told by colour alone.
 */
export function ChoiceChips<T extends string>(
  props: { label: string; options: Option<T>[] } & (
    | { multi?: false; value: T | undefined; onChange: (value: T | undefined) => void }
    | { multi: true; value: T[]; onChange: (value: T[]) => void }
  ),
) {
  const theme = useTheme();
  const chosen = (id: T) => (props.multi ? props.value.includes(id) : props.value === id);
  const press = (id: T) => {
    if (props.multi) props.onChange(props.value.includes(id) ? props.value.filter((x) => x !== id) : [...props.value, id]);
    else props.onChange(props.value === id ? undefined : id);
  };
  return (
    <View style={styles.field}>
      <ThemedText type="label" importantForAccessibility="no" accessibilityElementsHidden>
        {props.label}
      </ThemedText>
      <View style={styles.row} accessibilityRole={props.multi ? undefined : 'radiogroup'} accessibilityLabel={props.label}>
        {props.options.map((o) => {
          const on = chosen(o.id);
          return (
            <Pressable
              key={o.id}
              onPress={() => press(o.id)}
              accessibilityRole={props.multi ? 'checkbox' : 'radio'}
              aria-checked={on}
              accessibilityLabel={props.multi ? `${props.label}: ${o.label}` : o.label}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: on ? theme.text : pressed ? theme.backgroundSelected : theme.backgroundElement,
                  borderColor: on ? theme.text : theme.rule,
                },
              ]}>
              {on ? <Icon name="check" size={13} color={theme.background} weight="bold" /> : null}
              <ThemedText type="smallBold" style={{ fontFamily: Type.bodyHeavy, color: on ? theme.background : theme.text }}>
                {o.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: Radius.sm,
    borderWidth: 1.5,
  },
});
