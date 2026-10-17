import { expect, test } from '@jest/globals';
import { followerLane, groupSizes } from '../marine-groups';
import { createMarineMotion, MOVEMENT, type MarineMember } from '../marine-motion';
import { createSwimRig, CRUISE, JELLY_ARMS, SWIM_RIGS, type PinnipedRig, type SwimDrive, type SwimRigModel } from '../marine-rigs';
import { createReefLife, REEF, REEF_ANEMONE, reefRocks, type ReefVisitor } from '../reef-life';
import { SWIM_LEVEL } from '../ocean-depth';
import { islandScale, SEABED_PROPS, shoreDistance, shorePolygons } from '../island-outline';
import { shelfStretch } from '../ocean';

const TAU = Math.PI * 2;
/** One bone's rotation (x, y, z) through a stroke. */
function track(model: SwimRigModel, bone: string, drive: SwimDrive = CRUISE, samples = 48) {
  const rig = createSwimRig(model), b = rig.bones.indexOf(bone);
  return Array.from({ length: samples }, (_, i) => {
    rig.sample(TAU * i / samples, drive);
    return [rig.rotation[b * 3], rig.rotation[b * 3 + 1], rig.rotation[b * 3 + 2]];
  });
}
const range = (values: number[]) => Math.max(...values) - Math.min(...values);

test('a lurking barracuda all but stills its tail while its pectorals scull harder; a dash beats hard', () => {
  const hover = { ...CRUISE, effort: .25 }, dash = { ...CRUISE, effort: 1.6 };
  const tail = (drive: SwimDrive) => range(track('great-barracuda', 'Tail', drive).map((r) => r[1]));
  const fins = (drive: SwimDrive) => range(track('great-barracuda', 'PectoralL', drive).map((r) => r[2]));
  expect(tail(hover)).toBeLessThan(tail(CRUISE) * .3);
  expect(tail(dash)).toBeGreaterThan(tail(CRUISE));
  expect(fins(hover)).toBeGreaterThan(fins(CRUISE) * 1.5);
});

test("a sailfish's sail folds flat for a dash, rises fully for a display, and folds faster than it rises", () => {
  const rig = createSwimRig('sailfish'), dorsal = rig.bones.indexOf('Dorsal');
  expect(rig.scaled).toContain(dorsal);
  const height = () => rig.scale[dorsal * 3 + 1];
  rig.sample(0, { ...CRUISE, sail: 0 });
  expect(height()).toBeCloseTo(.07, 3);
  rig.sample(0, { ...CRUISE, sail: 1 });
  expect(height()).toBeCloseTo(1, 3);
  // Cruising it stands partly raised.
  rig.sample(0);
  expect(height()).toBeGreaterThan(.5);
  expect(height()).toBeLessThan(.9);
  const settle = (from: number, to: number) => {
    rig.sample(0, { ...CRUISE, sail: from });
    let t = 0;
    while (Math.abs(height() - (.07 + .93 * to)) > .1 && t < 10) { rig.step(1 / 30, { ...CRUISE, sail: to }); t += 1 / 30; }
    return t;
  };
  expect(settle(1, 0)).toBeLessThan(settle(0, 1));
});

test('a hovering clownfish rows with its pectorals, mirrored so the two fins sweep in turn, harder than when it darts', () => {
  const hover = { ...CRUISE, effort: .25 };
  const left = track('clownfish', 'PectoralL', hover), right = track('clownfish', 'PectoralR', hover);
  // The same yaw on mirrored fins sweeps one back while the other comes forward.
  left.forEach((r, i) => expect(r[1]).toBeCloseTo(right[i][1], 6));
  expect(range(left.map((r) => r[1]))).toBeGreaterThan(.8);
  expect(range(left.map((r) => r[1]))).toBeGreaterThan(range(track('clownfish', 'PectoralL', { ...CRUISE, effort: 1.6 }).map((r) => r[1])));
  // Darting, the deep little body wags right through to the tail.
  const tail = (drive: SwimDrive) => range(track('clownfish', 'Tail', drive).map((r) => r[1]));
  expect(tail({ ...CRUISE, effort: 1.6 })).toBeGreaterThan(tail(hover) * 3);
});

