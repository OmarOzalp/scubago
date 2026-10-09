import { expect, test } from '@jest/globals';
import { islandScale, islets, SEABED_PROPS, shoreDistance, shorePolygons } from '../island-outline';
import { createMarineMotion, MOVEMENT, type MarineMember } from '../marine-motion';
import { seabedProfile, shelfStretch } from '../ocean';
import { SWIM_LEVEL } from '../ocean-depth';
import { createReefLife, isReefModel, REEF, REEF_ROCK, REEF_SIZE, REEF_SPECIES, reefRocks, visitorGap, type ReefModel, type ReefVisitor } from '../reef-life';
import type { MarineModel } from '../swimming';

const REEF_MODELS = Object.keys(REEF_SPECIES) as ReefModel[];
/** Open-water animals that come close to the reef, a pod and the tuna school included. */
const VISITORS: MarineMember[] = [
  { model: 'great-white-shark', lane: 0 }, { model: 'tiger-shark', lane: 1 }, { model: 'whale-shark', lane: 2 },
  { model: 'bottlenose-dolphin', lane: 3, group: 3 }, { model: 'green-turtle', lane: 4 },
];
const DWELLERS: MarineMember[] = [{ model: 'day-octopus', lane: 5 }, { model: 'giant-cuttlefish', lane: 6 }, { model: 'giant-moray', lane: 7 }];

/** The seabed's own distance from the shore (as the seabed is drawn) and the bottom's height there. */
function ground(level: number, x: number, z: number) {
  const d = shoreDistance(shorePolygons(level), x, z), reach = d > 0 ? d / shelfStretch(x, z) : d;
  return { reach, floor: seabedProfile(reach).floor };
}
/** Distance from the shore of where something at world height `y` appears (see apparentShift). */
const apparent = (level: number, x: number, z: number, y: number) => shoreDistance(shorePolygons(level), x, z + .4 - .5 * (y - SWIM_LEVEL + .02));

test('the three reef species live on the reef, each with its habitat, size and behavior', () => {
  for (const model of REEF_MODELS) {
    expect(isReefModel(model)).toBe(true);
    expect(MOVEMENT[model].habitat).not.toBe('open-water');
  }
  expect(MOVEMENT['day-octopus'].habitat).toBe('seabed');
  expect(MOVEMENT['giant-cuttlefish'].habitat).toBe('reef-edge');
  expect(MOVEMENT['giant-moray'].habitat).toBe('crevice');
  // Every other species is open water, steered by marine-motion.ts.
  for (const model of Object.keys(MOVEMENT) as MarineModel[]) {
    if (!isReefModel(model)) expect(MOVEMENT[model].habitat ?? 'open-water').toBe('open-water');
  }
  expect(REEF_SIZE['giant-moray']).toBeGreaterThan(REEF_SIZE['day-octopus']);
});

test('open-water animals and the tuna school move exactly as they would without the reef animals', () => {
  const alone = createMarineMotion(VISITORS, 2, { school: true, seed: .4 });
  const shared = createMarineMotion([...VISITORS, ...DWELLERS], 2, { school: true, seed: .4 });
  for (let frame = 0; frame < 2400; frame++) {
    alone.step(.05, true);
    shared.step(.05, true);
    if (frame % 40) continue;
    for (const swimmer of alone.swimmers) {
      expect(shared.get(swimmer.lane)).toEqual(alone.get(swimmer.lane));
      expect(shared.dive(swimmer.lane)).toEqual(alone.dive(swimmer.lane));
    }
    // The school never sees them: its fish are exactly where they would be.
    expect(shared.school!.state.centerX).toBe(alone.school!.state.centerX);
    expect(shared.school!.state.centerZ).toBe(alone.school!.state.centerZ);
  }
  // The reef animals are drawn with the rest, each a lone animal (no pods or pairs).
  expect(shared.swimmers.filter((s) => isReefModel(s.model)).map((s) => [s.lane, s.leader, s.index])).toEqual([[5, 5, 0], [6, 6, 0], [7, 7, 0]]);
});

