import type { IconName } from '@/components/icon';
import { List, ListRow } from '@/components/ui/list';

/**
 * A card that leads somewhere: an icon, a title and a line about it, and a chevron. `compact` puts the
 * title and a short status ("6 stamps") on one line. It is a one-row List now (src/components/ui/list.tsx);
 * a page with several of them builds one List of ListRows instead, and new code does.
 */
export function LinkRow({
  icon,
  title,
  detail,
  onPress,
  role = 'button',
  accessibilityLabel,
  accessibilityHint,
  compact = false,
}: {
  icon: IconName;
  title: string;
  detail?: string;
  onPress: () => void;
  role?: 'button' | 'link';
  accessibilityLabel?: string;
  accessibilityHint?: string;
  compact?: boolean;
}) {
  return (
    <List>
      <ListRow
        leading={icon}
        title={title}
        subtitle={compact ? undefined : detail}
        subtitleLines={2}
        value={compact ? detail : undefined}
        accessibilityRole={role}
        accessibilityLabel={accessibilityLabel ?? (detail ? `${title}. ${detail}` : title)}
        accessibilityHint={accessibilityHint}
        onPress={onPress}
      />
    </List>
  );
}
