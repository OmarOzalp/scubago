import { expect, test } from '@jest/globals';
import type { IslandShape } from '../island-outline';
import type { MarineModel } from '../swimming';
import { clearFailures, surveyScene, swimScenes, type Survey } from '../../test-support/swim-clearance';

/**
 * The swimming never clips (docs/marine-navigation.md, "Depth"), coarsely: every model, in scenes of eight, on every island, for a
 * little while at one level of each, and the Coral Reef's biggest animals at its first level and its last. `npm run verify:swim` is
 * the exhaustive version (minutes per island and level, every level).
 */
const ISLANDS: [IslandShape, number][] = [['reef', 1], ['kelp', 3], ['volcanic', 6], ['mangrove', 2], ['wreck', 4]];
const BIGGEST: MarineModel[] = ['whale-shark', 'reef-manta', 'humpback-whale', 'leatherback-turtle', 'tiger-shark', 'great-white-shark', 'mola-mola'];
const WIDEST: MarineModel[] = ['humpback-whale', 'reef-manta'];

/** Surveys of the scenes (all of them, or those with one of `only`) on one island at one level: the school with the first scene. */
function sweep(shape: IslandShape, level: number, seconds: number, only?: readonly MarineModel[]) {
  const merged: Record<string, Survey> = {}, failures: string[] = [];
  swimScenes().forEach((scene, c) => {
    if (only && !scene.models.some((model) => only.includes(model))) return;
    const surveys = surveyScene({ shape, level, models: scene.models, species: scene.species, seed: c, school: c === 0 }, seconds);
    failures.push(...clearFailures(surveys, `${shape} level ${level}`));
    Object.assign(merged, surveys);
  });
  return { surveys: merged, failures };
}

test('no body is ever below the seabed, grazing it or inside an island: every model, on every island', () => {
  const failures: string[] = [];
  for (const [shape, level] of ISLANDS) failures.push(...sweep(shape, level, 8).failures);
  expect(failures).toEqual([]);
});

test('animals swim at the depth they live at: bottom-dwellers near the bottom, big open-water animals higher in deeper water', () => {
  const { surveys } = sweep('kelp', 3, 15);
  const median = (kind: Survey['kind'], pick: (s: Survey) => number) => {
    const rows = Object.values(surveys).filter((s) => s.kind === kind);
    return rows.reduce((sum, s) => sum + pick(s) * s.samples, 0) / rows.reduce((sum, s) => sum + s.samples, 0);
  };
  const above = (s: Survey) => s.above[1], below = (s: Survey) => s.below[1];
  // Close above the seabed, following it; the reef's mid-depth; the open water's deeper still, off the shelf.
  expect(median('bottom', above)).toBeLessThan(.5);
  expect(median('bottom', above)).toBeLessThan(median('reef', above));
  expect(median('open', below)).toBeGreaterThan(median('reef', below) - .05);
  // The school's fish keep clear of the surface, in the water and not at the top of it.
  expect(median('tuna', below)).toBeGreaterThan(.3);
});

test('on the Coral Reef the biggest animals swim in view, in water deep enough for them', () => {
  // (the reef's outer slope is a steep wall, the deep water beyond it a ring round the island that each of them goes round in, and the ocean
  // a little wider for them: shelf-water.ts)
  for (const level of [1, 6]) {
    const { surveys, failures } = sweep('reef', level, 40, BIGGEST);
    expect(failures).toEqual([]);
    for (const model of BIGGEST) {
      const s = surveys[model];
      expect(s).toBeDefined();
      expect(s.unseen / s.settled).toBeLessThan(.05);
      // (the sunfish is taller than the water there is, and always rides with some of it out: marine-bodies.ts)
      // (at the last level the reef's wall gives way to the islets' gentler shelves, and between them and the edge of the view there is no
      // water as deep as the widest bodies need, the humpback's and the reef manta's fins spanning two units and more: going round the whole
      // island, as every animal does, they ride over the shelves there for part of each lap, their backs at the surface)
      if (model !== 'mola-mola' && !(level === 6 && WIDEST.includes(model))) expect(s.stranded / s.settled).toBeLessThan(.2);
    }
  }
});
