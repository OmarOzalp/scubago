import { expect, test } from '@jest/globals';
import { shoreDistance, shorePolygons } from '../island-outline';
import { createMarineMotion, MOVEMENT, WORLD, type MarineMember } from '../marine-motion';
import { OCEAN } from '../ocean';
import { sampleDive } from '../ocean-depth';
import type { MarineModel } from '../swimming';

const SIX: MarineModel[] = ['whale-shark', 'great-white-shark', 'tiger-shark', 'reef-manta', 'mola-mola', 'green-turtle'];
/** Every species with its own model, as the showcase shows them. */
const SPECIES: MarineModel[] = [...SIX, 'scalloped-hammerhead', 'bottlenose-dolphin'];
const school = (models: MarineModel[]): MarineMember[] => models.map((model, lane) => ({ model, lane }));
const frameEdge = (x: number, z: number) => ((x / WORLD.x) ** 6 + (z / WORLD.z) ** 6) ** (1 / 6);

/** Separation of two footprint ellipses (negative when they overlap), from projected gaps over many axes. */
function footprintGap(a: { x: number; z: number; heading: number; m: { halfLength: number; halfWidth: number } }, b: typeof a) {
  const reach = (p: typeof a, ux: number, uz: number) => Math.hypot(
    p.m.halfLength * (ux * Math.sin(p.heading) + uz * Math.cos(p.heading)), p.m.halfWidth * (ux * Math.cos(p.heading) - uz * Math.sin(p.heading)));
  let best = -Infinity;
  for (let k = 0; k < 36; k++) {
    const t = Math.PI * k / 36, ux = Math.cos(t), uz = Math.sin(t);
    best = Math.max(best, Math.abs((b.x - a.x) * ux + (b.z - a.z) * uz) - reach(a, ux, uz) - reach(b, ux, uz));
  }
  return best;
}

test('animals stay in view and clear of the island and islets, at every level and school size', () => {
  for (const level of [1, 6]) {
    const [main, ...islets] = shorePolygons(level);
    for (const count of [2, 8]) {
      const members = school(Array.from({ length: count }, (_, i) => SPECIES[i % SPECIES.length]));
      const motion = createMarineMotion(members, level);
      for (let frame = 0; frame < 4800; frame++) {
        motion.step(.05, true);
        if (frame % 8) continue;
        for (const { lane } of members) {
          const pose = motion.get(lane)!, seen = motion.inspect(lane)!;
          expect(Object.values(pose).every(Number.isFinite)).toBe(true);
          // Judged where the camera shows it: inside the frame (a whale shark rounding a level 6 islet may
          // swing briefly into the haze at the corner), and its center well off the beach.
          expect(frameEdge(seen.x, seen.z)).toBeLessThan(level > 4 ? 1.35 : 1.15);
          expect(shoreDistance([main], seen.x, seen.z)).toBeGreaterThan(seen.m.islandClearance - .75);
          expect(shoreDistance([main], seen.x, seen.z)).toBeGreaterThan(seen.m.halfWidth * .85);
          if (islets.length) expect(shoreDistance(islets, seen.x, seen.z)).toBeGreaterThan(seen.m.halfWidth * .5);
        }
      }
    }
  }
});

test('turns build and settle smoothly at simulator frame rates', () => {
  const members = school(SPECIES);
  const motion = createMarineMotion(members, 1);
  for (let frame = 0; frame < 2400; frame++) {
    const before = members.map(({ lane }) => ({ ...motion.get(lane)! }));
    motion.step(.05, true);
    before.forEach((p, i) => {
      const next = motion.get(members[i].lane)!, m = MOVEMENT[members[i].model];
      // Never faster than the species' top turn rate, and turning speeds up or eases off gradually.
      expect(Math.abs(Math.atan2(Math.sin(next.heading - p.heading), Math.cos(next.heading - p.heading)))).toBeLessThanOrEqual(m.turnRate * .05 + 1e-6);
      expect(Math.abs(next.turn - p.turn)).toBeLessThan(m.turnRate * .5);
      expect(Math.abs(next.bank - p.bank)).toBeLessThan(.03);
      expect(Math.hypot(next.x - p.x, next.z - p.z)).toBeLessThan(m.cruise * (1 + m.swing + .08) * (1 + m.surge) * .05 + 1e-6);
    });
  }
});

