import { useEffect, useState } from 'react';
import { loadMarineModels, type MarineModels } from './marine-loader';

/** Resolves the shared parsed rigs; `failed` lets a scene fall back instead of hanging on a spinner. */
export function useMarineModels() {
  const [models, setModels] = useState<MarineModels | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let mounted = true;
    loadMarineModels()
      .then((loaded) => { if (mounted) setModels(loaded); })
      .catch((error) => {
        console.warn('marine models failed to load; using the illustrated island', error);
        if (mounted) setFailed(true);
      });
    return () => { mounted = false; };
  }, []);
  return { models, failed };
}
