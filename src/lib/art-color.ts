/** Small colour helpers for the species drawings (hex in, hex out). */

function channels(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

function toHex([r, g, b]: number[]): string {
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/** `a` blended towards `b` by `t` (0 = a, 1 = b). */
export function mix(a: string, b: string, t: number): string {
  const ca = channels(a);
  const cb = channels(b);
  return toHex(ca.map((v, i) => v + (cb[i] - v) * t));
}

export const lighten = (hex: string, t: number) => mix(hex, '#FFFFFF', t);
export const darken = (hex: string, t: number) => mix(hex, '#0B1626', t);
