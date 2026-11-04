import { router, type Href } from 'expo-router';

/**
 * Where the explorer was opened from, so that closing it goes back there: the `from` param of its route. Home opens it with none (a tab of the same
 * navigator: closing goes back to Home); the Rewards -> Islands screen opens it with `from=islands` (it goes to the one explorer, leaving the Rewards screens
 * behind, and closing puts them back); another tab would open it with its own path (`from=/logbook`) and closing goes to that tab.
 */
export const ORIGIN = { islands: 'islands' } as const;

/** The tabs a close may go back to (their paths, as `from`). */
const TABS = ['/map', '/logbook', '/field-guide'] as const;

let remembered: string | undefined;
/** The explorer's route says where it was opened from (its `from` param, as of the open it is on show for). */
export const rememberOrigin = (from?: string) => { remembered = from; };

/** Close the explorer: back to where it was opened from; with nothing to go back to (a link opened it), Home. */
export function closeExplorer(from = remembered) {
  if (from === ORIGIN.islands) {
    // (the tab leaves the explorer first, then the screens it was opened over are put back: Rewards, then Islands)
    router.back();
    router.push('/rewards');
    router.push('/rewards/islands');
  } else if ((TABS as readonly string[]).includes(from ?? '')) router.navigate(from as Href);
  else if (router.canGoBack()) router.back();
  else router.replace('/');
}
