import { expect, test } from '@jest/globals';
import { shoreDistance, shorePolygons } from '../island-outline';
import { GROUP_BUDGET, GROUP_SIZES, GROUP_STYLES, groupSizes } from '../marine-groups';
import { createMarineMotion, followerLane, MOVEMENT, type MarineMember } from '../marine-motion';
import { frame, worldFor } from '../steering';
import type { MarineModel } from '../swimming';

const species = (id: string, model: MarineModel) => ({ id, model });

test('species that swim together come in small groups, within a budget of extra animals', () => {
  const seeds = Array.from({ length: 40 }, (_, i) => i / 40);
  const sizes = (id: string, model: MarineModel) => new Set(seeds.map((seed) => groupSizes([species(id, model)], 99, seed)[0]));
  expect(sizes('bottlenose-dolphin', 'bottlenose-dolphin')).toEqual(new Set([2, 3]));
  expect(sizes('spinner-dolphin', 'bottlenose-dolphin')).toEqual(new Set([2, 3]));
  // Now and then a second scalloped hammerhead swims along; the great hammerhead is solitary.
  expect(sizes('scalloped-hammerhead', 'scalloped-hammerhead')).toEqual(new Set([1, 2]));
  expect(sizes('great-hammerhead', 'scalloped-hammerhead')).toEqual(new Set([1]));
  expect(sizes('chevron-barracuda', 'reef-fish')).toEqual(new Set([3, 4, 5]));
  expect(sizes('raccoon-butterflyfish', 'reef-fish')).toEqual(new Set([2]));
  // Everything else swims alone, including a schooling species drawn with a model that has no group style.
  expect(sizes('whale-shark', 'whale-shark')).toEqual(new Set([1]));
  expect(sizes('clownfish', 'reef-fish')).toEqual(new Set([1]));
  expect(sizes('bottlenose-dolphin', 'shark')).toEqual(new Set([1]));
  for (const [least, most] of Object.values(GROUP_SIZES)) expect(least).toBeLessThanOrEqual(most);
  // The budget: dolphins' pods first, then hammerheads, then shoals; the same visit always gives the same groups.
  const all = [species('chevron-barracuda', 'reef-fish'), species('scalloped-hammerhead', 'scalloped-hammerhead'), species('bottlenose-dolphin', 'bottlenose-dolphin'), species('giant-trevally', 'reef-fish')];
  for (const seed of seeds) {
    for (const budget of [GROUP_BUDGET.lite, GROUP_BUDGET.full, 0]) {
      const got = groupSizes(all, budget, seed);
      expect(got.reduce((sum, n) => sum + n - 1, 0)).toBeLessThanOrEqual(budget);
      expect(groupSizes(all, budget, seed)).toEqual(got);
      if (budget >= 2) expect(got[2]).toBeGreaterThanOrEqual(2);
    }
  }
});

type Run = ReturnType<typeof createMarineMotion>;
/** A scene stepped at 20 fps for `seconds`; `each` sees every frame. */
function run(members: MarineMember[], level: number, seconds: number, each: (motion: Run) => void, seed = .37) {
  const motion = createMarineMotion(members, level, { seed });
  for (let f = 0; f < seconds * 20; f++) { motion.step(.05, true); each(motion); }
  return motion;
}

test('a group is one species with a leader and followers, each drawn with a lane of its own', () => {
  const motion = createMarineMotion([{ model: 'bottlenose-dolphin', lane: 0, group: 3 }, { model: 'whale-shark', lane: 1 }, { model: 'reef-fish', lane: 2, group: 5 }], 1);
  expect(motion.swimmers.map((s) => [s.lane, s.leader, s.index])).toEqual([
    [0, 0, 0], [1, 1, 0], [2, 2, 0], [followerLane(0, 1), 0, 1], [followerLane(0, 2), 0, 2],
    ...[1, 2, 3, 4].map((k) => [followerLane(2, k), 2, k]),
  ]);
  expect(new Set(motion.swimmers.map((s) => s.lane)).size).toBe(motion.swimmers.length);
  // Groups ask for no more members than their style has places for; a lone species ignores `group`.
  expect(createMarineMotion([{ model: 'reef-fish', lane: 0, group: 12 }], 1).swimmers).toHaveLength(1 + GROUP_STYLES['reef-fish']!.places.length);
  expect(createMarineMotion([{ model: 'whale-shark', lane: 0, group: 3 }], 1).swimmers).toHaveLength(1);
  // Followers dive with their group, a little after their leader.
  const t = 30, dive = (lane: number, at: number) => motion.dive(lane, at).depth;
  for (let at = 0; at < 200; at += .5) expect(dive(followerLane(0, 1), at + t)).toBeCloseTo(dive(0, at + t - .8), 6);
});

