import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { Button, type ButtonVariant } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { IconTile } from '@/components/ui/list';
import { continuous } from '@/components/ui/surface';
import { Radius, Size, Space, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type NoticeProps = {
  /** One or two plain sentences. */
  children: ReactNode;
  icon?: IconName;
  /** `note` (default): sunSoft, for something to know. `danger`: dangerSoft with danger-coloured text, for something that stops the action. */
  tone?: 'note' | 'danger';
  /** Shows a close button (44 to hit). */
  onDismiss?: () => void;
  dismissLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/** A banner the diver can close: sunSoft fill, radius md, an icon, callout text. */
export function Notice({ children, icon = 'info', tone = 'note', onDismiss, dismissLabel = 'Close this note', style }: NoticeProps) {
  const theme = useTheme();
  const danger = tone === 'danger';
  const ink = danger ? theme.danger : theme.text;
  return (
    <View style={[styles.notice, { backgroundColor: danger ? theme.dangerSoft : theme.sunSoft }, style]}>
      <Icon name={icon} size={Size.icon} color={ink} />
      <Text style={[styles.text, { color: ink }]}>{children}</Text>
      {onDismiss ? <IconButton icon="close" on="bar" onPress={onDismiss} accessibilityLabel={dismissLabel} /> : null}
    </View>
  );
}

export type EmptyStateProps = {
  icon: IconName;
  title: string;
  /** One line. */
  message?: string;
  action?: { title: string; onPress: () => void; variant?: ButtonVariant; icon?: IconName };
  style?: StyleProp<ViewStyle>;
};

/** Nothing here yet: a 56 icon tile, a headline, one line, one button. Centred, no box round it. */
export function EmptyState({ icon, title, message, action, style }: EmptyStateProps) {
  const theme = useTheme();
  return (
    <View style={[styles.empty, style]}>
      <IconTile icon={icon} size={56} />
      <View style={styles.emptyText}>
        <Text accessibilityRole="header" style={[TypeScale.headline, styles.center, { color: theme.text }]}>
          {title}
        </Text>
        {message ? <Text style={[TypeScale.callout, styles.center, { color: theme.textSecondary }]}>{message}</Text> : null}
      </View>
      {action ? <Button title={action.title} onPress={action.onPress} variant={action.variant ?? 'primary'} icon={action.icon} size="md" style={styles.emptyButton} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s3,
    borderRadius: Radius.md,
    ...continuous,
    paddingLeft: Space.s4,
    paddingRight: Space.s1,
    paddingVertical: Space.s1,
    minHeight: Size.rowMin,
  },
  text: {
    ...TypeScale.callout,
    flex: 1,
    paddingVertical: Space.s2,
  },
  empty: {
    alignItems: 'center',
    gap: Space.s4,
    paddingVertical: Space.s6,
    paddingHorizontal: Space.s4,
  },
  emptyText: {
    alignItems: 'center',
    gap: Space.s1,
  },
  center: {
    textAlign: 'center',
  },
  emptyButton: {
    alignSelf: 'center',
    marginTop: Space.s1,
  },
});
