import { useEffect, useState } from 'react';

/**
 * Whether the phone has been left alone: true from `after` ms after `ready` first holds, and the phone has a moment to spare (where there is
 * `requestIdleCallback`, which React Native has and Safari has not; it is waited for for 5 s at most). The same wait as the explorer's ocean has
 * before it is made ahead (ocean-ahead.ts): for work that nobody is waiting for yet, so that it never gets in the way of what they are.
 * Once true it stays true.
 */
export function useIdle(ready: boolean, after: number) {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    if (!ready || idle) return;
    let live = true;
    let handle: number | undefined;
    const timer = setTimeout(() => {
      if (typeof requestIdleCallback === 'function') handle = requestIdleCallback(() => { if (live) setIdle(true); }, { timeout: 5000 });
      else setIdle(true);
    }, after);
    return () => {
      live = false;
      clearTimeout(timer);
      if (handle !== undefined && typeof cancelIdleCallback === 'function') cancelIdleCallback(handle);
    };
  }, [ready, idle, after]);
  return idle;
}
