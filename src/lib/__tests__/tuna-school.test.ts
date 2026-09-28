import { afterEach, expect, test } from '@jest/globals';
import { createShoreField, shoreDistance, shorePolygons } from '../island-outline';
import { createMarineMotion, MOVEMENT, WORLD, type MarineMotion } from '../marine-motion';
import { apparentShift, worldFor, type World } from '../steering';
import type { MarineModel } from '../swimming';
import { attackRoll, createTunaSchool, GREAT_WHITE_HUNT, TUNA_SCHOOL, type TunaSchool } from '../tuna-school';

const frameEdge = (x: number, z: number, world: World = WORLD) => ((x / world.x) ** 6 + (z / world.z) ** 6) ** (1 / 6);
const probability = GREAT_WHITE_HUNT.attackProbability;
afterEach(() => { GREAT_WHITE_HUNT.attackProbability = probability; });

/** A scene with these animals and the school, stepped at 60 fps for `seconds`; `each` sees every frame. */
function run(models: MarineModel[], level: number, seconds: number, seed: number, each: (motion: MarineMotion, school: TunaSchool, time: number) => void = () => {}) {
  const motion = createMarineMotion(models.map((model, lane) => ({ model, lane })), level, { school: true, seed });
  for (let frame = 1; frame <= seconds * 60; frame++) {
    motion.step(1 / 60, true);
    each(motion, motion.school!, frame / 60);
  }
  return motion;
}

/** The fish in the school's largest group (fish linked by gaps under 1 unit). */
function largestGroup(school: TunaSchool) {
  const { x, z } = school.pose, seen = new Set<number>();
  let best: number[] = [];
  for (let i = 0; i < school.size; i++) {
    if (seen.has(i)) continue;
    const open = [i], group: number[] = [];
    seen.add(i);
    while (open.length) {
      const a = open.pop()!;
      group.push(a);
      for (let j = 0; j < school.size; j++) if (!seen.has(j) && Math.hypot(x[a] - x[j], z[a] - z[j]) < 1) { seen.add(j); open.push(j); }
    }
    if (group.length > best.length) best = group;
  }
  return best;
}
/** Share of the fish in the school's largest group. */
const together = (school: TunaSchool) => largestGroup(school).length / school.size;
/** Whether a fish is inside the school's tap target, where the camera shows it at the target's depth. */
function inTarget(school: TunaSchool, i: number) {
  const area = school.hitArea, { x, y, z } = school.pose, hx = Math.sin(area.heading), hz = Math.cos(area.heading);
  const dx = x[i] - area.x, dz = z[i] - area.z + apparentShift(y[i] - area.y) - apparentShift(0);
  return ((dx * hx + dz * hz) / area.along) ** 2 + ((dx * hz - dz * hx) / area.across) ** 2 <= 1;
}

test('the school holds together, in view, off the island and islets, and below the surface', () => {
  for (const level of [1, 6]) {
    const [main, ...islets] = shorePolygons(level);
    for (const seed of [.2, .7]) {
      let samples = 0, whole = 0, finite = true, edge = 0, shore = Infinity, islet = Infinity, top = -Infinity;
      run([], level, 150, seed, (_, school, time) => {
        if (Math.round(time * 60) % 60) return;
        const { x, y, z } = school.pose;
        for (let i = 0; i < school.size; i++) {
          finite &&= [x[i], y[i], z[i]].every(Number.isFinite);
          // Judged where the camera shows it, like the large animals.
          const seenZ = z[i] + apparentShift(y[i] + .94);
          // Inside this level's ocean area, which grows with the island.
          edge = Math.max(edge, frameEdge(x[i], seenZ, worldFor(level)));
          shore = Math.min(shore, shoreDistance([main], x[i], seenZ));
          if (islets.length) islet = Math.min(islet, shoreDistance(islets, x[i], seenZ));
          top = Math.max(top, y[i]);
        }
        samples++;
        if (together(school) >= .9) whole++;
      });
      expect(finite).toBe(true);
      expect(edge).toBeLessThan(1.02);
      expect(shore).toBeGreaterThan(TUNA_SCHOOL.fishClearance - .05);
      expect(islet).toBeGreaterThan(.15);
      expect(top).toBeLessThan(-.45);
      expect(whole / samples).toBeGreaterThan(.95);
    }
  }
});

