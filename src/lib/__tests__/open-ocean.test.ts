import { expect, test } from '@jest/globals';
import { flatSeabed } from '../../test-support/flat-seabed';
import { shoreDistance, shorePolygons } from '../island-outline';
import { createMarineMotion, MOVEMENT, type MarineMember } from '../marine-motion';
import { createSwimRig, CRUISE, SWIM_RIGS } from '../marine-rigs';
import { OCEAN } from '../ocean';
import { sampleDive } from '../ocean-depth';
import { REEF_THREAT } from '../reef-life';
import { worldFor } from '../steering';
import type { MarineModel } from '../swimming';
import { SCHOOL_REACTIONS } from '../tuna-school';

/** The Open Ocean's animals (docs/archipelago.md). */
const OCEAN_FIVE: MarineModel[] = ['humpback-whale', 'sperm-whale', 'oceanic-whitetip', 'leatherback-turtle', 'oceanic-manta'];
const school = (models: MarineModel[]): MarineMember[] => models.map((model, lane) => ({ model, lane }));
const frameEdge = (x: number, z: number, world: { x: number; z: number }) => ((x / world.x) ** 6 + (z / world.z) ** 6) ** (1 / 6);

test('the Open Ocean animals stay in view and clear of the island and islets, at every level', () => {
  for (const level of [1, 6]) {
    const [main, ...islets] = shorePolygons(level);
    const members = school(OCEAN_FIVE);
    const motion = createMarineMotion(members, level);
    for (let frame = 0; frame < 4800; frame++) {
      motion.step(.05, true);
      if (frame % 8) continue;
      for (const { lane } of members) {
        const pose = motion.get(lane)!, seen = motion.inspect(lane)!;
        expect(Object.values(pose).every(Number.isFinite)).toBe(true);
        expect(frameEdge(seen.x, seen.z, worldFor(level))).toBeLessThan(level > 4 ? 1.35 : 1.15);
        expect(shoreDistance([main], seen.x, seen.z)).toBeGreaterThan(seen.m.islandClearance - .75);
        expect(shoreDistance([main], seen.x, seen.z)).toBeGreaterThan(seen.m.halfWidth * .85);
        if (islets.length) expect(shoreDistance(islets, seen.x, seen.z)).toBeGreaterThan(seen.m.halfWidth * .5);
      }
    }
  }
});

test('they keep farther out than the reef-side animals, the whales farthest of all', () => {
  const [main] = shorePolygons(1);
  // (over a flat bottom: where each would like to swim, not where the Coral Reef's shelf lets it)
  const offshore = (model: MarineModel) => {
    const motion = createMarineMotion([{ model, lane: 0 }], 1, { seabed: flatSeabed() });
    let sum = 0;
    for (let frame = 0; frame < 6000; frame++) {
      motion.step(.05, true);
      const seen = motion.inspect(0)!;
      sum += shoreDistance([main], seen.x, seen.z) / 6000;
    }
    return sum;
  };
  const whaleShark = offshore('whale-shark');
  expect(offshore('humpback-whale')).toBeGreaterThan(whaleShark);
  expect(offshore('sperm-whale')).toBeGreaterThan(whaleShark);
  expect(offshore('leatherback-turtle')).toBeGreaterThan(offshore('green-turtle'));
  expect(offshore('oceanic-manta')).toBeGreaterThan(offshore('reef-manta'));
  expect(offshore('oceanic-whitetip')).toBeGreaterThan(offshore('tiger-shark'));
});

