/**
 * Sharks drawn from above: the two hammerheads (told apart by the hammer's front edge) and the
 * tasselled wobbegong (its fringe of branched flaps and mosaic back).
 */
import { add, blob, type Ctrl, mul, norm, perp, type Pt, spline, sub } from '../kit';
import { scatter, scatterIn } from '../marks';
import type { PlateDef } from '../registry';
import { at, region, tAtX } from '../side';
import { mirrorY, topShark, type TopSharkSpec } from '../topshark';
import type { Fill, Part } from '../types';

/** A body outline from above, from half-widths along its length. */
const sides = (half: [number, number][]): { top: Ctrl[]; bot: Ctrl[] } => {
  const top = half.map(([x, w]) => [x, -w] as Ctrl);
  return { top, bot: mirrorY(top) };
};

/** One half of a hammer margin (y from the left tip to the middle), completed by its mirror image. */
const whole = (half: Ctrl[]): Ctrl[] => [
  ...half,
  ...half
    .slice(0, -1)
    .reverse()
    .map((p) => (p.length === 3 ? [p[0], -p[1], 1] : [p[0], -p[1]]) as Ctrl),
];

// ── Great hammerhead ─────────────────────────────────────────────────────────
// The hammer's front edge nearly straight (a T) with a shallow central notch; a giant sickle
// first dorsal; sickle-shaped pelvic fins; a tall second dorsal with a hollow trailing edge.
const great: TopSharkSpec = {
  tip: [3, 0],
  ...sides([
    [4, 2.6],
    [6, 3.8],
    [9, 4.4],
    [14, 5],
    [20, 5.6],
    [27, 5.9],
    [36, 5.4],
    [46, 4.5],
    [56, 3.3],
    [65, 2.3],
    [73, 1.5],
  ]),
  head: {
    front: whole([
      [0.9, -12.7, 1],
      [0.3, -11.4],
      [0.2, -9.2],
      [0.42, -7.4],
      [0.15, -5.4],
      [0.05, -2],
      [0.7, 0],
    ]),
    rear: whole([
      [0.9, -12.7, 1],
      [3.6, -12.9],
      [4.6, -12],
      [5, -9.6],
      [5.6, -6.8],
      [7.6, -4.9],
      [9, -4.4],
      [9.6, 0],
    ]),
  },
  pec: { at: 21, base: 6, h: 11, sweep: 1.5, rear: 2.4, concave: 0.16, round: 0.4 },
  pelvic: { at: 47, base: 4, h: 5.2, sweep: 1.4, rear: 1.8, concave: 0.28, round: 0.2 },
  d1: { at: 27, base: 9, h: 10.5, sweep: 0.98, rear: 2.6, concave: 0.26, convex: 0.1, round: 0.3 },
  d2: { at: 60, base: 3.2, h: 3.4, sweep: 0.8, rear: 1.4, concave: 0.28 },
  anal: { at: 59, base: 3.4, h: 3.2, sweep: 0.8, rear: 1.4, concave: 0.25 },
  caudal: { upper: [100, -10], lower: [86.5, 7], fork: [84.5, 1], notch: 3, trail: 0.06 },
  eyes: [
    [2.4, -12.35],
    [2.4, 12.35],
  ],
  eyeR: 0.55,
};

// ── Scalloped hammerhead ─────────────────────────────────────────────────────
// The hammer's front edge a broad arch with a central notch and smaller scallops either side;
// swept-back blades; a moderately tall first dorsal with a near-straight trailing edge; a low
// second dorsal with a long trailing tip.
const scalloped: TopSharkSpec = {
  tip: [3.5, 0],
  ...sides([
    [4.5, 2.4],
    [7, 3.7],
    [10, 4.1],
    [15, 4.6],
    [21, 5.1],
    [28, 5.3],
    [37, 4.9],
    [47, 4],
    [57, 3],
    [66, 2.1],
    [73, 1.4],
  ]),
  head: {
    front: whole([
      [5.8, -13.5],
      [4.3, -12.9],
      [3.3, -11.2],
      [2.7, -9.5],
      [3.05, -8.5],
      [2.15, -7.1],
      [1.3, -5.1],
      [0.55, -3.1],
      [0.05, -1.6],
      [0.95, 0],
    ]),
    rear: whole([
      [5.8, -13.5],
      [7, -13.3],
      [7.6, -11.6],
      [7.5, -9.2],
      [7.9, -6.6],
      [9.3, -4.4],
      [10.2, -4],
      [10.8, 0],
    ]),
  },
  pec: { at: 21, base: 5.6, h: 10, sweep: 1.3, rear: 2.2, concave: 0.1, round: 0.6 },
  pelvic: { at: 47, base: 4, h: 4.4, sweep: 1, rear: 1.4, concave: 0.03, round: 0.3 },
  d1: { at: 28, base: 9, h: 7.4, sweep: 0.75, rear: 2.2, concave: 0.06, convex: 0.08, round: 0.7 },
  d2: { at: 62, base: 2.4, h: 1.5, sweep: 0.6, rear: 6, rearLift: 0.3 },
  anal: { at: 60.5, base: 3.4, h: 2.6, sweep: 0.7, rear: 1.4, concave: 0.2 },
  caudal: { upper: [100, -9.6], lower: [86.5, 6.4], fork: [84.5, 1], notch: 3, trail: 0.06 },
  eyes: [
    [6.3, -13.1],
    [6.3, 13.1],
  ],
  eyeR: 0.55,
};

