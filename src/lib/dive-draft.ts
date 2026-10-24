/**
 * A page of the log while it is being written: what the form holds (numbers as the diver typed
 * them), and turning that into a dive's fields. Kept apart from the screens so the rules can be
 * tested without one.
 */
import { FIELD_NAMES, parseNumber, parseTime, type MeasuredField } from '@/lib/dives';
import type { Dive, DiveCurrent, DiveEntry, DiveFields, DiveGas, DiveKind, DiveSignature, DiveSuit, DiveSurface, TankMaterial } from '@/lib/types';

/** Fields typed as numbers (the rating is chosen with stars). */
export const TYPED_NUMBERS = [
  'bottomTimeMin',
  'maxDepthM',
  'avgDepthM',
  'waterTempC',
  'airTempC',
  'visibilityM',
  'o2Percent',
  'tankL',
  'pressureStartBar',
  'pressureEndBar',
  'weightKg',
] as const satisfies readonly MeasuredField[];

export type TypedNumber = (typeof TYPED_NUMBERS)[number];

/** A field of the form that a problem can be about: where its message is shown, and what takes focus. */
export type DraftField = 'number' | 'siteId' | 'divedOn' | 'timeIn' | TypedNumber;

export type DiveDraft = Record<TypedNumber, string> & {
  number: string;
  siteId: string | null;
  divedOn: string;
  timeIn: string;
  current?: DiveCurrent;
  surface?: DiveSurface;
  entry?: DiveEntry;
  kinds: DiveKind[];
  gas?: DiveGas;
  tankMaterial?: TankMaterial;
  suit?: DiveSuit;
  rating?: number;
  buddyName: string;
  centreName: string;
  notes: string;
  /** Kept as it is: signing happens on its own screen. */
  signature?: DiveSignature;
};

const show = (n: number | undefined) => (n === undefined ? '' : String(n));

/** A blank page with its number, site and date. */
export function emptyDraft(start: { number: number; siteId: string | null; divedOn: string }): DiveDraft {
  const numbers = Object.fromEntries(TYPED_NUMBERS.map((k) => [k, ''])) as Record<TypedNumber, string>;
  return { ...numbers, number: String(start.number), siteId: start.siteId, divedOn: start.divedOn, timeIn: '', kinds: [], buddyName: '', centreName: '', notes: '' };
}

/** The form for a page already written. */
export function draftFromDive(d: DiveFields): DiveDraft {
  const numbers = Object.fromEntries(TYPED_NUMBERS.map((k) => [k, show(d[k])])) as Record<TypedNumber, string>;
  return {
    ...numbers,
    number: String(d.number),
    siteId: d.siteId,
    divedOn: d.divedOn,
    timeIn: d.timeIn ?? '',
    current: d.current,
    surface: d.surface,
    entry: d.entry,
    kinds: d.kinds ?? [],
    gas: d.gas,
    tankMaterial: d.tankMaterial,
    suit: d.suit,
    rating: d.rating,
    buddyName: d.buddyName ?? '',
    centreName: d.centreName ?? '',
    notes: d.notes ?? '',
    signature: d.signature,
  };
}

/**
 * The page's fields from the form, or what to fix first and the field it is about. Only the typing
 * is checked here (a number that isn't one, a time that isn't a time); the store checks the page
 * itself (validateDive), and fieldOfProblem finds the field of what it says.
 */
