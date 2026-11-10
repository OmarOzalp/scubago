import type { StyleProp, ViewStyle } from 'react-native';

import type { IconName } from '@/components/icon';
import { IconButton as UiIconButton } from '@/components/ui/icon-button';

/**
 * The old round button, drawn as the design system's IconButton (src/components/ui/icon-button.tsx): a 40
 * circle, 44 to hit. `size` is no longer used (every icon button is one size); new code imports the ui one.
 */
export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  role = 'button',
  style,
}: {
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  size?: number;
  role?: 'button' | 'link';
  style?: StyleProp<ViewStyle>;
}) {
  return <UiIconButton icon={icon} onPress={onPress} accessibilityLabel={accessibilityLabel} accessibilityHint={accessibilityHint} role={role} style={style} />;
}
