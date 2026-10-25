import { expect, test } from '@jest/globals';
import { islandOf, residentsOf } from '../archipelago';
import { islandScale, SEABED_PROPS } from '../island-outline';
import { groupSizes, GROUP_STYLES } from '../marine-groups';
import { MOVEMENT } from '../marine-motion';
import { OCEAN, reefCrestAt, reefShape, seabedProfile, wallMeasure } from '../ocean';
import { CORAL, coralHeads, jettyBoat } from '../reef-coast';
import { REEF_ANEMONE, reefRocks } from '../reef-life';
import { marineModelFor } from '../swimming';

const NEW = ['grey-reef-shark', 'blacktip-reef-shark', 'whitetip-reef-shark', 'hawksbill-turtle', 'napoleon-wrasse', 'bumphead-parrotfish'] as const;
const { rise, top, edge, foot, height } = OCEAN.reefCrest;
/** A point off the reef, away from its boat passes (radians about the island's middle). */
const at = (angle: number, r = 3) => ({ x: Math.cos(angle) * r, z: Math.sin(angle) * r });
const open = at(.9), pass = at(OCEAN.reefShape.passes[0]);

test('round the Coral Reef the shelf runs on as a lagoon to a crest just under the surface, then drops away; other islands are as they were', () => {
  // Out to the shelf's edge, the same beach and shelf as any island's.
  for (const reach of [-.1, 0, .2, .5]) expect(seabedProfile(reach, OCEAN, open)).toEqual(seabedProfile(reach));
  // The lagoon: the shelf's floor, where another island's would be dropping away.
  for (const reach of [.8, 1, 1.15]) {
    expect(seabedProfile(reach, OCEAN, open).floor).toBeCloseTo(OCEAN.seabed.shelfFloor, 5);
    expect(seabedProfile(reach).floor).toBeLessThan(OCEAN.seabed.shelfFloor);
  }
  // The crest: up to just under the surface, never through it, wherever it wanders.
  let highest = -Infinity;
  for (let a = 0; a < Math.PI * 2; a += .05) {
    for (let reach = rise; reach < foot; reach += .02) {
      const { floor, depth } = seabedProfile(reach, OCEAN, at(a));
      expect(floor).toBeLessThan(OCEAN.surfaceLevel);
      expect(depth).toBeGreaterThan(0);
      highest = Math.max(highest, floor);
    }
  }
  expect(highest).toBeCloseTo(height, 2);
  // Past it, the deep, and the water deepening on into the open ocean.
  expect(seabedProfile(foot + .5, OCEAN, open).floor).toBeLessThan(OCEAN.seabed.shelfFloor - OCEAN.seabed.floorDrop + .01);
  expect(seabedProfile(4, OCEAN, open).depth).toBeGreaterThan(2);
  // Through a pass, the lagoon's floor runs on out over where the crest would be.
  expect(seabedProfile((top + edge) / 2, OCEAN, pass).floor).toBeLessThan(OCEAN.surfaceLevel - .35);
});

test('round an islet\'s reef the wall falls from right at the crest\'s outer edge, more steeply, and turns into the main island\'s where the reefs meet', () => {
  const { wall, isletWall } = OCEAN.reefCrest, deep = OCEAN.seabed.shelfFloor - OCEAN.seabed.floorDrop - OCEAN.reefCrest.drop;
  // The main island's wall is where the reef's measure is `wall`; an islet's where it is `isletWall`; in between, in between, and nowhere a jump.
  expect(wallMeasure(1.5)).toBeCloseTo(1.5, 9);
  expect(wallMeasure(isletWall[0], 1)).toBeCloseTo(wall[0], 9);
  expect(wallMeasure(isletWall[1], 1)).toBeCloseTo(wall[1], 9);
  for (let d = 1.6; d < 2.4; d += .05) {
    for (let islet = 0; islet < 1; islet += .1) {
      // (from where an islet's wall begins out, the more an islet's it is, the farther down its wall a place is)
      if (d >= isletWall[0]) expect(wallMeasure(d, islet + .1)).toBeGreaterThanOrEqual(wallMeasure(d, islet) - 1e-9);
      expect(Math.abs(wallMeasure(d, islet + .1) - wallMeasure(d, islet))).toBeLessThan(.12);
    }
  }
  // The crest and its shoulder as they were (the coral's outer edge is at `edge` of the measure, the shelf's reach less how far the crest wanders);
  // just past the islet's wall, the deep floor, where the main island's is only beginning to fall.
  const { shift } = reefShape(open.x, open.z);
  for (let reach = .5; reach <= OCEAN.reefCrest.edge + shift; reach += .05) expect(seabedProfile(reach, OCEAN, { ...open, islet: 1 })).toEqual(seabedProfile(reach, OCEAN, open));
  const past = isletWall[1] + .02 + shift;
  expect(seabedProfile(past, OCEAN, { ...open, islet: 1 }).floor).toBeCloseTo(deep, 5);
  expect(seabedProfile(past, OCEAN, open).floor).toBeGreaterThan(deep + .3);
});