test('pause freezes the school and a background frame cannot teleport it', () => {
  const motion = createMarineMotion(school(SIX.slice(0, 3)));
  const before = { ...motion.get(0)! };
  motion.step(200, false);
  expect(motion.get(0)).toEqual(before);
  motion.step(200, true);
  expect(Math.hypot(motion.get(0)!.x - before.x, motion.get(0)!.z - before.z)).toBeLessThan(.03);
  expect(motion.clock()).toBeCloseTo(.05, 5);
});

test('each species moves with its own personality', () => {
  const stats = Object.fromEntries(SPECIES.map((model) => {
    const motion = createMarineMotion([{ model, lane: 0 }]);
    let speed = 0, bank = 0, turn = 0, surge = 0, low = Infinity, high = -Infinity, tilt = Infinity, radius = Infinity;
    for (let frame = 0; frame < 12000; frame++) {
      motion.step(.05, true);
      if (frame < 200) continue;
      const p = motion.get(0)!;
      speed += p.speed / 11800;
      bank = Math.max(bank, Math.abs(p.bank - MOVEMENT[model].tilt));
      tilt = Math.min(tilt, p.bank);
      turn = Math.max(turn, Math.abs(p.turn));
      // The tightest turning circle it swims (radius, units).
      if (Math.abs(p.turn) > .05) radius = Math.min(radius, p.speed / Math.abs(p.turn));
      surge = Math.max(surge, p.pace);
      low = Math.min(low, p.y); high = Math.max(high, p.y);
      expect([p.pace, p.climb, p.turn, p.speed].every(Number.isFinite)).toBe(true);
    }
    return [model, { speed, bank, turn, surge, tilt, radius, drift: high - low }];
  }));
  const whale = stats['whale-shark'], manta = stats['reef-manta'], tiger = stats['tiger-shark'], white = stats['great-white-shark'];
  const mola = stats['mola-mola'], turtle = stats['green-turtle'], hammer = stats['scalloped-hammerhead'], dolphin = stats['bottlenose-dolphin'];
  // Drifting sunfish, slow whale shark, gliding manta, calm turtle, medium tiger shark and hammerhead,
  // medium-fast dolphin, fastest great white.
  expect(mola.speed).toBeLessThan(whale.speed);
  expect(whale.speed).toBeLessThan(manta.speed);
  expect(manta.speed).toBeLessThan(turtle.speed);
  expect(turtle.speed).toBeLessThan(tiger.speed);
  expect(tiger.speed).toBeLessThan(hammer.speed);
  expect(hammer.speed).toBeLessThan(dolphin.speed);
  expect(dolphin.speed).toBeLessThan(white.speed);
  // The whale shark and sunfish turn most reluctantly; of the heavy sharks the great white turns hardest
  // and surges; the hammerhead turns in tighter circles than any other shark; the dolphin is the most agile.
  expect(Math.max(whale.turn, mola.turn)).toBeLessThan(Math.min(manta.turn, tiger.turn, white.turn, turtle.turn, hammer.turn, dolphin.turn));
  expect(white.turn).toBeGreaterThan(Math.max(whale.turn, manta.turn, tiger.turn, mola.turn, turtle.turn));
  expect(hammer.radius).toBeLessThan(Math.min(white.radius, tiger.radius, whale.radius) * .85);
  expect(dolphin.turn).toBeGreaterThan(Math.max(...SIX.map((model) => stats[model].turn), hammer.turn));
  expect(white.surge).toBeGreaterThan(1.25);
  expect(whale.surge).toBeLessThan(1.15);
  expect(dolphin.surge).toBeGreaterThan(white.surge);
  // The manta banks deepest; the whale shark barely rolls; the sunfish stays on its side; the hammerhead and
  // dolphin bank moderately.
  expect(manta.bank).toBeGreaterThan(Math.max(whale.bank, tiger.bank, white.bank, turtle.bank, mola.bank, hammer.bank, dolphin.bank));
  expect(whale.bank).toBeLessThan(.1);
  expect(mola.tilt).toBeGreaterThan(.75);
  expect(Math.min(hammer.bank, dolphin.bank)).toBeGreaterThan(white.bank);
  // The manta rises and falls the most of the sharks and rays; the dolphin most of all (it comes up to breathe).
  expect(manta.drift).toBeGreaterThan(Math.max(whale.drift, tiger.drift, white.drift, hammer.drift));
  expect(dolphin.drift).toBeGreaterThan(2 * Math.max(...SIX.map((model) => stats[model].drift), hammer.drift));
});

