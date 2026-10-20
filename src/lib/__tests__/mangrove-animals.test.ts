import { expect, test } from '@jest/globals';
import { islandOf, ISLAND_PLACES, residentsOf } from '../archipelago';
import { shoreDistance, shorePolygons } from '../island-outline';
import { groupSizes, GROUP_STYLES } from '../marine-groups';
import { createMarineMotion, MOVEMENT } from '../marine-motion';
import { OCEAN } from '../ocean';
import { SEAGRASS, seagrassTufts } from '../seagrass';
import { marineModelFor, type MarineModel } from '../swimming';

const NEW = ['dugong', 'sawfish', 'lemon-shark', 'southern-stingray', 'tarpon'] as const;

test('the Mangroves & Seagrass has an island of its own; its new animals have their own models, and its residents from Home move there', () => {
  expect(ISLAND_PLACES.mangroves).toBeDefined();
  for (const id of [...NEW, 'tiger-shark', 'great-hammerhead', 'green-turtle']) {
    expect(residentsOf('mangroves')).toContain(id);
    expect(islandOf(id)).toBe('mangroves');
  }
  for (const id of NEW) expect(marineModelFor({ id, category: 'fish' })).toBe(id);
  // The manatee swims as its fellow sea cow.
  expect(marineModelFor({ id: 'west-indian-manatee', category: 'mammal' })).toBe('dugong');
});

test('the seagrass grows in meadows on the shelf around the island, every blade under the surface, the same every time', () => {
  const polygons = shorePolygons(3), tufts = seagrassTufts(3);
  expect(tufts.length).toBeGreaterThan(SEAGRASS.tufts.full * .8);
  expect(tufts.length).toBeLessThanOrEqual(SEAGRASS.tufts.full);
  for (const tuft of tufts) {
    const distance = shoreDistance(polygons, tuft.x, tuft.z);
    expect(distance).toBeGreaterThanOrEqual(SEAGRASS.band[0]);
    expect(distance).toBeLessThanOrEqual(SEAGRASS.band[1]);
    expect(tuft.floor + tuft.height).toBeLessThanOrEqual(OCEAN.surfaceLevel - SEAGRASS.clearance + 1e-9);
  }
  expect(seagrassTufts(3)).toBe(tufts);
  // Lite keeps fewer tufts of the same meadows.
  expect(seagrassTufts(3, SEAGRASS.tufts.lite).length).toBe(SEAGRASS.tufts.lite);
});

test('tarpon come in small groups and lemon sharks now and then in pairs', () => {
  const species = [{ id: 'tarpon', model: 'tarpon' as MarineModel }, { id: 'lemon-shark', model: 'lemon-shark' as MarineModel }];
  const seen = { tarpon: new Set<number>(), lemon: new Set<number>() };
  for (let seed = 0; seed < 1; seed += .05) {
    const [tarpon, lemon] = groupSizes(species, 20, seed);
    seen.tarpon.add(tarpon); seen.lemon.add(lemon);
  }
  expect(Math.min(...seen.tarpon)).toBeGreaterThanOrEqual(2);
  expect(Math.max(...seen.tarpon)).toBeLessThanOrEqual(4);
  expect([...seen.lemon].sort()).toEqual([1, 2]);
  expect(GROUP_STYLES.tarpon!.places.length).toBeGreaterThanOrEqual(3);
});

/** Its mean distance from the shore (seen from above), its mean height and how many breaths it takes. */
function habits(model: MarineModel, frames = 6000) {
  const motion = createMarineMotion([{ model, lane: 0 }], 3), polygons = shorePolygons(3);
  const top = OCEAN.surfaceLevel - (MOVEMENT[model].breathe?.clearance ?? 0);
  let distance = 0, depth = 0, breaths = 0, up = false;
  for (let frame = 0; frame < frames; frame++) {
    motion.step(.05, true);
    const seen = motion.inspect(0)!, y = motion.get(0)!.y + motion.dive(0).y;
    distance += shoreDistance(polygons, seen.x, seen.z) / frames;
    depth += y / frames;
    if (y > top - .05) { if (!up) breaths++; up = true; } else if (y < top - .15) up = false;
  }
  return { distance, depth, breaths };
}

test('the dugong grazes close in and comes up to breathe; the tarpon roll up for air; the stingray keeps low over the bottom', () => {
  const dugong = habits('dugong'), tarpon = habits('tarpon'), stingray = habits('southern-stingray'), lemon = habits('lemon-shark');
  expect(dugong.distance).toBeLessThan(1.5);
  expect(dugong.breaths).toBeGreaterThanOrEqual(3);
  expect(tarpon.breaths).toBeGreaterThanOrEqual(3);
  expect(stingray.depth).toBeLessThan(lemon.depth);
  expect(stingray.breaths).toBe(0);
});
