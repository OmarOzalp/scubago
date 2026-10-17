import { AccessibilityInfo } from 'react-native';

/**
 * Read a message aloud to VoiceOver or TalkBack users: errors, "saved", step changes. Sighted
 * users see the same message on screen, so this is a no-op when no screen reader is running.
 */
export function announce(message: string | null | undefined): void {
  if (message) AccessibilityInfo.announceForAccessibility(message);
}