test('each keeps to its habitat at every level: the octopus on the shelf, the cuttlefish over the reef edge, the moray at its dens', () => {
  for (const level of [1, 6]) {
    const motion = createMarineMotion([...VISITORS, ...DWELLERS], level, { school: true, seed: .7 });
    const seen = { octopus: 0, cuttlefish: 0, moray: 0 };
    for (let frame = 0; frame < 7200; frame++) {
      motion.step(1 / 30, true);
      if (frame % 30) continue;
      for (const { model, lane } of DWELLERS) {
        const pose = motion.get(lane)!, world = pose.y + SWIM_LEVEL;
        expect([pose.x, pose.y, pose.z, pose.heading, pose.pace, pose.turn, ...pose.tone!, ...pose.hide!].every(Number.isFinite)).toBe(true);
        expect(motion.dive(lane).depth).toBe(0);
        const { reach, floor } = ground(level, pose.x, pose.z);
        if (model === 'day-octopus') {
          // On the shelf, its arms clear of the beach as the camera sees it, on the bottom (a little higher in a jet).
          expect(reach).toBeGreaterThan(REEF.octopus.reach[0] - .06);
          // (a jet may carry it a little past the edge of its patch before it stops)
          expect(reach).toBeLessThan(REEF.octopus.reach[1] + .1);
          expect(apparent(level, pose.x, pose.z, world)).toBeGreaterThan(REEF.octopus.clear - .08);
          expect(world - floor).toBeGreaterThan(0);
          expect(world - floor).toBeLessThan(.25);
          expect(pose.hide).toEqual([0, 0]);
          seen.octopus++;
        } else if (model === 'giant-cuttlefish') {
          // Over the reef edge, higher in the water, never on the bottom or out over the deep.
          expect(reach).toBeGreaterThan(REEF.cuttlefish.reach[0] - .2);
          expect(reach).toBeLessThan(REEF.cuttlefish.reach[1] + .25);
          expect(world).toBeGreaterThan(REEF.cuttlefish.height[0] - .05);
          expect(world).toBeLessThan(REEF.cuttlefish.height[1] + .08);
          expect(world - floor).toBeGreaterThan(REEF.cuttlefish.floor * .5);
          seen.cuttlefish++;
        } else if (Math.max(...pose.hide!) < .99) {
          // Whatever of the moray is in sight lies on the shelf near the island.
          const head = { x: pose.x + Math.sin(pose.heading) * REEF_SIZE['giant-moray'] / 2, z: pose.z + Math.cos(pose.heading) * REEF_SIZE['giant-moray'] / 2 };
          const out = pose.hide![1] > 0 ? null : head;
          if (out) expect(ground(level, out.x, out.z).reach).toBeGreaterThan(.45);
          if (out) expect(ground(level, out.x, out.z).reach).toBeLessThan(1.05);
          // On the bottom (judged under its middle, which may be in the rock while it slides in or out).
          expect(world - floor).toBeLessThan(.35);
          seen.moray++;
        }
      }
    }
    expect(seen.octopus).toBeGreaterThan(0);
    expect(seen.cuttlefish).toBeGreaterThan(0);
    expect(seen.moray).toBeGreaterThan(0);
  }
});

test('the reef rocks sit on the shelf, clear of the corals, the reef rock, the islets and each other, at every level', () => {
  for (let level = 1; level <= 6; level++) {
    const { dens, rocks } = reefRocks(level, 2, 3), all = [...dens.flat(), ...rocks], s = islandScale(level);
    for (const rock of all) {
      const { reach, floor } = ground(level, rock.x, rock.z);
      expect(reach).toBeGreaterThan(.6);
      expect(reach).toBeLessThan(1);
      expect(rock.floor).toBeCloseTo(floor, 2);
      for (const [px, pz] of Object.values(SEABED_PROPS)) expect(Math.hypot(px * s - rock.x, pz * s - rock.z)).toBeGreaterThan(.65);
      for (const islet of islets(level)) expect(Math.hypot(islet.position[0] * s - rock.x, islet.position[1] * s - rock.z)).toBeGreaterThan(1.2);
      for (const other of all) if (other !== rock) expect(Math.hypot(other.x - rock.x, other.z - rock.z)).toBeGreaterThan(1.15);
      expect(Math.hypot(rock.dirX, rock.dirZ)).toBeCloseTo(1, 6);
    }
    // A moray's two dens face each other along the coast, far enough apart for it to come all the way out between them.
    for (const [a, b] of dens) {
      expect(Math.hypot(a.spotX - b.spotX, a.spotZ - b.spotZ)).toBeGreaterThan(REEF_SIZE['giant-moray'] * 1.05);
      expect(a.dirX * (b.x - a.x) + a.dirZ * (b.z - a.z)).toBeGreaterThan(0);
      expect(b.dirX * (a.x - b.x) + b.dirZ * (a.z - b.z)).toBeGreaterThan(0);
      for (const den of [a, b]) expect(Math.hypot(den.spotX - den.x, den.spotZ - den.z)).toBeCloseTo(REEF_ROCK.mouth, 6);
    }
    // An octopus rests beside its rock, clear of it.
    for (const rock of rocks) expect(Math.hypot(rock.spotX - rock.x, rock.spotZ - rock.z)).toBeCloseTo(REEF_ROCK.rest, 6);
  }
});

