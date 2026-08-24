import { describe, expect, it } from '@jest/globals';
import { generateDemoSightings, mulberry32 } from '@/lib/demo';
import { SITES } from '@/data/sites';
import { SPECIES_BY_ID } from '@/data/species';

const NOW = Date.UTC(2026, 7, 24);

describe('mulberry32', () => {
  it('is deterministic for a seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('stays within [0, 1)', () => {
    const rand = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('generateDemoSightings', () => {
  const opts = { seed: 1, now: NOW };

  it('is deterministic for the same seed and now', () => {
    const a = generateDemoSightings(SITES, SPECIES_BY_ID, opts);
    const b = generateDemoSightings(SITES, SPECIES_BY_ID, opts);
    expect(a).toEqual(b);
  });

  it('creates 1-3 sightings per notable species per site, all flagged demo', () => {
    const sightings = generateDemoSightings(SITES, SPECIES_BY_ID, opts);
    const expectedMin = SITES.reduce((n, s) => n + s.notableSpecies.length, 0);
    expect(sightings.length).toBeGreaterThanOrEqual(expectedMin);
    expect(sightings.length).toBeLessThanOrEqual(expectedMin * 3);
    expect(sightings.every((s) => s.isDemo && s.synced)).toBe(true);
  });

  it('only references species at sites that list them as notable', () => {
    const sightings = generateDemoSightings(SITES, SPECIES_BY_ID, opts);
    const notable = new Map(SITES.map((s) => [s.id, new Set(s.notableSpecies)]));
    for (const s of sightings) {
      expect(notable.get(s.siteId)?.has(s.speciesId)).toBe(true);
    }
  });

  it('dates all fall within the history window', () => {
    const sightings = generateDemoSightings(SITES, SPECIES_BY_ID, { ...opts, historyDays: 90 });
    const oldest = new Date(NOW - 91 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    for (const s of sightings) {
      expect(s.sightedOn >= oldest).toBe(true);
      expect(s.sightedOn <= new Date(NOW).toISOString().slice(0, 10)).toBe(true);
    }
  });
});
