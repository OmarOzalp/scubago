/**
 * Rays: mantas and devil rays, eagle ray and stingrays from above (disc width = 100); sawfish and
 * guitarfish, which are shark-shaped, from above with a slight roll like the hammerheads.
 */
import { add, blob, type Ctrl, ellipse, inside, lerp, mul, perp, type Pt, rng, spline } from '../kit';
import { scatterIn } from '../marks';
import { mirror, ray, type RaySpec } from '../ray';
import type { PlateDef } from '../registry';
import { rotateGeom } from '../render';
import { mirrorY, topShark, type TopSharkSpec } from '../topshark';
import type { Fill, Line, Part, PlateGeom } from '../types';

const both = (poly: Pt[]): Pt[][] => [poly, mirror(poly)];
const soft = (poly: Pt[], paint: Fill['paint'], o = 1, spread = 1): Fill[] =>
  // A soft-edged patch: the shape, plus slightly smaller and larger copies at lower strength.
  [1 + 0.08 * spread, 1, 1 - 0.1 * spread].map((k, i) => {
    const cx = poly.reduce((a, p) => a + p[0], 0) / poly.length;
    const cy = poly.reduce((a, p) => a + p[1], 0) / poly.length;
    return { poly: poly.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k] as Pt), paint, o: o * [0.35, 0.5, 0.75][i], clip: 'trunk' as const };
  });

// The mobulid disc, shared by both mantas (their outlines are the same; the markings differ).
const mantaDisc: Ctrl[] = [
  [0, 0],
  [5.5, 0.2],
  [9.2, 1.4],
  [10.4, 4.2],
  [12.2, 6.2],
  [22, 9.6],
  [34, 15],
  [45, 21.6],
  [50, 25.6, 1],
  [44.5, 26.6],
  [36, 27.9],
  [27, 30.6],
  [19, 35],
  [12.5, 40],
  [7, 44],
  [2.5, 45.6],
  [0, 46],
];
const mantaBase = {
  disc: mantaDisc,
  hub: [0, 24] as Pt,
  cephalic: { root: [8.2, 1.4] as Pt, tip: [6.8, -8.6] as Pt, width: 3.6 },
  pelvic: [
    [2.6, 43.5],
    [6.4, 45.6],
    [6.2, 50.4],
    [3.2, 50.2],
  ] as Ctrl[],
  eye: [10.9, 3.4] as Pt,
  eyeR: 0.85,
};

// ── Reef manta ───────────────────────────────────────────────────────────────
// Very wide diamond, paddle cephalic fins, mouth across the front; soft-edged white shoulder
// patches whose front edges curve back towards the midline (a black V or Y between them); a short
// spineless whip tail with a small dorsal fin and no knob.
const reefManta: RaySpec = {
  ...mantaBase,
  tail: { path: [[0, 45], [0.4, 58], [3, 72], [9, 86], [17, 96]], w0: 2.4, w1: 0.25, dorsal: { at: 0.02, len: 4.2, w: 2.2, paint: 'dark' } },
  extra: (c) => {
    // The patch sweeps out along the front of the wing; its front edge curves back towards the
    // midline, leaving a black V between the two.
    const patch: Pt[] = spline(
      [
        [8.8, 18],
        [11, 13.4],
        [17, 11.4],
        [25, 12.8],
        [32.5, 16.2],
        [35, 20],
        [27, 22.6],
        [18, 25],
        [12, 27.4],
        [9, 24.5],
      ],
      true,
    );
    void c;
    return {
      marks: both(patch).flatMap((p) => soft(p, 'light')),
      lines: [{ pts: [[-5.4, 0.25], [5.4, 0.25]], w: 1.6 }],
    };
  },
};