test('a sea lion flies in bouts of fore-flipper strokes and glides with them swept back along its flanks', () => {
  const rig = createSwimRig('california-sea-lion', .7), fore = rig.bones.indexOf('ForeL1');
  const spec = SWIM_RIGS['california-sea-lion'] as PinnipedRig;
  let gliding = 0, stroking = 0, sweptBack = 0;
  for (let i = 0; i < 30 * 40; i++) {
    rig.step(1 / 30, CRUISE);
    // ForeL1's yaw (positive is swept back) and roll (negative lowers it): held in the glide pose, or stroking.
    const yaw = rig.rotation[fore * 3 + 1], roll = rig.rotation[fore * 3 + 2];
    if (yaw > .8 && Math.abs(roll + spec.glideDroop) < .05) { gliding++; sweptBack = Math.max(sweptBack, yaw); } else stroking++;
  }
  expect(gliding).toBeGreaterThan(30 * 6);
  expect(stroking).toBeGreaterThan(30 * 5);
  expect(sweptBack).toBeGreaterThan(.85);
  // A turn bends its whole body.
  const straight = createSwimRig('california-sea-lion'), turning = createSwimRig('california-sea-lion');
  straight.sample(0); turning.sample(0, { effort: 1, turn: .8, curvature: 1.2, climb: 0 });
  const spine = ['Spine1', 'Spine2', 'RearBody', 'TailBase', 'Tail'].map((b) => straight.bones.indexOf(b));
  const bend = (r: typeof straight) => spine.reduce((sum, b) => sum + r.rotation[b * 3 + 1], 0);
  expect(Math.abs(bend(turning) - bend(straight))).toBeGreaterThan(1);
});

test('a jellyfish pulses: a quick squeeze of its rim and a slow relaxation, its arms swinging behind; it turns slowly', () => {
  const rig = createSwimRig('golden-jellyfish'), rim = rig.bones.indexOf('Rim'), bell = rig.bones.indexOf('Bell');
  const widths = Array.from({ length: 64 }, (_, i) => { rig.sample(TAU * i / 64); return [rig.scale[rim * 3], rig.scale[bell * 3]]; });
  expect(widths[0][0]).toBeCloseTo(1, 3);
  const narrowest = widths.reduce((best, w, i) => (w[0] < widths[best][0] ? i : best), 0);
  expect(widths[narrowest][0]).toBeLessThan(.9);
  // The squeeze takes well under half the cycle; the rim narrows more than the dome.
  expect(narrowest).toBeLessThan(32);
  expect(1 - widths[narrowest][1]).toBeLessThan(1 - widths[narrowest][0]);
  for (let a = 1; a <= JELLY_ARMS; a++) expect(range(track('golden-jellyfish', `Arm${a}A`).map((r) => Math.hypot(r[0], r[2])))).toBeGreaterThan(.03);
  // Baked loops never turn; live, the bell turns slowly about its axis.
  const root = rig.bones.indexOf('Root');
  rig.sample(1);
  expect(rig.rotation[root * 3 + 1]).toBe(0);
  for (let i = 0; i < 30 * 4; i++) rig.step(1 / 30, CRUISE);
  expect(Math.abs(rig.rotation[root * 3 + 1])).toBeGreaterThan(.5);
});

/** The six newcomers' open-water animals together, as a phone's island would hold them. */
const SIX: MarineMember[] = [
  { model: 'great-barracuda', lane: 0 }, { model: 'sailfish', lane: 1 }, { model: 'california-sea-lion', lane: 2, group: 3 },
  { model: 'spotted-eagle-ray', lane: 3, group: 3 }, { model: 'golden-jellyfish', lane: 4, group: 5 },
];
function watch(seconds: number, each: (motion: ReturnType<typeof createMarineMotion>, t: number) => void) {
  const motion = createMarineMotion(SIX, 3, { school: false, seed: .3 });
  for (let t = 0; t < seconds; t += 1 / 30) { motion.step(1 / 30, true); each(motion, t); }
}

test('the barracuda hangs still in the water, then dashes off; the sailfish raises its sail and rolls to show it, then folds it and bursts away', () => {
  let still = 0, dash = 0, display = 0, folded = 0, roll = 0, burst = 0;
  watch(150, (motion) => {
    const cuda = motion.get(0)!, sail = motion.get(1)!;
    if (cuda.pace < .15) still++;
    if (cuda.pace > 2) dash++;
    if (sail.sail === 1) { display++; roll = Math.max(roll, Math.abs(sail.bank)); }
    // The sail folds as the burst begins, before the speed has built.
    if (sail.sail === 0) { folded++; burst = Math.max(burst, sail.pace); }
  });
  expect(burst).toBeGreaterThan(1.8);
  expect(still).toBeGreaterThan(30 * 4);
  expect(dash).toBeGreaterThan(15);
  expect(display).toBeGreaterThan(30 * 4);
  expect(folded).toBeGreaterThan(30);
  expect(roll).toBeGreaterThan(.35);
});

test('a sea lion now and then rolls a full turn about its length and ends the way up it began, never jumping between frames', () => {
  let previous = 0, rolls = 0, inRoll = false;
  watch(240, (motion) => {
    const bank = motion.get(2)!.bank;
    expect(Math.abs(Math.atan2(Math.sin(bank - previous), Math.cos(bank - previous)))).toBeLessThan(.5);
    if (Math.abs(bank) > Math.PI * .9 && !inRoll) { rolls++; inRoll = true; }
    if (Math.abs(bank) < .6) inRoll = false;
    previous = bank;
  });
  expect(rolls).toBeGreaterThanOrEqual(2);
});

