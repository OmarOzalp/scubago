import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { OnFill, Radius, Shadow, Type } from '@/constants/theme';
import { useSchemeName, useTheme } from '@/hooks/use-theme';

interface Props {
  title: string;
  onPress: () => void;
  /**
   * 'primary': lagoon, for the screen's main action. 'log': coral, for logging and celebrating.
   * 'secondary': paper with an ink edge. 'quiet': text only.
   */
  variant?: 'primary' | 'log' | 'secondary' | 'quiet';
  icon?: IconName;
  disabled?: boolean;
  style?: ViewStyle;
  /** Read instead of the title when the title alone is unclear out of context. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

/** The app's button: solid, sinks a little when pressed. */
export function OceanButton({
  title,
  onPress,
  variant = 'primary',
  icon,
  disabled = false,
  style,
  accessibilityLabel,
  accessibilityHint,
}: Props) {
  const theme = useTheme();
  const scheme = useSchemeName();
  const fill =
    variant === 'primary' ? theme.lagoon : variant === 'log' ? theme.coral : variant === 'secondary' ? theme.backgroundElement : 'transparent';
  const ink =
    variant === 'primary' ? OnFill[scheme].lagoon : variant === 'log' ? OnFill[scheme].coral : variant === 'quiet' ? theme.tint : theme.text;
  const log = variant === 'log';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      aria-disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        log && styles.log,
        {
          backgroundColor: fill,
          borderColor: variant === 'secondary' ? theme.rule : 'transparent',
          boxShadow: log ? Shadow[scheme].coral : variant === 'secondary' ? Shadow[scheme].card : undefined,
          transform: [{ translateY: pressed && !disabled ? 2 : 0 }],
          opacity: disabled ? 0.45 : pressed && variant === 'quiet' ? 0.6 : 1,
        },
        style,
      ]}>
      <View style={styles.row}>
        {icon ? <Icon name={icon} size={log ? 22 : 20} color={ink} wash={ink} washOpacity={0.2} /> : null}
        <Text style={[log ? styles.logTitle : styles.title, { color: ink }]}>{title}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: Radius.md,
    borderWidth: 1.5,
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  log: {
    minHeight: 56,
    borderWidth: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  title: {
    fontFamily: Type.bodyHeavy,
    fontSize: 16,
    textAlign: 'center',
  },
  logTitle: {
    fontFamily: Type.display,
    fontSize: 20,
    textAlign: 'center',
  },
});
