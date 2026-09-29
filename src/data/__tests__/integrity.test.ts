import { describe, expect, it } from '@jest/globals';
import { REGIONS, REGIONS_BY_ID, regionPath } from '@/data/regions';
import { SITES } from '@/data/sites';
import { SPECIES, SPECIES_BY_ID } from '@/data/species';
import type { DiveSite, Region, SiteField } from '@/lib/types';

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

describe('dive-site details: sourced or absent', () => {
  // Details a diver relies on; each one filled in must name where it came from.
  const DETAILS: [SiteField, (site: DiveSite) => boolean][] = [
    ['depth', (s) => s.depthMinM != null || s.depthMaxM != null],
    ['difficulty', (s) => s.difficulty != null],
    ['dive_types', (s) => !!s.diveTypes?.length],
    ['access', (s) => !!s.access?.length],
    ['conditions', (s) => !!s.conditions],
  ];

  it('every filled-in detail has a source that covers it', () => {
    const unsourced: string[] = [];
    for (const site of SITES) {
      for (const [field, filled] of DETAILS) {
        if (filled(site) && !site.sources?.some((s) => s.fields.includes(field))) unsourced.push(`${site.id}: ${field}`);
      }
    }
    expect(unsourced).toEqual([]);
  });

  it('sources are named, link over https and cover real fields', () => {
    for (const site of SITES) {
      for (const source of site.sources ?? []) {
        expect(source.source.trim().length).toBeGreaterThan(0);
        expect(source.fields.length).toBeGreaterThan(0);
        if (source.url) expect(source.url).toMatch(/^https:\/\//);
        if (source.retrieved) expect(source.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it('depths are plausible and in order', () => {
    for (const site of SITES) {
      for (const depth of [site.depthMinM, site.depthMaxM]) {
        if (depth == null) continue;
        expect(depth).toBeGreaterThanOrEqual(0);
        expect(depth).toBeLessThanOrEqual(150);
      }
      if (site.depthMinM != null && site.depthMaxM != null) expect(site.depthMinM).toBeLessThanOrEqual(site.depthMaxM);
    }
  });

  it('regions exist, and their parents too, without loops', () => {
    for (const site of SITES) if (site.regionId) expect(REGIONS_BY_ID.has(site.regionId)).toBe(true);
    for (const region of REGIONS) {
      const seen = new Set<string>();
      for (let r: Region | undefined = region; r; r = r.parentId ? REGIONS_BY_ID.get(r.parentId) : undefined) {
        expect(seen.has(r.id)).toBe(false);
        seen.add(r.id);
        if (r.parentId) expect(REGIONS_BY_ID.has(r.parentId)).toBe(true);
      }
    }
    expect(regionPath('gbr-cairns-cooktown')).toBe('Cairns/Cooktown, Great Barrier Reef');
    expect(regionPath(undefined)).toBeNull();
  });

  it('an external id belongs to one site only, so sources never duplicate a place', () => {
    const owners = new Map<string, string>();
    for (const site of SITES) {
      for (const ext of site.externalIds ?? []) {
        const key = `${ext.scheme}:${ext.id}:${ext.relation ?? 'same_as'}`;
        if ((ext.relation ?? 'same_as') === 'same_as') expect(owners.get(key) ?? site.id).toBe(site.id);
        owners.set(key, site.id);
      }
    }
  });
});
