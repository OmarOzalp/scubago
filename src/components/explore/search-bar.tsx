import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Radius, Shadow, Type } from '@/constants/theme';
import { useSchemeName, useTheme } from '@/hooks/use-theme';

/** What the bar says before anything is typed, and what the field is called to a screen reader. */
export const SEARCH_PLACEHOLDER = 'Search dive sites or animals';

/**
 * Explore's one search bar: a button that opens the search while it is closed, and the text field
 * (with Cancel) while it is open. Return picks the top result (`onSubmit`); Escape on the web closes it.
 */
export function SearchBar({
  searching,
  query,
  onQueryChange,
  onOpen,
  onCancel,
  onSubmit,
}: {
  searching: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  onOpen: () => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const theme = useTheme();
  const scheme = useSchemeName();
  const shadow = Shadow[scheme].card;

  if (!searching) {
    return (
      <Pressable
        onPress={onOpen}
        accessibilityRole="search"
        accessibilityLabel={SEARCH_PLACEHOLDER}
        accessibilityHint="Find a dive site or a place, or where to see an animal"
        style={({ pressed }) => [
          styles.bar,
          { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement, borderColor: theme.rule, boxShadow: shadow },
        ]}>
        <Icon name="search" size={20} color={theme.textSecondary} />
        <Text numberOfLines={1} style={[styles.placeholder, { color: theme.textSecondary }]}>
          {SEARCH_PLACEHOLDER}
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={[styles.bar, { backgroundColor: theme.backgroundElement, borderColor: theme.tint, boxShadow: shadow }]}>
      <Icon name="search" size={20} color={theme.tint} />
      <TextInput
        autoFocus
        value={query}
        onChangeText={onQueryChange}
        accessibilityLabel={SEARCH_PLACEHOLDER}
        placeholder={SEARCH_PLACEHOLDER}
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        // Return picks a result and closes the search; with nothing to pick the keyboard stays.
        submitBehavior="submit"
        onSubmitEditing={onSubmit}
        onKeyPress={(e) => {
          if (e.nativeEvent.key === 'Escape') onCancel();
        }}
        style={[styles.searchInput, { color: theme.text }]}
      />
      <Pressable
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel="Cancel search"
        style={({ pressed }) => [styles.barButton, { opacity: pressed ? 0.6 : 1 }]}>
        <Text style={[styles.cancel, { color: theme.tint }]}>Cancel</Text>
      </Pressable>
    </View>
  );
}

/**
 * The filter the map or list is showing, edged in coral like the pins it lights up: an animal's
 * sites, or a place's. Tapping it clears the filter.
 */
export function FilterChip({
  leading,
  title,
  subtitle,
  accessibilityLabel,
  onClear,
}: {
  leading: ReactNode;
  title: string;
  subtitle: string;
  accessibilityLabel: string;
  onClear: () => void;
}) {
  const theme = useTheme();
  const scheme = useSchemeName();
  return (
    <Pressable
      onPress={onClear}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.bar,
        styles.filterBar,
        { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement, borderColor: theme.coral, boxShadow: Shadow[scheme].card },
      ]}>
      {leading}
      <View style={styles.filterText}>
        <Text numberOfLines={1} style={[styles.filterName, { color: theme.text }]}>
          {title}
        </Text>
        <Text numberOfLines={1} style={[styles.filterCount, { color: theme.textSecondary }]}>
          {subtitle}
        </Text>
      </View>
      <View style={[styles.closeCircle, { backgroundColor: theme.backgroundSelected }]}>
        <Icon name="close" size={16} weight="bold" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.md,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    minHeight: 50,
    gap: 10,
  },
  placeholder: {
    flex: 1,
    fontFamily: Type.body,
    fontSize: 16,
  },
  searchInput: {
    flex: 1,
    fontFamily: Type.body,
    fontSize: 16,
    minHeight: 48,
    // The bar round it is already edged in lagoon while the search is open, which is its focus ring;
    // the web's own would draw a second, black box inside it.
    outlineWidth: 0,
  },
  barButton: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancel: {
    fontFamily: Type.bodyHeavy,
    fontSize: 14,
  },
  filterBar: {
    paddingLeft: 6,
    paddingRight: 8,
    paddingVertical: 6,
  },
  filterText: {
    flex: 1,
  },
  filterName: {
    fontFamily: Type.bodyHeavy,
    fontSize: 15,
    lineHeight: 20,
  },
  filterCount: {
    fontFamily: Type.body,
    fontSize: 13,
    lineHeight: 18,
  },
  closeCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