// ── Oceanic manta ────────────────────────────────────────────────────────────
// Same outline; crisp white right-angled shoulder triangles with a clean black T between them
// (a bar across the front, a stripe down the middle); a pale chevron near the tail; a small knob
// at the tail base behind the dorsal fin.
const oceanicManta: RaySpec = {
  ...mantaBase,
  cephalic: { root: [8.2, 1.4], tip: [6.4, -9.2], width: 3.8 },
  tail: { path: [[0, 45], [0.4, 58], [-2.5, 72], [-8, 86], [-16, 96]], w0: 2.6, w1: 0.25, dorsal: { at: 0.02, len: 4.2, w: 2.3, paint: 'dark' }, knob: 0.1 },
  extra: () => {
    // The shoulder patches are soft-edged curved triangles, their pointed tips reaching out along the
    // front of each wing, with the black T of the head and back between them.
    const tri: Pt[] = spline(
      [
        [10.2, 10.6],
        [19, 9.4],
        [31.5, 11.6, 1],
        [24, 17.4],
        [15.5, 24.6],
        [10.2, 29.2],
        [9.2, 19.5],
      ],
      true,
    );
    return {
      marks: both(tri).flatMap((poly) => soft(poly, 'light', 1, 0.45)),
      lines: [{ pts: [[-5.4, 0.25], [5.4, 0.25]], w: 1.6 }],
    };
  },
};

// ── Munk's devil ray ─────────────────────────────────────────────────────────
// Small mobulid with rolled, horn-like cephalic fins and no mouth showing at the front; plain
// mauve-grey back with a darker collar across the head, no white patches; straight leading edges
// and sickle-swept tips; spineless whip tail with a small dark-rimmed dorsal fin.
const munks: RaySpec = {
  disc: [
    [0, 1.6],
    [3.8, 1.1],
    [6.2, 2.4],
    [7.1, 5],
    [9, 7.2],
    [44, 25.2],
    [50, 31.5, 1],
    [43.5, 30.6],
    [34, 30.9],
    [24, 33.6],
    [15, 39],
    [8, 45],
    [3, 47.6],
    [0, 48],
  ],
  hub: [0, 25],
  cephalic: { root: [5.2, 1.8], tip: [5.6, -5.8], width: 1.9, rolled: true },
  pelvic: [
    [2.4, 46],
    [5.4, 47.6],
    [5, 51],
    [2.6, 50.6],
  ],
  tail: { path: [[0, 47], [0.6, 60], [4, 76], [10, 92], [18, 106], [24, 116]], w0: 1.9, w1: 0.2, dorsal: { at: 0.015, len: 3.4, w: 1.8, paint: 'dark' } },
  eye: [7.2, 4.2],
  eyeR: 0.7,
  extra: (c) => {
    const collar: Pt[] = [
      [-14, 5.4],
      [14, 5.4],
      [14, 10],
      [-14, 10],
    ];
    const margin = (side: 1 | -1): Fill => {
      const lead = spline(
        [
          [9 * side, 7.2],
          [44 * side, 25.2],
          [50 * side, 31.5],
        ],
        false,
      );
      return { poly: [...lead, ...lead.slice().reverse().map(([x, y]) => [x - 1.6 * side, y + 2.4] as Pt)], paint: '#7D8A9E', o: 0.8, clip: 'trunk' };
    };
    void c;
    return { marks: [{ poly: collar, paint: 'dark', o: 0.7, clip: 'trunk' }, margin(1), margin(-1)] };
  },
};

