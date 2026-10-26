import { Pressable, StyleSheet, View, type AccessibilityActionEvent } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Above the book: the Contents button, and the page count between a turn back and a turn on. The
 * count is one control for a screen reader (swipe up for the next page, down for the one before),
 * and the arrows turn a page with a mouse on the web, where there is nothing to swipe with.
 */
export function BookBar({
  count,
  where,
  canBack,
  canOn,
  onBack,
  onOn,
  onContents,
}: {
  /** "6 of 6"; empty on the cover and on a blank page. */
  count: string;
  /** What a screen reader says for the count: "Page 6 of 6, Cod Hole, 21 October". */
  where: string;
  canBack: boolean;
  canOn: boolean;
  onBack: () => void;
  onOn: () => void;
  /** Absent while there are no pages to list. */
  onContents?: () => void;
}) {
  const theme = useTheme();
  const onAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'increment' && canOn) onOn();
    if (e.nativeEvent.actionName === 'decrement' && canBack) onBack();
  };
  return (
    <View style={styles.bar}>
      {onContents ? (
        <Pressable
          onPress={onContents}
          accessibilityRole="button"
          accessibilityHint="Lists every page"
          style={({ pressed }) => [styles.contents, { borderColor: theme.rule, backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement }]}>
          <Icon name="list" size={18} color={theme.text} />
          <ThemedText type="smallBold">Contents</ThemedText>
        </Pressable>
      ) : (
        <View />
      )}
      <View style={styles.turner}>
        <TurnArrow direction="back" enabled={canBack} onPress={onBack} />
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Page"
          accessibilityValue={{ text: where }}
          accessibilityActions={[
            { name: 'increment', label: 'Next page' },
            { name: 'decrement', label: 'Previous page' },
          ]}
          onAccessibilityAction={onAction}
          style={styles.count}>
          <ThemedText type="label" numberOfLines={1}>
            {count}
          </ThemedText>
        </View>
        <TurnArrow direction="on" enabled={canOn} onPress={onOn} />
      </View>
    </View>
  );
}

function TurnArrow({ direction, enabled, onPress }: { direction: 'back' | 'on'; enabled: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!enabled}
      accessibilityRole="button"
      accessibilityLabel={direction === 'back' ? 'Previous page' : 'Next page'}
      accessibilityState={{ disabled: !enabled }}
      hitSlop={4}
      style={({ pressed }) => [styles.arrow, { opacity: enabled ? (pressed ? 0.5 : 1) : 0.3 }]}>
      <Icon name={direction === 'back' ? 'chevronLeft' : 'chevronRight'} size={20} color={theme.text} weight="bold" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    rowGap: Spacing.one,
    columnGap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  contents: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderRadius: 22,
  },
  turner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
  },
  arrow: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: {
    minWidth: 64,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
