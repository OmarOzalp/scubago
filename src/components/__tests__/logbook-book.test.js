import { describe, expect, jest, test } from '@jest/globals';
import { bookLeaves, keepPlace, leafAnnouncement, openingIndex, pageCount, shortDay } from '@/components/logbook/book';
import { contentsRowHeight } from '@/components/logbook/contents';
import { edgeCount } from '@/components/logbook/sheet';

jest.mock('@/global.css', () => ({}));
jest.mock('react-native-reanimated', () => ({ __esModule: true, useReducedMotion: () => true, default: { View: require('react-native').View } }));

const dive = (number, over = {}) => ({ id: `d${number}`, userId: 'local', number, siteId: 'blue-corner', divedOn: `2026-10-${String(number).padStart(2, '0')}`, createdAt: `2026-10-${String(number).padStart(2, '0')}T12:00:00Z`, synced: false, ...over });
const site = (id) => ({ 'blue-corner': 'Blue Corner', 'cod-hole': 'Cod Hole' })[id] ?? 'Unknown site';

describe('the book’s order', () => {
  test('the cover, then every page oldest first, whatever order the log keeps them in', () => {
    const leaves = bookLeaves([dive(23), dive(28), dive(22), dive(25)]);
    expect(leaves.map((l) => l.key)).toEqual(['cover', 'd22', 'd23', 'd25', 'd28']);
    expect(leaves.slice(1).map((l) => [l.page, l.of])).toEqual([[1, 4], [2, 4], [3, 4], [4, 4]]);
  });

  test('two pages with one number keep the order the logbook lists them in (the later dive after)', () => {
    const leaves = bookLeaves([dive(5, { id: 'b', divedOn: '2026-10-06' }), dive(5, { id: 'a', divedOn: '2026-10-05' })]);
    expect(leaves.map((l) => l.key)).toEqual(['cover', 'a', 'b']);
  });

  test('an empty log is the cover and one blank page', () => {
    expect(bookLeaves([]).map((l) => l.kind)).toEqual(['cover', 'blank']);
  });
});

describe('where the book opens', () => {
  test('at the newest page, the last one', () => {
    const leaves = bookLeaves([dive(1), dive(2), dive(3)]);
    expect(leaves[openingIndex(leaves)].key).toBe('d3');
  });

  test('an empty log opens at its blank page, not the cover', () => {
    const leaves = bookLeaves([]);
    expect(leaves[openingIndex(leaves)].kind).toBe('blank');
  });
});

describe('the page count and what a screen reader hears', () => {
  test('“28 of 28” on a page, nothing on the cover or a blank page', () => {
    const leaves = bookLeaves(Array.from({ length: 28 }, (_, i) => dive(i + 1)));
    expect(pageCount(leaves[28])).toBe('28 of 28');
    expect(pageCount(leaves[1])).toBe('1 of 28');
    expect(pageCount(leaves[0])).toBe('');
    expect(pageCount(bookLeaves([])[1])).toBe('');
  });

  test('a page is announced by its place, site and day: “Page 28 of 28, Blue Corner, October 12”', () => {
    const leaves = bookLeaves([dive(1, { divedOn: '2026-10-01' }), dive(2, { siteId: 'cod-hole', divedOn: '2026-10-12' })]);
    const said = leafAnnouncement(leaves[2], site);
    expect(said).toMatch(/^Page 2 of 2, Cod Hole, /);
    expect(said).toContain(shortDay('2026-10-12'));
    expect(shortDay('2026-10-12', 2026)).toMatch(/October/);
    expect(shortDay('2026-10-12', 2026)).toMatch(/12/);
    expect(shortDay('2026-10-12', 2026)).not.toMatch(/2026/);
    expect(shortDay('2024-10-12', 2026)).toMatch(/2024/);
    expect(leafAnnouncement(leaves[0], site)).toBe('Cover');
    expect(leafAnnouncement(bookLeaves([])[1], site)).toBe('A blank page');
  });
});

describe('keeping the place when the pages change', () => {
  test('the same page stays open when a page is added before it', () => {
    const before = bookLeaves([dive(1), dive(3)]);
    const after = bookLeaves([dive(1), dive(2), dive(3)]);
    expect(keepPlace(after, before[1].key, 1)).toBe(1);
    expect(keepPlace(after, 'd3', 2)).toBe(3);
  });

  test('a deleted page leaves the book open at the page now in its place, or the last one', () => {
    const after = bookLeaves([dive(1), dive(2)]);
    expect(keepPlace(after, 'd9', 2)).toBe(2);
    expect(keepPlace(after, 'd9', 3)).toBe(2);
    expect(keepPlace(bookLeaves([]), 'd1', 1)).toBe(1);
  });
});

describe('the page edges', () => {
  test('one edge for a page or two under this one, two for a few, three for a stack, none at the end', () => {
    expect([0, 1, 2, 3, 9, 10, 400].map(edgeCount)).toEqual([0, 1, 1, 2, 2, 3, 3]);
  });
});

describe('the contents rows', () => {
  test('are one height, a 44 point target or more, and taller with larger text', () => {
    expect(contentsRowHeight(1)).toBeGreaterThanOrEqual(44);
    expect(contentsRowHeight(1.5)).toBeGreaterThan(contentsRowHeight(1));
    expect(contentsRowHeight(2)).toBeGreaterThan(contentsRowHeight(1.5));
  });
});
