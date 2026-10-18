import { expect, test } from '@jest/globals';
import { isMacroSpecies, MACRO, MACRO_SPECIES, macroHomes, macroPresence, macroResidents, reefProps, shoreGap, type MacroSpecies } from '../macro-life';
import { SPECIES } from '@/data/species';
import type { DexEntry, Species } from '../types';

const ALL = Object.keys(MACRO_SPECIES) as MacroSpecies[];

test('every macro species in the catalog has a creature, and only those', () => {
  const macro = SPECIES.filter((s) => s.category === 'macro').map((s) => s.id).sort();
  expect([...ALL].sort()).toEqual(macro);
  expect(new Set(Object.values(MACRO_SPECIES)).size).toBe(ALL.length);
});

test('each home is in the water on the shelf, clear of the reef props, the islets and one another, at every level', () => {
  for (let level = 1; level <= 6; level++) {
    const homes = macroHomes(level, ALL), props = reefProps(level);
    for (const home of homes) {
      const radius = MACRO.radius[home.kind];
      // In the water near the beach, where the bottom is shallow enough to see it.
      expect(shoreGap(level, home)).toBeGreaterThan(radius + .1);
      expect(home.floor).toBeLessThan(-.25);
      expect(home.floor).toBeGreaterThan(-.65);
      for (const prop of props) expect(Math.hypot(home.x - prop.x, home.z - prop.z)).toBeGreaterThan(prop.radius + radius);
      for (const other of homes) if (other !== home) expect(Math.hypot(home.x - other.x, home.z - other.z)).toBeGreaterThan(radius + MACRO.radius[other.kind] + .25);
      expect(Math.hypot(home.outX, home.outZ)).toBeCloseTo(1, 6);
    }
  }
});

test('homes move out with the island as it grows, and a species keeps its home whatever else is logged', () => {
  const [small] = macroHomes(1, ['giant-clam']), [large] = macroHomes(6, ['giant-clam']);
  expect(Math.hypot(large.x, large.z)).toBeGreaterThan(Math.hypot(small.x, small.z));
  const alone = macroHomes(3, ['pygmy-seahorse'])[0], crowded = macroHomes(3, ALL).find((h) => h.species === 'pygmy-seahorse')!;
  expect(crowded).toEqual(alone);
});

test('the creatures come into view only as the explorer zooms in close', () => {
  expect(macroPresence(31)).toBe(0); // the Home card
  expect(macroPresence(57)).toBe(0); // a phone's explorer, all the way out
  expect(macroPresence(MACRO.appear)).toBe(0);
  expect(macroPresence((MACRO.appear + MACRO.clear) / 2)).toBeCloseTo(.5, 6);
  expect(macroPresence(MACRO.clear)).toBe(1);
  expect(macroPresence(400)).toBe(1);
});

test('only the logged macro species live on the reef', () => {
  const entry = (id: string) => ({ species: SPECIES.find((s) => s.id === id) as Species } as DexEntry);
  expect(macroResidents([entry('reef-manta'), entry('giant-clam'), entry('day-octopus'), entry('pygmy-seahorse')])).toEqual(['giant-clam', 'pygmy-seahorse']);
  expect(isMacroSpecies('spanish-dancer')).toBe(true);
  expect(isMacroSpecies('clownfish')).toBe(false);
});
