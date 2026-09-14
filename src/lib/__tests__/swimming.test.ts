import { expect, test } from '@jest/globals';
import { sampleSwimPath, advanceSwimTime, marineModelFor } from '@/lib/swimming';

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
