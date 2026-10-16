import { Pressable, type StyleProp, type ViewStyle } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { useTheme } from '@/hooks/use-theme';

/** A round paper button holding one icon. `accessibilityLabel` says what it does. */
export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  size = 46,
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
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 1.5,
          borderColor: theme.rule,
          backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}>
      <Icon name={icon} size={Math.round(size * 0.5)} />
    </Pressable>
  );
}
