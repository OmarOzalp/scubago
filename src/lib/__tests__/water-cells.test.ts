import { expect, test } from '@jest/globals';
import { createShoreField, type IslandShape } from '../island-outline';
import { hullOf, marginOf, tooShallow, tooShallowCells } from '../marine-bodies';
import { MOVEMENT, STEEPEST_BOTTOM } from '../marine-motion';
import { createSeabed, edgeSide, FIELD_GRID, openedCells } from '../seabed';
import { SCHOOL_SHELF, shelfWater } from '../shelf-water';
import { frame, TAU, worldFor, type World } from '../steering';

// The animals' water worked out a cheaper way (a whole grid at once, only the sign where only the sign is asked, the thin streaks opened
// without two more fields) gives exactly what it gave before: the same cells too shallow, the same side of their edge, the same opening.
const { columns, rows, step, x0, z0 } = FIELD_GRID;
const BODIES = [['whale-shark', Infinity], ['grey-reef-shark', Infinity], ['southern-stingray', STEEPEST_BOTTOM], ['mola-mola', Infinity], ['reef-fish', Infinity]] as const;

test.each([['reef', 6], ['reef', 2], ['kelp', 4], ['wreck', 6], ['volcanic', 3], ['mangrove', 5]] as [IslandShape, number][])('a %s island at level %d: every body\'s water is as it was', (shape, level) => {
  const seabed = createSeabed(level, shape), field = createShoreField(level, shape);
  for (const [model, steepest] of BODIES) {
    const hull = hullOf(model), margin = marginOf(hull), tilt = MOVEMENT[model].tilt ?? 0;
    const cells = tooShallowCells(seabed, field, hull, margin, tilt, steepest), judge = tooShallow(seabed, field, hull, margin, tilt, steepest);
    let differ = 0, shallow = 0;
    for (let j = 0, n = 0; j < rows; j++) for (let i = 0; i < columns; i++, n++) { if (cells[n] !== (judge(x0 + i * step, z0 + j * step) ? 1 : 0)) differ++; shallow += cells[n]; }
    expect(differ).toBe(0);
    // (and the bodies are big enough for some of it to matter)
    if (model !== 'reef-fish') expect(shallow).toBeGreaterThan(0);

    // The sign of the field found for them, anywhere (between the cells too), and their opening as two fields found it.
    const full = seabed.distanceTo(`water-cells|${model}|${shape}|${level}`, (_x, _z, n) => cells[n] === 1), side = edgeSide(cells);
    for (let k = 0; k < 4000; k++) {
      const x = x0 - 1 + ((k * 7919) % 1000) / 1000 * (2 * -x0 + 2), z = z0 - 1 + ((k * 104729) % 997) / 997 * (2 * -z0 + 2);
      expect(side(x, z) < 0).toBe(full(x, z) < 0);
    }
    const raw = seabed.distanceTo(`water-cells|${model}|${shape}|${level}|raw`, (x, z) => full(x, z) < 0);
    const core = seabed.distanceTo(`water-cells|${model}|${shape}|${level}|core`, (x, z) => raw(x, z) < -step);
    const seen = new Uint8Array(columns * rows);
    for (let j = 0, n = 0; j < rows; j++) for (let i = 0; i < columns; i++, n++) seen[n] = full(x0 + i * step, z0 + j * step) < 0 ? 1 : 0;
    const opened = openedCells(seen);
    for (let j = 0, n = 0; j < rows; j++) for (let i = 0; i < columns; i++, n++) expect(opened[n]).toBe(core(x0 + i * step, z0 + j * step) < step ? 1 : 0);
  }
});

test('the opening of places that are everywhere, or nowhere, is nothing', () => {
  expect(openedCells(new Uint8Array(columns * rows).fill(1)).some((c) => c === 1)).toBe(false);
  expect(openedCells(new Uint8Array(columns * rows)).some((c) => c === 1)).toBe(false);
  expect(edgeSide(new Uint8Array(columns * rows).fill(1))(0, 0)).toBe(1e3);
});

// The shelf as it was worked out before: every direction looked along out from the island's middle to the edge of the ocean.
function shelfBefore(world: World, shallow: (x: number, z: number) => boolean, fit?: { ring: number; reach: number; cut: number }) {
  const cut = (w: World, width: number) => {
    let count = 0;
    for (let k = 0; k < 72; k++) {
      const ux = Math.cos(k * TAU / 72), uz = Math.sin(k * TAU / 72);
      let run = 0, longest = 0;
      for (let r = .5; r < 14 && frame(ux * r, uz * r, w).edge <= 1 - .02; r += .05) { if (shallow(ux * r, uz * r)) run = 0; else longest = Math.max(longest, run += .05); }
      if (longest < width) count++;
    }
    return count;
  };
  const ring = fit?.ring ?? .4, reach = fit?.reach ?? 1.15, allowed = 72 * (fit?.cut ?? .05);
  let factor = 1, count = cut(world, ring);
  while (factor < reach && count > allowed) { factor = Math.min(reach, factor + .05); count = cut({ x: world.x * factor, z: world.z * factor }, ring); }
  return factor;
}

test('the ocean a big body keeps to on a wide shelf is as it was', () => {
  let wider = 0;
  for (const [shape, level] of [['reef', 6], ['reef', 4], ['reef', 1], ['kelp', 6], ['wreck', 5]] as [IslandShape, number][]) {
    const seabed = createSeabed(level, shape), field = createShoreField(level, shape);
    for (const model of ['whale-shark', 'reef-manta', 'humpback-whale', 'grey-reef-shark', 'leatherback-turtle'] as const) {
      const hull = hullOf(model), side = edgeSide(tooShallowCells(seabed, field, hull, marginOf(hull), 0, Infinity));
      const shallow = (x: number, z: number) => side(x, z - .4) < 0;
      for (const fit of [undefined, SCHOOL_SHELF]) {
        const factor = shelfWater({ world: worldFor(level), shallow, fit }).factor;
        expect(factor).toBe(shelfBefore(worldFor(level), shallow, fit));
        if (factor > 1) wider++;
      }
    }
  }
  // (some of them are given a wider ocean, so that way is checked too)
  expect(wider).toBeGreaterThan(2);
});