/** Count each animal's behaviors over `seconds` of a reef on its own, with these visitors standing by. */
function watch(models: ReefModel[], seconds: number, visitors: ReefVisitor[] = [], level = 1) {
  const members = models.map((model, i) => ({ model, lane: i }));
  const reef = createReefLife(members, level, { seed: .25 });
  const states = members.map(() => new Map<string, number>()), changes = members.map(() => [] as string[]);
  for (let frame = 0; frame < seconds * 60; frame++) {
    reef.step(1 / 60, visitors);
    members.forEach(({ lane }, i) => {
      const { state } = reef.inspect(lane)!;
      states[i].set(state, (states[i].get(state) ?? 0) + 1 / 60);
      if (changes[i][changes[i].length - 1] !== state) changes[i].push(state);
    });
  }
  reef.publish(1);
  return { reef, states, changes };
}

test('the octopus walks its patch of shelf, rests by its rock, and now and then jets a short way, mantle first', () => {
  const { states, changes } = watch(['day-octopus'], 900);
  const time = (state: string) => states[0].get(state) ?? 0;
  expect(time('rest')).toBeGreaterThan(120);
  expect(time('crawl')).toBeGreaterThan(120);
  // Resting by its rock is common but not most of the time.
  expect(time('rest')).toBeLessThan(600);
  // Short jets now and then: lining up, the push, a glide, settling back down; never more often than its cooldown allows.
  const jets = changes[0].filter((s) => s === 'jet').length;
  expect(jets).toBeGreaterThanOrEqual(1);
  expect(jets).toBeLessThanOrEqual(900 / REEF.octopus.jet.cooldown);
  const order = changes[0].join(' ');
  expect(order).toContain('aim jet glide settle');
});

test('a large shark passing close above makes the octopus still, flat and darker; it carries on once the shark has gone', () => {
  const reef = createReefLife([{ model: 'day-octopus', lane: 0 }], 1, { seed: .25 });
  for (let frame = 0; frame < 30 * 60 && reef.inspect(0)!.state !== 'crawl'; frame++) reef.step(1 / 60, []);
  expect(reef.inspect(0)!.state).toBe('crawl');
  for (let frame = 0; frame < 60; frame++) reef.step(1 / 60, []);
  reef.publish(1);
  const walking = { ...reef.get(0)!, tone: [...reef.get(0)!.tone!] };
  const pose = reef.get(0)!;
  // A great white right over it (apparent position: shifted toward the viewer like the open-water animals').
  const shark: ReefVisitor = { x: pose.x, z: pose.z + .24, hx: 1, hz: 0, threat: 1, size: 1.15, width: .45, presence: 1 };
  for (let frame = 0; frame < 4 * 60; frame++) reef.step(1 / 60, [shark]);
  reef.publish(1);
  const wary = reef.get(0)!;
  expect(reef.inspect(0)!.alarm).toBe(1);
  expect(wary.speed).toBeLessThan(.01);
  expect(wary.rest).toBeGreaterThan(.5);
  expect(wary.tone![0]).toBeLessThan(walking.tone[0] - .1);
  // A dolphin is not a large shark: no alarm.
  const after = createReefLife([{ model: 'day-octopus', lane: 0 }], 1, { seed: .25 });
  const dolphin: ReefVisitor = { ...shark, threat: .65, size: .8 };
  for (let frame = 0; frame < 4 * 60; frame++) after.step(1 / 60, [dolphin]);
  expect(after.inspect(0)!.alarm).toBe(0);
  // Once the shark has gone, it relaxes again.
  for (let frame = 0; frame < 2 * 60; frame++) reef.step(1 / 60, []);
  expect(reef.inspect(0)!.alarm).toBe(0);
});

