import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { IconButton } from '@/components/ui/icon-button';
import { continuous } from '@/components/ui/surface';
import { Elevation, Radius, Scrim, Size, Space } from '@/constants/theme';
import { useSchemeName, useTheme } from '@/hooks/use-theme';

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
  disabled = false,
}: {
  items: MoreMenuItem[];
  accessibilityLabel?: string;
  /** No longer used: every icon button is one size. */
  size?: number;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const theme = useTheme();
  const scheme = useSchemeName();
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
        accessibilityLabel={accessibilityLabel}
        accessibilityHint="Opens a menu"
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
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
                  boxShadow: Elevation[scheme].raised,
                  ...(Elevation[scheme].cardBorder ? { borderWidth: 1, borderColor: theme.cardBorder } : null),
                  paddingBottom: Math.max(insets.bottom, Space.s4),
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
                  {item.icon ? <Icon name={item.icon} size={Size.icon} color={item.destructive ? theme.danger : theme.text} /> : null}
                  <ThemedText type="bodyStrong" themeColor={item.destructive ? 'danger' : 'text'}>
                    {item.label}
                  </ThemedText>
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
                <ThemedText type="bodyStrong" themeColor="textSecondary">
                  Cancel
                </ThemedText>
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
  scrim: { backgroundColor: Scrim },
  sheet: {
    width: '100%',
    maxWidth: 560,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    ...continuous,
    paddingTop: Space.s2,
    paddingHorizontal: Space.s2,
  },
  row: {
    minHeight: Size.rowMin,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s3,
    paddingHorizontal: Space.s4,
    borderRadius: Radius.md,
    ...continuous,
  },
  // The way out: set off by a hairline, square so the line runs the sheet's width.
  cancel: {
    borderTopWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    borderRadius: 0,
    marginTop: Space.s1,
  },
});
