import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MarineModel } from '@/lib/swimming';
import { getLoadedMarineModels, loadMarineModels, type MarineModels } from './marine-loader';

/** Only the current visible page is requested; stale completions cannot replace it. */
export function useMarineModels(requested: readonly MarineModel[]) {
  const key = [...new Set(requested)].sort().join(',');
  const [attempt, setAttempt] = useState(0);
  // A fresh visit to the same selection must not revive an earlier failure.
  const request = useMemo(() => ({ key, attempt }), [key, attempt]);
  const [state, setState] = useState<{ request: typeof request; models: MarineModels | null; failed: boolean }>(() => ({ request, models: getLoadedMarineModels(requested), failed: false }));
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  useEffect(() => {
    let current = true;
    const selected = request.key ? request.key.split(',') as MarineModel[] : [];
    loadMarineModels(selected)
      .then((models) => { if (current) setState({ request, models, failed: false }); })
      .catch((error) => {
        if (current) {
          console.warn('marine models failed to load; using the illustrated island', error);
          setState({ request, models: null, failed: true });
        }
      });
    return () => { current = false; };
  }, [request]);
  return { models: state.request === request ? state.models : getLoadedMarineModels(requested), failed: state.request === request && state.failed, retry };
}
