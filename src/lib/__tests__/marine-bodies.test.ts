import { expect, test } from '@jest/globals';
import { SPECIES } from '../../data/species';
import { hullBottom, hullOf, hullTop, landReach, lowestMiddle, marginOf, stanceOf, STANCES, tooShallow } from '../marine-bodies';
import { createShoreField } from '../island-outline';
import { MOVEMENT } from '../marine-motion';
import { createSeabed, SURFACE_Y } from '../seabed';
import { marineModelFor } from '../swimming';

const models = Object.keys(MOVEMENT) as (keyof typeof MOVEMENT)[];

test('every model has a hull and a place in the water, and every species that lives differently from its family says so', () => {
  for (const model of models) {
    const hull = hullOf(model), stance = STANCES[model];
    expect(hull).toBeDefined();
    expect(hull.keel).toBeGreaterThan(0);
    expect(hull.crest).toBeGreaterThan(0);
    expect(hull.width).toBeGreaterThan(0);
    expect(hull.length).toBeGreaterThan(0);
    expect(['bottom', 'reef', 'open']).toContain(stance.kind);
    expect(stance.band).toBeGreaterThanOrEqual(0);
    expect(stance.band).toBeLessThanOrEqual(1);
  }
  // The bottom-living species of a shared model are bottom-dwellers, the open-water ones are not.
  const stance = (id: string) => stanceOf(marineModelFor(SPECIES.find((s) => s.id === id)!)!, id).kind;
  for (const id of ['tasselled-wobbegong', 'nurse-shark', 'zebra-shark', 'giant-guitarfish', 'marbled-ray', 'garden-eel', 'stonefish']) expect(stance(id)).toBe('bottom');
  for (const id of ['shortfin-mako', 'silky-shark', 'munks-devil-ray']) expect(stance(id)).toBe('open');
  // The owner's groups: bottom-dwellers, reef fish and the big open-water animals.
  for (const model of ['southern-stingray', 'sawfish', 'goliath-grouper', 'lionfish', 'batfish', 'whitetip-reef-shark'] as const) expect(STANCES[model].kind).toBe('bottom');
  for (const model of ['whale-shark', 'reef-manta', 'oceanic-manta', 'great-white-shark', 'humpback-whale', 'sperm-whale', 'mola-mola', 'sailfish'] as const) expect(STANCES[model].kind).toBe('open');
  for (const model of ['reef-fish', 'garibaldi', 'king-angelfish', 'napoleon-wrasse', 'bumphead-parrotfish', 'hawksbill-turtle'] as const) expect(STANCES[model].kind).toBe('reef');
});

test('a hull turns as it is drawn: nose down lowers the nose, a roll lowers a wing, the heading carries it round', () => {
  const hull = hullOf('reef-manta'), out = new Float64Array(21);
  hullBottom(hull, 0, 0, 0, 0, 0, out);
  // Level, facing +z: the nose point (1) is ahead, the tail (2) behind, the wings out to either side.
  expect(out[5]).toBeGreaterThan(0);
  expect(out[8]).toBeLessThan(0);
  expect(out[15]).toBeGreaterThan(0);
  expect(out[18]).toBeLessThan(0);
  const level = out[4];
  hullBottom(hull, 0, 0, 0, .3, 0, out);
  expect(out[4]).toBeLessThan(level);
  // Rolled, one wingtip hangs lower than the keel.
  hullBottom(hull, 0, 0, 0, 0, .4, out);
  expect(Math.min(out[16], out[19])).toBeLessThan(-hull.wing);
  // Turned a quarter round, the nose points along +x (three quarters of its half length out).
  hullBottom(hull, 0, 0, Math.PI / 2, 0, 0, out);
  expect(out[3]).toBeCloseTo(.75 * hull.length, 6);
  expect(Math.abs(out[5])).toBeLessThan(.01);
});

test('the lowest its middle may be puts every point of the hull above the bottom, with the margin', () => {
  const seabed = createSeabed(1, 'kelp');
  for (const model of ['whale-shark', 'southern-stingray', 'bottlenose-dolphin', 'mola-mola'] as const) {
    const hull = hullOf(model), margin = marginOf(hull), out = new Float64Array(21);
    for (const [x, z, heading, pitch, roll] of [[2.3, 1.5, .4, .1, .2], [-3, 1.9, 2.2, -.2, -.3], [1, -2.6, -1.1, 0, 0]]) {
      const middle = lowestMiddle(seabed, hull, margin, x, z, heading, pitch, roll);
      hullBottom(hull, x, z, heading, pitch, roll, out);
      let room = Infinity;
      for (let i = 0; i < 7; i++) room = Math.min(room, middle + out[i * 3 + 1] - seabed.floor(out[i * 3], out[i * 3 + 2]));
      expect(room).toBeCloseTo(margin, 5);
    }
  }
  // Bigger animals keep more room.
  expect(marginOf(hullOf('whale-shark'))).toBeGreaterThan(marginOf(hullOf('clownfish')));
});

test('a body too big for the water is shut out of it, and fits where it is deep: the whale shark is out of the lagoon, the stingray is not', () => {
  const seabed = createSeabed(1, 'reef'), coast = createShoreField(1, 'reef');
  const whale = tooShallow(seabed, coast, hullOf('whale-shark'), marginOf(hullOf('whale-shark')));
  const clownfish = tooShallow(seabed, coast, hullOf('clownfish'), marginOf(hullOf('clownfish')));
  // Over the crest nothing larger than a hand's thickness fits; out past the reef the whale shark does.
  const crest = [0, 3.3] as const;
  expect(seabed.floor(...crest)).toBeGreaterThan(SURFACE_Y - .1);
  expect(whale(...crest)).toBe(true);
  expect(clownfish(...crest)).toBe(true);
  expect(whale(0, 4.9)).toBe(false);
  expect(clownfish(0, 4.9)).toBe(false);
  // The lagoon: too shallow for the whale shark, plenty for a clownfish.
  expect(whale(3, .2)).toBe(true);
  expect(clownfish(3, .2)).toBe(false);
});

test('dry land is found in a hull and the way out is away from it', () => {
  const land = createShoreField(1, 'reef'), hull = hullOf('southern-stingray');
  // On the island: its middle is on land, and out is away from the island's middle.
  const inside = landReach(land, hull, .2, .3, 0, 0, 0);
  expect(inside).not.toBeNull();
  expect(inside!.depth).toBeGreaterThan(.3);
  // Well out at sea: nothing.
  expect(landReach(land, hull, 0, 4.6, 0, 0, 0)).toBeNull();
  // A tail over the beach: the ray's nose or tail reaches the sand while its middle is in the water.
  let tailOn = 0;
  for (let heading = 0; heading < 6.3; heading += .3) if (landReach(land, hull, 2.4, .3, heading, 0, 0)) tailOn++;
  expect(tailOn).toBeGreaterThan(0);
  expect(hullTop(hull, 0, 0)).toBeCloseTo(hull.crest, 6);
});
