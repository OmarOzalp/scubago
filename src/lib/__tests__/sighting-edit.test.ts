import { describe, expect, it, jest } from '@jest/globals';

import {
  applyEdit,
  canEditSighting,
  isMaterialChange,
  localIsoDate,
  shiftIsoDate,
  validateSightingInput,
} from '@/lib/sighting-edit';
import type { Sighting } from '@/lib/types';

const base: Sighting = {
  id: 's-1', userId: 'uid-1', username: 'alice', speciesId: 'reef-manta', siteId: 'blue-corner',
  sightedOn: '2026-09-01', notes: 'big one', isDemo: false, synced: true, createdAt: '2026-09-01T10:00:00.000Z',
  status: 'confirmed',
};

describe('editing a sighting', () => {
  it('only the diver who logged it may change it', () => {
    expect(canEditSighting(base, 'uid-1')).toBe(true);
    expect(canEditSighting(base, 'uid-2')).toBe(false);
    expect(canEditSighting({ ...base, isDemo: true, userId: 'local' }, 'local')).toBe(false);
  });

  it('treats species, site and date as what a verification vouches for', () => {
    expect(isMaterialChange(base, { ...base, speciesId: 'whale-shark' })).toBe(true);
    expect(isMaterialChange(base, { ...base, siteId: 'yongala' })).toBe(true);
    expect(isMaterialChange(base, { ...base, sightedOn: '2026-09-02' })).toBe(true);
    expect(isMaterialChange(base, { ...base })).toBe(false);
  });

  it('a material edit can\'t keep a verification; a notes or photo edit keeps it', () => {
    const now = '2026-09-10T00:00:00.000Z';
    expect(applyEdit(base, { ...base, speciesId: 'whale-shark' }, now).status).toBe('unverified');
    expect(applyEdit(base, { ...base, sightedOn: '2026-08-31' }, now).status).toBe('unverified');
    const notes = applyEdit(base, { ...base, notes: 'even bigger', photoUri: 'file:///p.jpg' }, now);
    expect(notes).toMatchObject({ status: 'confirmed', notes: 'even bigger', photoUri: 'file:///p.jpg' });
  });

  it('marks the edit as waiting to sync and clears an old sync error', () => {
    const after = applyEdit({ ...base, syncError: 'boom' }, { ...base, notes: '  ' }, '2026-09-10T00:00:00.000Z');
    expect(after).toMatchObject({ synced: false, syncError: undefined, updatedAt: '2026-09-10T00:00:00.000Z', notes: undefined });
    // What identifies the sighting never changes.
    expect(after).toMatchObject({ id: 's-1', userId: 'uid-1', createdAt: base.createdAt });
  });
});

describe('the checks every sighting passes', () => {
  const known = { species: (id: string) => id === 'reef-manta', site: (id: string) => id === 'blue-corner', today: '2026-09-29' };
  const input = { speciesId: 'reef-manta', siteId: 'blue-corner', sightedOn: '2026-09-29' };

  it('accepts a sighting from today or earlier', () => {
    expect(validateSightingInput(input, known)).toBeNull();
    expect(validateSightingInput({ ...input, sightedOn: '1998-02-14' }, known)).toBeNull();
  });

  it('rejects unknown species or sites, impossible dates and future dates', () => {
    expect(validateSightingInput({ ...input, speciesId: 'nessie' }, known)).toMatch(/species/);
    expect(validateSightingInput({ ...input, siteId: 'atlantis' }, known)).toMatch(/site/);
    expect(validateSightingInput({ ...input, sightedOn: '2026-02-30' }, known)).toMatch(/valid/);
    expect(validateSightingInput({ ...input, sightedOn: '29/09/2026' }, known)).toMatch(/valid/);
    expect(validateSightingInput({ ...input, sightedOn: '2026-09-30' }, known)).toMatch(/future/);
  });
});

describe('dates', () => {
  it('uses the diver\'s own calendar day, not UTC\'s', () => {
    // 7am on 30 September in Cairns (UTC+10) is 21:00 on 29 September in UTC. Jest can't switch
    // the time zone, so the date answers as a phone in Cairns would.
    const cairnsMorning = new Date('2026-09-29T21:00:00.000Z');
    jest.spyOn(cairnsMorning, 'getFullYear').mockReturnValue(2026);
    jest.spyOn(cairnsMorning, 'getMonth').mockReturnValue(8);
    jest.spyOn(cairnsMorning, 'getDate').mockReturnValue(30);
    expect(cairnsMorning.toISOString().slice(0, 10)).toBe('2026-09-29'); // what the old code logged
    expect(localIsoDate(cairnsMorning)).toBe('2026-09-30');
  });

  it('moves by whole calendar days across months, years and leap days', () => {
    expect(shiftIsoDate('2026-09-30', 1)).toBe('2026-10-01');
    expect(shiftIsoDate('2027-01-01', -1)).toBe('2026-12-31');
    expect(shiftIsoDate('2028-02-28', 1)).toBe('2028-02-29');
  });
});
