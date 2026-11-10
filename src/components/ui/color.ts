/** `amount` (0 to 1) of `tint` laid over `base`, as an opaque hex colour: soft fills that art can be drawn on. */
export function mix(base: string, tint: string, amount: number): string {
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const a = rgb(base);
  const b = rgb(tint);
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * amount).toString(16).padStart(2, '0')).join('')}`;
}
