import { expect, test } from '@jest/globals';
import { createSwimRig, CRUISE, CUTTLEFISH_FINS, OCTOPUS_ARMS, octopusArmBone, OCTOPUS_SEGMENTS, RIG_EULER_ORDER, rigBones, strokeFrequency, SWIM_RIGS, type SwimDrive, type SwimRigModel } from '../marine-rigs';

const SHARKS = ['tiger-shark', 'whale-shark', 'great-white-shark', 'scalloped-hammerhead'] as const;
const REEF = ['day-octopus', 'giant-cuttlefish', 'giant-moray'] as const;
const ALL: SwimRigModel[] = [...SHARKS, 'reef-manta', 'mola-mola', 'green-turtle', 'bottlenose-dolphin', ...REEF];
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
/** Pitch of each spine segment relative to the body root (accumulated local pitch). */
const segmentPitch = (pose: Record<string, number[]>) => SPINE.map((_, i) => SPINE.slice(0, i + 1).reduce((sum, bone) => sum + pose[bone][0], 0));
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

test('the hammerhead sways more of its body than the great white, while its wide head stays steadier', () => {
  const frontShare = (model: SwimRigModel) => {
    const poses = cycle(model);
    return peak(poses.map((pose) => segmentYaw(pose)[1])) / peak(poses.map((pose) => segmentYaw(pose)[4]));
  };
  expect(frontShare('scalloped-hammerhead')).toBeGreaterThan(1.3 * frontShare('great-white-shark'));
  const head = (model: SwimRigModel) => peak(cycle(model).map((pose) => pose.Head[1]));
  expect(head('scalloped-hammerhead')).toBeLessThan(head('great-white-shark'));
  // The cephalofoil barely yaws: under a degree and a half either way.
  expect(head('scalloped-hammerhead')).toBeLessThan(.025);
  expect(strokeFrequency(SWIM_RIGS['scalloped-hammerhead'], 1)).toBeGreaterThan(strokeFrequency(SWIM_RIGS['tiger-shark'], 1));
  expect(strokeFrequency(SWIM_RIGS['scalloped-hammerhead'], 1)).toBeLessThan(strokeFrequency(SWIM_RIGS['great-white-shark'], 1));
});

test('the dolphin beats its flukes up and down: the spine pitches, growing toward the tail, and never yaws when swimming straight', () => {
  const poses = cycle('bottlenose-dolphin');
  const peaks = SPINE.map((_, i) => peak(poses.map((pose) => segmentPitch(pose)[i])));
  for (let i = 1; i < peaks.length; i++) expect(peaks[i]).toBeGreaterThan(peaks[i - 1]);
  expect(peaks[4]).toBeGreaterThan(.3);
  // Side to side, nothing moves: no yaw or roll anywhere along the body.
  for (const pose of poses) for (const bone of [...SPINE, 'Head', 'Root']) expect(Math.abs(pose[bone][1]) + Math.abs(pose[bone][2])).toBeLessThan(1e-9);
  // The head stays level, and the front body is steady.
  expect(peak(poses.map((pose) => pose.Head[0]))).toBeLessThan(.1 * peaks[4]);
  expect(peaks[0]).toBeLessThan(.15 * peaks[4]);
  // The fluke tips flex together, mirrored left and right.
  for (const pose of poses) expect(pose.FlukeR[2]).toBeCloseTo(-pose.FlukeL[2], 6);
  expect(peak(poses.map((pose) => pose.FlukeL[2]))).toBeGreaterThan(.05);
  // Its beat is quicker than any shark's.
  for (const shark of SHARKS) expect(strokeFrequency(SWIM_RIGS['bottlenose-dolphin'], 1)).toBeGreaterThan(strokeFrequency(SWIM_RIGS[shark], 1));
});

test('a dolphin bends sideways into a turn, and pitches its flippers up to climb', () => {
  const mean = (poses: Record<string, number[]>[], pick: (pose: Record<string, number[]>) => number) => poses.reduce((sum, pose) => sum + pick(pose), 0) / poses.length;
  const left = cycle('bottlenose-dolphin', { effort: 1, turn: .4, curvature: .8, climb: 0 });
  const straight = cycle('bottlenose-dolphin');
  expect(mean(left, (pose) => segmentYaw(pose)[4])).toBeLessThan(mean(straight, (pose) => segmentYaw(pose)[4]) - .02);
  expect(mean(left, (pose) => pose.Head[1])).toBeGreaterThan(0);
  const climbing = cycle('bottlenose-dolphin', { ...CRUISE, climb: 1 });
  expect(mean(climbing, (pose) => pose.PectoralL[0])).toBeLessThan(mean(straight, (pose) => pose.PectoralL[0]) - .1);
});

