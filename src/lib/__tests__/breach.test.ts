import { expect, test } from '@jest/globals';
import { breachFlight, breachHeight, DOLPHIN_BREACH } from '../breach';
import { shorePolygons, shoreDistance } from '../island-outline';
import { createMarineMotion, MOVEMENT, type MarineMember, type MarineMotion } from '../marine-motion';
import { OCEAN } from '../ocean';
import { sampleDive, SWIM_LEVEL } from '../ocean-depth';
import { frame, viewHeight, worldFor } from '../steering';

const C = DOLPHIN_BREACH, SURFACE = OCEAN.surfaceLevel - SWIM_LEVEL;
const dolphin = (lane: number, group = 1): MarineMember => ({ model: 'bottlenose-dolphin', lane, group });
const CROWD: MarineMember[] = [dolphin(0, 3), { model: 'whale-shark', lane: 1 }, { model: 'tiger-shark', lane: 2 }, { model: 'green-turtle', lane: 3 }, { model: 'reef-manta', lane: 4 }];

type Leap = { lane: number; stages: { stage: string; at: number }[] };
/** Runs a scene at `fps` for `seconds`, recording each leap's stages as they begin; `each` sees every frame. */
function watch(members: MarineMember[], level: number, seconds: number, options: { seed?: number; leap?: number; fps?: number } = {},
  each: (motion: MarineMotion) => void = () => {}) {
  const motion = createMarineMotion(members, level, { seed: options.seed ?? .37, leap: options.leap });
  const leaps: Leap[] = [], open = new Map<number, Leap>(), fps = options.fps ?? 20;
  for (let frame = 0; frame < seconds * fps; frame++) {
    motion.step(1 / fps, true);
    for (const { lane } of motion.swimmers) {
      const stage = motion.inspect(lane)!.leap?.stage;
      let leap = open.get(lane);
      if (stage && !leap) { leap = { lane, stages: [] }; open.set(lane, leap); leaps.push(leap); }
      if (leap && stage && leap.stages[leap.stages.length - 1]?.stage !== stage) leap.stages.push({ stage, at: motion.clock() });
      if (leap && !stage) { leap.stages.push({ stage: 'done', at: motion.clock() }); open.delete(lane); }
    }
    each(motion);
  }
  return { motion, leaps, flown: leaps.filter((leap) => leap.stages.some((s) => s.stage === 'air')) };
}

test('a leap is one smooth arc: the run-up, the flight and the plunge meet without a kink', () => {
  const level = .15, { rise, speed } = breachFlight();
  const at = (stage: 'build' | 'air' | 'reentry', t: number) => breachHeight(stage, t, level, SURFACE);
  // From its depth at rest, to the surface at the leap's rising speed; back down as fast; home at rest.
  expect(at('build', 0)[0]).toBeCloseTo(level, 9);
  expect(at('build', 0)[1]).toBeCloseTo(0, 9);
  expect(at('build', C.build)[0]).toBeCloseTo(SURFACE, 9);
  expect(at('build', C.build)[1]).toBeCloseTo(rise, 9);
  expect(at('air', 0)[0]).toBeCloseTo(SURFACE, 9);
  expect(at('air', C.air)[0]).toBeCloseTo(SURFACE, 9);
  expect(at('air', C.air)[1]).toBeCloseTo(-rise, 9);
  expect(at('reentry', 0)[1]).toBeCloseTo(-rise, 9);
  expect(at('reentry', C.reentry)[0]).toBeCloseTo(level, 9);
  expect(at('reentry', C.reentry)[1]).toBeCloseTo(0, 9);
  // The apex is `apex` above the calm surface, halfway through the flight; it leaves the water at a leap's angle.
  expect(at('air', C.air / 2)[0]).toBeCloseTo(SURFACE + C.apex, 9);
  expect(Math.atan2(rise, speed)).toBeGreaterThan(.6);
  expect(Math.atan2(rise, speed)).toBeLessThan(1.15);
  // The run-up dips a little before sweeping up, and the plunge carries it below its depth before it
  // eases back up: never a jump in between.
  let dip = Infinity, plunge = Infinity, step = 0, last = level;
  for (const [stage, duration] of [['build', C.build], ['air', C.air], ['reentry', C.reentry]] as const) {
    for (let k = 0; k <= 200; k++) {
      const [y] = at(stage, duration * k / 200);
      step = Math.max(step, Math.abs(y - last));
      last = y;
      if (stage === 'build') dip = Math.min(dip, y);
      if (stage === 'reentry') plunge = Math.min(plunge, y);
    }
  }
  expect(dip).toBeLessThan(level - .02);
  expect(dip).toBeGreaterThan(level - .35);
  expect(plunge).toBeLessThan(level - .15);
  expect(plunge).toBeGreaterThan(level - .6);
  expect(step).toBeLessThan(.04);
});

