import { describe, expect, it } from '@jest/globals';
import { SITES } from '@/data/sites';
import { SPECIES, SPECIES_BY_ID } from '@/data/species';

describe('seed data integrity', () => {
  it('species ids are unique', () => {
    expect(SPECIES_BY_ID.size).toBe(SPECIES.length);
  });

  it('site ids are unique', () => {
    expect(new Set(SITES.map((s) => s.id)).size).toBe(SITES.length);
  });

  it('every notableSpecies id exists in the species list', () => {
    const missing: string[] = [];
    for (const site of SITES) {
      for (const id of site.notableSpecies) {
        if (!SPECIES_BY_ID.has(id)) missing.push(`${site.id} -> ${id}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('site coordinates are plausible', () => {
    for (const site of SITES) {
      expect(Math.abs(site.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(site.lng)).toBeLessThanOrEqual(180);
    }
  });

  it('every species has a non-empty blurb and names', () => {
    for (const s of SPECIES) {
      expect(s.commonName.length).toBeGreaterThan(0);
      expect(s.scientificName.length).toBeGreaterThan(0);
      expect(s.blurb.length).toBeGreaterThan(10);
    }
  });
});
