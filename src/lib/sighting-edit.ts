import type { Sighting } from '@/lib/types';

/** What the logging flow collects, for a new sighting or an edit. */
export interface SightingInput {
  speciesId: string;
  siteId: string;
  sightedOn: string;
  notes?: string;
  photoUri?: string;
}

type Facts = Pick<Sighting, 'speciesId' | 'siteId' | 'sightedOn'>;

/**
 * Whether an edit changes what a verification vouches for: which animal, where and when. Notes and
 * the diver's own photo don't: a buddy confirms the encounter, not the write-up.
 */
export function isMaterialChange(before: Facts, after: Facts): boolean {
  return before.speciesId !== after.speciesId || before.siteId !== after.siteId || before.sightedOn !== after.sightedOn;
}

/** Only the diver who logged a sighting may change or delete it (example data belongs to no one). */
export function canEditSighting(s: Sighting, ownerId: string): boolean {
  return !s.isDemo && s.userId === ownerId;
}

/**
 * The sighting after an edit, waiting to sync. Changing what was seen, where or when makes it
 * unverified again: an existing confirmation no longer applies, and only the server can grant a
 * new one. (The server enforces the same rule; see supabase/migrations.)
 */
export function applyEdit(before: Sighting, input: SightingInput, now: string): Sighting {
  const material = isMaterialChange(before, input);
  return {
    ...before,
    speciesId: input.speciesId,
    siteId: input.siteId,
    sightedOn: input.sightedOn,
    notes: input.notes?.trim() || undefined,
    photoUri: input.photoUri || undefined,
    status: material ? 'unverified' : before.status,
    updatedAt: now,
    synced: false,
    syncError: undefined,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** A calendar date as yyyy-mm-dd, in the diver's own time zone (not UTC's day). */
export function localIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Move a yyyy-mm-dd date by whole days (calendar arithmetic, so daylight saving can't skew it). */
export function shiftIsoDate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function isRealDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * The checks every sighting passes, new or edited. Returns what's wrong, or null.
 * `today` is the diver's local date (localIsoDate).
 */
export function validateSightingInput(
  input: SightingInput,
  known: { species: (id: string) => boolean; site: (id: string) => boolean; today: string },
): string | null {
  if (!known.species(input.speciesId)) return 'Choose the species you saw.';
  if (!known.site(input.siteId)) return 'Choose the dive site.';
  if (!isRealDate(input.sightedOn)) return 'That date isn’t valid.';
  if (input.sightedOn > known.today) return 'A sighting can’t be dated in the future.';
  return null;
}
