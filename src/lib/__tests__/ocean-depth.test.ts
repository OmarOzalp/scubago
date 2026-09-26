import { test, expect } from '@jest/globals';
import { sampleDive } from '../ocean-depth';

test('each animal surfaces, dives out of sight and returns on a continuous loop', () => {
  for (let lane = 0; lane < 8; lane++) {
    const cycle = Array.from({ length: 381 }, (_, i) => sampleDive(i / 10, lane, 8));
    expect(cycle.some((p) => p.opacity === 1)).toBe(true);
    expect(cycle.some((p) => !p.visible && p.opacity === 0)).toBe(true);
    expect(cycle.every((p) => p.y <= -.92 && p.opacity >= 0 && p.opacity <= 1)).toBe(true);
    expect(sampleDive(38, lane, 8).y).toBeCloseTo(sampleDive(0, lane, 8).y);
    for (let i = 1; i < cycle.length; i++) expect(Math.abs(cycle[i].opacity - cycle[i - 1].opacity)).toBeLessThan(.05);
  }
});

test('a crowded page leaves fewer residents at the surface without emptying the ocean', () => {
  let sparseVisits = 0, crowdedVisits = 0;
  for (let t = 0; t < 114; t += .25) {
    const visible = Array.from({ length: 8 }, (_, lane) => sampleDive(t, lane, 8).opacity > .5);
    expect(visible.filter(Boolean).length).toBeGreaterThanOrEqual(2);
    expect(visible.filter(Boolean).length).toBeLessThanOrEqual(5);
    sparseVisits += Number(sampleDive(t, 0, 2).opacity > .5);
    crowdedVisits += Number(sampleDive(t, 0, 8).opacity > .5);
  }
  expect(crowdedVisits).toBeLessThan(sparseVisits);
});


test('the rise phase is distinct from the descent and reaches a fully visible surface', () => {
  const descending = sampleDive(25, 0, 2);
  const rising = sampleDive(35, 0, 2);
  expect(descending.depth).toBeGreaterThan(0);
  expect(descending.surfacing).toBe(false);
  expect(rising.depth).toBeGreaterThan(0);
  expect(rising.surfacing).toBe(true);
  expect(sampleDive(38, 0, 2).depth).toBe(0);
});
