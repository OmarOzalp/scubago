import { expect, test } from '@jest/globals';
import { shoreDistance, shorePolygons } from '../island-outline';
import { createMarineMotion, MOVEMENT, type MarineMember } from '../marine-motion';
import { frame, OCEAN_GROWTH, oceanScale, roamFor, WORLD, worldFor } from '../steering';

const SCENE: MarineMember[] = [
  { model: 'whale-shark', lane: 0 }, { model: 'bottlenose-dolphin', lane: 1, group: 3 }, { model: 'great-white-shark', lane: 2 },
  { model: 'reef-manta', lane: 3 }, { model: 'green-turtle', lane: 4 }, { model: 'reef-fish', lane: 5, group: 4 },
];

test('the ocean widens with each level while animals keep their size', () => {
  expect(worldFor(1)).toEqual(WORLD);
  expect(roamFor(1)).toBe(0);
  for (let level = 2; level <= 6; level++) {
    expect(oceanScale(level)).toBeGreaterThan(oceanScale(level - 1));
    expect(worldFor(level).x / WORLD.x).toBeCloseTo(worldFor(level).z / WORLD.z, 9);
  }
  // Modest: at most a fifth more room, so the island and the animals stay readable when the camera pulls back.
  expect(oceanScale(6)).toBeLessThanOrEqual(1.2);
  expect(oceanScale(0)).toBe(1);
  expect(oceanScale(9)).toBe(oceanScale(6));
  const motion = createMarineMotion(SCENE, 6);
  expect(motion.ocean.world).toEqual(worldFor(6));
  expect(motion.ocean.roam).toBeCloseTo(roamFor(6), 9);
});

test('at every level every animal and the tuna school stay in view and clear of the island', () => {
  for (let level = 1; level <= 6; level++) {
    const [main] = shorePolygons(level), world = worldFor(level);
    const motion = createMarineMotion(SCENE, level, { seed: level / 7, school: true });
    for (let f = 0; f < 20 * 90; f++) {
      motion.step(.05, true);
      if (f % 10) continue;
      for (const { lane, model } of motion.swimmers) {
        const seen = motion.inspect(lane)!;
        if (motion.dive(lane).opacity < .2) continue;
        expect(frame(seen.x, seen.z, world).edge).toBeLessThan(level > 4 ? 1.3 : 1.15);
        expect(shoreDistance([main], seen.x, seen.z)).toBeGreaterThan(MOVEMENT[model].halfWidth * .8);
      }
      const school = motion.school!;
      expect(frame(school.state.centerX, school.state.centerZ + .4, world).edge).toBeLessThan(1.02);
    }
  }
});

test('a new level reshapes the island at once and widens the ocean gradually, without moving anyone', () => {
  const motion = createMarineMotion(SCENE, 1, { seed: .4, school: true });
  for (let f = 0; f < 20 * 30; f++) motion.step(.05, true);
  const before = new Map(motion.swimmers.map(({ lane }) => [lane, { ...motion.get(lane)! }]));
  motion.setLevel(6);
  expect(motion.level).toBe(6);
  let width = motion.ocean.world.x;
  for (let f = 0; f < 20 * 12; f++) {
    motion.step(.05, true);
    // The area grows a little every frame, never in a jump.
    const grown = motion.ocean.world.x - width;
    expect(grown).toBeGreaterThanOrEqual(0);
    expect(grown).toBeLessThan(WORLD.x * .2 * OCEAN_GROWTH.ease * .05 + 1e-9);
    width = motion.ocean.world.x;
    for (const { lane, model } of motion.swimmers) {
      const pose = motion.get(lane)!, last = before.get(lane)!, m = MOVEMENT[model];
      if (!motion.inspect(lane)!.leap) expect(Math.hypot(pose.x - last.x, pose.z - last.z)).toBeLessThan(m.cruise * 2.3 * .05 + .002);
      before.set(lane, { ...pose });
    }
  }
  // About three seconds to settle; after twelve it is there.
  expect(motion.ocean.world.x).toBeCloseTo(worldFor(6).x, 3);
  expect(motion.ocean.roam).toBeCloseTo(roamFor(6), 3);
  // Going back down eases just the same.
  motion.setLevel(2);
  motion.step(.05, true);
  expect(motion.ocean.world.x).toBeGreaterThan(worldFor(2).x);
});

test('animals and the tuna school use the extra room at higher levels', () => {
  const offshore = (level: number) => {
    const [main] = shorePolygons(level);
    const motion = createMarineMotion([{ model: 'whale-shark', lane: 0 }, { model: 'green-turtle', lane: 1 }], level, { seed: .3, school: true });
    let whale = 0, school = 0, n = 0;
    for (let f = 0; f < 20 * 420; f++) {
      motion.step(.05, true);
      if (f % 20) continue;
      const seen = motion.inspect(0)!;
      whale += shoreDistance([main], seen.x, seen.z);
      school += shoreDistance([main], motion.school!.state.centerX, motion.school!.state.centerZ + .4);
      n++;
    }
    return { whale: whale / n, school: school / n };
  };
  const low = offshore(1), high = offshore(6);
  expect(high.whale).toBeGreaterThan(low.whale + .1);
  expect(high.school).toBeGreaterThan(low.school + .1);
});
