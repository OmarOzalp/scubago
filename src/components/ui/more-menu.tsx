import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { IconButton } from '@/components/journal/icon-button';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type MoreMenuItem = {
  label: string;
  icon?: IconName;
  /** Marks the red item: the one that can't be taken back. It still asks first (the caller's `confirmAction`). */
  destructive?: boolean;
  onPress: () => void;
};

/**
 * The "…" button: the things on a page that are rare or can't be undone (Delete) wait behind it,
 * away from the buttons you press all the time. It opens a short sheet of rows; choosing a row closes
 * the sheet and then runs it, so a confirmation asked by the row stands on its own.
 */
export function MoreMenu({
  items,
  accessibilityLabel = 'More actions',
  size = 44,
  disabled = false,
}: {
  items: MoreMenuItem[];
  accessibilityLabel?: string;
  size?: number;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const choose = (item: MoreMenuItem) => {
    setOpen(false);
    // After the sheet has gone, so the iPhone's alert is not asked from under it.
    setTimeout(item.onPress, Platform.OS === 'ios' ? 350 : 0);
  };
  return (
    <>
      <IconButton
        icon="more"
        size={size}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint="Opens a menu"
        onPress={() => !disabled && setOpen(true)}
        style={{ opacity: disabled ? 0.4 : 1 }}
      />
      {open ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setOpen(false)} statusBarTranslucent>
          <View style={styles.root}>
            <Pressable style={[StyleSheet.absoluteFill, styles.scrim]} onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel="Close menu" />
            <View
              accessibilityViewIsModal
              style={[
                styles.sheet,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.cardBorder,
                  paddingBottom: Math.max(insets.bottom, Spacing.three),
                },
              ]}
            >
              {items.map((item) => (
                <Pressable
                  key={item.label}
                  onPress={() => choose(item)}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  style={({ pressed }) => [
                    styles.row,
                    {
                      backgroundColor: pressed ? theme.backgroundSelected : 'transparent',
                    },
                  ]}
                >
                  {item.icon ? <Icon name={item.icon} size={20} color={item.destructive ? theme.danger : theme.text} /> : null}
                  <ThemedText themeColor={item.destructive ? 'danger' : 'text'}>{item.label}</ThemedText>
                </Pressable>
              ))}
              <Pressable
                onPress={() => setOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                style={({ pressed }) => [
                  styles.row,
                  styles.cancel,
                  {
                    borderTopColor: theme.rule,
                    backgroundColor: pressed ? theme.backgroundSelected : 'transparent',
                  },
                ]}
              >
                <ThemedText themeColor="textSecondary">Cancel</ThemedText>
              </Pressable>
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  scrim: { backgroundColor: 'rgba(11, 27, 46, 0.45)' },
  sheet: {
    width: '100%',
    maxWidth: 560,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderWidth: 1,
    paddingTop: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 4,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.md,
  },
  cancel: {
    borderTopWidth: 1,
    justifyContent: 'center',
    borderRadius: 0,
    marginTop: Spacing.one,
  },
});
