import { StyleSheet, View } from 'react-native';

import { FieldLabel } from '@/components/form-field';
import { Chip } from '@/components/ui/chip';
import { Space } from '@/constants/theme';

type Option<T extends string> = { id: T; label: string };

/**
 * A row of choices under a small label. One choice (read as radio buttons; tap the chosen one
 * again to clear it, since every field on a page is optional) or several (`multi`, checkboxes).
 * The chosen ones are filled with the ink colour, as chips are everywhere.
 */
export function ChoiceChips<T extends string>(
  props: { label: string; options: Option<T>[] } & (
    | { multi?: false; value: T | undefined; onChange: (value: T | undefined) => void }
    | { multi: true; value: T[]; onChange: (value: T[]) => void }
  ),
) {
  const chosen = (id: T) => (props.multi ? props.value.includes(id) : props.value === id);
  const press = (id: T) => {
    if (props.multi) props.onChange(props.value.includes(id) ? props.value.filter((x) => x !== id) : [...props.value, id]);
    else props.onChange(props.value === id ? undefined : id);
  };
  return (
    <View style={styles.field}>
      <FieldLabel>{props.label}</FieldLabel>
      <View style={styles.row} accessibilityRole={props.multi ? undefined : 'radiogroup'} accessibilityLabel={props.label}>
        {props.options.map((o) => (
          <Chip
            key={o.id}
            role={props.multi ? 'checkbox' : 'radio'}
            label={o.label}
            selected={chosen(o.id)}
            accessibilityLabel={props.multi ? `${props.label}: ${o.label}` : o.label}
            onPress={() => press(o.id)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: Space.s1 },
  // A chip is 36 to look at and 44 to hit: the 4 above and below it make the gap between rows.
  row: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Space.s2 },
});
