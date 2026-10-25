import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MarineModel } from '@/lib/swimming';
import { getLoadedMarineModels, loadMarineModel } from './marine-loader';

/**
 * The models of the animals in the scene (and of one about to join it), each there as soon as it is loaded: the scene
 * doesn't wait for the slowest, and each animal joins as its own model arrives (null until the first of them has).
 * Models loaded for an earlier request are there at once. Any model failing to load fails the request (the scene shows
 * its illustration, with a retry); a fresh visit to the same selection starts afresh.
 */
export function useMarineModels(requested: readonly MarineModel[]) {
  const key = [...new Set(requested)].sort().join(',');
  const [attempt, setAttempt] = useState(0);
  // A fresh visit to the same selection must not revive an earlier failure.
  const request = useMemo(() => ({ key, attempt }), [key, attempt]);
  const [failure, setFailure] = useState<typeof request | null>(null);
  // (bumped as each model arrives, to draw the scene with it)
  const [, setArrivals] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  useEffect(() => {
    let current = true;
    const selected = request.key ? request.key.split(',') as MarineModel[] : [];
    for (const model of selected) {
      if (getLoadedMarineModels([model])) continue;
      loadMarineModel(model)
        .then(() => { if (current) setArrivals((count) => count + 1); })
        .catch((error) => {
          if (!current) return;
          current = false;
          console.warn('marine models failed to load; using the illustrated island', error);
          setFailure(request);
        });
    }
    return () => { current = false; };
  }, [request]);
  // The same object for as long as the same models are loaded (the scene compares it).
  const loaded = getLoadedMarineModels(key ? key.split(',') as MarineModel[] : []);
  const signature = loaded ? Object.keys(loaded).sort().join(',') : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- (keyed by which are loaded: the models themselves never change once loaded)
  const models = useMemo(() => loaded, [signature]);
  return { models, failed: failure === request, retry };
}
