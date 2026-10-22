import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';

/**
 * Opens a web page: in the in-app browser on a phone (as ExternalLink does) and in a new tab on the
 * web, where expo-web-browser would open a small pop-up window. Only secure links are opened, and
 * a failure to open one is never an error for the diver.
 */
export async function openExternalUrl(url: string): Promise<void> {
  if (!url.startsWith('https://')) return;
  try {
    if (process.env.EXPO_OS === 'web') {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    await openBrowserAsync(url, { presentationStyle: WebBrowserPresentationStyle.AUTOMATIC });
  } catch {
    // No browser to open: nothing to tell the diver that they can act on.
  }
}