// ── Spotted eagle ray ────────────────────────────────────────────────────────
// White spots and rings on a dark back; a protruding domed head with a duck-bill snout; a whip
// tail about twice the span (curled round the plate); pointed, swept-back wings with a deeply
// hollow trailing edge; spines at the tail base behind the dorsal fin.
const eagle: RaySpec = {
  disc: [
    [0, 0],
    [3.2, 0.6],
    [5, 2.8],
    [5.5, 6.2],
    [5.8, 10],
    [7.4, 12.4],
    [20, 15.8],
    [35, 21.4],
    [47, 28],
    [50, 30.5, 1],
    [42, 31],
    [32, 32.6],
    [22, 37],
    [14, 44.5],
    [8, 52],
    [3, 55.4],
    [0, 56],
  ],
  hub: [0, 30],
  pelvic: [
    [2.6, 53.5],
    [6, 56],
    [5.4, 61],
    [2.6, 60],
  ],
  tail: {
    path: [[0, 55], [2, 74], [13, 91], [36, 100], [60, 96], [79, 82], [88, 60], [90, 38], [86, 16]],
    w0: 1.9,
    w1: 0.15,
    hold: 0.6,
    dorsal: { at: 0.01, len: 3.4, w: 1.7 },
    spines: { at: 0.035, n: 3, len: 3.6 },
  },
  eye: [5.7, 7.2],
  eyeR: 0.85,
  extra: (c) => {
    // The head is raised: a fold where it rises from the disc.
    const fold: Line = { pts: spline([[-6.8, 12.6], [-3, 11], [3, 11], [6.8, 12.6]], false), w: 1, taper: 'both' };
    const spots: Fill[] = [];
    const rand = rng(17);
    const right = c.disc.filter((p) => p[0] >= 0);
    const half: Pt[] = [...right, [0, 56]];
    for (const f of scatterIn(half, { r: 0.9, gap: 2.2, paint: 'light', rand, tries: 900 })) {
      spots.push({ ...f, clip: 'trunk' }, { poly: mirror(f.poly), paint: 'light', clip: 'trunk' });
    }
    // A few spots are rings with dark centres.
    const rings: Fill[] = [
      [14, 24],
      [27, 25],
      [20, 33],
      [9, 38],
    ].flatMap(([x, y]) =>
      both(ellipse([x, y], 1.6)).flatMap((p, i) => [
        { poly: p, paint: 'light' as const, clip: 'trunk' as const },
        { poly: ellipse([i ? -x : x, y], 0.85), paint: 'back' as const, clip: 'trunk' as const },
      ]),
    );
    return { marks: [...spots, ...rings], lines: [fold] };
  },
};

// ── Marbled ray (round ribbontail) ───────────────────────────────────────────
// A round, thick disc with no corners; black marbling on grey; a short, thick tail with a spine and
// a deep fold to the tip; granular skin with a thorny midline.
const marbled: RaySpec = {
  disc: [
    [0, 0],
    [12, 1.3],
    [27, 6],
    [39.5, 15],
    [47.4, 28],
    [50, 41],
    [47.4, 55],
    [39, 69],
    [25, 81.5],
    [11, 89],
    [0, 92],
  ],
  hub: [0, 44],
  tail: { path: [[0, 88], [0.5, 112], [3, 140], [8, 168], [14, 184]], w0: 7, w1: 0.4, hold: 1.5, spines: { at: 0.3, n: 1, len: 7 }, fold: { from: 0.34, w: 3.4 } },
  eye: [7.5, 19],
  eyeR: 1.3,
  spiracle: { at: [9, 25], r: 2 },
  extra: (c) => {
    const rand = rng(29);
    const blotches: Fill[] = [];
    for (let k = 0; k < 190; k++) {
      const x = (rand() - 0.5) * 94;
      const y = 3 + rand() * 88;
      const r = 0.8 + rand() ** 2 * 3.6;
      blotches.push({ poly: blob([x, y], r, 0.5, rand, 9, 1 + rand() * 0.9, rand() * 180), paint: 'dark', o: 0.85, clip: 'trunk' });
    }
    const flecks: Fill[] = Array.from({ length: 40 }, () => ({ poly: ellipse([(rand() - 0.5) * 90, 6 + rand() * 82], 0.45), paint: 'light' as const, o: 0.8, clip: 'trunk' as const }));
    const thorns: Fill[] = Array.from({ length: 16 }, (_, i) => ({ poly: ellipse([0, 28 + i * 3.4], 0.75), paint: '#D8CDB4' as const, edge: 0.6 }));
    const granules: Line[] = [];
    for (let k = 0; k < 320; k++) {
      const p: Pt = [(rand() - 0.5) * 88, 6 + rand() * 82];
      if (inside(p, c.disc)) granules.push({ pts: [p, add(p, [0.35, 0.2])], w: 0.9, o: 0.5, detail: true });
    }
    return { marks: [...blotches, ...flecks, ...thorns], lines: granules };
  },
};

