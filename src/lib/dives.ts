/**
 * The dive log: each dive is a numbered page with the site, the date, what the diver measured and
 * noted, the animals they saw (sightings carry its id) and, if they have them, a buddy's signature
 * and a dive centre's stamp. This module holds the rules that don't need a database or a screen:
 * numbering, milestones, checking what the form collected, and binding sightings logged before
 * dives existed into past pages.
 */
import type {
  Dive,
  DiveCurrent,
  DiveEntry,
  DiveFields,
  DiveGas,
  DiveKind,
  DiveSignature,
  DiveSuit,
  DiveSurface,
  Sighting,
  TankMaterial,
} from '@/lib/types';

/** Dive numbers a diver celebrates: each gets a bookplate page. */
export const MILESTONES = [25, 50, 100, 150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000] as const;

export const MAX_DIVE_NUMBER = 100000;

/** The number the next page gets: one after the highest so far, or after the dives logged before ScubaGo. */
export function nextDiveNumber(dives: Pick<Dive, 'number'>[], divesBefore: number): number {
  const top = dives.reduce((max, d) => Math.max(max, d.number), 0);
  return Math.max(top, Math.max(0, Math.floor(divesBefore))) + 1;
}

/** The milestone a dive number reaches, or null. */
export function milestoneAt(number: number): number | null {
  return (MILESTONES as readonly number[]).includes(number) ? number : null;
}

/** The next milestone from a dive number on (the number itself counts), and how many dives away it is. */
export function nextMilestone(number: number): { at: number; remaining: number } | null {
  const at = MILESTONES.find((m) => m >= number);
  return at ? { at, remaining: at - number } : null;
}

/** "fiftieth", "hundredth"… for a milestone; plain "No. 1,500" style beyond the words we have. */
export function milestoneName(at: number): string {
  const words: Record<number, string> = {
    25: 'twenty-fifth', 50: 'fiftieth', 100: 'hundredth', 150: 'hundred-and-fiftieth', 200: 'two-hundredth',
    250: 'two-hundred-and-fiftieth', 300: 'three-hundredth', 400: 'four-hundredth', 500: 'five-hundredth',
    750: 'seven-hundred-and-fiftieth', 1000: 'thousandth',
  };
  return words[at] ?? `${at.toLocaleString('en')}th`;
}

// ── Choices ──────────────────────────────────────────────────────────────────

export const CURRENTS: { id: DiveCurrent; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'light', label: 'Light' },
  { id: 'moderate', label: 'Moderate' },
  { id: 'strong', label: 'Strong' },
];
export const SURFACES: { id: DiveSurface; label: string }[] = [
  { id: 'calm', label: 'Calm' },
  { id: 'choppy', label: 'Choppy' },
  { id: 'rough', label: 'Rough' },
];
export const ENTRIES: { id: DiveEntry; label: string }[] = [
  { id: 'boat', label: 'Boat' },
  { id: 'shore', label: 'Shore' },
  { id: 'liveaboard', label: 'Liveaboard' },
];
export const KINDS: { id: DiveKind; label: string }[] = [
  { id: 'reef', label: 'Reef' },
  { id: 'wall', label: 'Wall' },
  { id: 'wreck', label: 'Wreck' },
  { id: 'drift', label: 'Drift' },
  { id: 'night', label: 'Night' },
  { id: 'muck', label: 'Muck' },
  { id: 'cave', label: 'Cavern' },
  { id: 'deep', label: 'Deep' },
  { id: 'training', label: 'Training' },
];
export const GASES: { id: DiveGas; label: string }[] = [
  { id: 'air', label: 'Air' },
  { id: 'nitrox', label: 'Nitrox' },
  { id: 'trimix', label: 'Trimix' },
];
export const TANK_MATERIALS: { id: TankMaterial; label: string }[] = [
  { id: 'aluminium', label: 'Aluminium' },
  { id: 'steel', label: 'Steel' },
];
export const SUITS: { id: DiveSuit; label: string }[] = [
  { id: 'none', label: 'No suit' },
  { id: 'skin', label: 'Skin' },
  { id: 'shorty', label: 'Shorty' },
  { id: 'wet3', label: '3 mm' },
  { id: 'wet5', label: '5 mm' },
  { id: 'wet7', label: '7 mm' },
  { id: 'semidry', label: 'Semi-dry' },
  { id: 'dry', label: 'Drysuit' },
];

export const labelOf = <T extends string>(list: { id: T; label: string }[], id: T | undefined): string | undefined =>
  list.find((x) => x.id === id)?.label;

// ── Checking and tidying the form ────────────────────────────────────────────

