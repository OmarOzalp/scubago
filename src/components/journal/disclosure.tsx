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
  lead,
}: {
  /** Up to three words, as a question or "About …". */
  label: string;
  children: ReactNode;
  /** Read after the label: what opening it shows ("Shows where the rarity comes from"). */
  hint?: string;
  defaultOpen?: boolean;
  align?: 'start' | 'center';
  /** Sits before the label on the same line (the rarity tag beside "How rare?"); what opens goes below both. */
  lead?: ReactNode;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  const toggle = (
    <Pressable
      onPress={() => setOpen((o) => !o)}
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-expanded={open}
      accessibilityHint={hint}
      style={({ pressed }) => [styles.toggle, pressed && { backgroundColor: theme.backgroundSelected }]}>
      <ThemedText type="smallBold" themeColor="tint">
        {label}
      </ThemedText>
      <Icon name="chevronDown" size={14} color={theme.tint} weight="bold" style={open ? styles.flip : undefined} />
    </Pressable>
  );
  return (
    <View style={[styles.box, align === 'center' && styles.center]}>
      {lead ? (
        <View style={styles.head}>
          {lead}
          {toggle}
        </View>
      ) : (
        toggle
      )}
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
  // The toggle pulls 8 back over its own padding, so this gap is what shows between the lead and the label.
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
