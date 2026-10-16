import { describe, expect, it } from '@jest/globals';

import {
  airConsumption,
  bindPastSightings,
  cleanDive,
  formatMinutes,
  isSignaturePath,
  logTotals,
  milestoneAt,
  neighbours,
  nextDiveNumber,
  nextMilestone,
  parseNumber,
  parseTime,
  pastDiveId,
  signaturePath,
  timeOut,
  validateDive,
} from '@/lib/dives';
import type { Dive, DiveFields, Sighting } from '@/lib/types';

const known = { site: (id: string) => id === 'blue-corner', today: '2026-10-16' };
const base: DiveFields = { number: 49, siteId: 'blue-corner', divedOn: '2026-10-15' };

const dive = (over: Partial<Dive>): Dive => ({
  id: 'd-1', userId: 'me', number: 1, siteId: 'blue-corner', divedOn: '2026-10-01', synced: true, createdAt: '2026-10-01T10:00:00.000Z', ...over,
});

const sighting = (over: Partial<Sighting>): Sighting => ({
  id: 's-1', userId: 'me', username: 'me', speciesId: 'reef-manta', siteId: 'blue-corner', sightedOn: '2026-09-01',
  isDemo: false, synced: true, createdAt: '2026-09-01T10:00:00.000Z', ...over,
});

describe('dive numbers', () => {
  it('continues from the highest page, or from the dives logged before ScubaGo', () => {
    expect(nextDiveNumber([], 0)).toBe(1);
    expect(nextDiveNumber([], 120)).toBe(121);
    expect(nextDiveNumber([{ number: 48 }, { number: 12 }], 0)).toBe(49);
    expect(nextDiveNumber([{ number: 48 }], 200)).toBe(201);
  });

  it('knows the milestones and how far the next one is', () => {
    expect(milestoneAt(50)).toBe(50);
    expect(milestoneAt(49)).toBeNull();
    expect(nextMilestone(48)).toEqual({ at: 50, remaining: 2 });
    expect(nextMilestone(50)).toEqual({ at: 50, remaining: 0 });
    expect(nextMilestone(1001)).toEqual({ at: 1500, remaining: 499 });
  });
});

describe('checking a page', () => {
  it('accepts a page with only a number, site and date', () => {
    expect(validateDive(base, known)).toBeNull();
  });

  it('refuses what cannot be a dive', () => {
    expect(validateDive({ ...base, number: 0 }, known)).toMatch(/dive number/);
    expect(validateDive({ ...base, number: 2.5 }, known)).toMatch(/dive number/);
    expect(validateDive({ ...base, siteId: 'nowhere' }, known)).toMatch(/site/);
    expect(validateDive({ ...base, divedOn: '2026-02-30' }, known)).toMatch(/date/);
    expect(validateDive({ ...base, divedOn: '2026-10-17' }, known)).toMatch(/future/);
    expect(validateDive({ ...base, timeIn: '25:00' }, known)).toMatch(/time in/);
    expect(validateDive({ ...base, maxDepthM: 400 }, known)).toMatch(/Maximum depth has to be between 0 and 350/);
    expect(validateDive({ ...base, maxDepthM: NaN }, known)).toMatch(/number/);
    expect(validateDive({ ...base, maxDepthM: 18, avgDepthM: 22 }, known)).toMatch(/average depth/);
    expect(validateDive({ ...base, pressureStartBar: 200, pressureEndBar: 210 }, known)).toMatch(/end pressure/);
    expect(validateDive({ ...base, gas: 'air', o2Percent: 32 }, known)).toMatch(/Nitrox/);
    expect(validateDive({ ...base, rating: 3.5 }, known)).toMatch(/whole number/);
    expect(validateDive({ ...base, notes: 'x'.repeat(4001) }, known)).toMatch(/4000/);
  });

  it('tidies what it keeps', () => {
    const clean = cleanDive({
      ...base,
      maxDepthM: 28.26,
      bottomTimeMin: 52.4,
      buddyName: '  Maya   Lin ',
      centreName: '',
      notes: '  great dive \n',
      kinds: ['drift', 'drift', 'wall'],
      gas: 'air',
      o2Percent: 32,
    });
    expect(clean).toEqual({ ...base, maxDepthM: 28.3, bottomTimeMin: 52, buddyName: 'Maya Lin', notes: 'great dive', kinds: ['drift', 'wall'], gas: 'air' });
  });
});