test('sea lions, eagle rays and jellyfish come in groups, the barracuda and sailfish alone; the jellies drift highest', () => {
  const species = SIX.map((m) => ({ id: m.model, model: m.model }));
  const sizes = groupSizes(species, 12, .5);
  expect(sizes[0]).toBe(1);
  expect(sizes[1]).toBe(1);
  expect(sizes[2]).toBeGreaterThanOrEqual(2);
  expect(sizes[3]).toBeGreaterThanOrEqual(3);
  expect(sizes[4]).toBeGreaterThanOrEqual(4);
  // Chevron barracuda school with the great barracuda's model.
  expect(groupSizes([{ id: 'chevron-barracuda', model: 'great-barracuda' }], 6, .5)[0]).toBeGreaterThanOrEqual(3);
  const depth = (model: keyof typeof MOVEMENT) => MOVEMENT[model].depth;
  expect(depth('golden-jellyfish')).toBeGreaterThan(depth('sailfish'));
  expect(depth('sailfish')).toBeGreaterThan(depth('spotted-eagle-ray'));
  expect(MOVEMENT['golden-jellyfish'].cruise).toBeLessThan(MOVEMENT['great-barracuda'].cruise / 3);
});

test('a clownfish pair darts about its anemone, never straying far, and ducks down into it when a big animal comes over', () => {
  const level = 2, reef = createReefLife([{ model: 'clownfish', lane: 4 }], level, { seed: .2 });
  const mate = followerLane(4, 1);
  expect(reef.swimmers).toEqual([
    { model: 'clownfish', lane: 4, leader: 4, index: 0 },
    { model: 'clownfish', lane: mate, leader: 4, index: 1 },
  ]);
  const home = reefRocks(level, 0, 0, 1).anemones[0];
  expect(reef.rocks).toContainEqual(home);
  const calm: ReefVisitor[] = [];
  let far = 0, moved = 0, last = reef.get(4)!.x;
  for (let t = 0; t < 120; t += 1 / 60) {
    reef.step(1 / 60, calm);
    reef.publish(1);
    for (const lane of [4, mate]) {
      const pose = reef.get(lane)!;
      far = Math.max(far, Math.hypot(pose.x - home.x, pose.z - home.z));
      const height = pose.y + SWIM_LEVEL - home.floor;
      expect(height).toBeGreaterThan(REEF.clownfish.nestle - .05);
      expect(height).toBeLessThan(REEF.clownfish.height[1] + .05);
    }
    moved += Math.abs(reef.get(4)!.x - last); last = reef.get(4)!.x;
  }
  // The first ventures at most this far; the second keeps close to it.
  expect(far).toBeLessThan(REEF.clownfish.venture.reach + REEF.clownfish.mate[1] + .05);
  expect(moved).toBeGreaterThan(1);
  // A shark gliding right over the anemone sends both down among the tentacles.
  const shark: ReefVisitor[] = [{ x: home.x, z: home.z + .4, hx: 1, hz: 0, threat: 1, size: 1.2, width: .45, presence: 1 }];
  for (let t = 0; t < 3; t += 1 / 60) reef.step(1 / 60, shark);
  reef.publish(1);
  for (const lane of [4, mate]) {
    expect(reef.inspect(lane)!.state).toBe('nestle');
    expect(reef.get(lane)!.y + SWIM_LEVEL - home.floor).toBeLessThan(REEF.clownfish.height[0]);
    expect(Math.hypot(reef.get(lane)!.x - home.x, reef.get(lane)!.z - home.z)).toBeLessThan(REEF_ANEMONE.radius);
  }
});

test('the anemones sit on the open shelf, clear of the corals, the reef rock, the dens and the octopuses\' rocks, at every level', () => {
  for (let level = 1; level <= 6; level++) {
    const { dens, rocks, anemones } = reefRocks(level, 2, 3, 2), scale = islandScale(level), polygons = shorePolygons(level);
    for (const home of anemones) {
      const d = shoreDistance(polygons, home.x, home.z), reach = d / shelfStretch(home.x, home.z);
      expect(reach).toBeGreaterThan(.62);
      expect(reach).toBeLessThan(.78);
      for (const [x, z] of Object.values(SEABED_PROPS)) expect(Math.hypot(x * scale - home.x, z * scale - home.z)).toBeGreaterThan(.7);
      for (const rock of [...dens.flat(), ...rocks]) expect(Math.hypot(rock.x - home.x, rock.z - home.z)).toBeGreaterThan(REEF_ANEMONE.radius + .45);
    }
    expect(Math.hypot(anemones[0].x - anemones[1].x, anemones[0].z - anemones[1].z)).toBeGreaterThan(2);
  }
});
