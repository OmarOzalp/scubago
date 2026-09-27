import { expect, test } from '@jest/globals';
import { createSwimRig, CRUISE, rigBones, strokeFrequency, SWIM_RIGS, type SwimDrive, type SwimRigModel } from '../marine-rigs';

const SHARKS = ['tiger-shark', 'whale-shark', 'great-white-shark'] as const;
const ALL: SwimRigModel[] = [...SHARKS, 'reef-manta', 'mola-mola', 'green-turtle'];
const SPINE = ['Spine1', 'Spine2', 'RearBody', 'TailBase', 'Tail'];

/** Sample one stroke; returns per-sample rotations keyed by bone. */
function cycle(model: SwimRigModel, drive: SwimDrive = CRUISE, samples = 64) {
  const rig = createSwimRig(model);
  return Array.from({ length: samples }, (_, i) => {
    rig.sample(Math.PI * 2 * i / samples, drive);
    return Object.fromEntries(rig.bones.map((bone, b) => [bone, [rig.rotation[b * 3], rig.rotation[b * 3 + 1], rig.rotation[b * 3 + 2]]]));
  });
}
/** Heading of each spine segment relative to the body root (accumulated local yaw). */
const segmentYaw = (pose: Record<string, number[]>) => SPINE.map((_, i) => SPINE.slice(0, i + 1).reduce((sum, bone) => sum + pose[bone][1], 0));
const peak = (values: number[]) => Math.max(...values.map(Math.abs));

test('every species drives its full bone hierarchy with finite, seamlessly looping poses', () => {
  for (const model of ALL) {
    const rig = createSwimRig(model);
    expect(rig.bones).toEqual(rigBones(model));
    rig.sample(0);
    const start = Array.from(rig.rotation);
    rig.sample(Math.PI * 2);
    Array.from(rig.rotation).forEach((value, i) => expect(value).toBeCloseTo(start[i], 6));
    for (let i = 0; i < 400; i++) {
      rig.step(1 / 30, { effort: 1 + Math.sin(i / 20) * .5, turn: Math.sin(i / 50) * .4, curvature: Math.sin(i / 50), climb: Math.cos(i / 40) });
      expect(Array.from(rig.rotation).every(Number.isFinite)).toBe(true);
      expect([rig.offset.x, rig.offset.y, rig.offset.z].every(Number.isFinite)).toBe(true);
    }
  }
});

test('shark swimming grows toward the tail while the head stays steady', () => {
  for (const model of SHARKS) {
    const poses = cycle(model);
    const peaks = SPINE.map((_, i) => peak(poses.map((pose) => segmentYaw(pose)[i])));
    for (let i = 1; i < peaks.length; i++) expect(peaks[i]).toBeGreaterThan(peaks[i - 1]);
    const head = peak(poses.map((pose) => pose.Head[1]));
    expect(head).toBeLessThan(.25 * peaks[4]);
    expect(peaks[0]).toBeLessThan(.2 * peaks[4]);
  }
});

test('each shark has its own gait: whale slowest, great white fastest and stiffest in front', () => {
  const tiger = SWIM_RIGS['tiger-shark'], whale = SWIM_RIGS['whale-shark'], white = SWIM_RIGS['great-white-shark'];
  expect(strokeFrequency(whale, 1)).toBeLessThan(strokeFrequency(tiger, 1));
  expect(strokeFrequency(tiger, 1)).toBeLessThan(strokeFrequency(white, 1));
  const frontShare = (model: SwimRigModel) => {
    const poses = cycle(model);
    return peak(poses.map((pose) => segmentYaw(pose)[2])) / peak(poses.map((pose) => segmentYaw(pose)[4]));
  };
  expect(frontShare('great-white-shark')).toBeLessThan(frontShare('tiger-shark'));
});

test('tail beats speed up with effort and stop advancing while paused', () => {
  for (const model of ALL) {
    const spec = SWIM_RIGS[model];
    expect(strokeFrequency(spec, .5)).toBeLessThan(strokeFrequency(spec, 1));
    expect(strokeFrequency(spec, 1)).toBeLessThan(strokeFrequency(spec, 1.4));
    expect(strokeFrequency(spec, 0)).toBeGreaterThan(0);
    const rig = createSwimRig(model, 1);
    const before = Array.from(rig.rotation);
    rig.step(0, { ...CRUISE, effort: 1.5 });
    expect(Array.from(rig.rotation)).toEqual(before);
  }
});

test('turning bends a shark into the turn and dips the inside pectoral', () => {
  for (const model of SHARKS) {
    const mean = (poses: Record<string, number[]>[], pick: (pose: Record<string, number[]>) => number) => poses.reduce((sum, pose) => sum + pick(pose), 0) / poses.length;
    const left = cycle(model, { effort: 1, turn: .4, curvature: .8, climb: 0 });
    const straight = cycle(model);
    // A left turn curves the tail toward the left (+X), which is a negative segment yaw, and turns the head left.
    expect(mean(left, (pose) => segmentYaw(pose)[4])).toBeLessThan(mean(straight, (pose) => segmentYaw(pose)[4]) - .02);
    expect(mean(left, (pose) => pose.Head[1])).toBeGreaterThan(0);
    expect(mean(left, (pose) => pose.PectoralL[2])).toBeLessThan(mean(straight, (pose) => pose.PectoralL[2]));
  }
});