describe('reading the form', () => {
  it('understands the usual ways of writing a time', () => {
    expect(parseTime('9:30')).toBe('09:30');
    expect(parseTime('0930')).toBe('09:30');
    expect(parseTime('9.30pm')).toBe('21:30');
    expect(parseTime('12am')).toBe('00:00');
    expect(parseTime('14')).toBe('14:00');
    expect(parseTime('24:00')).toBeNull();
    expect(parseTime('noonish')).toBeNull();
  });

  it('reads numbers with a comma or a point, and leaves empty boxes empty', () => {
    expect(parseNumber('28,5')).toBe(28.5);
    expect(parseNumber(' 7 ')).toBe(7);
    expect(parseNumber('')).toBeUndefined();
    expect(parseNumber('deep')).toBeNaN();
  });

  it('works out the time out and air consumption', () => {
    expect(timeOut({ timeIn: '23:40', bottomTimeMin: 45 })).toBe('00:25');
    expect(timeOut({ timeIn: '09:00' })).toBeUndefined();
    // 150 bar from a 12 l tank over 50 min at an average of 15 m: 1800 l / 50 / 2.5 = 14.4 l/min.
    expect(airConsumption({ ...base, pressureStartBar: 200, pressureEndBar: 50, tankL: 12, bottomTimeMin: 50, avgDepthM: 15 })).toBe(14.4);
    expect(airConsumption({ ...base, pressureStartBar: 200, tankL: 12 })).toBeUndefined();
  });

  it('formats times for the page', () => {
    expect(formatMinutes(52)).toBe('52 min');
    expect(formatMinutes(65)).toBe('1 h 05 min');
    expect(formatMinutes(60 * 38)).toBe('38 h');
  });
});

describe('signatures', () => {
  it('turns finger strokes into compact path data inside the box', () => {
    const path = signaturePath([
      [[10, 10], [10.2, 10.1], [40, 30], [400, 30]],
      [[50, 50]],
    ]);
    expect(path).toBe('M10,10L40,30L300,30M50,50L50.6,50');
    expect(isSignaturePath(path!)).toBe(true);
    expect(signaturePath([])).toBeNull();
  });

  it('only accepts path data it drew itself', () => {
    expect(isSignaturePath('M1,2L3,4')).toBe(true);
    expect(isSignaturePath('M1,2 <script>')).toBe(false);
    expect(isSignaturePath('M1,2C3,4,5,6,7,8')).toBe(false);
    expect(isSignaturePath(undefined)).toBe(false);
  });
});

describe('past pages from older sightings', () => {
  it('makes one page per site and day, oldest first, numbered after the dives logged before', () => {
    const { dives, links } = bindPastSightings(
      'me',
      [
        sighting({ id: 'a', sightedOn: '2026-09-02', createdAt: '2026-09-02T09:00:00.000Z' }),
        sighting({ id: 'b', sightedOn: '2026-09-01', siteId: 'german-channel' }),
        sighting({ id: 'c', sightedOn: '2026-09-02', createdAt: '2026-09-02T08:00:00.000Z' }),
        sighting({ id: 'other', userId: 'someone' }),
        sighting({ id: 'demo', isDemo: true }),
        sighting({ id: 'paged', diveId: 'd-7' }),
      ],
      [],
      100,
      '2026-10-16T00:00:00.000Z',
    );
    expect(dives.map((d) => [d.number, d.siteId, d.divedOn, d.fromSightings])).toEqual([
      [101, 'german-channel', '2026-09-01', true],
      [102, 'blue-corner', '2026-09-02', true],
    ]);
    expect(dives[1].createdAt).toBe('2026-09-02T08:00:00.000Z');
    expect(links).toEqual([
      { sightingId: 'b', diveId: dives[0].id },
      { sightingId: 'a', diveId: dives[1].id },
      { sightingId: 'c', diveId: dives[1].id },
    ]);
  });

  it('gives the same page the same id on every phone, and reuses a page that exists', () => {
    expect(pastDiveId('me', 'blue-corner', '2026-09-02')).toBe(pastDiveId('me', 'blue-corner', '2026-09-02'));
    expect(pastDiveId('me', 'blue-corner', '2026-09-02')).not.toBe(pastDiveId('you', 'blue-corner', '2026-09-02'));
    const id = pastDiveId('me', 'blue-corner', '2026-09-01');
    const { dives, links } = bindPastSightings('me', [sighting({ id: 'late' })], [{ id, number: 7 }], 0, 'now');
    expect(dives).toEqual([]);
    expect(links).toEqual([{ sightingId: 'late', diveId: id }]);
  });
});

describe('the log as a whole', () => {
  it('adds up the totals', () => {
    const totals = logTotals([
      dive({ id: 'a', number: 120, maxDepthM: 18, bottomTimeMin: 50, waterTempC: 27, centreName: 'Sam’s Tours' }),
      dive({ id: 'b', number: 121, maxDepthM: 31, bottomTimeMin: 41, waterTempC: 24, signature: { name: 'Maya', at: 'x' } }),
      dive({ id: 'c', number: 122, siteId: 'german-channel' }),
    ]);
    expect(totals).toMatchObject({ lifetime: 122, pages: 3, bottomMinutes: 91, sites: 2, signed: 1, stamped: 1 });
    expect(totals.deepest).toEqual({ depth: 31, diveId: 'b' });
    expect(totals.longest).toEqual({ minutes: 50, diveId: 'a' });
    expect(totals.coldest).toEqual({ temp: 24, diveId: 'b' });
  });

  it('turns pages in number order', () => {
    const dives = [dive({ id: 'a', number: 3 }), dive({ id: 'b', number: 1 }), dive({ id: 'c', number: 2 })];
    expect(neighbours(dives, 'c')).toMatchObject({ older: { id: 'b' }, newer: { id: 'a' } });
    expect(neighbours(dives, 'a').newer).toBeUndefined();
  });
});