/** Limits for each measured field: [min, max, decimals]. Anything outside is a typo, not a dive. */
export const RANGES = {
  bottomTimeMin: [1, 600, 0],
  maxDepthM: [0, 350, 1],
  avgDepthM: [0, 350, 1],
  waterTempC: [-3, 40, 1],
  airTempC: [-40, 55, 1],
  visibilityM: [0, 100, 1],
  o2Percent: [21, 100, 0],
  tankL: [1, 30, 1],
  pressureStartBar: [0, 350, 0],
  pressureEndBar: [0, 350, 0],
  weightKg: [0, 40, 1],
  rating: [1, 5, 0],
} as const satisfies Record<string, readonly [number, number, number]>;

export type MeasuredField = keyof typeof RANGES;

const TEXT_MAX = { buddyName: 80, centreName: 80, notes: 4000 } as const;

const pad = (n: number) => String(n).padStart(2, '0');

/** "9:5", "0930", "9.30 am" and the like as HH:MM (24 h), or null if it isn't a time of day. */
export function parseTime(text: string): string | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, '');
  if (!t) return null;
  const m = /^(\d{1,2})(?:[:.h]?(\d{2}))?(am|pm)?$/.exec(t);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (m[3] === 'pm' ? 12 : 0);
  }
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}

/** A number typed in the form ("28", "28,5", " 7 "), or undefined when the box is empty; NaN if it isn't one. */
export function parseNumber(text: string | undefined): number | undefined {
  const t = (text ?? '').trim().replace(',', '.');
  if (!t) return undefined;
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

const round = (v: number, decimals: number) => Math.round(v * 10 ** decimals) / 10 ** decimals;

function isRealDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

const FIELD_NAMES: Record<MeasuredField, string> = {
  bottomTimeMin: 'Bottom time',
  maxDepthM: 'Maximum depth',
  avgDepthM: 'Average depth',
  waterTempC: 'Water temperature',
  airTempC: 'Air temperature',
  visibilityM: 'Visibility',
  o2Percent: 'Oxygen',
  tankL: 'Tank size',
  pressureStartBar: 'Start pressure',
  pressureEndBar: 'End pressure',
  weightKg: 'Weight',
  rating: 'Rating',
};

/**
 * What's wrong with a page before it is written, or null. `today` is the diver's local date
 * (localIsoDate); `site` says whether a site id is known.
 */
export function validateDive(input: DiveFields, known: { site: (id: string) => boolean; today: string }): string | null {
  if (!Number.isInteger(input.number) || input.number < 1 || input.number > MAX_DIVE_NUMBER) return 'The dive number has to be a whole number from 1.';
  if (!known.site(input.siteId)) return 'Choose the dive site.';
  if (!isRealDate(input.divedOn)) return 'That date isn’t valid.';
  if (input.divedOn > known.today) return 'A dive can’t be dated in the future.';
  if (input.timeIn !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.timeIn)) return 'Write the time in as hours and minutes, like 09:30.';
  for (const key of Object.keys(RANGES) as MeasuredField[]) {
    const v = input[key];
    if (v === undefined) continue;
    const [min, max] = RANGES[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) return `${FIELD_NAMES[key]} has to be a number.`;
    if (v < min || v > max) return `${FIELD_NAMES[key]} has to be between ${min} and ${max}.`;
  }
  if (input.avgDepthM !== undefined && input.maxDepthM !== undefined && input.avgDepthM > input.maxDepthM) {
    return 'The average depth can’t be deeper than the maximum.';
  }
  if (input.pressureStartBar !== undefined && input.pressureEndBar !== undefined && input.pressureEndBar > input.pressureStartBar) {
    return 'The end pressure can’t be higher than the start pressure.';
  }
  if (input.o2Percent !== undefined && input.gas === 'air') return 'Air is 21% oxygen; choose Nitrox for a richer mix.';
  if (input.rating !== undefined && !Number.isInteger(input.rating)) return 'The rating is a whole number of stars.';
  for (const [key, max] of Object.entries(TEXT_MAX) as [keyof typeof TEXT_MAX, number][]) {
    if ((input[key]?.length ?? 0) > max) return `Keep it under ${max} characters.`;
  }
  return null;
}

/** The page as it will be kept: text trimmed, empty fields dropped, numbers rounded to sensible steps. */
export function cleanDive(input: DiveFields): DiveFields {
  const out: DiveFields = { number: input.number, siteId: input.siteId, divedOn: input.divedOn };
  if (input.timeIn) out.timeIn = input.timeIn;
  for (const key of Object.keys(RANGES) as MeasuredField[]) {
    const v = input[key];
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = round(v, RANGES[key][2]);
  }
  if (input.current) out.current = input.current;
  if (input.surface) out.surface = input.surface;
  if (input.entry) out.entry = input.entry;
  if (input.kinds?.length) out.kinds = [...new Set(input.kinds)];
  if (input.gas) out.gas = input.gas;
  if (input.gas !== 'nitrox' && input.gas !== 'trimix') delete out.o2Percent;
  if (input.tankMaterial) out.tankMaterial = input.tankMaterial;
  if (input.suit) out.suit = input.suit;
  const text = (s: string | undefined) => s?.replace(/[ \t]+/g, ' ').trim() || undefined;
  const buddy = text(input.buddyName);
  const centre = text(input.centreName);
  const notes = input.notes?.trim() || undefined;
  if (buddy) out.buddyName = buddy;
  if (centre) out.centreName = centre;
  if (notes) out.notes = notes;
  if (input.signature) out.signature = input.signature;
  return out;
}

