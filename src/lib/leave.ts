import { router, type Href } from 'expo-router';

/**
 * Close the screen the diver is on: back to the one underneath, or, when nothing is underneath (it was
 * opened straight from a link, or the web page was reloaded on it), on to `fallback`. A bare
 * `router.back()` there does nothing ("GO_BACK was not handled") and leaves the diver stuck on a screen
 * whose job is done, with no back arrow.
 */
export function leave(fallback: Href = '/'): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
