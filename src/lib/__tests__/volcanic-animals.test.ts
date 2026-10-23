import { expect, test } from '@jest/globals';
import { islandOf, ISLAND_PLACES, residentsOf } from '../archipelago';
import { shoreDistance, shorePolygons } from '../island-outline';
import { groupSizes, GROUP_STYLES } from '../marine-groups';
import { createMarineMotion, MOVEMENT } from '../marine-motion';
import { createSwimRig, CRUISE } from '../marine-rigs';
import { OCEAN } from '../ocean';
import { marineModelFor, type MarineModel } from '../swimming';
import { waterEdge } from '../../test-support/water-edge';

const TAU = Math.PI * 2;
const range = (values: number[]) => Math.max(...values) - Math.min(...values);
/** One bone's yaw (rotation about the vertical) through a stroke. */
function yaw(model: Parameters<typeof createSwimRig>[0], bone: string, samples = 48) {
  const rig = createSwimRig(model), b = rig.bones.indexOf(bone);
  return Array.from({ length: samples }, (_, i) => { rig.sample(TAU * i / samples, CRUISE); return rig.rotation[b * 3 + 1]; });
}
const NEW = ['marine-iguana', 'galapagos-shark', 'thresher-shark', 'giant-trevally', 'king-angelfish'] as const;

test('the Volcanic Pinnacle has an island of its own, and its new animals have their own models and swim there', () => {
  expect(ISLAND_PLACES['volcanic-pinnacle']).toBeDefined();
  for (const id of [...NEW, 'scalloped-hammerhead', 'spotted-eagle-ray']) {
    expect(residentsOf('volcanic-pinnacle')).toContain(id);
    expect(islandOf(id)).toBe('volcanic-pinnacle');
  }
  for (const id of NEW) expect(marineModelFor({ id, category: 'fish' })).toBe(id);
});

test('a marine iguana sweeps its tail in waves that grow toward the whip of its tip, its legs folded and nearly still', () => {
  const swing = ['Spine2', 'RearBody', 'TailBase', 'Tail'].map((bone) => range(yaw('marine-iguana', bone)));
  for (let i = 1; i < swing.length; i++) expect(swing[i]).toBeGreaterThan(swing[i - 1]);
  // The whip (TailUpper) flexes the last third, lagging the stroke; no joint bends more than about 45° either way.
  expect(range(yaw('marine-iguana', 'TailUpper'))).toBeGreaterThan(.3);
  expect(Math.max(...swing)).toBeLessThan(1.6);
  expect(range(yaw('marine-iguana', 'Head'))).toBeLessThan(swing[1]);
  expect(range(yaw('marine-iguana', 'PectoralL'))).toBeLessThan(.25);
});

test('a thresher sweeps its long scythe of a tail in one smooth arc from a nearly still body', () => {
  const body = ['Spine1', 'Spine2', 'RearBody', 'TailBase'].map((bone) => range(yaw('thresher-shark', bone)));
  const tail = range(yaw('thresher-shark', 'Tail'));
  // The tail swings far more than any joint of the body, and the lobe hardly bends back against it (no kink).
  expect(tail).toBeGreaterThan(Math.max(...body) * 4);
  expect(range(yaw('thresher-shark', 'TailUpper'))).toBeLessThan(tail / 5);
  // Its tip sweeps about a tenth of the shark's length either side, like the Galápagos shark's.
  expect(Math.sin(tail / 2) * .48).toBeGreaterThan(.08);
});

test('hammerheads school in twos and threes at the pinnacle; giant trevally hunt in packs of three to five', () => {
  const species = [{ id: 'scalloped-hammerhead', model: 'scalloped-hammerhead' as MarineModel }, { id: 'giant-trevally', model: 'giant-trevally' as MarineModel }];
  for (let seed = 0; seed < 1; seed += .1) {
    const [hammerheads, trevally] = groupSizes(species, 20, seed);
    expect(hammerheads).toBeGreaterThanOrEqual(2); expect(hammerheads).toBeLessThanOrEqual(3);
    expect(trevally).toBeGreaterThanOrEqual(3); expect(trevally).toBeLessThanOrEqual(5);
  }
  expect(GROUP_STYLES['giant-trevally']!.places.length).toBeGreaterThanOrEqual(4);
});

/** Its mean distance from the shore (seen from above), its mean height, how much of the time it is near the surface (within .3) and how many breaths it takes. */
function habits(model: MarineModel, frames = 6000) {
  const motion = createMarineMotion([{ model, lane: 0 }], 3, { shape: 'volcanic' }), polygons = shorePolygons(3, 24, 'volcanic');
  const top = OCEAN.surfaceLevel - (MOVEMENT[model].breathe?.clearance ?? 0);
  let distance = 0, near = 0, depth = 0, breaths = 0, up = false;
  for (let frame = 0; frame < frames; frame++) {
    motion.step(.05, true);
    const seen = motion.inspect(0)!, y = motion.get(0)!.y + motion.dive(0).y;
    distance += shoreDistance(polygons, seen.x, seen.z) / frames;
    depth += y / frames;
    if (y > OCEAN.surfaceLevel - .3) near++;
    if (y > top - .05) { if (!up) breaths++; up = true; } else if (y < top - .15) up = false;
  }
  return { distance, near: near / frames, depth, breaths };
}

test('the iguana and the angelfish keep to the shore, the iguana up at the surface for long spells; the thresher keeps out in the blue, deeper', () => {
  const iguana = habits('marine-iguana'), angelfish = habits('king-angelfish'), thresher = habits('thresher-shark'), galapagos = habits('galapagos-shark');
  // (near the edge of the water its body has room in: the shelf's shallows, which it keeps off, push it out from the shore itself, as the kelp's)
  expect(iguana.distance).toBeLessThan(waterEdge('marine-iguana', 'volcanic', 3) + 1.1);
  expect(angelfish.distance).toBeLessThan(waterEdge('king-angelfish', 'volcanic', 3) + 1.1);
  expect(iguana.near).toBeGreaterThan(.5);
  expect(iguana.breaths).toBeGreaterThanOrEqual(5);
  expect(thresher.distance).toBeGreaterThan(iguana.distance + .5);
  expect(thresher.depth).toBeLessThan(galapagos.depth);
});
