import { StyleSheet, View, type AccessibilityActionEvent } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Size, Space } from '@/constants/theme';

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
  const onAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'increment' && canOn) onOn();
    if (e.nativeEvent.actionName === 'decrement' && canBack) onBack();
  };
  return (
    <View style={styles.bar}>
      {onContents ? <Button title="Contents" variant="secondary" size="md" icon="list" accessibilityHint="Lists every page" onPress={onContents} /> : <View />}
      <View style={styles.turner}>
        <IconButton icon="chevronLeft" accessibilityLabel="Previous page" disabled={!canBack} onPress={onBack} />
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
          <ThemedText type="footnoteStrong" themeColor="textSecondary" numberOfLines={1}>
            {count}
          </ThemedText>
        </View>
        <IconButton icon="chevronRight" accessibilityLabel="Next page" disabled={!canOn} onPress={onOn} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    rowGap: Space.s1,
    columnGap: Space.s2,
    paddingHorizontal: Space.s4,
    paddingBottom: Space.s2,
  },
  turner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
  },
  count: {
    minWidth: 64,
    minHeight: Size.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