test('out of the water a dolphin stills its tail beat, stretches out and folds its flippers in; other species ignore it', () => {
  const swimming = cycle('bottlenose-dolphin'), flying = cycle('bottlenose-dolphin', { ...CRUISE, air: 1 });
  const beat = (poses: Record<string, number[]>[]) => peak(poses.map((pose) => segmentPitch(pose)[4]));
  expect(beat(flying)).toBeLessThan(beat(swimming) * .15);
  expect(peak(flying.map((pose) => pose.FlukeL[2]))).toBeLessThan(peak(swimming.map((pose) => pose.FlukeL[2])) * .15);
  // Flippers tuck against the flanks, mirrored.
  const mean = (poses: Record<string, number[]>[], pick: (pose: Record<string, number[]>) => number) => poses.reduce((sum, pose) => sum + pick(pose), 0) / poses.length;
  expect(mean(flying, (pose) => pose.PectoralL[2])).toBeGreaterThan(mean(swimming, (pose) => pose.PectoralL[2]) + .25);
  expect(mean(flying, (pose) => pose.PectoralR[2])).toBeLessThan(mean(swimming, (pose) => pose.PectoralR[2]) - .25);
  // Stepped, the change eases in rather than snapping.
  const rig = createSwimRig('bottlenose-dolphin');
  rig.step(1 / 60, CRUISE);
  const before = Array.from(rig.rotation);
  rig.step(1 / 60, { ...CRUISE, air: 1 });
  expect(Math.max(...Array.from(rig.rotation).map((v, i) => Math.abs(v - before[i])))).toBeLessThan(.05);
  for (const model of SHARKS) expect(cycle(model, { ...CRUISE, air: 1 })).toEqual(cycle(model));
});

/** Where an octopus arm's first segment points (rad from +Z toward +X, seen from above) in this pose: its rest direction turned by the bone's Z·X·Y rotation. */
function armHeading(pose: Record<string, number[]>, arm: (typeof OCTOPUS_ARMS)[number]) {
  expect(RIG_EULER_ORDER).toBe('ZXY');
  const [x, y, z] = pose[octopusArmBone(arm.name, 1)], vx = Math.sin(arm.angle), vz = Math.cos(arm.angle);
  const a = Math.cos(x), b = Math.sin(x), c = Math.cos(y), d = Math.sin(y), e = Math.cos(z), f = Math.sin(z);
  return Math.atan2((c * e - d * f * b) * vx + (d * e + c * f * b) * vz, -a * d * vx + a * c * vz);
}

test('the octopus walks on eight arms, each in its own rhythm, never in lockstep', () => {
  const poses = cycle('day-octopus', { ...CRUISE, ground: 1 }, 96);
  // Each arm reaches forward and back around its own direction...
  const swings = OCTOPUS_ARMS.map((arm) => poses.map((pose) => armHeading(pose, arm) - arm.angle));
  for (const swing of swings) expect(Math.max(...swing) - Math.min(...swing)).toBeGreaterThan(.05);
  // ...at its own moment: the arms reach their furthest forward at many different points in the stride.
  const peaks = new Set(swings.map((swing) => Math.round(swing.indexOf(Math.max(...swing)) / 6)));
  expect(peaks.size).toBeGreaterThanOrEqual(6);
  // Every segment of every arm moves.
  for (const { name } of OCTOPUS_ARMS) for (let s = 1; s <= OCTOPUS_SEGMENTS; s++) {
    const bone = octopusArmBone(name, s), ys = poses.map((pose) => pose[bone][1]);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(.01);
  }
});

