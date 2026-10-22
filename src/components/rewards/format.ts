/** Words and dates for the rewards screens. Dates come in as yyyy-mm-dd and are never run through a time zone. */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function parts(iso: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** "12 March 2026", for sentences and screen readers. */
export function longDate(iso: string): string {
  const p = parts(iso);
  return p ? `${p[2]} ${MONTHS[p[1] - 1]} ${p[0]}` : iso;
}

/** "12 MAR 2026", for the typewriter. */
export function stampDate(iso: string): string {
  const p = parts(iso);
  return p ? `${String(p[2]).padStart(2, '0')} ${MONTHS[p[1] - 1].slice(0, 3).toUpperCase()} ${p[0]}` : iso;
}

export const plural = (n: number, one: string, many: string = `${one}s`) => `${n.toLocaleString('en')} ${n === 1 ? one : many}`;

/** What a ladder of badges is called (the engine names the rungs, not the ladder). */
const LADDER_TITLES: Record<string, string> = {
  species: 'Species logged',
  dives: 'Dives',
  sites: 'Dive sites',
  countries: 'Countries',
  'gbr-sites': 'Great Barrier Reef',
  'red-sea-sites': 'Red Sea',
};

export function ladderTitle(key: string): string {
  return LADDER_TITLES[key] ?? key.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

export const TIER_LABEL = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' } as const;