// ── Southern stingray ────────────────────────────────────────────────────────
// A diamond disc with sharp outer corners; a long whip tail (about twice the span, curled round)
// with a spine and a dark fold; plain, unpatterned brown; a row of tubercles down the middle.
const southern: RaySpec = {
  disc: [
    [0, 0],
    [10, 5],
    [25, 13.8],
    [40, 23.6],
    [49.4, 31.2, 1],
    [45, 40],
    [35, 52],
    [24, 63],
    [14, 72],
    [6, 79],
    [0, 83],
  ],
  hub: [0, 38],
  pelvic: [
    [2.6, 80],
    [6.4, 82],
    [6, 87],
    [2.8, 86.4],
  ],
  tail: {
    path: [[0, 82], [1.5, 100], [10, 118], [30, 130], [56, 130], [76, 116], [86, 94], [89, 70], [87, 46], [83, 26]],
    w0: 2.8,
    w1: 0.15,
    hold: 0.7,
    spines: { at: 0.06, n: 1, len: 6 },
    fold: { from: 0.12, to: 0.6, w: 1.4, paint: 'dark' },
  },
  eye: [6.8, 19.5],
  eyeR: 1.1,
  spiracle: { at: [8.4, 24.5], r: 1.5 },
  extra: () => ({
    marks: Array.from({ length: 13 }, (_, i) => ({ poly: ellipse([0, 26 + i * 4], 0.6), paint: 'dark' as const, o: 0.8 })),
  }),
};

// ── Bluespotted ribbontail ───────────────────────────────────────────────────
// Electric-blue spots on a tan oval disc that's longer than wide; a blue-striped tail with a broad
// fold to the tip and two spines; big bulging eyes.
const ribbontail: RaySpec = {
  disc: [
    [0, 0],
    [14, 2],
    [30, 10],
    [42, 24],
    [49, 42],
    [50, 61],
    [46, 81],
    [36, 99],
    [22, 113],
    [9, 120],
    [0, 122],
  ],
  hub: [0, 58],
  tail: { path: [[0, 118], [0.5, 140], [4, 165], [12, 190], [22, 212]], w0: 5, w1: 0.4, hold: 1.2, spines: { at: 0.42, n: 2, len: 6 }, fold: { from: 0.38, w: 4.6 } },
  eye: [10, 22],
  eyeR: 3.2,
  spiracle: { at: [12, 30], r: 2.6 },
  extra: (c) => {
    const rand = rng(41);
    const right: Pt[] = [...c.disc.filter((p) => p[0] >= 0), [0, 122]];
    const spots: Fill[] = [];
    for (const r of [2.6, 1.7, 1.1]) {
      for (const f of scatterIn(right, { r, gap: 2.2, paint: '#2C8BE8', rand, tries: r > 2 ? 60 : 160 })) {
        spots.push({ ...f, clip: 'trunk' }, { poly: mirror(f.poly), paint: '#2C8BE8', clip: 'trunk' });
      }
    }
    // Two blue stripes along each side of the tail.
    const stripes: Fill[] = [0.55, -0.55].map((k) => {
      const pts = Array.from({ length: 40 }, (_, i) => {
        const t = 0.32 + (i / 39) * 0.6;
        const p = c.onTail(t);
        const q = c.onTail(Math.min(1, t + 0.01));
        const n = perp([q[0] - p[0], q[1] - p[1]].map((v) => v / Math.hypot(q[0] - p[0], q[1] - p[1])) as Pt);
        return add(p, mul(n, k * (5 * (1 - t) ** 1.2 + 0.4)));
      });
      return { poly: [...pts, ...pts.slice().reverse().map((p) => add(p, [0.01, 0.9]))], paint: '#2C8BE8' as const };
    });
    return { marks: spots, near: stripes.map((s) => ({ poly: s.poly, paint: s.paint, lines: [], edge: 0.01 })) };
  },
};