/** Air used, in bar, when both pressures are known. */
export const airUsed = (d: Pick<DiveFields, 'pressureStartBar' | 'pressureEndBar'>): number | undefined =>
  d.pressureStartBar !== undefined && d.pressureEndBar !== undefined ? d.pressureStartBar - d.pressureEndBar : undefined;

/**
 * Surface air consumption in litres a minute (at the surface), when the tank, pressures, time and
 * a depth are known: the gas used, spread over the dive, scaled back to one atmosphere.
 */
export function airConsumption(d: DiveFields): number | undefined {
  const used = airUsed(d);
  const depth = d.avgDepthM ?? (d.maxDepthM !== undefined ? d.maxDepthM * 0.6 : undefined);
  if (used === undefined || !d.tankL || !d.bottomTimeMin || depth === undefined || used <= 0) return undefined;
  return round((used * d.tankL) / d.bottomTimeMin / (1 + depth / 10), 1);
}

// ── Signatures ───────────────────────────────────────────────────────────────

/** The signature box strokes are drawn into. */
export const SIGNATURE_BOX = { width: 300, height: 100 } as const;

/**
 * Finger strokes as SVG path data in the signature box: each stroke a polyline, points closer than
 * half a unit dropped, coordinates to one decimal. Null when nothing was drawn.
 */
export function signaturePath(strokes: [number, number][][]): string | null {
  const parts: string[] = [];
  for (const stroke of strokes) {
    const kept: [number, number][] = [];
    for (const [x, y] of stroke) {
      const cx = Math.min(SIGNATURE_BOX.width, Math.max(0, x));
      const cy = Math.min(SIGNATURE_BOX.height, Math.max(0, y));
      const last = kept[kept.length - 1];
      if (!last || Math.hypot(cx - last[0], cy - last[1]) >= 0.5) kept.push([cx, cy]);
    }
    if (kept.length === 0) continue;
    // A tap is a dot: a tiny line, so it still shows with round caps.
    if (kept.length === 1) kept.push([kept[0][0] + 0.6, kept[0][1]]);
    parts.push(kept.map(([x, y], i) => `${i ? 'L' : 'M'}${round(x, 1)},${round(y, 1)}`).join(''));
  }
  return parts.length ? parts.join('') : null;
}

/** Signature path data the app will draw: only M/L commands and numbers, and not too long. */
export function isSignaturePath(svg: string | undefined): boolean {
  return !!svg && svg.length <= 20000 && /^(?:[ML]-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?)+$/.test(svg);
}

/** Every signature on a page: the one signed on the diver's phone first, then any sent from a buddy's. */
export function signaturesOf(d: Pick<Dive, 'signature' | 'remoteSignatures'>): DiveSignature[] {
  return [...(d.signature ? [d.signature] : []), ...(d.remoteSignatures ?? [])];
}

// ── Past pages from sightings logged before dives ────────────────────────────

