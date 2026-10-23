import { expect, test } from '@jest/globals';
import { shoreDistance, shorePolygons } from '../island-outline';
import { createMarineMotion, MOVEMENT, type MarineMember } from '../marine-motion';
import { createSwimRig, CRUISE, type SwimDrive } from '../marine-rigs';
import { OCEAN } from '../ocean';
import { sampleDive } from '../ocean-depth';
import type { MarineModel } from '../swimming';
import { waterEdge } from '../../test-support/water-edge';

const TAU = Math.PI * 2;
const range = (values: number[]) => Math.max(...values) - Math.min(...values);
/** One bone's rotation through a stroke. */
function track(model: Parameters<typeof createSwimRig>[0], bone: string, drive: SwimDrive = CRUISE, samples = 48) {
  const rig = createSwimRig(model), b = rig.bones.indexOf(bone);
  return Array.from({ length: samples }, (_, i) => {
    rig.sample(TAU * i / samples, drive);
    return [rig.rotation[b * 3], rig.rotation[b * 3 + 1], rig.rotation[b * 3 + 2]];
  });
}

test('a harbor seal sweeps its hind flippers from side to side; a sea otter undulates up and down', () => {
  // The seal: hind flippers and rear body swing about the vertical, hardly at all up and down.
  expect(range(track('harbor-seal', 'HindL').map((r) => r[1]))).toBeGreaterThan(.4);
  expect(range(track('harbor-seal', 'TailBase').map((r) => r[1]))).toBeGreaterThan(range(track('harbor-seal', 'TailBase').map((r) => r[0])) * 3);
  // The otter: its body waves about its lateral axis and its feet paddle up and down.
  expect(range(track('sea-otter', 'TailBase').map((r) => r[0]))).toBeGreaterThan(range(track('sea-otter', 'TailBase').map((r) => r[1])) * 3);
  expect(range(track('sea-otter', 'HindL').map((r) => r[0]))).toBeGreaterThan(.3);
});

test('floating on its back, a sea otter curls belly-up: head and feet raised, paws on its chest, the stroke stilled', () => {
  const rig = createSwimRig('sea-otter'), at = (bone: string) => rig.bones.indexOf(bone) * 3;
  rig.sample(1, { ...CRUISE, effort: .3, rest: 1 });
  // Nose down and tail end down in its own frame: skyward once the motion rolls it over.
  expect(rig.rotation[at('Head')]).toBeGreaterThan(.3);
  for (const bone of ['Spine1', 'Spine2', 'RearBody', 'TailBase', 'Tail']) expect(rig.rotation[at(bone)]).toBeLessThan(0);
  expect(rig.rotation[at('HindL')]).toBeLessThan(-.3);
  // Both forepaws swing in toward the chest, mirrored.
  expect(rig.rotation[at('ForeL1') + 2]).toBeLessThan(-.8);
  expect(rig.rotation[at('ForeR1') + 2]).toBeGreaterThan(.8);
  // At rest the stroke stills: the pose barely changes through a cycle.
  const tail = (phase: number) => { rig.sample(phase, { ...CRUISE, effort: .3, rest: 1 }); return rig.rotation[at('TailBase')]; };
  expect(Math.abs(tail(0) - tail(Math.PI / 2))).toBeLessThan(.01);
});

test('a raft of sea otters floats on their backs at the surface between dives, and dives to forage', () => {
  const members: MarineMember[] = [{ model: 'sea-otter', lane: 0, group: 3 }];
  const motion = createMarineMotion(members, 3, { shape: 'kelp' });
  const top = OCEAN.surfaceLevel - MOVEMENT['sea-otter'].breathe!.clearance;
  let up = 0, floating = 0, onBack = 0, seen = 0, dove = false;
  for (let frame = 0; frame < 6000; frame++) {
    motion.step(.05, true);
    if (frame % 5) continue;
    const pose = motion.get(0)!, dive = motion.dive(0);
    if (dive.depth > .5) { dove = true; continue; }
    if (dive.depth > 0) continue;
    seen++;
    const y = pose.y + dive.y;
    if (y > top - .05) up++;
    if ((pose.rest ?? 0) > .9) {
      floating++;
      // Rolled right over (about a half turn), drifting slowly.
      if (Math.abs(Math.abs(pose.bank) - Math.PI) < .3 && pose.speed < MOVEMENT['sea-otter'].cruise * .4) onBack++;
    }
  }
  // Up in the water, it spends most of its time floating at the surface, on its back.
  expect(up / seen).toBeGreaterThan(.6);
  expect(floating / seen).toBeGreaterThan(.55);
  expect(onBack / floating).toBeGreaterThan(.9);
  expect(dove).toBe(true);
});

test('the garibaldi and the leafy seadragon keep near the rocky shore, the seadragon barely moving, and both sway with the surge', () => {
  const polygons = shorePolygons(3, 24, 'kelp');
  for (const model of ['garibaldi', 'leafy-seadragon'] as MarineModel[]) {
    const motion = createMarineMotion([{ model, lane: 0 }], 3, { shape: 'kelp' });
    let distance = 0, travelled = 0, swayed = 0, last = motion.inspect(0)!;
    let px = last.x, pz = last.z;
    for (let frame = 0; frame < 4000; frame++) {
      motion.step(.05, true);
      const seen = motion.inspect(0)!, pose = motion.get(0)!;
      distance += shoreDistance(polygons, seen.x, seen.z) / 4000;
      travelled += Math.hypot(seen.x - px, seen.z - pz);
      swayed = Math.max(swayed, Math.hypot(pose.x - seen.x, pose.z - seen.z + seen.shift));
      px = seen.x; pz = seen.z; last = seen;
    }
    // (near the edge of the water its body has room in: the shelf's shallows, which it keeps off, push it out from the shore itself)
    expect(distance).toBeLessThan(waterEdge(model, 'kelp', 3) + 1);
    // Its drawn place rocks back and forth about where it steers (Movement.sway).
    expect(swayed).toBeGreaterThan(MOVEMENT[model].sway! * .5);
    expect(swayed).toBeLessThan(MOVEMENT[model].sway! * 1.5);
    if (model === 'leafy-seadragon') expect(travelled / 200).toBeLessThan(.08);
  }
});

test('an orca pod patrols outside the kelp and comes up to breathe', () => {
  const motion = createMarineMotion([{ model: 'orca', lane: 0, group: 3 }], 3, { shape: 'kelp' });
  const polygons = shorePolygons(3, 24, 'kelp'), top = OCEAN.surfaceLevel - MOVEMENT.orca.breathe!.clearance;
  let breaths = 0, up = false, distance = 0, frames = 0;
  for (let frame = 0; frame < 12000; frame++) {
    motion.step(.05, true);
    const seen = motion.inspect(0)!, y = motion.get(0)!.y + sampleDive(motion.clock(), 0, 3).y;
    distance += shoreDistance(polygons, seen.x, seen.z); frames++;
    if (y > top - .1) { if (!up) breaths++; up = true; } else if (y < top - .2) up = false;
  }
  expect(distance / frames).toBeGreaterThan(MOVEMENT.orca.islandClearance);
  expect(breaths).toBeGreaterThanOrEqual(3);
});