// ── Marbled electric ray ─────────────────────────────────────────────────────
// A round pancake disc, flattened at the front; a short thick tail ending in a broad paddle
// caudal fin, with two small dorsal fins and no sting; brown and cream marbling; fringed
// spiracles behind tiny eyes.
const electric: RaySpec = {
  disc: [
    [0, 0],
    [14, 0.4],
    [30, 3],
    [42, 11],
    [48.6, 24],
    [50, 38],
    [47, 52],
    [39, 64],
    [28, 73],
    [16, 79],
    [6, 82],
    [0, 83],
  ],
  hub: [0, 38],
  pelvic: [
    [14, 70],
    [26, 77],
    [24, 87],
    [12, 92.5],
    [4.5, 90],
  ],
  tail: { path: [[0, 82], [0, 104], [0, 124]], w0: 6.4, w1: 4, fold: { from: 0.12, to: 0.85, w: 1.4 } },
  eye: [6.6, 17],
  eyeR: 0.8,
  spiracle: { at: [8.8, 21.5], r: 1.9 },
  extra: (c) => {
    const rand = rng(53);
    const caudal: Pt[] = spline(
      [
        [-4, 121],
        [-11.5, 131],
        [-9, 139],
        [0, 141.5],
        [9, 139],
        [11.5, 131],
        [4, 121],
      ],
      true,
    );
    // Seen from above the dorsal fins are slim leaves standing on the tail's midline.
    const dorsal = (y: number, len: number): Pt[] => spline([[0, y], [1.3, y + len * 0.35], [1.1, y + len * 0.8], [0, y + len, 1], [-0.7, y + len * 0.6], [-0.6, y + len * 0.2]], true);
    const fins: Part[] = [
      { poly: caudal, paint: 'back', lines: [0.3, 0.5, 0.7].map((k) => ({ pts: [[0, 122], [lerp([-10, 136], [10, 136], k)[0], 138]] as Pt[], w: 0.7, taper: 'end' as const })), edge: 0.85 },
      { poly: dorsal(95, 8), paint: 'back', lines: [], edge: 0.8 },
      { poly: dorsal(107, 6.5), paint: 'back', lines: [], edge: 0.8 },
    ];
    // Marbling: a net of cream rings and worm-tracks on dark brown.
    const marks: Fill[] = [];
    for (let k = 0; k < 300; k++) {
      const x = (rand() - 0.5) * 94;
      const y = 2 + rand() * 90;
      marks.push({ poly: blob([x, y], 0.9 + rand() * 1.8, 0.45, rand, 9, 1 + rand() * 1.4, rand() * 180), paint: 'pattern', o: 0.9, clip: 'body' });
    }
    // Papillae round each spiracle.
    const papillae: Line[] = [];
    for (const sx of [1, -1]) {
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        const c0: Pt = [8.8 * sx, 21.5];
        papillae.push({ pts: [add(c0, [Math.cos(a) * 1.9, Math.sin(a) * 1.5]), add(c0, [Math.cos(a) * 2.7, Math.sin(a) * 2.2])], w: 0.8 });
      }
    }
    void c;
    return { near: fins, marks, lines: papillae };
  },
};

