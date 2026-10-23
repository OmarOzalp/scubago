import { describe, expect, it } from '@jest/globals';

import { carryOver, draftFromDive, emptyDraft, fieldOfProblem, hasMoreDetails, readDraft, TYPED_NUMBERS } from '@/lib/dive-draft';
import { validateDive } from '@/lib/dives';
import type { Dive, DiveFields } from '@/lib/types';

const start = { number: 49, siteId: 'blue-corner', divedOn: '2026-10-12' };

const page = (over: Partial<Dive> = {}): Dive => ({
  id: 'd-1', userId: 'me', number: 48, siteId: 'blue-corner', divedOn: '2026-10-11', synced: true, createdAt: '2026-10-11T10:00:00.000Z', ...over,
});

describe('a page being written', () => {
  it('a blank page holds its number, site and date, and nothing else', () => {
    const draft = emptyDraft(start);
    expect(readDraft(draft)).toEqual({ fields: { number: 49, siteId: 'blue-corner', divedOn: '2026-10-12' } });
  });

  it('reads numbers and times as divers type them', () => {
    const draft = { ...emptyDraft(start), timeIn: '9.30 am', maxDepthM: '28,5', bottomTimeMin: ' 52 ', waterTempC: '-1', gas: 'nitrox' as const, o2Percent: '32' };
    expect(readDraft(draft).fields).toMatchObject({ timeIn: '09:30', maxDepthM: 28.5, bottomTimeMin: 52, waterTempC: -1, gas: 'nitrox', o2Percent: 32 });
  });

  it('says what to fix when something typed isn’t a number or a time, and which field it is about', () => {
    expect(readDraft({ ...emptyDraft(start), maxDepthM: '28m' })).toEqual({ problem: 'Maximum depth has to be a number.', field: 'maxDepthM' });
    expect(readDraft({ ...emptyDraft(start), timeIn: 'morning' })).toMatchObject({ problem: expect.stringMatching(/hours and minutes/), field: 'timeIn' });
    expect(readDraft({ ...emptyDraft(start), number: '' })).toEqual({ problem: 'Give the dive a number.', field: 'number' });
    expect(readDraft({ ...emptyDraft(start), siteId: null })).toEqual({ problem: 'Choose the dive site.', field: 'siteId' });
  });

  it('finds the field of every message the store’s checks can give', () => {
    const known = { site: (id: string) => id === 'blue-corner', today: '2026-10-22' };
    const base = { number: 49, siteId: 'blue-corner', divedOn: '2026-10-12' };
    const check = (over: object) => validateDive({ ...base, ...over }, known)!;
    expect(fieldOfProblem(check({ number: 0 }))).toBe('number');
    expect(fieldOfProblem(check({ siteId: 'nowhere' }))).toBe('siteId');
    expect(fieldOfProblem(check({ divedOn: '2026-02-30' }))).toBe('divedOn');
    expect(fieldOfProblem(check({ divedOn: '2026-10-23' }))).toBe('divedOn');
    expect(fieldOfProblem(check({ timeIn: '25:00' }))).toBe('timeIn');
    // Each number's range message belongs to that number.
    const outOfRange: Record<string, number> = {
      bottomTimeMin: 9999, maxDepthM: 400, avgDepthM: 400, waterTempC: 99, airTempC: 99, visibilityM: 9999,
      o2Percent: 5, tankL: 999, pressureStartBar: 9999, pressureEndBar: 9999, weightKg: 999,
    };
    for (const key of TYPED_NUMBERS) {
      expect([key, fieldOfProblem(check({ [key]: outOfRange[key] }))]).toEqual([key, key]);
    }
    expect(fieldOfProblem(check({ avgDepthM: 30, maxDepthM: 20 }))).toBe('avgDepthM');
    expect(fieldOfProblem(check({ pressureStartBar: 50, pressureEndBar: 120 }))).toBe('pressureEndBar');
    expect(fieldOfProblem(check({ gas: 'air', o2Percent: 32 }))).toBe('o2Percent');
    // A message about the page as a whole has no field.
    expect(fieldOfProblem('Could not save')).toBeUndefined();
    expect(fieldOfProblem(check({ notes: 'x'.repeat(5000) }))).toBeUndefined();
  });

  it('a page read back into the form and out again is the same page', () => {
    const fields: DiveFields = {
      number: 121, siteId: 'blue-corner', divedOn: '2026-10-01', timeIn: '07:45', bottomTimeMin: 61, maxDepthM: 31.2, avgDepthM: 17,
      waterTempC: 27, airTempC: 30, visibilityM: 25, current: 'strong', surface: 'calm', entry: 'boat', kinds: ['drift', 'wall'],
      gas: 'nitrox', o2Percent: 32, tankL: 12, tankMaterial: 'aluminium', pressureStartBar: 210, pressureEndBar: 60, weightKg: 4,
      suit: 'wet3', rating: 5, buddyName: 'Maya', centreName: 'Sam’s Tours', notes: 'Grey reef sharks on the corner.',
      signature: { name: 'Maya', svg: 'M1,1L20,20', at: '2026-10-01T09:00:00.000Z', role: 'buddy' },
    };
    expect(readDraft(draftFromDive(fields))).toEqual({ fields });
  });

  it('knows when a page has more than the quick fields', () => {
    expect(hasMoreDetails({ ...start, timeIn: '09:00', maxDepthM: 18, bottomTimeMin: 40, notes: 'nice' })).toBe(false);
    expect(hasMoreDetails({ ...start, kinds: [] })).toBe(false);
    expect(hasMoreDetails({ ...start, buddyName: 'Maya' })).toBe(true);
  });
});

describe('what a new page carries over from the last one', () => {
  it('the gear always, and the buddy and centre on the same trip', () => {
    const latest = page({ gas: 'nitrox', o2Percent: 32, tankL: 12, weightKg: 4, suit: 'wet3', buddyName: 'Maya', centreName: 'Sam’s Tours' });
    expect(carryOver(latest, '2026-10-12')).toEqual({
      patch: { gas: 'nitrox', o2Percent: '32', tankL: '12', tankMaterial: undefined, weightKg: '4', suit: 'wet3', buddyName: 'Maya', centreName: 'Sam’s Tours' },
      from: 48,
      what: ['gear', 'buddy', 'dive centre'],
    });
    // A month later it's another trip: the gear comes along, the buddy doesn't.
    expect(carryOver(latest, '2026-11-20').what).toEqual(['gear']);
  });

  it('nothing from a page without gear, buddy or centre, or with no page at all', () => {
    expect(carryOver(page(), '2026-10-12')).toEqual({ patch: {}, what: [] });
    expect(carryOver(undefined, '2026-10-12')).toEqual({ patch: {}, what: [] });
  });
});