test('tuna turn, speed up and roll within what a tuna can do, even when fleeing', () => {
  GREAT_WHITE_HUNT.attackProbability = 1;
  const last = { x: new Float32Array(TUNA_SCHOOL.size), z: new Float32Array(TUNA_SCHOOL.size), heading: new Float32Array(TUNA_SCHOOL.size) };
  let speed = 0, turn = 0, pitch = 0, roll = 0, panicked = false;
  run(['great-white-shark', 'whale-shark'], 1, 150, .4, (_, school, time) => {
    const p = school.pose;
    panicked ||= school.state.mood === 'panic';
    for (let i = 0; i < school.size; i++) {
      if (time > .1) {
        speed = Math.max(speed, Math.hypot(p.x[i] - last.x[i], p.z[i] - last.z[i]) * 60);
        turn = Math.max(turn, Math.abs(Math.atan2(Math.sin(p.heading[i] - last.heading[i]), Math.cos(p.heading[i] - last.heading[i]))) * 60);
      }
      pitch = Math.max(pitch, Math.abs(p.pitch[i])); roll = Math.max(roll, Math.abs(p.roll[i]));
      last.x[i] = p.x[i]; last.z[i] = p.z[i]; last.heading[i] = p.heading[i];
    }
  });
  expect(panicked).toBe(true);
  expect(speed).toBeLessThan(TUNA_SCHOOL.panicSpeed * 1.06 * 1.05);
  expect(turn).toBeLessThanOrEqual(TUNA_SCHOOL.panicTurnRate + .06);
  expect(pitch).toBeLessThanOrEqual(.36);
  expect(roll).toBeLessThanOrEqual(.46);
});

test('a whale shark is flowed around without alarm, and a tiger shark only puts the school on alert', () => {
  const moods = (model: MarineModel) => {
    const seen = new Set<string>();
    let fear = 0;
    run([model], 1, 300, .3, (_, school) => { seen.add(school.state.mood); fear = Math.max(fear, school.state.fear); });
    return { seen, fear };
  };
  const whale = moods('whale-shark');
  expect(whale.fear).toBeLessThan(.1);
  expect([...whale.seen]).toEqual(['calm']);
  const tiger = moods('tiger-shark');
  expect(tiger.seen.has('alert')).toBe(true);
  expect(tiger.seen.has('panic')).toBe(false);
  expect(tiger.fear).toBeLessThan(.35);
});

test('a hammerhead puts the school on alert and scatters the fish it passes close to, but never hunts it; a dolphin causes no alarm', () => {
  const watch = (model: MarineModel, seed: number) => {
    const seen = new Set<string>();
    let fear = 0, alert = 0;
    const motion = run([model], 1, 300, seed, (_, school) => { seen.add(school.state.mood); fear = Math.max(fear, school.state.fear); alert = Math.max(alert, school.state.alert); });
    return { seen, fear, alert, hunt: motion.hunt(0) };
  };
  for (const seed of [.3, .7]) {
    const hammer = watch('scalloped-hammerhead', seed), tiger = watch('tiger-shark', seed);
    expect(hammer.hunt).toBeNull();
    expect(hammer.seen.has('alert')).toBe(true);
    expect(hammer.seen.has('panic')).toBe(false);
    // A stronger startle than a tiger shark's close pass, still short of panic.
    expect(hammer.fear).toBeGreaterThan(tiger.fear);
    expect(hammer.fear).toBeLessThan(.5);
    expect(hammer.alert).toBeGreaterThan(tiger.alert);
    const dolphin = watch('bottlenose-dolphin', seed);
    expect([...dolphin.seen]).toEqual(['calm']);
    expect(dolphin.fear).toBeLessThan(.1);
  }
});

test('a great white that does not attack only puts the school on alert', () => {
  GREAT_WHITE_HUNT.attackProbability = 0;
  const seen = new Set<string>();
  let charges = 0;
  const motion = run(['great-white-shark'], 1, 400, .3, (m, school) => {
    seen.add(school.state.mood);
    if (m.hunt(0)!.phase === 'charge') charges++;
  });
  expect(motion.hunt(0)!.encounters).toBeGreaterThan(3);
  expect(charges).toBe(0);
  expect(seen.has('alert')).toBe(true);
  expect(seen.has('panic')).toBe(false);
});