test('each species keeps its own distance from the island', () => {
  const [main] = shorePolygons(1);
  const offshore = Object.fromEntries(SPECIES.map((model) => {
    const motion = createMarineMotion([{ model, lane: 0 }]);
    let sum = 0, closest = Infinity;
    for (let frame = 0; frame < 6000; frame++) {
      motion.step(.05, true);
      const seen = motion.inspect(0)!, distance = shoreDistance([main], seen.x, seen.z);
      sum += distance / 6000;
      closest = Math.min(closest, distance);
    }
    // Alone, an animal never comes inside its clearance.
    expect(closest).toBeGreaterThan(MOVEMENT[model].islandClearance - .05);
    return [model, sum];
  }));
  expect(offshore['whale-shark']).toBeGreaterThan(Math.max(offshore['great-white-shark'], offshore['reef-manta'], offshore['tiger-shark'], offshore['green-turtle']));
  expect(offshore['great-white-shark']).toBeGreaterThan(offshore['tiger-shark']);
  expect(offshore['mola-mola']).toBeGreaterThan(offshore['tiger-shark']);
  expect(offshore['tiger-shark']).toBeGreaterThan(offshore['green-turtle']);
  // The hammerhead comes closer in than the whale shark, and the dolphin closer still.
  expect(offshore['whale-shark']).toBeGreaterThan(offshore['scalloped-hammerhead']);
  expect(offshore['scalloped-hammerhead']).toBeGreaterThan(offshore['bottlenose-dolphin']);
});

test('simulator and device frame rates produce the same movement', () => {
  const low = createMarineMotion(school(SIX.slice(0, 3))), high = createMarineMotion(school(SIX.slice(0, 3)));
  for (let i = 0; i < 2400; i++) low.step(1 / 20, true);
  for (let i = 0; i < 7200; i++) high.step(1 / 60, true);
  for (let lane = 0; lane < 3; lane++) {
    const a = low.get(lane)!, b = high.get(lane)!;
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(.02);
  }
});

test('a great white passes a whale shark instead of trailing it', () => {
  const motion = createMarineMotion(school(['whale-shark', 'great-white-shark']));
  const progress = [0, 0], last = [NaN, NaN];
  let trailing = 0, longest = 0;
  for (let frame = 0; frame < 12000; frame++) {
    motion.step(.05, true);
    const whale = motion.get(0)!, white = motion.get(1)!;
    [whale, white].forEach((p, i) => {
      const angle = Math.atan2(p.z, p.x);
      if (!Number.isNaN(last[i])) progress[i] += Math.abs(Math.atan2(Math.sin(angle - last[i]), Math.cos(angle - last[i])));
      last[i] = angle;
    });
    const dx = whale.x - white.x, dz = whale.z - white.z;
    const behind = Math.hypot(dx, dz) < 3.5 && dx * Math.sin(white.heading) + dz * Math.cos(white.heading) > 0 && Math.cos(whale.heading - white.heading) > .7;
    trailing = behind ? trailing + .05 : 0;
    longest = Math.max(longest, trailing);
  }
  expect(progress[1]).toBeGreaterThan(progress[0] * 1.4);
  expect(longest).toBeLessThan(30);
});

test('smaller, nimbler animals make most of the room', () => {
  // How far each shifts from where it would like to be, over ten minutes of encounters.
  const motion = createMarineMotion(school(['whale-shark', 'great-white-shark']));
  const moved = [0, 0];
  for (let frame = 0; frame < 12000; frame++) {
    motion.step(.05, true);
    [0, 1].forEach((lane) => { const seen = motion.inspect(lane)!; moved[lane] += Math.abs(seen.lane - seen.band); });
  }
  expect(moved[1]).toBeGreaterThan(moved[0] * 2);
});

