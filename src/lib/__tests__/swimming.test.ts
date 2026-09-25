import { expect, test } from '@jest/globals';
import { sampleSwimPath, advanceSwimTime, marineModelFor, pickSwimmers, swimmerPages, MAX_ANIMATED } from '@/lib/swimming';
import type { DexEntry, Species } from '@/lib/types';

test('paths remain outside the island and always give finite continuous positions', () => {
  for (let lane = 0; lane < 12; lane++) {
    for (let time = 0; time < 120; time += .4) {
      const p = sampleSwimPath(time, lane);
      expect(Math.hypot(p.x, p.z)).toBeGreaterThan(2.7);
      expect([p.x, p.y, p.z, p.heading, p.bank].every(Number.isFinite)).toBe(true);
      const next = sampleSwimPath(time + .001, lane);
      expect(Math.hypot(next.x - p.x, next.z - p.z)).toBeLessThan(.01);
    }
  }
});
test('heading follows travel direction rather than flipping at turns', () => {
  for (let time = 0; time < 100; time++) {
    const p = sampleSwimPath(time, 0);
    const next = sampleSwimPath(time + .001, 0);
    const heading = Math.atan2(next.x - p.x, next.z - p.z);
    expect(Math.cos(p.heading - heading)).toBeGreaterThan(.999);
  }
});
test('pause freezes phase and a long background frame cannot jump the animation', () => {
  expect(advanceSwimTime(12, 10, false)).toBe(12);
  expect(advanceSwimTime(12, 10, true)).toBeCloseTo(12.05);
  expect(advanceSwimTime(12, .016, true)).toBeCloseTo(12.016);
});
test('sharks and rays select their own rigs', () => {
  expect(marineModelFor('shark')).toBe('shark');
  expect(marineModelFor('ray')).toBe('manta');
  expect(marineModelFor('fish')).toBe('reef-fish');
  expect(marineModelFor('turtle')).toBeNull();
});


function entry(id: string, category: Species['category']): DexEntry {
  return { species: { id, commonName: id, scientificName: id, category, rarity: 'common', blurb: '' }, count: 1, firstSeenOn: '2026-01-01', firstSeenSiteId: 'x', lastSeenOn: '2026-01-01' };
}

test('only species with a rig swim, in collection order, with lanes 0..n-1', () => {
  const residents = [entry('turtle-a', 'turtle'), entry('shark-a', 'shark'), entry('ray-a', 'ray'), entry('octo', 'cephalopod'), entry('fish-a', 'fish')];
  expect(pickSwimmers(residents)).toEqual([
    { species: residents[1].species, model: 'shark', lane: 0 },
    { species: residents[2].species, model: 'manta', lane: 1 },
    { species: residents[4].species, model: 'reef-fish', lane: 2 },
  ]);
  expect(pickSwimmers([])).toEqual([]);
  expect(pickSwimmers([entry('t', 'turtle')])).toEqual([]);
});

test('large collections are bounded and page deterministically, wrapping around', () => {
  const residents = Array.from({ length: 19 }, (_, i) => entry(`fish-${i}`, 'fish'));
  expect(swimmerPages(residents)).toBe(3);
  expect(pickSwimmers(residents, 0)).toHaveLength(MAX_ANIMATED);
  expect(pickSwimmers(residents, 0).map((s) => s.species.id)[0]).toBe('fish-0');
  expect(pickSwimmers(residents, 1).map((s) => s.species.id)[0]).toBe(`fish-${MAX_ANIMATED}`);
  expect(pickSwimmers(residents, 2)).toHaveLength(19 - 2 * MAX_ANIMATED);
  expect(pickSwimmers(residents, 3)).toEqual(pickSwimmers(residents, 0));
  expect(pickSwimmers(residents, 1)).toEqual(pickSwimmers(residents, 1));
  expect(swimmerPages([])).toBe(1);
  expect(swimmerPages([entry('t', 'turtle')])).toBe(1);
});

test('exact species receive distinct art before family fallbacks', () => {
  const residents = [entry('whale-shark', 'shark'), entry('tiger-shark', 'shark'), entry('other-shark', 'shark'), entry('reef-manta', 'ray'), entry('other-ray', 'ray')];
  expect(pickSwimmers(residents).map((s) => s.model)).toEqual(['whale-shark', 'tiger-shark', 'shark', 'reef-manta', 'manta']);
  expect(marineModelFor(entry('unknown-turtle', 'turtle').species)).toBeNull();
});