test('a jetting octopus streams its arms together behind it; resting, it coils them and settles its mantle', () => {
  const rig = createSwimRig('day-octopus');
  const pose = () => Object.fromEntries(rig.bones.map((bone, b) => [bone, [rig.rotation[b * 3], rig.rotation[b * 3 + 1], rig.rotation[b * 3 + 2]]]));
  rig.sample(1, { ...CRUISE, ground: 1 });
  const walking = OCTOPUS_ARMS.map((arm) => Math.abs(armHeading(pose(), arm)));
  rig.sample(1, { ...CRUISE, jet: 1, ground: 0 });
  const jetting = OCTOPUS_ARMS.map((arm) => Math.abs(armHeading(pose(), arm)));
  // Jetting mantle first (toward -Z), every arm swings round toward +Z, the whole bundle within a narrow fan.
  expect(Math.max(...jetting)).toBeLessThan(.5);
  expect(jetting.reduce((a, b) => a + b)).toBeLessThan(walking.reduce((a, b) => a + b) * .25);
  const mantle = rig.bones.indexOf('Mantle');
  expect(rig.scale[mantle * 3]).toBeLessThan(1);
  rig.sample(1, { ...CRUISE, effort: .25, rest: 1, ground: 1 });
  // Resting, the tips curl to the side and up, the mantle lowers, and the body settles a touch.
  const tips = OCTOPUS_ARMS.map(({ name, angle }) => rig.rotation[rig.bones.indexOf(octopusArmBone(name, OCTOPUS_SEGMENTS)) * 3 + 1] * Math.sign(angle));
  expect(Math.min(...tips)).toBeGreaterThan(0);
  expect(rig.rotation[mantle * 3]).toBeLessThan(-.1);
  expect(rig.offset.y).toBeLessThan(0);
});

test("a cuttlefish ripples a wave backward along its fin skirt, softer while hovering, and folds it to jet", () => {
  const roll = (poses: Record<string, number[]>[], fin: string) => poses.map((pose) => pose[fin][2]);
  const cruising = cycle('giant-cuttlefish', CRUISE, 96), hovering = cycle('giant-cuttlefish', { ...CRUISE, effort: .25 }, 96);
  // The wave reaches each fin a little after the one in front of it: the peaks march toward the back.
  const peaks = CUTTLEFISH_FINS.map((_, i) => { const r = roll(cruising, `FinL${i + 1}`); return r.indexOf(Math.max(...r)); });
  const lags = peaks.slice(1).map((p, i) => ((p - peaks[i]) % 96 + 96) % 96);
  for (const lag of lags) expect(lag).toBeGreaterThan(0);
  // Left and right mirror each other, and hovering keeps the ripple gentler.
  const middle = `FinL${Math.ceil(CUTTLEFISH_FINS.length / 2)}`;
  expect(peak(roll(hovering, middle))).toBeLessThan(peak(roll(cruising, middle)));
  cruising.forEach((pose) => expect(pose[middle][2]).toBeCloseTo(-pose[middle.replace('L', 'R')][2], 5));
  // A jet folds the skirt down against the mantle and squeezes it.
  const rig = createSwimRig('giant-cuttlefish');
  rig.sample(0, { ...CRUISE, jet: 1 });
  const left = rig.bones.indexOf(middle), mantle = rig.bones.indexOf('Mantle');
  expect(rig.rotation[left * 3 + 2]).toBeLessThan(-.2);
  expect(rig.scale[mantle * 3]).toBeLessThan(1);
});

test('a resting moray breathes through its slowly opening mouth and lies still; swimming, a wave runs down its whole body', () => {
  const lateral = (poses: Record<string, number[]>[], bone: string) => peak(poses.map((pose) => pose[bone][1]));
  const resting = cycle('giant-moray', { ...CRUISE, effort: .25, rest: 1 }, 96), swimming = cycle('giant-moray', CRUISE, 96);
  // The jaw opens and closes with each breath, never past closed.
  const jaw = resting.map((pose) => pose.Jaw[0]);
  expect(Math.min(...jaw)).toBeGreaterThanOrEqual(0);
  expect(Math.max(...jaw) - Math.min(...jaw)).toBeGreaterThan(.15);
  // Swimming bends the body far more than resting does, more toward the tail than at the neck.
  expect(lateral(swimming, 'Body6')).toBeGreaterThan(lateral(resting, 'Body6') * 3);
  expect(lateral(swimming, 'Body7')).toBeGreaterThan(lateral(swimming, 'Body2'));
});