test('the visiting whale shark and manta never collide at the same depth', () => {
  const members = [{ model: 'whale-shark' as const, lane: 0 }, { model: 'reef-manta' as const, lane: 2 }];
  const motion = createMarineMotion(members);
  for (let frame = 0; frame < 12000; frame++) {
    motion.step(.05, true);
    const t = motion.clock();
    if (members.some(({ lane }) => sampleDive(t, lane, 2).opacity < .4)) continue;
    const a = motion.inspect(0)!, b = motion.inspect(2)!;
    // Where their footprints meet, the manta glides clearly above the whale shark.
    if (footprintGap(a, b) < 0) expect(Math.abs(motion.get(0)!.y - motion.get(2)!.y)).toBeGreaterThan(.25);
  }
});

test('a crowd of eight keeps apart or passes at different depths', () => {
  const members = school(['shark', 'manta', 'reef-fish', 'whale-shark', 'shark', 'reef-fish', 'manta', 'tiger-shark']);
  const motion = createMarineMotion(members, 3);
  let clashes = 0, seenFrames = 0;
  for (let frame = 0; frame < 6000; frame++) {
    motion.step(.05, true);
    const t = motion.clock();
    for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) {
      if (sampleDive(t, members[i].lane, 8).opacity < .4 || sampleDive(t, members[j].lane, 8).opacity < .4) continue;
      seenFrames++;
      const a = motion.inspect(members[i].lane)!, b = motion.inspect(members[j].lane)!;
      if (footprintGap(a, b) < -.3 && Math.abs(motion.get(members[i].lane)!.y - motion.get(members[j].lane)!.y) < .15) clashes++;
    }
  }
  expect(clashes / seenFrames).toBeLessThan(.02);
});

test('the eight species together keep apart or pass at different depths', () => {
  const members = school(SPECIES);
  const motion = createMarineMotion(members, 1);
  let clashes = 0, seenFrames = 0;
  for (let frame = 0; frame < 6000; frame++) {
    motion.step(.05, true);
    const t = motion.clock();
    for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) {
      if (sampleDive(t, members[i].lane, 8).opacity < .4 || sampleDive(t, members[j].lane, 8).opacity < .4) continue;
      seenFrames++;
      const a = motion.inspect(members[i].lane)!, b = motion.inspect(members[j].lane)!;
      if (footprintGap(a, b) < -.3 && Math.abs(motion.get(members[i].lane)!.y - motion.get(members[j].lane)!.y) < .15) clashes++;
    }
  }
  expect(clashes / seenFrames).toBeLessThan(.02);
});

test('the dolphin comes up to breathe now and then, just below the surface, and never next to a dive', () => {
  const m = MOVEMENT['bottlenose-dolphin'], top = OCEAN.surfaceLevel - m.breathe!.clearance;
  for (const count of [1, 4]) {
    const members = school(['bottlenose-dolphin', 'whale-shark', 'tiger-shark', 'reef-manta'].slice(0, count) as MarineModel[]);
    const motion = createMarineMotion(members, 1);
    let breaths = 0, up = false, highest = -Infinity, frames = 0, near = 0, climb = 0;
    for (let frame = 0; frame < 12000; frame++) {
      motion.step(.05, true);
      const pose = motion.get(0)!, dive = sampleDive(motion.clock(), 0, count), y = pose.y + dive.y;
      highest = Math.max(highest, y);
      frames++;
      if (y > top - .15) near++;
      // Up for a breath: well above anywhere it swims otherwise (even rising to pass another animal), and
      // only while up in the water.
      if (y > top - .1) {
        expect(dive.depth).toBe(0);
        if (!up) breaths++;
        up = true;
      } else if (y < top - .2) up = false;
      climb = Math.max(climb, Math.abs(pose.climb));
      expect(Number.isFinite(y)).toBe(true);
    }
    // About one breath every half minute while up in the water, each brief, reaching just below the surface.
    expect(breaths).toBeGreaterThanOrEqual(6);
    expect(breaths).toBeLessThanOrEqual(24);
    expect(highest).toBeLessThanOrEqual(top + .01);
    expect(highest).toBeGreaterThan(top - .05);
    expect(near / frames).toBeLessThan(.2);
    expect(climb).toBeGreaterThan(.5);
  }
  // Other species never come up to the surface.
  const whale = createMarineMotion([{ model: 'whale-shark', lane: 0 }]);
  for (let frame = 0; frame < 6000; frame++) {
    whale.step(.05, true);
    expect(whale.get(0)!.y + sampleDive(whale.clock(), 0, 1).y).toBeLessThan(-.7);
  }
});
