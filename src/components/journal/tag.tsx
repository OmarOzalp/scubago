import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Radius, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * A small label on a card: rarity, verification, "Only you". `color` edges and tints it; `text` is
 * its (contrast-checked) lettering. Dashed for a state that will change, like waiting to sync.
 */
export function Tag({
  label,
  color,
  text,
  dashed = false,
  small = false,
  accessibilityLabel,
  style,
}: {
  label: string;
  color?: string;
  text?: string;
  dashed?: boolean;
  small?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const edge = color ?? theme.rule;
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.tag,
        { borderColor: edge, borderStyle: dashed ? 'dashed' : 'solid', backgroundColor: color ? `${color}1F` : 'transparent' },
        style,
      ]}>
      <Text style={[styles.label, { color: text ?? theme.textSecondary, fontSize: small ? 12 : 13 }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    borderRadius: Radius.xs,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 1,
    alignSelf: 'flex-start',
  },
  label: {
    fontFamily: Type.bodyHeavy,
    lineHeight: 17,
  },
});
