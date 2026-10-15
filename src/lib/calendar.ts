/** Calendar helpers for the date picker (components/date-field.tsx). Dates are yyyy-mm-dd, days in UTC. */

const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const utc = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

/** "Mon, 12 Oct 2026" in the device's language. */
export function longDate(iso: string, weekday: 'short' | 'long' = 'short'): string {
  return utc(iso).toLocaleDateString(undefined, {
    weekday,
    day: 'numeric',
    month: weekday === 'long' ? 'long' : 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * The days of a month as a Monday-first grid: null for the blanks before the 1st and after the last.
 * Always whole weeks.
 */
export function monthGrid(year: number, month: number): (string | null)[] {
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay(); // 0 = Sunday
  const blanks = (first + 6) % 7;
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (string | null)[] = Array(blanks).fill(null);
  for (let d = 1; d <= days; d++) cells.push(isoOf(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
