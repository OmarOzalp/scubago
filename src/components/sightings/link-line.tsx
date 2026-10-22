import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { openExternalUrl } from '@/components/sightings/open-external';
import { Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** One ruled line in a card that opens a web page: the page's name, and an "opens outside" icon. */
export function LinkLine({ label, url, first = false }: { label: string; url: string; first?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => void openExternalUrl(url)}
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityHint="Opens in your browser"
      style={({ pressed }) => [
        styles.line,
        { borderTopColor: theme.rule, borderTopWidth: first ? 0 : 1, backgroundColor: pressed ? theme.backgroundSelected : 'transparent' },
      ]}>
      <View style={styles.text}>
        <Text style={[styles.label, { color: theme.tint }]}>{label}</Text>
      </View>
      <Icon name="external" size={18} color={theme.tint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  line: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  text: {
    flex: 1,
  },
  label: {
    fontFamily: Type.bodyBold,
    fontSize: 15,
    lineHeight: 20,
    textDecorationLine: 'underline',
  },
});