test('the cuttlefish hovers and glides over its reef edge, and a predator close by sends it jetting away, darker and bolder', () => {
  const calm = watch(['giant-cuttlefish'], 600);
  const time = (state: string) => calm.states[0].get(state) ?? 0;
  expect(time('hover')).toBeGreaterThan(100);
  expect(time('cruise')).toBeGreaterThan(100);
  // Unprompted jets are rare.
  expect(calm.changes[0].filter((s) => s === 'push').length).toBeLessThanOrEqual(600 / REEF.cuttlefish.jet.every[0] + 1);

  const reef = createReefLife([{ model: 'giant-cuttlefish', lane: 0 }], 1, { seed: .25 });
  reef.step(1 / 60, []);
  const at = reef.inspect(0)!;
  const shark: ReefVisitor = { x: at.x + .5, z: at.z + .2, hx: 0, hz: 1, threat: 1, size: 1.15, width: .45, presence: 1 };
  const states = new Set<string>();
  let darkest = 1, boldest = 1, fastest = 0;
  for (let frame = 0; frame < 3 * 60; frame++) {
    reef.step(1 / 60, [shark]);
    reef.publish(1);
    const pose = reef.get(0)!;
    states.add(reef.inspect(0)!.state);
    darkest = Math.min(darkest, pose.tone![0]); boldest = Math.max(boldest, pose.tone![2]); fastest = Math.max(fastest, pose.speed);
  }
  expect([...states]).toEqual(expect.arrayContaining(['brace', 'push', 'coast']));
  expect(darkest).toBeLessThan(.9);
  expect(boldest).toBeGreaterThan(1.4);
  expect(fastest).toBeGreaterThan(REEF.cuttlefish.cruise * 3);
  // It jetted away from the shark, backward (mantle first).
  const after = reef.inspect(0)!;
  expect(Math.hypot(after.x - shark.x, after.z - shark.z)).toBeGreaterThan(Math.hypot(at.x - shark.x, at.z - shark.z));
});

test('the moray lies in its den with its head out, now and then moving to its other den along the shelf', () => {
  const { reef, states, changes } = watch(['giant-moray'], 900);
  const time = (state: string) => states[0].get(state) ?? 0;
  expect(time('den')).toBeGreaterThan(400);
  // A move: out of the den, along the shelf, head first into the other den, round out of sight, and out again.
  expect(changes[0].join(' ')).toContain('den leave swim approach go-in inside come-out den');
  expect(reef.inspect(0)!.den === 0 || reef.inspect(0)!.den === 1).toBe(true);

  // In its den, the body goes into the rock right at the den's mouth.
  const moray = createReefLife([{ model: 'giant-moray', lane: 0 }], 1, { seed: .25 });
  moray.step(1 / 60, []);
  moray.publish(1);
  const pose = moray.get(0)!, info = moray.inspect(0)!, den = info.dens[info.den];
  const length = REEF_SIZE['giant-moray'], along = pose.hide![0];
  const cutX = pose.x + Math.sin(pose.heading) * (along - .5) * length, cutZ = pose.z + Math.cos(pose.heading) * (along - .5) * length;
  expect(Math.hypot(cutX - den.spotX, cutZ - den.spotZ)).toBeLessThan(.01);
  expect(along).toBeGreaterThan(.45);
  expect(along).toBeLessThan(.6);
  expect(pose.rest).toBeGreaterThan(.9);
});

test('a large animal very close sends the moray back into its den; it comes out again once the water is clear', () => {
  const reef = createReefLife([{ model: 'giant-moray', lane: 0 }], 1, { seed: .25 });
  reef.step(1 / 60, []);
  reef.publish(1);
  const before = reef.get(0)!.hide![0], info = reef.inspect(0)!, den = info.dens[info.den];
  const head = { x: den.spotX + den.dirX * .4, z: den.spotZ + den.dirZ * .4 };
  // A whale shark (large, harmless) brushing right past its head counts; a turtle (small) does not.
  const turtle: ReefVisitor = { x: head.x, z: head.z + .2, hx: 1, hz: 0, threat: .1, size: .55, width: .6, presence: 1 };
  for (let frame = 0; frame < 3 * 60; frame++) reef.step(1 / 60, [turtle]);
  expect(reef.inspect(0)!.state).toBe('den');
  const whale: ReefVisitor = { ...turtle, threat: .3, size: 1.4 };
  for (let frame = 0; frame < 3 * 60; frame++) reef.step(1 / 60, [whale]);
  reef.publish(1);
  expect(reef.inspect(0)!.state).toBe('retreat');
  expect(reef.get(0)!.hide![0]).toBeGreaterThan(before + .2);
  for (let frame = 0; frame < 20 * 60; frame++) reef.step(1 / 60, []);
  reef.publish(1);
  expect(reef.inspect(0)!.state).toBe('den');
  expect(reef.get(0)!.hide![0]).toBeCloseTo(REEF.moray.inside, 1);
});