test('a charge drives through the school, which scatters and regroups, and the shark rests before the next', () => {
  GREAT_WHITE_HUNT.attackProbability = 1;
  const cruise = MOVEMENT['great-white-shark'].cruise;
  type Charge = { start: number; end: number; top: number; closest: number; panicked: boolean; after?: number };
  const charges: Charge[] = [];
  let phase = 'normal', current: Charge | null = null, exitEnd = -1, restSpeed = 0;
  run(['great-white-shark'], 1, 600, .6, (motion, school, time) => {
    const hunt = motion.hunt(0)!, shark = motion.get(0)!;
    if (hunt.phase !== phase) {
      if (hunt.phase === 'charge') charges.push(current = { start: time, end: 0, top: 0, closest: Infinity, panicked: false });
      if (phase === 'charge' && current) current.end = time;
      if (phase === 'exit') exitEnd = time;
      phase = hunt.phase;
    }
    if (current && (hunt.phase === 'charge' || time < current.end + 2)) {
      if (hunt.phase === 'charge') {
        current.top = Math.max(current.top, shark.speed);
        current.closest = Math.min(current.closest, Math.hypot(shark.x - school.state.centerX, shark.z - school.state.centerZ));
      }
      if (school.state.mood === 'panic') current.panicked = true;
    }
    if (current?.end && current.after === undefined && time >= current.end + 12) current.after = together(school);
    // Back to cruising after the charge: the next few seconds after the exit.
    if (exitEnd > 0 && time > exitEnd + 3 && time < exitEnd + 3.1) restSpeed = Math.max(restSpeed, shark.speed);
  });
  expect(charges.length).toBeGreaterThanOrEqual(3);
  for (let k = 1; k < charges.length; k++) expect(charges[k].start - charges[k - 1].end).toBeGreaterThanOrEqual(GREAT_WHITE_HUNT.cooldown);
  const done = charges.filter((c) => c.after !== undefined);
  // Noticeably faster than cruising (never a missile: at most chargeSpeed x cruise), and through or close by the school.
  for (const c of charges) {
    expect(c.top).toBeGreaterThan(cruise * 1.6);
    expect(c.top).toBeLessThanOrEqual(cruise * GREAT_WHITE_HUNT.chargeSpeed * 1.05);
    expect(c.panicked).toBe(true);
  }
  expect(charges.filter((c) => c.closest < 1.3).length / charges.length).toBeGreaterThanOrEqual(.7);
  // Regrouped a dozen seconds later (most of the time: a charge can leave a few stragglers).
  expect(done.filter((c) => c.after! >= .8).length / done.length).toBeGreaterThanOrEqual(.7);
  expect(restSpeed).toBeLessThan(cruise * 1.35);
});

test('about one encounter in five becomes a charge, decided once when the encounter begins', () => {
  // The roll itself, over many hunters, seeds and encounters.
  let rolls = 0, hits = 0;
  for (let lane = 0; lane < 6; lane++) {
    for (let s = 0; s < 40; s++) {
      for (let encounter = 1; encounter <= 60; encounter++) { rolls++; if (attackRoll(lane, s / 40, encounter)) hits++; }
    }
  }
  expect(hits / rolls).toBeGreaterThan(.18);
  expect(hits / rolls).toBeLessThan(.22);
  // In the scene: an encounter's decision never changes to an attack while it lasts.
  for (const seed of [.15, .55]) {
    let phase = 'normal', attack = false;
    run(['great-white-shark', 'reef-manta'], 1, 400, seed, (motion) => {
      const hunt = motion.hunt(0)!;
      if (hunt.phase === 'encounter' && phase !== 'encounter') {
        expect(hunt.attack).toBe(attackRoll(0, seed, hunt.encounters));
        attack = hunt.attack;
      } else if (hunt.phase === 'encounter') {
        if (!attack) expect(hunt.attack).toBe(false);
        attack = hunt.attack;
      }
      phase = hunt.phase;
    });
  }
});

test('the school moves the same at simulator and device frame rates, and can be left out', () => {
  const low = createMarineMotion([{ model: 'whale-shark', lane: 0 }], 1, { school: true, seed: .5 });
  const high = createMarineMotion([{ model: 'whale-shark', lane: 0 }], 1, { school: true, seed: .5 });
  for (let i = 0; i < 1200; i++) low.step(1 / 20, true);
  for (let i = 0; i < 3600; i++) high.step(1 / 60, true);
  expect(Math.hypot(low.school!.state.centerX - high.school!.state.centerX, low.school!.state.centerZ - high.school!.state.centerZ)).toBeLessThan(.05);
  expect(createMarineMotion([], 1, { school: 20 }).school!.size).toBe(20);
  expect(createMarineMotion([], 1).school).toBeNull();
  expect(createMarineMotion([], 1, { school: 0 }).school).toBeNull();
});

