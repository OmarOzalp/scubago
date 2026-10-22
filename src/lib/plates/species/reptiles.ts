/**
 * Sea reptiles other than turtles: the banded sea krait (an eel-like body with rings and a paddle
 * tail) and the marine iguana (a lizard drawn from its trunk, crest and splayed, clawed legs).
 */
import { add, blob, type Ctrl, lerp, mul, norm, perp, type Pt, resample, rng, spline, sub } from '../kit';
import { scatterIn } from '../marks';
import { tube } from '../ray';
import type { PlateDef } from '../registry';
import { mapGeom } from '../render';
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
  // The trunk sits low: its belly a few units above the rock, the tail dragging out behind it.
  const s = trunk({
    tip: [6, 38],
    top: [[7, 33.4], [9.4, 30.6], [13, 29.2], [17, 29.8], [21, 31.6], [27, 31.2], [36, 29.2], [46, 28.8], [56, 30], [64, 32.2], [78, 36], [90, 42.4], [96, 46.4], [110, 47.2], [124, 47.7], [136, 48.1]],
    bot: [[7, 41.4], [10, 43.6], [15, 44.6], [20, 44.2], [26, 46.2], [36, 47.2], [46, 47.2], [56, 46.2], [64, 45.2], [78, 45], [90, 48.2], [96, 50], [110, 49.4], [124, 48.9], [136, 48.3]],
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
  // The rock: a low ledge of dark lava with a little green algae.
  const rock = spline(
    [[-3, 57], [-2, 53.6], [6, 51.4], [20, 50.4], [40, 49.8], [60, 49.4], [80, 49.8], [96, 50.4], [103, 52], [105, 56.4], [100, 59.6], [70, 60.2], [10, 59.6]],
    true,
  );
  const rockPart: Part = {
    poly: rock,
    paint: '#6E6A60',
    lines: [0.15, 0.5, 0.8].map((k) => ({
      pts: [
        [8 + k * 85, 53.4],
        [14 + k * 85, 55.2],
        [10 + k * 85, 57.4],
      ] as Pt[],
      w: 0.8,
      o: 0.5,
      taper: 'both' as const,
    })),
    edge: 0.9,
    marks: scatterIn(rock, {
      r: 1.1,
      gap: 3,
      paint: '#7A8B5A',
      rand,
      tries: 60,
      o: 0.7,
      wobble: 0.5,
    }),
  };
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
  // Elbows and knees out: the upper arm drops back, the forearm comes forward, the long toes grip.
  leg([[16, 42.6], [20.4, 46.2], [16.6, 48.6], [15.6, 50]], 2.1, [[10.8, 50.2], [13, 50.9], [15.6, 51.2]], true);
  leg([[47, 43], [43, 46.6], [47.4, 48.8], [48.4, 50]], 2.2, [[43, 50.2], [45.4, 50.9], [48, 51.2]], true);
  leg([[24, 43.4], [28.4, 47], [24.4, 49], [23, 50]], 2.4, [[17.6, 50.3], [20, 51], [22.8, 51.3], [26, 50.8]], false);
  leg([[57, 43.8], [53, 47.4], [57.4, 49.2], [58.4, 50]], 2.6, [[52, 50.3], [54.6, 51], [57.4, 51.3], [61, 50.8]], false);
  // The tail lies along the ledge, then slips over its end and hangs down, curling in.
  const bent = mapGeom(g, droop);
  bent.far.unshift(rockPart);
  return bent;
}

/** Bends a flat tail (running level from x = 96, centre line y = 48.2) down in a hook. */
const DROOP_X = 96;
const DROOP_Y = 48.2;
const droopPath: Pt[] = (() => {
  const out: Pt[] = [[0, 0]];
  const L = 44;
  for (let i = 1; i <= 220; i++) {
    const t = i / 220;
    const th = 1.75 * t ** 1.45;
    const [px, py] = out[i - 1];
    out.push([px + Math.cos(th) * (L / 220), py + Math.sin(th) * (L / 220)]);
  }
  return out;
})();
function droop([x, y]: Pt): Pt {
  if (x <= DROOP_X) return [x, y];
  const k = Math.min(droopPath.length - 1.001, ((x - DROOP_X) / 44) * (droopPath.length - 1));
  const i = Math.floor(k);
  const a = droopPath[i];
  const b = droopPath[i + 1];
  const c = lerp(a, b, k - i);
  const d = norm(sub(b, a));
  const h = y - DROOP_Y;
  return [DROOP_X + c[0] - d[1] * h, DROOP_Y + c[1] + d[0] * h];
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