export function readDraft(
  draft: DiveDraft,
): { fields: DiveFields; problem?: undefined; field?: undefined } | { fields?: undefined; problem: string; field: DraftField } {
  if (!draft.siteId) return { problem: 'Choose the dive site.', field: 'siteId' };
  const number = parseNumber(draft.number);
  if (number === undefined || Number.isNaN(number)) return { problem: 'Give the dive a number.', field: 'number' };
  const fields: DiveFields = { number, siteId: draft.siteId, divedOn: draft.divedOn };
  if (draft.timeIn.trim()) {
    const time = parseTime(draft.timeIn);
    if (!time) return { problem: 'Write the time in as hours and minutes, like 09:30.', field: 'timeIn' };
    fields.timeIn = time;
  }
  for (const key of TYPED_NUMBERS) {
    const v = parseNumber(draft[key]);
    if (v === undefined) continue;
    if (Number.isNaN(v)) return { problem: `${FIELD_NAMES[key]} has to be a number.`, field: key };
    fields[key] = v;
  }
  if (draft.rating) fields.rating = draft.rating;
  if (draft.current) fields.current = draft.current;
  if (draft.surface) fields.surface = draft.surface;
  if (draft.entry) fields.entry = draft.entry;
  if (draft.kinds.length) fields.kinds = draft.kinds;
  if (draft.gas) fields.gas = draft.gas;
  if (draft.tankMaterial) fields.tankMaterial = draft.tankMaterial;
  if (draft.suit) fields.suit = draft.suit;
  if (draft.buddyName.trim()) fields.buddyName = draft.buddyName;
  if (draft.centreName.trim()) fields.centreName = draft.centreName;
  if (draft.notes.trim()) fields.notes = draft.notes;
  if (draft.signature) fields.signature = draft.signature;
  return { fields };
}

/**
 * The field a message from the store's checks (validateDive) is about, so it can be shown under it
 * and the diver taken there. Nothing for a message about the page as a whole.
 */
export function fieldOfProblem(message: string): DraftField | undefined {
  for (const key of TYPED_NUMBERS) if (message.startsWith(FIELD_NAMES[key])) return key;
  if (/dive number/i.test(message)) return 'number';
  if (/dive site/i.test(message)) return 'siteId';
  if (/\bdate/i.test(message)) return 'divedOn';
  if (/time in|hours and minutes/i.test(message)) return 'timeIn';
  if (/average depth/i.test(message)) return 'avgDepthM';
  if (/end pressure/i.test(message)) return 'pressureEndBar';
  if (/oxygen/i.test(message)) return 'o2Percent';
  return undefined;
}

/** The quick fields: what most divers write on every page. Everything else is under "More details". */
const QUICK: (keyof DiveFields)[] = ['number', 'siteId', 'divedOn', 'timeIn', 'bottomTimeMin', 'maxDepthM', 'notes', 'signature'];

/** Whether a page has anything beyond the quick fields (so the form opens with "More details" shown). */
export function hasMoreDetails(d: DiveFields): boolean {
  return (Object.keys(d) as (keyof DiveFields)[]).some((k) => !QUICK.includes(k) && d[k] !== undefined && !(Array.isArray(d[k]) && (d[k] as unknown[]).length === 0));
}

/** How many days apart two yyyy-mm-dd dates are. */
function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000;
}

/**
 * What a new page starts with from the diver's latest one: the gas and gear always (they rarely
 * change), and the buddy and dive centre when it was within a few days (the same trip). Returns
 * what was carried over, so the form can say so.
 */
export function carryOver(latest: Dive | undefined, divedOn: string): { patch: Partial<DiveDraft>; from?: number; what: string[] } {
  if (!latest) return { patch: {}, what: [] };
  const patch: Partial<DiveDraft> = {};
  const what: string[] = [];
  const gear = { gas: latest.gas, o2Percent: show(latest.o2Percent), tankL: show(latest.tankL), tankMaterial: latest.tankMaterial, weightKg: show(latest.weightKg), suit: latest.suit };
  if (latest.gas || latest.tankL !== undefined || latest.tankMaterial || latest.weightKg !== undefined || latest.suit) {
    Object.assign(patch, gear);
    what.push('gear');
  }
  if (daysBetween(latest.divedOn, divedOn) <= 3) {
    if (latest.buddyName) {
      patch.buddyName = latest.buddyName;
      what.push('buddy');
    }
    if (latest.centreName) {
      patch.centreName = latest.centreName;
      what.push('dive centre');
    }
  }
  return what.length ? { patch, from: latest.number, what } : { patch: {}, what: [] };
}