test('the tap target sits on the school, turned along it, from the first frame', () => {
  const school = createTunaSchool(createShoreField(1), { seed: .5 });
  const check = () => {
    const { x, z } = school.pose, area = school.hitArea;
    let mx = 0, mz = 0;
    for (let i = 0; i < school.size; i++) { mx += x[i]; mz += z[i]; }
    // A school that is together: the target's middle is the fish's middle, and every fish is inside it.
    expect(together(school)).toBe(1);
    expect(Math.hypot(area.x - mx / school.size, area.z - mz / school.size)).toBeLessThan(1e-4);
    for (let i = 0; i < school.size; i++) expect(inTarget(school, i)).toBe(true);
    // Longer along the school's way than across it.
    const travel = Math.atan2(school.state.velocityX, school.state.velocityZ);
    expect(Math.abs(Math.sin(area.heading - travel))).toBeLessThan(.35);
    expect(area.along).toBeGreaterThan(area.across);
  };
  check();
  for (let k = 0; k < 20; k++) {
    for (let s = 0; s < 30; s++) school.step(1 / 30, []);
    school.publish(1);
    check();
  }
});

test('the tap target follows the school through calm, alert, panic and regrouping, at a comfortable, bounded size', () => {
  GREAT_WHITE_HUNT.attackProbability = 1;
  const [min, max] = TUNA_SCHOOL.hitSize;
  for (const seed of [.3, .6]) {
    const moods = new Set<string>();
    let bounded = true, calm = 0, covered = 0, centered = 0, scattered = 0, kept = 0, least = 1, frames = 0, jumps = 0, lastX = NaN, lastZ = NaN, area = 0, widest = 0;
    run(['great-white-shark', 'whale-shark', 'tiger-shark'], 1, 240, seed, (_, school, time) => {
      const target = school.hitArea;
      // It moves with the school, smoothly: only a school splitting in two moves it across at once.
      if (Math.hypot(target.x - lastX, target.z - lastZ) > .1) jumps++;
      frames++; lastX = target.x; lastZ = target.z;
      if (Math.round(time * 60) % 10) return;
      const mood = school.state.mood;
      moods.add(mood);
      bounded &&= [target.x, target.y, target.z, target.heading].every(Number.isFinite)
        && target.along <= max && target.across >= min && target.across <= target.along;
      widest = Math.max(widest, target.along);
      // Over the main body of the school, never left behind where the school was.
      const group = largestGroup(school), share = group.filter((i) => inTarget(school, i)).length / group.length;
      let inside = 0;
      for (let i = 0; i < school.size; i++) if (inTarget(school, i)) inside++;
      least = Math.min(least, inside / school.size);
      if (mood === 'calm') {
        let gx = 0, gz = 0;
        for (const i of group) { gx += school.pose.x[i]; gz += school.pose.z[i]; }
        calm++;
        if (share >= .9) covered++;
        if (Math.hypot(gx / group.length - target.x, gz / group.length - target.z) < .25) centered++;
        area = Math.max(area, Math.PI * target.along * target.across);
      } else if (mood === 'panic' || mood === 'recover') {
        scattered++;
        if (share >= .85) kept++;
      }
    });
    expect(bounded).toBe(true);
    expect([...moods].sort()).toEqual(['alert', 'calm', 'panic', 'recover']);
    expect(covered / calm).toBeGreaterThan(.95);
    expect(centered / calm).toBeGreaterThan(.95);
    expect(kept / scattered).toBeGreaterThan(.9);
    expect(least).toBeGreaterThan(.35);
    expect(jumps / frames).toBeLessThan(.001);
    // Generous, but never more than a small part of the ocean (about 110 square units in view): a
    // stretched or scattered school reaches the largest size and no further.
    expect(area).toBeLessThanOrEqual(Math.PI * max * max);
    expect(widest).toBe(max);
  }
});

test('a school of one fish still has a target comfortable to tap, on the fish', () => {
  const school = createTunaSchool(createShoreField(1), { seed: .2, size: 1 });
  for (let s = 0; s < 90; s++) school.step(1 / 30, []);
  school.publish(1);
  const area = school.hitArea, [min] = TUNA_SCHOOL.hitSize;
  expect([area.along, area.across]).toEqual([min, min]);
  expect(area.x).toBeCloseTo(school.pose.x[0], 5);
  expect(area.z).toBeCloseTo(school.pose.z[0], 5);
});
