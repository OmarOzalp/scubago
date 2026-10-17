import { describe, expect, it, test } from '@jest/globals';
import { depthLabel, siteAddedBy, siteFacts, siteSourceList } from '@/lib/site-details';
import type { DiveSite } from '@/lib/types';

const site = (details: Partial<DiveSite>): DiveSite => ({
  id: 's', name: 'S', lat: 0, lng: 0, region: 'R', country: 'C', blurb: '', notableSpecies: [], source: 'seed', ...details,
});

test('depths read naturally, and an unknown depth shows nothing', () => {
  expect(depthLabel(site({ depthMinM: 5, depthMaxM: 18 }))).toBe('5–18 m');
  expect(depthLabel(site({ depthMaxM: 30 }))).toBe('to 30 m');
  expect(depthLabel(site({ depthMinM: 12 }))).toBe('from 12 m');
  expect(depthLabel(site({ depthMinM: 9, depthMaxM: 9 }))).toBe('9 m');
  expect(depthLabel(site({}))).toBeNull();
});

test('only known facts are listed, and each source is named once', () => {
  expect(siteFacts(site({}))).toEqual([]);
  expect(siteFacts(site({ depthMaxM: 28, difficulty: 'advanced', diveTypes: ['wreck', 'drift'], access: ['boat'] }))).toEqual([
    { label: 'Depth', value: 'to 28 m' }, { label: 'Level', value: 'Advanced' }, { label: 'Type', value: 'Wreck, Drift' }, { label: 'Access', value: 'Boat' },
  ]);
  expect(siteSourceList(site({ sources: [
    { fields: ['depth'], source: 'Operator A', url: 'https://a.example' }, { fields: ['access'], source: 'Operator A' }, { fields: ['dive_types'], source: 'Register B', license: 'CC BY 4.0' },
  ] }))).toEqual([{ source: 'Operator A', url: 'https://a.example', license: undefined }, { source: 'Register B', url: undefined, license: 'CC BY 4.0' }]);
});

describe('siteAddedBy', () => {
  const site = (createdBy?: string) => ({ source: 'user' as const, createdBy });

  it('says nothing for curated sites', () => {
    expect(siteAddedBy({ source: 'seed' }, 'me')).toBeNull();
  });
  it('credits you only for sites you added', () => {
    expect(siteAddedBy(site('me'), 'me')).toBe('you');
    expect(siteAddedBy(site('local'), undefined)).toBe('you');
    expect(siteAddedBy(site('local'), 'me')).toBe('you');
  });
  it('credits another diver for everyone else’s sites, and for ones not yet attributed', () => {
    expect(siteAddedBy(site('someone-else'), 'me')).toBe('a diver');
    expect(siteAddedBy(site('me'), undefined)).toBe('a diver');
    expect(siteAddedBy(site(undefined), 'me')).toBe('a diver');
  });
});
