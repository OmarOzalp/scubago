import type { HomeScene } from '../home-start';
import { isMarineModel, loadMarineModel } from './marine-loader';
import { loadSeabedBake, loneIsland } from './seabed-assets';

/**
 * At launch, what Home will show loads while the app starts, from what it showed last (home-start.ts): the seabed of
 * its island at its level (Home's island at the first level on a first launch) and each of its animals' models, on
 * its own, so each animal can join the scene as soon as its model is in.
 */
export function preloadHomeScene(last: HomeScene | null) {
  void loadSeabedBake(last?.level ?? 1, loneIsland(last?.habitat ?? 'island'));
  for (const model of last?.models ?? []) if (isMarineModel(model)) loadMarineModel(model).catch(() => undefined);
}