test('manta strokes travel outward along each wing and mirror left to right', () => {
  const poses = cycle('reef-manta');
  const phaseOfPeak = (bone: string) => poses.reduce((best, pose, i) => (pose[bone][2] > poses[best][bone][2] ? i : best), 0);
  expect(phaseOfPeak('WingL5')).toBeGreaterThan(phaseOfPeak('WingL1'));
  expect(phaseOfPeak('WingL3')).toBeGreaterThan(phaseOfPeak('WingL1'));
  for (const pose of poses) {
    for (let i = 1; i <= 5; i++) expect(pose[`WingR${i}`][2]).toBeCloseTo(-pose[`WingL${i}`][2], 6);
    expect(Math.abs(pose.Root[0])).toBeLessThan(.05);
  }
  // Outer wing segments carry more of the stroke than the shoulder.
  expect(peak(poses.map((pose) => pose.WingL5[2]))).toBeGreaterThan(peak(poses.map((pose) => pose.WingL1[2])));
});

test('manta banks with its outer wing, climbs with stronger strokes and glides when slow', () => {
  const stroke = (drive: SwimDrive, bone: string) => peak(cycle('reef-manta', drive).map((pose) => pose[bone][2]));
  const left = { effort: 1, turn: .4, curvature: 0, climb: 0 };
  expect(stroke(left, 'WingR4')).toBeGreaterThan(stroke(left, 'WingL4'));
  expect(stroke({ ...CRUISE, climb: 1 }, 'WingL4')).toBeGreaterThan(stroke(CRUISE, 'WingL4'));
  const glide = cycle('reef-manta', { effort: .4, turn: 0, curvature: 0, climb: -.5 });
  expect(peak(glide.map((pose) => pose.WingL4[2]))).toBeLessThan(.6 * stroke(CRUISE, 'WingL4'));
  // Gliding wings are held in a shallow V.
  expect(glide.reduce((sum, pose) => sum + pose.WingL3[2], 0) / glide.length).toBeGreaterThan(0);
});

test('the ocean sunfish sculls with its dorsal and anal fins together while its disc stays stiff', () => {
  const poses = cycle('mola-mola');
  // Fin bones roll about the body axis. The dorsal fin points up and the anal fin down, so opposite
  // roll signs mean both tips swing to the same side at once.
  const together = poses.filter((pose) => Math.abs(pose.Dorsal1[2]) > .1).every((pose) => Math.sign(pose.Dorsal1[2]) === -Math.sign(pose.Anal1[2]) || Math.abs(pose.Anal1[2]) < .08);
  expect(together).toBe(true);
  const fin = peak(poses.map((pose) => pose.Dorsal1[2]));
  const body = Math.max(peak(poses.map((pose) => pose.Root[1])), peak(poses.map((pose) => pose.Root[2])));
  expect(fin).toBeGreaterThan(.3);
  expect(body).toBeLessThan(.12 * fin);
  // The clavus steers like a rudder.
  const mean = (list: Record<string, number[]>[], bone: string) => list.reduce((sum, pose) => sum + pose[bone][1], 0) / list.length;
  expect(mean(cycle('mola-mola', { effort: 1, turn: .4, curvature: 0, climb: 0 }), 'Clavus2')).toBeGreaterThan(mean(poses, 'Clavus2') + .1);
});

test('the green turtle flies in bouts of flipper strokes separated by glides', () => {
  const rig = createSwimRig('green-turtle', .4);
  const flipper = rig.bones.indexOf('FrontL1') * 3;
  let gliding = 0, stroking = 0, longestGlide = 0, glide = 0, previous = rig.rotation[flipper + 2];
  const dt = 1 / 30;
  for (let i = 0; i < 30 * 60; i++) {
    rig.step(dt, CRUISE);
    const flap = rig.rotation[flipper + 2];
    const moving = Math.abs(flap - previous) / dt > .05;
    previous = flap;
    if (moving) { stroking++; glide = 0; } else { gliding++; glide += dt; longestGlide = Math.max(longestGlide, glide); }
  }
  // Both states are common, and glides last for several seconds rather than flickering.
  expect(stroking / (stroking + gliding)).toBeGreaterThan(.3);
  expect(gliding / (stroking + gliding)).toBeGreaterThan(.2);
  expect(longestGlide).toBeGreaterThan(2);
  // While gliding, the front flippers hold swept back along the shell.
  const hold = createSwimRig('green-turtle');
  for (let i = 0; i < 30 * 30 && hold.rotation[flipper + 1] < .5; i++) hold.step(dt, CRUISE);
  expect(hold.rotation[flipper + 1]).toBeGreaterThan(.5);
});