/** FNV-1a, as a short stable tag. */
function tag(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/**
 * The id of the past page for a site and day. The same on every device, so two phones binding the
 * same old sightings make the same page rather than two.
 */
export function pastDiveId(ownerId: string, siteId: string, date: string): string {
  return `d-past-${tag(`${ownerId}|${siteId}|${date}`)}-${tag(`${date}|${siteId}`)}`;
}

/**
 * Pages for the diver's sightings that belong to no dive (logged before dives existed, or by an
 * older version of the app): one page per site and day, oldest first, numbered after the pages
 * already written. A page that already exists for that site and day takes its sightings instead.
 * Returns the new pages and which sightings go on which page.
 */
export function bindPastSightings(
  ownerId: string,
  sightings: Pick<Sighting, 'id' | 'userId' | 'siteId' | 'sightedOn' | 'createdAt' | 'isDemo' | 'diveId'>[],
  dives: Pick<Dive, 'id' | 'number'>[],
  divesBefore: number,
  now: string,
): { dives: Dive[]; links: { sightingId: string; diveId: string }[] } {
  const loose = sightings.filter((s) => s.userId === ownerId && !s.isDemo && !s.diveId);
  if (loose.length === 0) return { dives: [], links: [] };
  const groups = new Map<string, { siteId: string; date: string; first: string; ids: string[] }>();
  for (const s of loose) {
    const key = `${s.sightedOn}|${s.siteId}`;
    const g = groups.get(key);
    if (g) {
      g.ids.push(s.id);
      if (s.createdAt < g.first) g.first = s.createdAt;
    } else groups.set(key, { siteId: s.siteId, date: s.sightedOn, first: s.createdAt, ids: [s.id] });
  }
  const ordered = [...groups.values()].sort((a, b) => (a.date === b.date ? a.first.localeCompare(b.first) : a.date.localeCompare(b.date)));
  const existing = new Set(dives.map((d) => d.id));
  let number = nextDiveNumber(dives, divesBefore);
  const created: Dive[] = [];
  const links: { sightingId: string; diveId: string }[] = [];
  for (const g of ordered) {
    const id = pastDiveId(ownerId, g.siteId, g.date);
    if (!existing.has(id)) {
      created.push({
        id,
        userId: ownerId,
        number: number++,
        siteId: g.siteId,
        divedOn: g.date,
        fromSightings: true,
        synced: false,
        createdAt: g.first,
      });
      existing.add(id);
    }
    for (const sightingId of g.ids) links.push({ sightingId, diveId: id });
  }
  return { dives: created, links };
}

// ── The log as a whole ───────────────────────────────────────────────────────

/** Newest page first (by number; the same number by date, then when it was written). */
export function sortDives<T extends Pick<Dive, 'number' | 'divedOn' | 'createdAt'>>(dives: T[]): T[] {
  return [...dives].sort((a, b) =>
    b.number !== a.number ? b.number - a.number : b.divedOn !== a.divedOn ? b.divedOn.localeCompare(a.divedOn) : b.createdAt.localeCompare(a.createdAt),
  );
}

/** The pages either side of one: `older` has the lower number. */
export function neighbours<T extends Pick<Dive, 'id' | 'number' | 'divedOn' | 'createdAt'>>(dives: T[], id: string): { older?: T; newer?: T } {
  const sorted = sortDives(dives);
  const i = sorted.findIndex((d) => d.id === id);
  if (i < 0) return {};
  return { newer: sorted[i - 1], older: sorted[i + 1] };
}

export interface LogTotals {
  /** The diver's lifetime count: the highest dive number. */
  lifetime: number;
  /** Pages in ScubaGo. */
  pages: number;
  bottomMinutes: number;
  deepest?: { depth: number; diveId: string };
  longest?: { minutes: number; diveId: string };
  coldest?: { temp: number; diveId: string };
  sites: number;
  signed: number;
  stamped: number;
}

export function logTotals(dives: Dive[]): LogTotals {
  const totals: LogTotals = { lifetime: 0, pages: dives.length, bottomMinutes: 0, sites: new Set(dives.map((d) => d.siteId)).size, signed: 0, stamped: 0 };
  for (const d of dives) {
    totals.lifetime = Math.max(totals.lifetime, d.number);
    totals.bottomMinutes += d.bottomTimeMin ?? 0;
    if (d.maxDepthM !== undefined && (!totals.deepest || d.maxDepthM > totals.deepest.depth)) totals.deepest = { depth: d.maxDepthM, diveId: d.id };
    if (d.bottomTimeMin !== undefined && (!totals.longest || d.bottomTimeMin > totals.longest.minutes)) totals.longest = { minutes: d.bottomTimeMin, diveId: d.id };
    if (d.waterTempC !== undefined && (!totals.coldest || d.waterTempC < totals.coldest.temp)) totals.coldest = { temp: d.waterTempC, diveId: d.id };
    if (signaturesOf(d).length > 0) totals.signed++;
    if (d.centreName) totals.stamped++;
  }
  return totals;
}

/** "52 min", "1 h 05 min"; "38 h" for long totals. */
export function formatMinutes(min: number): string {
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h >= 20 ? `${h} h` : `${h} h ${pad(m)} min`;
}

/** "28 m", "28.5 m". */
export const formatDepth = (m: number): string => `${Number.isInteger(m) ? m : m.toFixed(1)} m`;

/** "No. 1,204". */
export const formatDiveNumber = (n: number): string => `No. ${n.toLocaleString('en')}`;

/** The time out, from the time in and the bottom time, as HH:MM (wrapping past midnight). */
export function timeOut(d: Pick<DiveFields, 'timeIn' | 'bottomTimeMin'>): string | undefined {
  if (!d.timeIn || !d.bottomTimeMin) return undefined;
  const [h, m] = d.timeIn.split(':').map(Number);
  const total = (h * 60 + m + d.bottomTimeMin) % (24 * 60);
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}
