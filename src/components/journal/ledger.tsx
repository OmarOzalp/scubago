import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Space, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface LedgerItem {
  value: string;
  /** Set small after the value ("m", "min"). */
  unit?: string;
  label: string;
  /** Read instead of "value unit label". */
  accessibilityLabel?: string;
  /** Lettering for the value (a rarity colour, say). */
  color?: string;
}

/** A figure ("4h 57m") as opposed to a name ("Whale Shark"). */
const isFigure = (value: string) => /^\d/.test(value);

/** A row of figures ruled off from each other, like the totals at the foot of a logbook page. */
export function Ledger({ items, bare = false }: { items: LedgerItem[]; bare?: boolean }) {
  const theme = useTheme();
  const row = (
    <View style={styles.row}>
      {items.map((item, index) => (
        <View
          key={item.label}
          accessible
          accessibilityLabel={item.accessibilityLabel ?? `${item.value}${item.unit ? ` ${item.unit}` : ''} ${item.label}`}
          style={[styles.cell, index > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: theme.rule }]}>
          {/* A name (a species, say) is set smaller and may take two lines, so it isn't cut short. A long figure
              ("4h 57m") stays on one line, shrinking to fit where it can: wrapped, it took a third line of the cell. */}
          <Text
            numberOfLines={item.value.length > 5 && !isFigure(item.value) ? 2 : 1}
            adjustsFontSizeToFit={item.value.length > 5 && isFigure(item.value)}
            minimumFontScale={0.7}
            style={[styles.value, item.value.length > 5 && styles.word, { color: item.color ?? theme.text }]}>
            {item.value}
            {item.unit ? <Text style={styles.unit}>{item.unit}</Text> : null}
          </Text>
          {/* A one-word label ("Collections") shrinks to fit rather than break in the middle of the word. */}
          <Text
            numberOfLines={item.label.includes(' ') ? 2 : 1}
            adjustsFontSizeToFit={!item.label.includes(' ')}
            minimumFontScale={0.75}
            style={[styles.label, { color: theme.textSecondary }]}>
            {item.label}
          </Text>
        </View>
      ))}
    </View>
  );
  return bare ? row : <Card padded={false} style={styles.card}>{row}</Card>;
}

const styles = StyleSheet.create({
  card: {
    paddingVertical: Space.s4,
    paddingHorizontal: Space.s2,
  },
  row: {
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Space.s2,
    gap: 2,
  },
  value: {
    ...TypeScale.figure,
  },
  word: {
    ...TypeScale.bodyStrong,
    minHeight: TypeScale.figure.lineHeight,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  unit: {
    ...TypeScale.subhead,
  },
  label: {
    ...TypeScale.footnoteStrong,
    textAlign: 'center',
  },
});