test('together with the whale shark they keep apart or pass at different depths', () => {
  const members = school([...OCEAN_FIVE, 'whale-shark']);
  const motion = createMarineMotion(members, 1);
  let clashes = 0, seenFrames = 0;
  for (let frame = 0; frame < 6000; frame++) {
    motion.step(.05, true);
    const t = motion.clock();
    for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) {
      if (sampleDive(t, members[i].lane, members.length).opacity < .4 || sampleDive(t, members[j].lane, members.length).opacity < .4) continue;
      seenFrames++;
      const a = motion.inspect(members[i].lane)!, b = motion.inspect(members[j].lane)!;
      // Overlap judged on their centers, against the larger footprint.
      const close = Math.hypot(a.x - b.x, a.z - b.z) < Math.max(a.m.halfLength, b.m.halfLength);
      if (close && Math.abs(motion.get(members[i].lane)!.y - motion.get(members[j].lane)!.y) < .15) clashes++;
    }
  }
  expect(clashes / seenFrames).toBeLessThan(.02);
});

test('the whales come up to breathe now and then, the sperm whale resting longest at the surface', () => {
  const surfaceTime: Partial<Record<MarineModel, number>> = {};
  for (const model of ['humpback-whale', 'sperm-whale'] as const) {
    const top = OCEAN.surfaceLevel - MOVEMENT[model].breathe!.clearance;
    // (over a flat bottom: the breathing, not the shelf's shallows, which keep a whale's back near the surface)
    const motion = createMarineMotion([{ model, lane: 0 }], 1, { seabed: flatSeabed() });
    let breaths = 0, up = false, highest = -Infinity, near = 0;
    for (let frame = 0; frame < 12000; frame++) {
      motion.step(.05, true);
      const pose = motion.get(0)!, dive = sampleDive(motion.clock(), 0, 1), y = pose.y + dive.y;
      highest = Math.max(highest, y);
      if (y > top - .05) near++;
      if (y > top - .1) {
        if (!up) breaths++;
        up = true;
      } else if (y < top - .2) up = false;
    }
    // Ten minutes: a breath every 30 to 34 s when one falls wholly between dives, each reaching just below the surface.
    expect(breaths).toBeGreaterThanOrEqual(5);
    expect(breaths).toBeLessThanOrEqual(14);
    expect(highest).toBeLessThanOrEqual(top + .01);
    expect(highest).toBeGreaterThan(top - .05);
    surfaceTime[model] = near / breaths;
  }
  expect(surfaceTime['sperm-whale']!).toBeGreaterThan(surfaceTime['humpback-whale']!);
});

test('the oceanic whitetip alarms the reef and the tuna; the whales, leatherback and manta do not', () => {
  expect(REEF_THREAT['oceanic-whitetip']).toBeGreaterThan(.8);
  expect(SCHOOL_REACTIONS['oceanic-whitetip'].threat).toBeGreaterThan(0);
  for (const model of ['humpback-whale', 'sperm-whale', 'leatherback-turtle', 'oceanic-manta'] as const) {
    expect(REEF_THREAT[model]!).toBeLessThan(.5);
    expect(SCHOOL_REACTIONS[model].threat).toBe(0);
  }
  // The whales are so big the school gives them the widest berth.
  expect(SCHOOL_REACTIONS['humpback-whale'].gap).toBeGreaterThan(SCHOOL_REACTIONS['whale-shark'].gap);
});

test('the larger animals beat slower than their reef-side relatives', () => {
  const rate = (model: keyof typeof SWIM_RIGS) => SWIM_RIGS[model].frequency;
  expect(rate('oceanic-manta')).toBeLessThan(rate('reef-manta'));
  expect(rate('leatherback-turtle')).toBeLessThan(rate('green-turtle'));
  expect(rate('oceanic-whitetip')).toBeLessThan(rate('great-white-shark'));
  expect(rate('humpback-whale')).toBeLessThan(rate('bottlenose-dolphin'));
  expect(rate('sperm-whale')).toBeLessThan(rate('humpback-whale'));
  // Each rig poses every bone with finite rotations through a stroke.
  for (const model of OCEAN_FIVE) {
    const rig = createSwimRig(model as keyof typeof SWIM_RIGS);
    for (let i = 0; i < 16; i++) {
      rig.sample(Math.PI * 2 * i / 16, CRUISE);
      expect(Array.from(rig.rotation).every(Number.isFinite)).toBe(true);
    }
  }
});