test('leaps are rare: about one breath in three at most, never rolled per frame, and replayed by the same seed', () => {
  const run = (seed: number, fps: number) => watch([dolphin(0)], 6, 1500, { seed, fps });
  const a = run(.37, 20), b = run(.37, 60), c = run(.81, 20), d = run(.12, 20);
  // Breaths while up in the water (dives take the rest): one every `every` seconds.
  const breaths = 1500 / MOVEMENT['bottlenose-dolphin'].breathe!.every * .6;
  for (const visit of [a, c, d]) expect(visit.flown.length).toBeLessThan(breaths * .35);
  expect(a.flown.length + c.flown.length + d.flown.length).toBeGreaterThanOrEqual(3);
  // Decided once per breath on the fixed simulation clock: any frame rate gives the very same leaps, and
  // another visit (seed) gives others.
  const starts = (run: typeof a) => run.leaps.map((leap) => `${leap.lane}@${leap.stages[0].at.toFixed(1)}`);
  expect(starts(b)).toEqual(starts(a));
  expect(starts(c)).not.toEqual(starts(a));
});

test('a leap happens only where there is room: off the island, in the clear middle of the view, clear of others, never by a dive', () => {
  let airborne = 0;
  for (const level of [1, 6]) {
    const [main] = shorePolygons(level), world = worldFor(level), scale = world.x / worldFor(1).x;
    watch(CROWD, level, 600, { leap: 1 }, (motion) => {
      for (const { lane } of motion.swimmers) {
        const seen = motion.inspect(lane)!;
        if (seen.leap?.stage !== 'air') continue;
        airborne++;
        const pose = motion.get(lane)!, y = pose.y + motion.dive(lane).y;
        expect(motion.dive(lane).depth).toBe(0);
        expect(shoreDistance([main], seen.x, seen.z)).toBeGreaterThan(MOVEMENT['bottlenose-dolphin'].islandClearance + C.islandMargin - .15);
        expect(frame(seen.x, seen.z, world).edge).toBeLessThan(C.frameEdge + .03);
        expect(Math.abs(viewHeight(y, pose.z, scale))).toBeLessThan(C.view + .03);
        // Every other animal, its own pod included, well clear of the arc.
        for (const other of motion.swimmers) {
          if (other.lane === lane || motion.dive(other.lane).opacity < .1) continue;
          const o = motion.get(other.lane)!, m = MOVEMENT[other.model];
          expect(Math.hypot(o.x - pose.x, o.z - pose.z)).toBeGreaterThan(m.halfWidth + .26);
        }
      }
    });
  }
  expect(airborne).toBeGreaterThan(20 * 2);
});

test('once airborne a leap always completes, and a pod has one leaper at a time with a rest between leaps', () => {
  const { flown, leaps } = watch([dolphin(0, 3)], 3, 1500, { leap: .5 }, (motion) => {
    const leaping = motion.swimmers.filter(({ lane }) => { const s = motion.inspect(lane)!.leap?.stage; return s && s !== 'settle'; });
    expect(leaping.length).toBeLessThanOrEqual(1);
  });
  expect(flown.length).toBeGreaterThanOrEqual(6);
  // Every member of the pod gets to leap now and then.
  expect(new Set(flown.map((leap) => leap.lane)).size).toBeGreaterThanOrEqual(2);
  for (const leap of flown) {
    const names = leap.stages.map((s) => s.stage), at = (stage: string) => leap.stages.find((s) => s.stage === stage)?.at ?? NaN;
    if (names[names.length - 1] !== 'done') continue;
    expect(names).toEqual(['build', 'air', 'reentry', 'done']);
    // Stages are seen at frame times, a frame (.05 s) apart at most from when they began.
    expect(Math.abs(at('air') - at('build') - C.build)).toBeLessThan(.06);
    expect(Math.abs(at('reentry') - at('air') - C.air)).toBeLessThan(.06);
    expect(Math.abs(at('done') - at('reentry') - C.reentry)).toBeLessThan(.06);
  }
  // A called-off run-up only ever ends in an ordinary breath, before it leaves the water.
  for (const leap of leaps.filter((l) => l.stages.some((s) => s.stage === 'settle'))) {
    expect(leap.stages.map((s) => s.stage)).toEqual(expect.arrayContaining(['build', 'settle']));
    expect(leap.stages.some((s) => s.stage === 'air')).toBe(false);
  }
  const done = flown.filter((leap) => leap.stages.some((s) => s.stage === 'done')).map((leap) => ({ start: leap.stages[0].at, end: leap.stages[leap.stages.length - 1].at }));
  for (let i = 1; i < done.length; i++) expect(done[i].start - done[i - 1].end).toBeGreaterThanOrEqual(C.cooldown - .1);
});