// ── Largetooth sawfish ───────────────────────────────────────────────────────
// A long, broad, flat saw with about twenty evenly spaced teeth a side; shark-like body with large
// triangular pectoral fins; the first dorsal starting well ahead of the pelvic fins; a shark tail
// with a small lower lobe.
const sawfish: TopSharkSpec = {
  tip: [25, 0],
  blunt: 0.6,
  ...(() => {
    const top: Ctrl[] = [
      [26.5, -2.6],
      [29, -3.8],
      [33, -4.6],
      [38, -5],
      [45, -4.8],
      [53, -4.1],
      [62, -3.2],
      [70, -2.4],
      [77, -1.8],
    ];
    return { top, bot: mirrorY(top) };
  })(),
  pec: { at: 31, base: 7.5, h: 9, sweep: 1.05, rear: 1.6, concave: 0.06, round: 0.4 },
  pelvic: { at: 47.5, base: 4, h: 4.6, sweep: 0.9, rear: 1.2, concave: 0.06 },
  d1: { at: 44, base: 6, h: 6.2, sweep: 0.75, rear: 1.6, concave: 0.12 },
  d2: { at: 64, base: 5, h: 5.2, sweep: 0.75, rear: 1.4, concave: 0.12 },
  caudal: { upper: [100, -9], lower: [89, 5.4], fork: [87, 1], notch: 2, trail: 0.05 },
  eyes: [
    [31, -2.6],
    [31, 2.6],
  ],
  eyeR: 0.45,
  extra: () => {
    // The saw: broad at the base, tapering to under half that width at a pointed tip, with a
    // tooth every 1.3 units all along it (24 a side).
    const edge: [number, number][] = [
      [-7.4, 0],
      [-6, 0.55],
      [-2, 1.2],
      [5, 1.75],
      [16, 2.3],
      [27.5, 2.9],
    ];
    const halfAt = (x: number) => {
      for (let i = 1; i < edge.length; i++) if (x <= edge[i][0]) return edge[i - 1][1] + ((x - edge[i - 1][0]) / (edge[i][0] - edge[i - 1][0])) * (edge[i][1] - edge[i - 1][1]);
      return edge[edge.length - 1][1];
    };
    const saw: Pt[] = spline(
      [
        [27.5, -2.9],
        [16, -2.3],
        [5, -1.75],
        [-2, -1.2],
        [-6, -0.55],
        [-7.4, 0, 1],
        [-6, 0.55],
        [-2, 1.2],
        [5, 1.75],
        [16, 2.3],
        [27.5, 2.9],
      ],
      true,
    );
    const teeth: Part[] = [];
    for (let i = 0; i < 24; i++) {
      const x = -4.9 + i * 1.3;
      const len = 1.45 * (0.7 + 0.3 * Math.min(1, (x + 6) / 14));
      for (const s of [-1, 1]) {
        const b: Pt = [x, s * (halfAt(x) - 0.15)];
        teeth.push({ poly: [add(b, [-0.32, 0]), add(b, [0.18, s * len]), add(b, [0.45, s * len * 0.83]), add(b, [0.38, 0])], paint: '#EDE6D3', lines: [], edge: 0.55 });
      }
    }
    const ridge: Line = { pts: [[-5, 0], [27, 0]], w: 0.8, taper: 'both' };
    const spiracles: Fill[] = [-1, 1].map((s) => ({ poly: ellipse([33, s * 2.7], 0.8, 0.5), paint: 'dark', o: 0.85 }));
    return { far: teeth, near: [{ poly: saw, paint: '#9C8C6C', lines: [ridge, { pts: [[-3, -0.9], [26, -1.6]], w: 0.55, taper: 'both' }, { pts: [[-3, 0.9], [26, 1.6]], w: 0.9, taper: 'both' }], edge: 0.9 }], marks: spiracles };
  },
};

