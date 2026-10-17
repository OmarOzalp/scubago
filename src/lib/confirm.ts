import { Alert, Platform } from 'react-native';

/**
 * Ask before doing something that can't be taken back. Resolves true when the diver confirms.
 * React Native's Alert does nothing on web, so the web app uses the browser's own dialog.
 */
export function confirmAction({
  title,
  message,
  confirmLabel,
  destructive = false,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
}): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
