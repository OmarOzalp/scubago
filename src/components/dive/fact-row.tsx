import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { Space, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * One line of facts in a card of them: a small icon, what it is (secondary), and what it says (strong,
 * on the right, wrapping at spaces). Put FactRows in a `Card padded={false}`; each after the first draws
 * the inset hairline above itself.
 */
export function FactRow({
  icon,
  label,
  separator = false,
  labelWidth = 96,
  accessibilityLabel,
  children,
}: {
  icon: IconName;
  label: string;
  /** Draw the hairline above this row (every row but the first). */
  separator?: boolean;
  /** Room for the label, so the values of a card's rows start at one edge. */
  labelWidth?: number;
  accessibilityLabel?: string;
  /** The value: text, or any node (stars, a status). */
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View accessible={accessibilityLabel ? true : undefined} accessibilityLabel={accessibilityLabel} style={styles.row}>
      {separator ? <View style={[styles.hairline, { backgroundColor: theme.rule }]} /> : null}
      <Icon name={icon} size={18} color={theme.textSecondary} />
      <Text style={[TypeScale.subhead, { color: theme.textSecondary, width: labelWidth }]}>{label}</Text>
      <View style={styles.value}>
        {typeof children === 'string' ? <Text style={[TypeScale.subheadStrong, styles.text, { color: theme.text }]}>{children}</Text> : children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s2,
    minHeight: 48,
    paddingVertical: Space.s2,
    paddingHorizontal: Space.s4,
  },
  hairline: {
    position: 'absolute',
    top: 0,
    left: Space.s4,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
  value: {
    flex: 1,
    alignItems: 'flex-end',
  },
  text: {
    textAlign: 'right',
  },
});