test('a pod swims as one: followers keep close to their leader, turn with it, never jump and never swim through each other', () => {
  for (const [model, group, level] of [['bottlenose-dolphin', 3, 1], ['bottlenose-dolphin', 3, 6], ['scalloped-hammerhead', 2, 1], ['reef-fish', 5, 3]] as const) {
    const m = MOVEMENT[model], lanes = Array.from({ length: group - 1 }, (_, k) => followerLane(0, k + 1));
    const last = new Map<number, { x: number; z: number; heading: number }>();
    const apart: number[] = [];
    let clashes = 0, frames = 0;
    run([{ model, lane: 0, group }, { model: 'whale-shark', lane: 1 }, { model: 'green-turtle', lane: 2 }], level, 600, (motion) => {
      const head = motion.get(0)!, leaping = motion.swimmers.some(({ lane }) => motion.inspect(lane)!.leap);
      for (const lane of lanes) {
        const pose = motion.get(lane)!, before = last.get(lane);
        if (before && !leaping) {
          // Nimbler than usual to hold its place, but never beyond that, and never a jump.
          const turned = Math.abs(Math.atan2(Math.sin(pose.heading - before.heading), Math.cos(pose.heading - before.heading)));
          expect(turned).toBeLessThanOrEqual(m.turnRate * 1.3 * .05 + 1e-6);
          expect(Math.hypot(pose.x - before.x, pose.z - before.z)).toBeLessThanOrEqual(m.cruise * 2.2 * .05 + 1e-6);
        }
        last.set(lane, { x: pose.x, z: pose.z, heading: pose.heading });
        if (motion.dive(lane).opacity > .5 && !leaping) apart.push(Math.hypot(pose.x - head.x, pose.z - head.z));
      }
      // Members at about the same depth never overlap much; passing beneath one another is fine.
      const all = [0, ...lanes];
      for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
        const a = motion.get(all[i])!, b = motion.get(all[j])!;
        if (Math.abs(a.y - b.y) > .2 || motion.dive(all[i]).opacity < .5) continue;
        frames++;
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d < m.halfWidth * 1.2) clashes++;
      }
    });
    apart.sort((a, b) => a - b);
    const places = GROUP_STYLES[model]!.places, farthest = Math.max(...places.map(([x, z]) => Math.hypot(x, z)));
    expect(apart[Math.floor(apart.length / 2)]).toBeLessThan(farthest + .6);
    expect(apart[Math.floor(apart.length * .98)]).toBeLessThan(farthest + 2.4);
    expect(clashes / Math.max(1, frames)).toBeLessThan(.01);
  }
});

test('followers keep their own clearance from the island and islets, and stay in view, at every level', () => {
  for (const level of [1, 4, 6]) {
    const [main, ...islets] = shorePolygons(level), world = worldFor(level);
    run([{ model: 'bottlenose-dolphin', lane: 0, group: 3 }, { model: 'scalloped-hammerhead', lane: 1, group: 2 }, { model: 'reef-fish', lane: 2, group: 4 }, { model: 'whale-shark', lane: 3 }], level, 150, (motion) => {
      for (const { lane, model, index } of motion.swimmers) {
        if (!index) continue;
        const seen = motion.inspect(lane)!, m = MOVEMENT[model];
        expect(shoreDistance([main], seen.x, seen.z)).toBeGreaterThan(m.islandClearance - .45);
        if (islets.length) expect(shoreDistance(islets, seen.x, seen.z)).toBeGreaterThan(m.halfWidth * .5);
        expect(frame(seen.x, seen.z, world).edge).toBeLessThan(1.12);
      }
    });
  }
});

test('each member has its own depth and breathes on its own, one after another; the third now and then stays under', () => {
  const motion = createMarineMotion([{ model: 'bottlenose-dolphin', lane: 0, group: 3 }], 3, { seed: .37, leap: 0 });
  const lanes = [0, followerLane(0, 1), followerLane(0, 2)], top = new Map<number, number[]>(), depth = new Map<number, number>();
  const up = new Set<number>();
  for (let f = 0; f < 20 * 900; f++) {
    motion.step(.05, true);
    for (const lane of lanes) {
      const pose = motion.get(lane)!, y = pose.y + motion.dive(lane).y;
      depth.set(lane, (depth.get(lane) ?? 0) + pose.y);
      // A breath: well above where it usually swims.
      if (y > -.5 && !up.has(lane)) { up.add(lane); top.set(lane, [...(top.get(lane) ?? []), motion.clock()]); }
      if (y < -.62) up.delete(lane);
    }
  }
  const [first, second, third] = lanes.map((lane) => top.get(lane) ?? []);
  expect(first.length).toBeGreaterThan(8);
  // Staggered: the second member comes up a couple of seconds after the leader.
  const gaps = second.map((t) => Math.min(...first.map((u) => Math.abs(t - u - 2.4))));
  expect(gaps.filter((g) => g < .6).length / second.length).toBeGreaterThan(.8);
  expect(third.length).toBeLessThan(first.length * .85);
  expect(third.length).toBeGreaterThan(first.length * .25);
  // Their usual depths differ a little.
  const mean = lanes.map((lane) => depth.get(lane)! / (20 * 900));
  expect(Math.max(...mean) - Math.min(...mean)).toBeGreaterThan(.08);
});

test('a pod passes other animals as one, and the tuna school sees each member', () => {
  let clashes = 0, frames = 0;
  const members: MarineMember[] = [{ model: 'bottlenose-dolphin', lane: 0, group: 3 }, { model: 'whale-shark', lane: 1 }, { model: 'tiger-shark', lane: 2 }, { model: 'reef-manta', lane: 3 }, { model: 'mola-mola', lane: 4 }];
  const motion = createMarineMotion(members, 1, { seed: .5, school: true });
  for (let f = 0; f < 20 * 400; f++) {
    motion.step(.05, true);
    for (const { lane, index } of motion.swimmers) {
      if (!index) continue;
      const pose = motion.get(lane)!;
      for (const other of members.slice(1)) {
        if (motion.dive(other.lane).opacity < .4 || motion.dive(lane).opacity < .4) continue;
        const o = motion.get(other.lane)!, m = MOVEMENT[other.model];
        if (Math.abs(o.y - pose.y) > .15) continue;
        frames++;
        if (Math.hypot(o.x - pose.x, o.z - pose.z) < Math.min(m.halfLength, m.halfWidth) + .15) clashes++;
      }
    }
  }
  expect(clashes / Math.max(1, frames)).toBeLessThan(.01);
  expect(motion.school).not.toBeNull();
});
