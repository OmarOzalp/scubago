import { sortDives } from '@/lib/dives';
import type { Dive } from '@/lib/types';

/**
 * The logbook as a book: the cover, then one leaf per dive, oldest first, so the newest page is the
 * last one and the book opens there. With no dives yet, the cover and one blank page.
 */
export type Leaf =
  | { kind: 'cover'; key: 'cover' }
  | { kind: 'blank'; key: 'blank' }
  /** `page` counts from 1 at the first page after the cover; `of` is how many pages there are. */
  | { kind: 'page'; key: string; dive: Dive; page: number; of: number };

export function bookLeaves(dives: Dive[]): Leaf[] {
  const pages = sortDives(dives).reverse();
  const cover: Leaf = { kind: 'cover', key: 'cover' };
  if (pages.length === 0) return [cover, { kind: 'blank', key: 'blank' }];
  return [cover, ...pages.map((dive, i): Leaf => ({ kind: 'page', key: dive.id, dive, page: i + 1, of: pages.length }))];
}

/** Where the book opens: its last page, the newest dive (or the blank page of an empty log). */
export const openingIndex = (leaves: readonly Leaf[]): number => Math.max(0, leaves.length - 1);

/** The leaf's place in the book, or -1. */
export const indexOfKey = (leaves: readonly Leaf[], key: string | null | undefined): number => (key ? leaves.findIndex((l) => l.key === key) : -1);

/** "6 of 6", the quiet page count; nothing on the cover or a blank page. */
export const pageCount = (leaf: Leaf | undefined): string => (leaf?.kind === 'page' ? `${leaf.page} of ${leaf.of}` : '');

/** "21 October", with the year when it isn't this year's. */
export function shortDay(isoDate: string, thisYear = new Date().getFullYear()): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: y === thisYear ? undefined : 'numeric', timeZone: 'UTC' });
}

/** What a screen reader says on turning to a leaf: "Page 6 of 6, Cod Hole, 21 October". */
export function leafAnnouncement(leaf: Leaf | undefined, siteName: (siteId: string) => string): string {
  if (!leaf) return '';
  if (leaf.kind === 'cover') return 'Cover';
  if (leaf.kind === 'blank') return 'A blank page';
  return `Page ${leaf.page} of ${leaf.of}, ${siteName(leaf.dive.siteId)}, ${shortDay(leaf.dive.divedOn)}`;
}

/** The leaf to show after the leaves changed: the same one when it is still there, else the one now at its place. */
export function keepPlace(leaves: readonly Leaf[], key: string | null, was: number): number {
  const at = indexOfKey(leaves, key);
  if (at >= 0) return at;
  return Math.max(0, Math.min(was, leaves.length - 1));
}