// ── Giant guitarfish ─────────────────────────────────────────────────────────
// A pale, translucent, pointed wedge snout with a dark central ridge; a flat triangular front
// disc; two similar tall dorsal fins, both behind the pelvic fins; a caudal fin with no lower
// lobe; a row of thorns down the middle.
const guitarfish: TopSharkSpec = {
  tip: [0, 0],
  blunt: 0,
  ...(() => {
    const top: Ctrl[] = [
      [4, -1.7],
      [11, -4.6],
      [19, -8.6],
      [26, -12.8],
      [30.5, -14.6],
      [33.5, -14],
      [36.5, -10.6],
      [39.5, -6.8],
      [43, -5.6],
      [50, -5.2],
      [60, -4.5],
      [70, -3.5],
      [78, -2.6],
      [83, -2.1],
    ];
    return { top, bot: mirrorY(top) };
  })(),
  pelvic: { at: 39, base: 5, h: 4.4, sweep: 0.9, rear: 1.2, round: 0.8 },
  d1: { at: 51, base: 5.4, h: 6.6, sweep: 0.7, rear: 1.6, concave: 0.12 },
  d2: { at: 67, base: 5, h: 6, sweep: 0.7, rear: 1.6, concave: 0.12 },
  caudal: { upper: [100, -6.4], lower: [93, 2.8], fork: [96, 1.6], notch: 1.4, trail: 0.02, lowerRound: 2, lowerBow: 0.02 },
  eyes: [
    [18.5, -2.2],
    [18.5, 2.2],
  ],
  eyeR: 0.6,
  rings: { top: [0.03, 0.08, 0.14, 0.21], bot: [0.7, 0.77, 0.83, 0.88, 0.925, 0.96] },
  extra: (c) => {
    const snout: Pt[] = spline(
      [
        [0.3, 0],
        [8, -2.7],
        [15, -4.2],
        [15.5, 0],
        [15, 4.2],
        [8, 2.7],
      ],
      true,
    );
    const thorns: Fill[] = Array.from({ length: 22 }, (_, i) => ({ poly: ellipse([21 + i * 2.8, 0.1 * Math.sin(i)], 0.42), paint: '#5A4A34', o: 0.9 }));
    const spiracles: Fill[] = [-1, 1].map((s) => ({ poly: ellipse([21, s * 2.6], 0.85, 0.55), paint: 'dark', o: 0.8 }));
    void c;
    return {
      tint: [{ poly: snout, paint: '#CDBE9C', o: 0.9, clip: 'trunk' }],
      lines: [{ pts: [[1, 0], [16, 0]], w: 2, taper: 'both' }],
      marks: [...thorns, ...spiracles],
    };
  },
};

const R = (spec: RaySpec, palette: PlateDef['palette'], rotate = 0): PlateDef => ({
  build: (): PlateGeom => (rotate ? rotateGeom(ray(spec), rotate) : ray(spec)),
  palette,
});

export const RAYS: Record<string, PlateDef> = {
  'reef-manta': R(reefManta, { back: '#22252A', belly: '#F3F2EE' }),
  'oceanic-manta': R(oceanicManta, { back: '#17181B', belly: '#F4F3EF' }),
  'munks-devil-ray': R(munks, { back: '#6E5F78', belly: '#F3F1EE', dark: '#2C2533' }),
  'spotted-eagle-ray': R(eagle, { back: '#25303F', belly: '#F7F5F0' }),
  'marbled-ray': R(marbled, { back: '#858A89', belly: '#ECEAE5', dark: '#1D1E21' }),
  'southern-stingray': R(southern, { back: '#6C5D47', belly: '#F3F0E8', dark: '#2E2A25' }),
  'bluespotted-ribbontail-ray': R(ribbontail, { back: '#B5975A', belly: '#F5F3EE' }, -90),
  'marbled-electric-ray': R(electric, { back: '#6A4A2E', belly: '#F1EBDD', pattern: '#D8C39E' }),
  sawfish: { build: () => topShark({ ...sawfish, seed: 12 }), palette: { back: '#8A7A58', belly: '#EFEDE6' } },
  'giant-guitarfish': { build: () => topShark({ ...guitarfish, seed: 13 }), palette: { back: '#9A8562', belly: '#F1EEE6' } },
};
