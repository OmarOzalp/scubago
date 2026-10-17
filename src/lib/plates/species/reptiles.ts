/**
 * Sea reptiles other than turtles: the banded sea krait (an eel-like body with rings and a paddle
 * tail) and the marine iguana (a lizard drawn from its trunk, crest and splayed, clawed legs).
 */
import { add, blob, type Ctrl, lerp, mul, norm, perp, type Pt, resample, rng, spline, sub } from '../kit';
import { scatterIn } from '../marks';
import { tube } from '../ray';
import type { PlateDef } from '../registry';
import { atX, contours, outlineOf, trunk } from '../side';
import { eel, type EelCtx } from '../eel';
import { emptyGeom, type Fill, type Line, type Part, type PlateGeom } from '../types';

// ── Banded sea krait ─────────────────────────────────────────────────────────
// A slender blue-grey snake in a loose S, ringed all the way round with regular black bands; a
// small head barely wider than the neck, its upper lip and snout yellow with a yellow band over
// each eye; the tail flattened into a vertical paddle with a black tip.
const krait: PlateDef = {
  palette: { back: '#86A8C6', belly: '#E3D38C', dark: '#3E5468' },
  build: () =>
    eel({
      seed: 95,
      spine: [[6, 24], [14, 21], [24, 22.6], [34, 29], [44, 35.4], [55, 37.4], [65, 33.4], [75, 27.6], [85, 25.6], [93, 29]],
      width: (t) => 1.45 * kraitWidth(t),
      eye: { t: 0.018, f: -0.32, r: 0.62, iris: '#2A2A2A' },
      engrave: [-0.7, 0.5, 0.75],
      extra: (c) => kraitMarks(c),
    }),
};

function kraitWidth(t: number) {
  if (t < 0.03) return 0.5 + 1.25 * Math.sqrt(1 - (1 - t / 0.03) ** 2);
  if (t < 0.06) return 1.75 - ((t - 0.03) / 0.03) * 0.3;
  if (t < 0.86) return 1.45 + 0.5 * Math.sin(Math.PI * Math.min(1, (t - 0.06) / 0.8));
  if (t < 0.93) return 1.5 + ((t - 0.86) / 0.07) * 0.9;
  return 2.4 * Math.sqrt(Math.max(0, 1 - ((t - 0.93) / 0.07) ** 2)) + 0.05;
}

function kraitMarks(c: EelCtx) {
  const across = (t0: number, t1: number, f0: number, f1: number): Pt[] => {
    const fs = Array.from({ length: 7 }, (_, k) => f0 + ((f1 - f0) * k) / 6);
    return [...fs.map((f) => c.at(t0 + Math.abs(f) * 0.002, f)), ...fs.reverse().map((f) => c.at(t1 - Math.abs(f) * 0.002, f))];
  };
  const belly: Fill = { poly: [...Array.from({ length: 120 }, (_, k) => c.at(0.05 + (k / 119) * 0.95, 0.45)), ...Array.from({ length: 120 }, (_, k) => c.at(1 - (k / 119) * 0.95, 1.1))], paint: 'belly', o: 0.9, clip: 'trunk' };
  // Black rings, each about as wide as the gap between, narrowing on the belly.
  const rings: Fill[] = [];
  const n = 40;
  for (let k = 0; k < n; k++) {
    const t = 0.065 + (k / n) * 0.9;
    const w = (0.9 / n) * 0.48;
    rings.push({ poly: across(t, t + w, -1.15, 0.5), paint: 'ink', o: 0.92, clip: 'trunk' }, { poly: across(t + w * 0.18, t + w * 0.82, 0.5, 1.15), paint: 'ink', o: 0.92, clip: 'trunk' });
  }
  const head: Fill[] = [
    { poly: across(0, 0.052, -1.2, 0.2), paint: 'ink', clip: 'trunk' },
    { poly: across(0, 0.034, 0.15, 1.2), paint: '#F0D44A', clip: 'trunk' },
    { poly: across(0.002, 0.03, -0.8, -0.05), paint: '#F0D44A', clip: 'trunk' },
    { poly: across(0.97, 1, -1.2, 1.2), paint: 'ink', clip: 'trunk' },
  ];
  const mouth: Line = { pts: [c.at(0.001, 0.25), c.at(0.025, 0.3)], w: 0.8 };
  return { tint: [belly], marks: [...rings, ...head], lines: [mouth] };
}