test('new reef discoveries arrive their own way: the octopus edges out by its rock, the cuttlefish glides in from the deep side, the moray comes out of its den', () => {
  const members = DWELLERS.map(({ model }, lane) => ({ model: model as ReefModel, lane }));
  const reef = createReefLife(members, 1, { seed: .25, arriving: [0, 1, 2] });
  for (const { lane } of members) {
    expect(reef.arrival(lane)!.stage).toBe('offstage');
    expect(reef.dive(lane).visible).toBe(false);
    expect(reef.dive(lane).opacity).toBe(0);
  }
  for (const { lane } of members) expect(reef.arrive(lane)).toBe(true);
  // Already on its way: not again.
  expect(reef.arrive(0)).toBe(false);
  expect(reef.inspect(0)!.state).toBe('emerge');
  expect(reef.inspect(1)!.state).toBe('enter');
  expect(reef.inspect(2)!.state).toBe('inside');
  const start = { x: reef.inspect(1)!.x, z: reef.inspect(1)!.z };
  let arrived = 0;
  for (let frame = 0; frame < 30 * 60 && arrived < 3; frame++) {
    reef.step(1 / 60, []);
    arrived = members.filter(({ lane }) => reef.arrival(lane)!.stage === 'arrived').length;
  }
  expect(arrived).toBe(3);
  for (const { lane } of members) expect(reef.dive(lane)).toMatchObject({ depth: 0, opacity: 1, visible: true });
  // The cuttlefish came in toward the island from deeper water.
  const now = reef.inspect(1)!;
  expect(ground(1, now.x, now.z).reach).toBeLessThan(ground(1, start.x, start.z).reach);
  // Put straight in place (reduced motion): settled at once.
  const instant = createReefLife(members, 1, { arriving: [2] });
  expect(instant.arrive(2, { instant: true })).toBe(true);
  expect(instant.arrival(2)!.stage).toBe('arrived');
  expect(instant.inspect(2)!.state).toBe('den');
});

test('a new level moves the rocks out with the island, and the animals with them', () => {
  const motion = createMarineMotion(DWELLERS, 1, { seed: .25 });
  motion.step(1, true);
  // Copies: poses are updated in place.
  const moray = { ...motion.get(7)! }, octopus = { ...motion.get(5)! };
  motion.setLevel(5);
  motion.step(1 / 60, true);
  const ratio = islandScale(5) / islandScale(1);
  // The moray stays in its den, its body still entering the rock at the den's (moved) mouth.
  const info = motion.reef!.inspect(7)!, den = info.dens[info.den], pose = motion.get(7)!;
  expect(info.state).toBe('den');
  const along = pose.hide![0], length = REEF_SIZE['giant-moray'];
  expect(Math.hypot(pose.x + Math.sin(pose.heading) * (along - .5) * length - den.spotX, pose.z + Math.cos(pose.heading) * (along - .5) * length - den.spotZ)).toBeLessThan(.02);
  expect(Math.hypot(pose.x, pose.z)).toBeCloseTo(Math.hypot(moray.x, moray.z) * ratio, 0);
  expect(Math.hypot(motion.get(5)!.x, motion.get(5)!.z)).toBeGreaterThan(Math.hypot(octopus.x, octopus.z));
});

test('a footprint gap measures to the body, not just its middle', () => {
  const shark: ReefVisitor = { x: 0, z: 0, hx: 1, hz: 0, threat: 1, size: 1, width: .4, presence: 1 };
  // Off the nose, the side and the tail.
  expect(visitorGap(shark, 1.5, 0)).toBeCloseTo(.1, 6);
  expect(visitorGap(shark, 0, 1)).toBeCloseTo(.6, 6);
  expect(visitorGap(shark, -1, .6)).toBeCloseTo(.2, 6);
});
