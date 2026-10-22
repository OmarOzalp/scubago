import { useCallback, useEffect, useRef, useState } from 'react';

import { sightingsService, type SightingsService } from '@/lib/external-sightings/service';
import type { SightingsStatus, SiteSightings } from '@/lib/external-sightings/types';
import type { DiveSite } from '@/lib/types';

export interface UseSiteSightingsOptions {
  /** Search radius in km; 3 when absent. */
  radiusKm?: number;
  /** Replace the service, for tests. */
  service?: Pick<SightingsService, 'load'>;
}

export interface UseSiteSightings {
  /** Real sightings near the site: cached or fresh, null until there is something. Never made up. */
  summary: SiteSightings | null;
  /**
   * 'idle': no site. 'loading': nothing to show yet. 'stale': showing an old copy while it refreshes.
   * 'ready': up to date. 'offline' / 'error': the refresh failed; `summary` still holds the cached copy, if any.
   */
  status: SightingsStatus;
  /** Fetch again now, even if the cache is fresh. */
  refresh: () => void;
}

interface State {
  key: string;
  summary: SiteSightings | null;
  status: SightingsStatus;
}

/**
 * Real sightings (iNaturalist and OBIS) near a dive site, offline-first: the cached summary shows at
 * once, a stale one is refreshed in the background, and a failed refresh keeps what was cached.
 * Requests go through a shared, rate-limited queue and are cancelled when the screen goes away.
 * Never throws.
 */
export function useSiteSightings(site?: DiveSite, options: UseSiteSightingsOptions = {}): UseSiteSightings {
  const { radiusKm, service = sightingsService } = options;
  const siteId = site?.id;
  const lat = site?.lat;
  const lng = site?.lng;
  const key = siteId === undefined ? '' : `${siteId}|${radiusKm ?? ''}`;

  // State is only set from callbacks, tagged with the site it is for; what is shown is chosen at render.
  const [state, setState] = useState<State>({ key: '', summary: null, status: 'idle' });
  const [round, setRound] = useState(0);
  const forceNext = useRef(false);

  useEffect(() => {
    if (siteId === undefined || lat === undefined || lng === undefined) return;
    const controller = new AbortController();
    const force = forceNext.current;
    forceNext.current = false;
    const show = (summary: SiteSightings | null, status: SightingsStatus) => {
      if (!controller.signal.aborted) setState({ key, summary, status });
    };
    void Promise.resolve()
      .then(() =>
        service.load(
          { id: siteId, lat, lng },
          {
            radiusKm,
            signal: controller.signal,
            forceRefresh: force,
            onCached: ({ summary, stale }) => show(summary, stale ? 'stale' : 'ready'),
          },
        ),
      )
      .then((result) => show(result.summary, result.status))
      .catch(() => {
        // The service does not reject unless it is aborted; if something unexpected happens anyway,
        // report an error and keep whatever was shown.
        if (controller.signal.aborted) return;
        setState((previous) => ({ key, summary: previous.key === key ? previous.summary : null, status: 'error' }));
      });
    return () => controller.abort();
  }, [key, siteId, lat, lng, radiusKm, service, round]);

  const refresh = useCallback(() => {
    if (siteId === undefined) return;
    forceNext.current = true;
    setState((previous) => (previous.key === key ? { ...previous, status: previous.summary ? 'stale' : 'loading' } : previous));
    setRound((n) => n + 1);
  }, [siteId, key]);

  if (siteId === undefined) return { summary: null, status: 'idle', refresh };
  if (state.key !== key) return { summary: null, status: 'loading', refresh };
  return { summary: state.summary, status: state.status, refresh };
}