// ── Marine iguana ────────────────────────────────────────────────────────────
// Standing on lava rock: a stocky, sooty black lizard; a short, blunt, almost square head knobbed
// with tubercles and crusted white with salt; a crest of spines from the nape along the back and
// tail; a long tail flattened like an oar; short splayed legs with long curved claws.
function marineIguana(): PlateGeom {
  const g = emptyGeom();
  const rand = rng(97);
  const s = trunk({
    tip: [6, 29.6],
    top: [[7, 25.4], [9.4, 22.6], [13, 21.4], [17, 22.2], [21, 24.6], [27, 24.4], [36, 22], [46, 21.4], [56, 22.6], [64, 24.6], [78, 27.6], [94, 30.4], [112, 32.6], [130, 34]],
    bot: [[7, 33.2], [10, 35.4], [15, 36.2], [20, 35.4], [26, 37.6], [36, 39.2], [46, 39.4], [56, 38.2], [64, 36.4], [78, 35.6], [94, 35.2], [112, 34.8], [130, 34.2]],
    blunt: 0.95,
  });
  const body = outlineOf(s);
  g.body = body;
  g.trunk = body;
  g.engraving = contours(s, {
    top: [0.06, 0.14],
    bot: [0.66, 0.76, 0.86, 0.94],
  });
  g.heavy.push(s.bot);
  // The crest: spines from the nape down the back and tail, tallest over the shoulders.
  for (let x = 19; x < 118; x += 2.3) {
    const h = x < 26 ? 1.6 + (x - 19) * 0.24 : x < 44 ? 3.3 : 3.3 * Math.max(0.2, 1 - (x - 44) / 80);
    const b = atX(s, x, 0);
    g.far.push({
      poly: [add(b, [-0.9, 1.4]), add(b, [0.5, -h]), add(b, [1.1, 1.4])],
      paint: 'back',
      lines: [],
      edge: 0.6,
    });
  }
  // Knobs on the head, crusted with salt.
  for (const [x, r] of [[9, 1.1], [11.6, 1.3], [14.4, 1.2], [17, 1]]) {
    const p = add(atX(s, x, 0), [0, 0.4]);
    g.far.push({
      poly: blob(p, r, 0.2, rand, 7),
      paint: 'back',
      lines: [],
      edge: 0.6,
    });
  }
  g.marks.push(
    {
      poly: blob(atX(s, 9, 0.18), 2.2, 0.35, rand, 8, 1.4, -20),
      paint: '#E9E7E1',
      o: 0.95,
      clip: 'trunk',
    },
    {
      poly: blob(atX(s, 13.6, 0.12), 1.6, 0.35, rand, 8, 1.3, 10),
      paint: '#E9E7E1',
      o: 0.9,
      clip: 'trunk',
    },
    {
      poly: blob(atX(s, 6.8, 0.5), 1.1, 0.3, rand, 7),
      paint: '#E9E7E1',
      o: 0.9,
      clip: 'trunk',
    },
  );
  // Scales: a fine stipple of pale and dark beads.
  g.marks.push(
    ...scatterIn(body, {
      r: 0.35,
      gap: 0.8,
      paint: '#6A6A66',
      rand,
      tries: 900,
      o: 0.7,
    }).map((f) => ({ ...f, clip: 'trunk' as const })),
  );
  // Mouth, a small dewlap fold, nostril.
  g.lines.push(
    { pts: [atX(s, 6.4, 0.66), atX(s, 11, 0.72), atX(s, 15.6, 0.66)], w: 1.1 },
    {
      pts: [atX(s, 15, 0.98), atX(s, 19, 1.06), atX(s, 22, 0.98)],
      w: 0.8,
      o: 0.7,
      taper: 'both',
    },
  );
  g.eyes.push({ c: atX(s, 13.4, 0.36), r: 1.1, iris: '#9A7A3A' });
  // The rock: dark lava with a little green algae.
  const rock = spline(
    [[2, 64, 1], [6, 54], [16, 50.4], [30, 49.4], [44, 50.6], [58, 49.4], [72, 50.2], [86, 52.4], [96, 56], [100, 64, 1]],
    true,
  );
  g.far.unshift({
    poly: rock,
    paint: '#6E6A60',
    lines: [0.3, 0.6].map((k) => ({
      pts: [
        [8 + k * 30, 55],
        [14 + k * 40, 58],
        [10 + k * 50, 62],
      ] as Pt[],
      w: 0.8,
      o: 0.5,
    })),
    edge: 0.9,
    marks: scatterIn(rock, {
      r: 1.2,
      gap: 2.2,
      paint: '#7A8B5A',
      rand,
      tries: 40,
      o: 0.7,
      wobble: 0.5,
    }),
  });
  // Legs: short, splayed, with long curved claws gripping the rock.
  const leg = (path: Ctrl[], w0: number, toes: Pt[], far: boolean) => {
    const c = resample(spline(path, false), 30);
    const end = c[c.length - 1];
    const part: Part = {
      poly: tube(c, (t) => w0 * (1 - t * 0.45)),
      paint: 'back',
      lines: [
        {
          pts: c.slice(2, -2).map((p, i, arr) => add(p, mul(perp(norm(sub(arr[Math.min(arr.length - 1, i + 1)], arr[Math.max(0, i - 1)]))), w0 * 0.5))),
          w: 0.9,
          o: 0.5,
          taper: 'both',
        },
      ],
      edge: 0.8,
    };
    const toeParts: Part[] = toes.map((t) => ({
      poly: tube(resample(spline([end, lerp(end, t, 0.6), t], false), 10), (u) => 0.75 * (1 - u * 0.5)),
      paint: 'back' as const,
      lines: [],
      edge: 0.6,
    }));
    const claws: Line[] = toes.map((t) => {
      const d = norm(sub(t, end));
      return {
        pts: spline([t, add(t, mul(d, 1.6)), add(add(t, mul(d, 2.4)), [0, 1.4])], false),
        w: 1.4,
        taper: 'end' as const,
      };
    });
    (far ? g.far : g.near).push(part, ...toeParts);
    g.lines.push(...claws);
  };
  leg(
    [[22, 37], [17, 42], [15, 47], [17, 50]],
    1.9,
    [[11, 50.4], [13.4, 51.2], [16, 51.4]],
    true,
  );
  leg(
    [[54, 37], [48, 42], [47, 47], [49, 50]],
    2.1,
    [[43, 50], [45.6, 51], [48.6, 51.2]],
    true,
  );
  leg(
    [[30, 37.6], [34, 43], [31, 48], [29, 50]],
    2.2,
    [[23, 50.6], [25.6, 51.4], [28.6, 51.6], [32, 51]],
    false,
  );
  leg(
    [[62, 36.6], [68, 42], [65, 47.4], [62, 50]],
    2.4,
    [[56, 50.4], [58.6, 51.2], [61.6, 51.4], [65, 51]],
    false,
  );
  return g;
}

export const REPTILES: Record<string, PlateDef> = {
  'banded-sea-krait': krait,
  'marine-iguana': {
    build: marineIguana,
    palette: {
      back: '#2E2F30',
      belly: '#3A3A38',
      fin: '#2E2F30',
      dark: '#141414',
    },
  },
};