test('the crest is coral, its seaward edge breaking into surf; none in the lagoon, in a pass or out at sea', () => {
  let surfed = 0, crested = 0;
  for (let a = 0; a < Math.PI * 2; a += .05) {
    const p = at(a);
    expect(reefCrestAt(p.x, p.z, .9).coral).toBe(0);
    expect(reefCrestAt(p.x, p.z, foot).coral).toBe(0);
    for (let reach = rise; reach < edge + .3; reach += .02) {
      const { coral, surf } = reefCrestAt(p.x, p.z, reach);
      expect(surf).toBeLessThanOrEqual(coral + 1e-9);
      if (coral > .5) crested++;
      if (surf > .3) surfed++;
    }
  }
  expect(crested).toBeGreaterThan(300);
  expect(surfed).toBeGreaterThan(100);
  expect(reefCrestAt(pass.x, pass.z, (top + edge) / 2).surf).toBe(0);
});

test('coral heads dot the lagoon and crowd the crest, under the surface, clear of the reef\'s homes, more with every level', () => {
  const lagoon: number[] = [];
  for (let level = 1; level <= 6; level++) {
    const heads = coralHeads(level), s = islandScale(level);
    expect(coralHeads(level)).toEqual(heads);
    expect(heads.filter((h) => !h.crest).length).toBeGreaterThan(15);
    expect(heads.filter((h) => h.crest).length).toBeGreaterThan(20);
    lagoon.push(heads.filter((h) => !h.crest).length);
    const { dens, rocks, anemones } = reefRocks(level, 2, 3, 2);
    const props = Object.values(SEABED_PROPS).map(([x, z]) => ({ x: x * s, z: z * s }));
    for (const head of heads) {
      // Its top under the surface, with water to spare over it.
      expect(head.floor + head.height).toBeLessThanOrEqual(OCEAN.surfaceLevel - CORAL.clearance + 1e-9);
      for (const p of [...props, jettyBoat(level)]) expect(Math.hypot(p.x - head.x, p.z - head.z)).toBeGreaterThanOrEqual(CORAL.clear);
      for (const rock of [...dens.flat(), ...rocks]) expect(Math.hypot(rock.x - head.x, rock.z - head.z)).toBeGreaterThan(.45);
      for (const home of anemones) expect(Math.hypot(home.x - head.x, home.z - head.z)).toBeGreaterThan(REEF_ANEMONE.radius);
    }
  }
  // The lagoon fills in as the levels go up (the island growing shifts a few in or out between levels).
  for (let i = 1; i < lagoon.length; i++) expect(lagoon[i]).toBeGreaterThanOrEqual(lagoon[i - 1] - 3);
  expect(lagoon[5]).toBeGreaterThan(lagoon[0] * 1.5);
});

test('the Coral Reef\'s own animals have their own models, and swim as they do on a reef', () => {
  for (const id of NEW) {
    expect(residentsOf('coral-reef')).toContain(id);
    expect(islandOf(id)).toBe('coral-reef');
    expect(marineModelFor({ id, category: 'fish' })).toBe(id);
  }
  // The potato cod swims as its fellow giant grouper.
  expect(marineModelFor({ id: 'potato-cod', category: 'fish' })).toBe('goliath-grouper');
  // The whitetip rests on the bottom, low and still for long spells; the blacktip keeps to the shallows, high in the water.
  const whitetip = MOVEMENT['whitetip-reef-shark'], blacktip = MOVEMENT['blacktip-reef-shark'], grey = MOVEMENT['grey-reef-shark'];
  expect(whitetip.depth).toBeLessThan(-.2);
  expect(whitetip.pause!.hold).toBeGreaterThan(10);
  expect(whitetip.pause!.slow).toBeLessThan(.05);
  expect(blacktip.roam[1]).toBeLessThan(grey.roam[0] + .3);
  expect(blacktip.depth).toBeGreaterThan(grey.depth);
  // Bumphead parrotfish move in herds, grey reef sharks now and then in twos.
  expect(groupSizes([{ id: 'bumphead-parrotfish', model: 'bumphead-parrotfish' }], 6)[0]).toBeGreaterThan(1);
  expect(GROUP_STYLES['bumphead-parrotfish']).toBeDefined();
  expect(GROUP_STYLES['grey-reef-shark']).toBeDefined();
});
