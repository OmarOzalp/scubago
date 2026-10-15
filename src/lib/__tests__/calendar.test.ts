import { describe, expect, it } from '@jest/globals';

import { longDate, monthGrid } from '@/lib/calendar';

describe('monthGrid', () => {
  it('lays a month out in whole Monday-first weeks', () => {
    // October 2026 starts on a Thursday and has 31 days.
    const cells = monthGrid(2026, 9);
    expect(cells.length % 7).toBe(0);
    expect(cells.slice(0, 4)).toEqual([null, null, null, '2026-10-01']);
    expect(cells.filter(Boolean)).toHaveLength(31);
    expect(cells.filter(Boolean).at(-1)).toBe('2026-10-31');
  });

  it('handles leap years and months that start on a Monday', () => {
    expect(monthGrid(2028, 1).filter(Boolean)).toHaveLength(29);
    expect(monthGrid(2027, 1).filter(Boolean)).toHaveLength(28);
    expect(monthGrid(2026, 5)[0]).toBe('2026-06-01'); // 1 June 2026 is a Monday
  });
});

describe('longDate', () => {
  it('names the day the diver picked, whatever the time zone', () => {
    expect(longDate('2026-10-15', 'long')).toMatch(/15/);
    expect(longDate('2026-10-15', 'long')).toMatch(/2026/);
  });
});
