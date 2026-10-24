import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * A short label with a chevron that opens what it explains ("How rare?", "About these records"):
 * the explanation is all still there, it only waits to be asked for. Closed to begin with.
 */
export function Disclosure({
  label,
  children,
  hint,
  defaultOpen = false,
  align = 'start',
}: {
  /** Up to three words, as a question or "About …". */
  label: string;
  children: ReactNode;
  /** Read after the label: what opening it shows ("Shows where the rarity comes from"). */
  hint?: string;
  defaultOpen?: boolean;
  align?: 'start' | 'center';
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={[styles.box, align === 'center' && styles.center]}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        aria-expanded={open}
        accessibilityHint={hint}
        style={({ pressed }) => [styles.toggle, pressed && { backgroundColor: theme.backgroundSelected }]}>
        <ThemedText type="smallBold" themeColor="tint">
          {label}
        </ThemedText>
        <Icon name="chevronDown" size={14} color={theme.tint} weight="bold" style={open ? styles.flip : undefined} />
      </Pressable>
      {open ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'flex-start',
  },
  center: {
    alignItems: 'center',
  },
  toggle: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    marginHorizontal: -8,
    borderRadius: Radius.sm,
  },
  flip: {
    transform: [{ rotate: '180deg' }],
  },
  body: {
    alignSelf: 'stretch',
  },
});
