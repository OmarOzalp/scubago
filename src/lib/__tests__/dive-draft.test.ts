import { describe, expect, it } from '@jest/globals';

import { carryOver, draftFromDive, emptyDraft, hasMoreDetails, readDraft } from '@/lib/dive-draft';
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

  it('says what to fix when something typed isn’t a number or a time', () => {
    expect(readDraft({ ...emptyDraft(start), maxDepthM: '28m' })).toEqual({ problem: 'Maximum depth has to be a number.' });
    expect(readDraft({ ...emptyDraft(start), timeIn: 'morning' }).problem).toMatch(/hours and minutes/);
    expect(readDraft({ ...emptyDraft(start), number: '' }).problem).toBe('Give the dive a number.');
    expect(readDraft({ ...emptyDraft(start), siteId: null }).problem).toBe('Choose the dive site.');
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