// ── Tasselled wobbegong ──────────────────────────────────────────────────────
// A fringe of branched skin flaps round the very broad, flat head (wider than long); a
// reticulated mosaic of dark lines round pale spots; huge rounded pectorals and pelvics; both
// dorsals set far back on a short tail.
const wobbegong: TopSharkSpec = {
  tip: [0, 0],
  blunt: 1,
  ...sides([
    [0.5, 5.4],
    [1.8, 8.2],
    [4.5, 9.8],
    [9.5, 10.6],
    [15, 10.4],
    [21, 9.6],
    [30, 8.3],
    [40, 6.5],
    [50, 4.7],
    [60, 3.4],
    [70, 2.4],
    [78, 1.8],
  ]),
  pec: { at: 18.5, base: 11.5, h: 12.5, sweep: 0.72, rear: 1.4, convex: 0.14, concave: -0.06, round: 5 },
  pelvic: { at: 42, base: 9, h: 8, sweep: 0.75, rear: 1.2, convex: 0.12, concave: -0.04, round: 3.6 },
  d1: { at: 51, base: 7, h: 3.4, sweep: 0.55, rear: 1.2, round: 1.6, convex: 0.1 },
  d2: { at: 65, base: 6, h: 3, sweep: 0.55, rear: 1.1, round: 1.3, convex: 0.1 },
  caudal: { upper: [100, -3.4], lower: [86, 3.4], fork: [91, 1.8], notch: 2.6, trail: 0, lowerTrail: 0, lowerRound: 3, upperBow: 0.02 },
  eyes: [
    [7.4, -4.4],
    [7.4, 4.4],
  ],
  eyeR: 0.6,
  extra: (c) => {
    const s = c.s;
    // Tassels: branched flaps all round the front and sides of the head.
    const tassels: Part[] = [];
    const edgePts: { p: Pt; n: Pt }[] = [];
    const tEnd = tAtX(s, 17);
    for (const side of ['top', 'bot'] as const) {
      const edge = s[side];
      const k1 = Math.round(tEnd * (edge.length - 1));
      for (let i = 1; i < k1; i += 3) {
        const p = edge[i];
        const q = edge[Math.min(edge.length - 1, i + 1)];
        let n = perp(norm(sub(q, p)));
        if (side === 'bot') n = mul(n, -1);
        edgePts.push({ p, n });
      }
    }
    for (const { p, n } of edgePts) {
      const len = 2 + c.rand() * 1.4;
      const t = perp(n);
      const base = 0.7;
      const tip = add(p, mul(n, len));
      const fork = add(p, mul(n, len * 0.55));
      const pts: Pt[] = [
        add(p, mul(t, -base)),
        add(fork, mul(t, -0.35)),
        add(add(tip, mul(t, -0.9)), mul(n, -0.2)),
        add(fork, mul(t, -0.05)),
        tip,
        add(fork, mul(t, 0.05)),
        add(add(tip, mul(t, 0.9)), mul(n, -0.25)),
        add(fork, mul(t, 0.35)),
        add(p, mul(t, base)),
        add(p, mul(n, -1.5)),
      ];
      tassels.push({ poly: spline(pts, true, 0.6, 4), paint: 'back', lines: [], edge: 0.55 });
    }
    // Mosaic: pale spots packed close, so the dark ground between them reads as a network of lines.
    const pale = scatter(s, { t0: 0.01, t1: 1, f0: 0.02, f1: 0.98, r: (t) => 1.05 - t * 0.4, gap: 0.42, paint: 'pattern', rand: c.rand, tries: 2600, wobble: 0.3 });
    const finPale = [...c.pecs, ...c.pelvics].flatMap((f) => scatterIn(f.poly, { r: 0.9, gap: 0.45, paint: 'pattern', rand: c.rand, tries: 260, wobble: 0.3 }));
    const flecks = scatter(s, { t0: 0.01, t1: 1, f0: 0.04, f1: 0.96, r: 0.16, gap: 0.6, paint: 'light', rand: c.rand, tries: 900 });
    const saddles: Fill[] = [30, 44, 58, 70].map((x) => ({ poly: region(s, tAtX(s, x - 2.5), tAtX(s, x + 2.5), 0.08, 0.92), paint: 'dark', o: 0.28, clip: 'trunk' }));
    const spiracles: Fill[] = [-1, 1].map((k) => ({ poly: blob([10, k * 4.8], 0.7, 0.15, c.rand, 8, 1.4), paint: 'ink', o: 0.75 }));
    return { far: tassels, marks: [...pale, ...finPale.map((f) => ({ ...f, clip: 'body' as const })), ...saddles, ...flecks, ...spiracles] };
  },
};
void at;

export const SHARKS_TOP: Record<string, PlateDef> = {
  'great-hammerhead': { build: () => topShark({ ...great, seed: 5 }), palette: { back: '#7A7E7C', belly: '#F1F0EC' } },
  'scalloped-hammerhead': { build: () => topShark({ ...scalloped, seed: 6 }), palette: { back: '#6F7570', belly: '#F2F1ED' } },
  'tasselled-wobbegong': {
    build: () => topShark({ ...wobbegong, seed: 9 }),
    palette: { back: '#7A6448', belly: '#D9CDB4', pattern: '#D8C7A0', dark: '#3E3022' },
  },
};
