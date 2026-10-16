import { StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { PaperButton } from '@/components/journal/paper';
import { Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** A card that leads somewhere: an icon, a title and a line about it, and a chevron. */
export function LinkRow({
  icon,
  title,
  detail,
  onPress,
  role = 'button',
  accessibilityLabel,
  accessibilityHint,
}: {
  icon: IconName;
  title: string;
  detail?: string;
  onPress: () => void;
  role?: 'button' | 'link';
  accessibilityLabel?: string;
  accessibilityHint?: string;
}) {
  const theme = useTheme();
  return (
    <PaperButton
      onPress={onPress}
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel ?? (detail ? `${title}. ${detail}` : title)}
      accessibilityHint={accessibilityHint}
      style={styles.row}>
      <View style={[styles.icon, { backgroundColor: theme.backgroundSelected }]}>
        <Icon name={icon} size={24} />
      </View>
      <View style={styles.body}>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        {detail ? <Text style={[styles.detail, { color: theme.textSecondary }]}>{detail}</Text> : null}
      </View>
      <Icon name="chevronRight" size={18} color={theme.textSecondary} weight="bold" />
    </PaperButton>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 1,
  },
  title: {
    fontFamily: Type.bodyHeavy,
    fontSize: 15,
    lineHeight: 20,
  },
  detail: {
    fontFamily: Type.body,
    fontSize: 14,
    lineHeight: 19,
  },
});