test('the body pitches up out of the water, is clear of it at the apex, and dives back in nose first', () => {
  let exits = 0, entries = 0, apexes = 0;
  watch([dolphin(0)], 6, 900, { leap: 1 }, (motion) => {
    const seen = motion.inspect(0)!, pose = motion.get(0)!, y = pose.y + motion.dive(0).y;
    if (!seen.leap || seen.leap.stage === 'settle') {
      expect(pose.air).toBe(0);
      return;
    }
    if (seen.leap.stage !== 'air') return;
    const t = seen.leap.since;
    if (t < .12) { exits++; expect(pose.pitch).toBeLessThan(-.5); }
    if (t > C.air - .12) { entries++; expect(pose.pitch).toBeGreaterThan(.5); }
    if (Math.abs(t - C.air / 2) < .03) {
      apexes++;
      // Its middle well above the water, and the rig told it is out: the tail beat stills.
      expect(y).toBeGreaterThan(OCEAN.surfaceLevel + C.apex * .8);
      expect(pose.air).toBeGreaterThan(.99);
      expect(Math.abs(pose.pitch)).toBeLessThan(.3);
    }
  });
  expect(Math.min(exits, entries, apexes)).toBeGreaterThan(0);
});

test('each leap leaves a splash where it breaks the surface, a stronger one where it lands', () => {
  const seenSplashes = new Set<number>();
  const records: { at: number; x: number; z: number; strength: number }[] = [];
  const { flown, motion } = watch([dolphin(0)], 6, 900, { leap: 1 }, (m) => {
    for (const splash of m.splashes) if (Number.isFinite(splash.time) && !seenSplashes.has(splash.time)) {
      seenSplashes.add(splash.time);
      records.push({ at: splash.time, x: splash.x, z: splash.z, strength: splash.strength });
    }
  });
  expect(motion.splashes.length).toBe(8);
  const complete = flown.filter((leap) => leap.stages.some((s) => s.stage === 'reentry'));
  expect(records.length).toBe(complete.length * 2);
  for (const leap of complete) {
    const exit = leap.stages.find((s) => s.stage === 'air')!.at, entry = leap.stages.find((s) => s.stage === 'reentry')!.at;
    const out = records.find((r) => Math.abs(r.at - exit) < .06), back = records.find((r) => Math.abs(r.at - entry) < .06);
    expect(out?.strength).toBe(C.splash.exit);
    expect(back?.strength).toBe(C.splash.reentry);
    // The two splashes are the leap's length apart.
    expect(Math.hypot(back!.x - out!.x, back!.z - out!.z)).toBeCloseTo(C.length, 0);
  }
});

test('a dolphin never leaps by a dive, and other species never leap', () => {
  watch([dolphin(0), { model: 'whale-shark', lane: 1 }, { model: 'scalloped-hammerhead', lane: 2, group: 2 }], 4, 600, { leap: 1 }, (motion) => {
    for (const { lane, model } of motion.swimmers) {
      const leap = motion.inspect(lane)!.leap;
      if (model !== 'bottlenose-dolphin') expect(leap).toBeNull();
      else if (leap && leap.stage !== 'settle') expect(sampleDive(motion.clock(), 0, 3).depth).toBe(0);
    }
  });
});
