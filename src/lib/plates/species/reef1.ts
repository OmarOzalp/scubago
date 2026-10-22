/**
 * Reef fish, part one: clownfish, Moorish idol, the angelfish, raccoon butterflyfish, stoplight
 * parrotfish, triggerfish and lionfish. Side on, facing left, 1% of total length per unit.
 */
import { add, ellipse, lerp, mul, norm, perp, type Pt, rng, spline, sub } from '../kit';
import { scatter, scatterIn, shapeIn } from '../marks';
import type { PlateDef } from '../registry';
import { swell } from '../render';
import { at, atX, region, tAtX } from '../side';
import { fish, type FishCtx, type FishSpec, ring, scaleRims } from '../fish';
import type { Fill, Line, Part } from '../types';

const F = (spec: FishSpec, palette: PlateDef['palette'], seed: number): PlateDef => ({ build: () => fish({ ...spec, seed }), palette });
/** A band along part of a fin's outline (its margin). */
const margin = (outline: Pt[], w: number, paint: Fill['paint'], o = 1): Fill => {
  const n = outline.length;
  const inner = outline.map((p, i) => {
    const a = outline[Math.max(0, i - 1)];
    const b = outline[Math.min(n - 1, i + 1)];
    const nr = perp(norm(sub(b, a)));
    return add(p, mul(nr, -w));
  });
  return { poly: [...outline, ...inner.reverse()], paint, o };
};
/** A filament streaming back from a point, as a thin tapering ribbon. */
const filament = (pts: Pt[], w: number, paint: Fill['paint']): Part => ({ poly: swell(spline(pts, false), w, 'end'), paint, lines: [], edge: 0.5 });
/** A vertical band across the body between two x positions, bowed by `bow`, from f0 to f1. */
const vband = (c: FishCtx, x0: number, x1: number, bow = 0, f0 = -0.6, f1 = 1.6): Pt[] => {
  const s = c.s;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let k = 0; k <= 10; k++) {
    const f = f0 + ((f1 - f0) * k) / 10;
    const b = bow * Math.sin(Math.PI * ((f - f0) / (f1 - f0)));
    left.push(at(s, tAtX(s, x0 - b), f));
    right.push(at(s, tAtX(s, x1 - b), f));
  }
  return [...left, ...right.reverse()];
};

// ── Ocellaris clownfish ──────────────────────────────────────────────────────
// Three white bars, the middle one bulging forward; thin black edges on the bars and fin margins;
// a chunky oval body with a notched dorsal; rounded fins all round; a large eye and blunt face.
const clownfish: FishSpec = {
  tip: [0, 1.5],
  blunt: 0.75,
  top: [[0.8, -2], [2.5, -5.5], [5, -9], [9, -12.6], [14, -15.4], [20, -17], [28, -17.8], [36, -17.6], [46, -16], [56, -12.6], [64, -9], [72, -6.6], [78, -6]],
  bot: [[0.8, 3.6], [3, 6.6], [7, 10], [13, 13.6], [20, 16.2], [28, 17.6], [36, 17.8], [46, 16.4], [56, 13], [64, 9.6], [72, 7], [78, 6.2]],
  dorsal: [
    { from: 22, to: 46, spines: 10, rays: 0, h: [[0, 5], [0.3, 7], [1, 4]], notch: 0.3, rake: [25, 45] },
    { from: 47.5, to: 74, rays: 14, h: [[0, 9], [0.4, 13], [1, 6]], rake: [40, 75] },
  ],
  anal: [{ from: 57, to: 74, spines: 2, rays: 12, h: [[0, 6], [0.45, 11.5], [1, 5]], rake: [30, 70] }],
  caudal: { type: 'rounded', len: 20, h: 13, rays: 14 },
  pectoral: { at: [24, 0.5], base: 4, h: [[0, 9], [0.4, 11], [1, 7]], angles: [-15, 40], rays: 11 },
  pelvic: { at: [27, 0.88], base: 3, h: [[0, 8], [1, 5]], angles: [35, 80], rays: 6 },
  eye: { x: 10.5, f: 0.33, r: 2.6, iris: '#E07A2A' },
  gill: { x: 20, bow: 2.6 },
  mouth: [[0.4, 0.6], [2.4, 0.64], [4, 0.62]],
  scales: 9,
  belly: 1.5,
  softBelly: false,
  lateral: false,
  extra: (c) => {
    const bars = [vband(c, 14, 19.5, -2.4, -0.05, 1.05), vband(c, 42, 49, 3.2, -0.05, 1.05), vband(c, 72.5, 76.5, 0, -0.05, 1.05)];
    const edges: Line[] = bars.flatMap((b) => [{ pts: b.slice(0, 11), w: 1.6 }, { pts: b.slice(11), w: 1.6 }]);
    const finMargin = (o: Pt[]) => margin(o, 0.8, 'ink', 0.9);
    return {
      marks: bars.map((poly) => ({ poly, paint: 'light' as const, clip: 'trunk' as const })),
      lines: edges,
      median: [
        { part: 'dorsal', index: 0, marks: [finMargin(c.dorsal[0].outline)] },
        { part: 'dorsal', index: 1, marks: [finMargin(c.dorsal[1].outline)] },
        { part: 'anal', marks: [finMargin(c.anal[0].outline)] },
        { part: 'caudal', marks: [finMargin(c.caudal.trailing)] },
        { part: 'pectoral', marks: [{ poly: swell(spline(c.pectoral!.tips, false), 1.1, 'both'), paint: 'ink', o: 0.85 }] },
      ],
    };
  },
};

// ── Moorish idol ─────────────────────────────────────────────────────────────
// A very long white dorsal filament, longer than the body; a tubular snout with an orange saddle;
// two broad vertical black bars, the first through the eye; a deep disc with a tall sickle anal
// fin; a black tail with a white arc.
const idol: FishSpec = {
  tip: [0, 2],
  blunt: 0.6,
  top: [[0.6, 0.6], [5, 0.2], [8, -0.6], [10, -3], [12, -10], [15, -20], [19, -28], [25, -32.5], [32, -33.5], [40, -32], [50, -26], [60, -17], [68, -9.5], [76, -5], [82, -4]],
  bot: [[0.6, 3.2], [5, 3.6], [8, 4.6], [11, 8], [15, 16], [20, 25], [26, 31], [33, 33.5], [41, 32.5], [51, 26], [61, 17], [69, 9.6], [76, 5], [82, 4.2]],
  dorsal: [{ from: 22, to: 72, spines: 6, rays: 36, h: [[0, 14], [0.08, 22], [0.25, 22], [0.6, 12], [1, 3]], notch: 0.15, rake: [30, 72] }],
  anal: [{ from: 30, to: 72, spines: 3, rays: 30, h: [[0, 16], [0.12, 22], [0.5, 12], [1, 3]], rake: [30, 72] }],
  caudal: { type: 'emarginate', len: 16, h: 9, rays: 12, paint: 'ink' },
  pectoral: { at: [30, 0.55], base: 3, h: [[0, 9], [1, 6]], angles: [0, 40], rays: 9, paint: 'paper' },
  pelvic: { at: [30, 0.95], base: 2, h: [[0, 7], [1, 4]], angles: [55, 80], rays: 5, paint: 'ink' },
  eye: { x: 17.5, f: 0.4, r: 1.7, iris: '#D9B44A' },
  mouth: [[0.3, 0.45], [1.4, 0.5]],
  lateral: false,
  belly: 1.5,
  softBelly: false,
  engraving: 'smooth',
  extra: (c) => {
    const s = c.s;
    // Yellow wash over the top and back of the body.
    const yellow = region(s, tAtX(s, 26), 1, -0.6, (t) => 0.55 - 0.3 * t);
    const bar1 = vband(c, 13, 27, 1.5);
    const bar2 = vband(c, 47, 62, 2);
    const saddle = shapeIn(s, [[tAtX(s, 4), -0.05], [tAtX(s, 9), -0.15], [tAtX(s, 11), 0.25], [tAtX(s, 5), 0.35]]);
    // The filament: from the third dorsal spine, up and back in a long S past the tail.
    const base = c.dorsal[0].tips[2];
    const fil = filament([base, add(base, [12, -12]), add(base, [34, -16]), add(base, [56, -10]), add(base, [78, -8])], 1.6, 'light');
    return {
      tint: [{ poly: yellow, paint: '#F6D23A', o: 0.85, clip: 'body' }],
      marks: [
        { poly: bar1, paint: 'ink', o: 0.92, clip: 'body' },
        { poly: bar2, paint: 'ink', o: 0.92, clip: 'body' },
        { poly: saddle, paint: '#F08A24', edge: 0.8 },
      ],
      near: [fil],
      median: [{ part: 'caudal', marks: [margin(c.caudal.trailing, 2, 'light', 0.9)] }],
    };
  },
};

// The angelfish shape: deep, compressed, squarish at the fin bases.
const angelBody = (depth: number) => ({
  tip: [0, 2] as Pt,
  blunt: 0.6,
  top: [[0.6, -1], [2.6, -5], [5.4, -10], [9, -15], [13, -19.5], [18, -23], [24, -25], [32, -25.4], [42, -24.2], [52, -21], [61, -15.6], [68, -10.4], [74, -7.2], [80, -6.2]].map(([x, y]) => [x, y * depth] as [number, number]),
  bot: [[0.6, 3.6], [2.6, 7], [6, 11.4], [11, 16], [17, 20.4], [24, 23.4], [32, 24.6], [42, 23.8], [52, 20.6], [61, 15.2], [68, 10], [74, 7.2], [80, 6.4]].map(([x, y]) => [x, y * depth] as [number, number]),
});
const angelSpine = (c: FishCtx, paint: Fill['paint']): Fill => {
  const p = atX(c.s, 17, 0.78);
  return { poly: [add(p, [-1.2, -0.6]), add(p, [4.2, 0.4]), add(p, [-1.2, 0.9])], paint, edge: 0.8 };
};

// ── Emperor angelfish ────────────────────────────────────────────────────────
// Many thin yellow and blue stripes sweeping up into the dorsal fin; a black eye mask with blue
// edges; a black shoulder patch behind the gill cover with a blue front edge; a solid yellow tail;
// a pale face and mouth.
const emperor: FishSpec = {
  ...angelBody(0.95),
  dorsal: [
    { from: 24, to: 50, spines: 13, rays: 0, h: [[0, 4], [0.2, 6], [1, 7]], notch: 0.25, rake: [35, 50] },
    { from: 51, to: 79, rays: 19, h: [[0, 8], [0.5, 12], [0.85, 12], [1, 6]], rake: [45, 78] },
  ],
  anal: [{ from: 50, to: 78, spines: 3, rays: 19, h: [[0, 5], [0.3, 10], [0.8, 11], [1, 5]], rake: [40, 75], paint: '#2A3F80' }],
  caudal: { type: 'rounded', len: 20, h: 12, rays: 14, paint: '#F5B21E' },
  pectoral: { at: [27, 0.55], base: 3.4, h: [[0, 9], [1, 6]], angles: [-5, 40], rays: 10 },
  pelvic: { at: [28, 0.92], base: 2.4, h: [[0, 9], [1, 5]], angles: [50, 80], rays: 6 },
  eye: { x: 12.5, f: 0.34, r: 1.8, iris: '#2A3F80' },
  gill: { x: 22, bow: 2.6 },
  mouth: [[0.3, 0.58], [1.8, 0.62], [3, 0.6]],
  lateral: false,
  belly: 1.5,
  softBelly: false,
  engraving: 'smooth',
  extra: (c) => {
    const s = c.s;
    // Stripes: yellow on blue, rising towards the tail and on up into the soft dorsal.
    const stripes: Fill[] = [];
    for (let k = 0; k < 13; k++) {
      const f = -0.35 + k * 0.105;
      stripes.push({ poly: region(s, tAtX(s, 26), 1, (t) => f - 0.55 * t ** 1.6, (t) => f + 0.045 - 0.55 * t ** 1.6), paint: '#F3C623', o: 0.95, clip: 'body' });
    }
    const face = region(s, 0, tAtX(s, 10), -0.1, 1.1);
    const mask = shapeIn(s, [[tAtX(s, 9), -0.02], [tAtX(s, 14.5), -0.02], [tAtX(s, 15.5), 0.5], [tAtX(s, 14), 0.86], [tAtX(s, 10.5), 0.86], [tAtX(s, 10.5), 0.5]]);
    const patch = shapeIn(s, [[tAtX(s, 21), 0.95], [tAtX(s, 22), 0.3], [tAtX(s, 26), -0.02], [tAtX(s, 31), 0.1], [tAtX(s, 31), 0.6], [tAtX(s, 28), 1]]);
    const patchFront: Line = { pts: spline([atX(s, 21, 0.95), atX(s, 22, 0.3), atX(s, 26, -0.02)], false), w: 2.2, o: 1 };
    const analLines: Line[] = [0.3, 0.55, 0.8].map((k) => ({ pts: c.anal[0].outline.map((p) => lerp(p, lerp(c.anal[0].bases[0], c.anal[0].bases[c.anal[0].bases.length - 1], 0.5), k)), w: 0.9, o: 0.7, taper: 'both' }));
    return {
      tint: [{ poly: face, paint: '#CFE0EA', o: 0.9, clip: 'trunk' }],
      marks: [
        ...stripes,
        { poly: patch, paint: '#0E1426', o: 0.92, clip: 'trunk' },
        { poly: mask, paint: '#0E1426', o: 0.92, clip: 'trunk', edge: 2.2 },
        angelSpine(c, '#8EC6F0'),
      ],
      lines: [patchFront, ...analLines.map((l) => ({ ...l, o: 0.5 }))],
    };
  },
};

// ── French angelfish ─────────────────────────────────────────────────────────
// A black, nearly circular disc speckled with gold scale rims; a yellow eye ring; a yellow-orange
// bar at the pectoral base; a long yellow dorsal filament; a white chin.
const french: FishSpec = {
  tip: [0, 2.5],
  blunt: 0.6,
  top: [[0.6, -0.5], [2.4, -5], [5, -10.5], [8.6, -16], [13, -21], [19, -25], [26, -27.5], [34, -28], [44, -26.6], [53, -22.6], [61, -17], [68, -11], [74, -7.6], [79, -6.6]],
  bot: [[0.6, 4.2], [2.6, 8], [6, 13], [11, 18.5], [17, 23], [24, 26.4], [32, 28], [42, 27.2], [51, 23.6], [60, 18], [67, 12], [73, 8.2], [79, 7]],
  dorsal: [
    { from: 26, to: 46, spines: 10, rays: 0, h: [[0, 5], [0.3, 7], [1, 8]], notch: 0.2, rake: [35, 50] },
    { from: 47, to: 78, rays: 26, h: [[0, 9], [0.5, 15], [0.85, 18], [1, 10]], rake: [45, 80] },
  ],
  anal: [{ from: 48, to: 77, spines: 3, rays: 22, h: [[0, 6], [0.5, 13], [0.85, 16], [1, 8]], rake: [40, 78] }],
  caudal: { type: 'truncate', len: 21, h: 12, rays: 14 },
  pectoral: { at: [26, 0.55], base: 3.4, h: [[0, 10], [1, 6]], angles: [-5, 40], rays: 10 },
  pelvic: { at: [27, 0.92], base: 2.4, h: [[0, 10], [1, 5]], angles: [50, 80], rays: 6 },
  eye: { x: 12, f: 0.33, r: 1.8, iris: '#F2A81D' },
  gill: { x: 22, bow: 2.6 },
  mouth: [[0.3, 0.6], [1.8, 0.64], [3, 0.62]],
  lateral: false,
  belly: 1.5,
  softBelly: false,
  engraving: 'none',
  extra: (c) => {
    const s = c.s;
    const rims = scaleRims(s, 11, 18, tAtX(s, 23), '#E8B92E', 0.95);
    const chin = shapeIn(s, [[tAtX(s, 0.2), 0.55], [tAtX(s, 4), 0.62], [tAtX(s, 8), 0.85], [tAtX(s, 4), 1.02], [tAtX(s, 0.6), 0.85]]);
    const eye = atX(s, 12, 0.33);
    const fil = filament([c.dorsal[1].tips[c.dorsal[1].tips.length - 2], add(c.dorsal[1].apex, [12, 1]), add(c.dorsal[1].apex, [26, 4])], 1.6, '#F5C531');
    const pecBar = shapeIn(s, [[tAtX(s, 25.4), 0.42], [tAtX(s, 27.4), 0.44], [tAtX(s, 28.4), 0.72], [tAtX(s, 26.6), 0.74]]);
    return {
      marks: [...rims, { poly: chin, paint: '#E9E6DA', clip: 'trunk' }, { poly: ring(eye, 1.8, 2.6), paint: '#F2A81D' }],
      near: [fil, { poly: pecBar, paint: '#F2A81D', lines: [], edge: 0.6 }],
      median: [
        { part: 'dorsal', index: 1, marks: [margin(c.dorsal[1].outline, 0.9, '#F5C531')] },
        { part: 'caudal', marks: [margin(c.caudal.trailing, 0.9, '#E8B92E', 0.8)] },
      ],
    };
  },
};

// ── Queen angelfish ──────────────────────────────────────────────────────────
// The blue-ringed crown spot on the forehead; a solid yellow tail; long dorsal and anal streamers
// with orange tips; a blue-green body with yellow-rimmed scales; yellow pectorals with a blue
// spot at the base.
const queen: FishSpec = {
  ...angelBody(1),
  dorsal: [
    { from: 24, to: 50, spines: 14, rays: 0, h: [[0, 5], [0.3, 7], [1, 8]], notch: 0.22, rake: [35, 50] },
    { from: 51, to: 78, rays: 20, h: [[0, 9], [0.5, 14], [0.8, 18], [0.95, 25], [1, 14]], rake: [45, 80] },
  ],
  anal: [{ from: 50, to: 77, spines: 3, rays: 20, h: [[0, 6], [0.5, 12], [0.8, 16], [0.95, 23], [1, 12]], rake: [40, 78] }],
  caudal: { type: 'truncate', len: 20, h: 12, rays: 14, paint: '#F7D21E' },
  pectoral: { at: [27, 0.55], base: 3.4, h: [[0, 10], [1, 6]], angles: [-5, 40], rays: 10, paint: '#F7D21E' },
  pelvic: { at: [28, 0.92], base: 2.4, h: [[0, 10], [1, 5]], angles: [50, 80], rays: 6, paint: '#F7D21E' },
  eye: { x: 12, f: 0.33, r: 1.8, iris: '#2D6CC0' },
  gill: { x: 22, bow: 2.6 },
  mouth: [[0.3, 0.58], [1.8, 0.62], [3, 0.6]],
  lateral: false,
  belly: 1.5,
  softBelly: false,
  engraving: 'none',
  extra: (c) => {
    const s = c.s;
    const rims = scaleRims(s, 10, 17, tAtX(s, 23), '#E7B33A', 0.85);
    // The yellow-green face fades into the blue body rather than stopping at a hard edge.
    const face = [[21, 0.5], [24, 0.2], [28, 0.12]].map(([x, o]) => ({ poly: region(s, 0, tAtX(s, x), 0.05, 0.9), paint: '#D9C23A' as const, o, clip: 'trunk' as const }));
    const crownC = atX(s, 17, 0.1);
    const crown: Fill[] = [
      { poly: ellipse(crownC, 2.8), paint: '#3FB7F2' },
      { poly: ellipse(crownC, 2.2), paint: '#0B1F4D' },
      ...scatterIn(ellipse(crownC, 1.9), { r: 0.28, gap: 0.3, paint: '#3FB7F2', rand: c.rand, tries: 40 }),
    ];
    // The streamers carry on from the last ray of each fin, along its trailing edge.
    const dTip = c.dorsal[1].tips[c.dorsal[1].tips.length - 1];
    const aTip = c.anal[0].tips[c.anal[0].tips.length - 1];
    const dEnd = add(dTip, [14, -1]);
    const aEnd = add(aTip, [14, 1]);
    const streamers = [filament([dTip, add(dTip, [7, -0.9]), dEnd], 1.2, '#3E7FA8'), filament([aTip, add(aTip, [7, 0.9]), aEnd], 1.2, '#3E7FA8')];
    const tips: Fill[] = [dEnd, aEnd].map((p) => ({ poly: ellipse(p, 1.4, 0.7), paint: '#F08A24' }));
    return {
      tint: face,
      marks: [...rims, ...crown, angelSpine(c, '#2D6CC0'), { poly: ellipse(atX(s, 27.6, 0.5), 1.6), paint: '#2D6CC0' }, ...tips],
      near: streamers,
      median: [
        { part: 'dorsal', index: 1, marks: [margin(c.dorsal[1].outline, 0.9, '#3FB7F2')] },
        { part: 'anal', marks: [margin(c.anal[0].outline, 0.9, '#3FB7F2')] },
      ],
    };
  },
};

// ── King angelfish ───────────────────────────────────────────────────────────
// One white vertical bar behind the head, ending around mid-flank; a dark slate-blue body with no
// stripes or rimmed scales; a yellow-orange tail and pectorals; a deep, squarish outline with
// short filaments.
const king: FishSpec = {
  ...angelBody(0.98),
  dorsal: [
    { from: 24, to: 50, spines: 14, rays: 0, h: [[0, 5], [0.3, 7], [1, 8]], notch: 0.22, rake: [35, 50] },
    { from: 51, to: 78, rays: 19, h: [[0, 9], [0.5, 13], [0.85, 17], [0.96, 20], [1, 12]], rake: [45, 80] },
  ],
  anal: [{ from: 50, to: 77, spines: 3, rays: 18, h: [[0, 6], [0.5, 12], [0.85, 15], [0.96, 18], [1, 10]], rake: [40, 78] }],
  caudal: { type: 'truncate', len: 20, h: 12, rays: 14, paint: '#F5A623' },
  pectoral: { at: [27, 0.55], base: 3.4, h: [[0, 10], [1, 6]], angles: [-5, 40], rays: 10, paint: '#F5A623' },
  pelvic: { at: [28, 0.92], base: 2.4, h: [[0, 10], [1, 5]], angles: [50, 80], rays: 6, paint: '#F2F2F2' },
  eye: { x: 12, f: 0.33, r: 1.8, iris: '#4FA3E0' },
  gill: { x: 22, bow: 2.6 },
  mouth: [[0.3, 0.58], [1.8, 0.62], [3, 0.6]],
  lateral: false,
  belly: 1.5,
  softBelly: false,
  engraving: 'smooth',
  extra: (c) => {
    const s = c.s;
    const bar = shapeIn(s, [[tAtX(s, 28.5), -0.02], [tAtX(s, 31), -0.02], [tAtX(s, 31.6), 0.35], [tAtX(s, 30.6), 0.6], [tAtX(s, 29), 0.6], [tAtX(s, 28.8), 0.3]]);
    const spots = scatter(s, { t0: 0.02, t1: tAtX(s, 22), f0: 0.05, f1: 0.8, r: 0.3, gap: 0.9, paint: '#8EC6F0', rand: c.rand, tries: 200, o: 0.9 });
    return {
      marks: [{ poly: bar, paint: 'light', clip: 'trunk' }, ...spots, angelSpine(c, '#8EC6F0'), { poly: ellipse(atX(s, 1.6, 0.62), 1.3, 0.9), paint: '#F5A623' }],
      median: [
        { part: 'dorsal', index: 1, marks: [margin(c.dorsal[1].outline, 0.9, '#4FA3E0')] },
        { part: 'anal', marks: [margin(c.anal[0].outline, 0.9, '#4FA3E0')] },
      ],
    };
  },
};

// ── Raccoon butterflyfish ────────────────────────────────────────────────────
// A black eye mask followed by a white band; a broad diagonal black shoulder crescent; a black spot
// on the tail stock joined by a black line under the soft dorsal; diagonal orange stripes on the
// lower flank; a round yellow disc with a short pointed snout.
const raccoon: FishSpec = {
  tip: [0, 0.5],
  blunt: 0.2,
  top: [[1, -1.2], [3, -3], [5, -5.4], [7, -9], [10, -14], [14, -19], [20, -23], [27, -25], [35, -25.4], [44, -24], [53, -20], [61, -14.6], [68, -9.6], [74, -6.6], [79, -6]],
  bot: [[1, 1.8], [3, 3.2], [6, 5.6], [10, 10], [15, 15.6], [21, 20], [28, 23], [36, 24], [45, 23], [54, 19], [62, 14], [69, 9.6], [75, 7], [79, 6.4]],
  dorsal: [
    { from: 22, to: 50, spines: 12, rays: 0, h: [[0, 4], [0.4, 9], [1, 9]], notch: 0.2, rake: [35, 50] },
    { from: 51, to: 78, rays: 22, h: [[0, 9], [0.6, 11], [1, 5]], rake: [45, 78] },
  ],
  anal: [{ from: 50, to: 77, spines: 3, rays: 18, h: [[0, 5], [0.5, 10], [1, 5]], rake: [40, 75] }],
  caudal: { type: 'truncate', len: 19, h: 12, rays: 14 },
  pectoral: { at: [26, 0.55], base: 3, h: [[0, 9], [1, 6]], angles: [-5, 40], rays: 9, paint: 'paper' },
  pelvic: { at: [27, 0.92], base: 2, h: [[0, 8], [1, 4]], angles: [50, 80], rays: 6 },
  eye: { x: 11, f: 0.36, r: 1.6, iris: '#2A2A2A' },
  gill: { x: 21, bow: 2.2, preopercle: false },
  mouth: [[0.3, 0.5], [1.4, 0.55]],
  lateral: false,
  belly: 1.5,
  softBelly: false,
  engraving: 'smooth',
  extra: (c) => {
    const s = c.s;
    const dusky = region(s, tAtX(s, 18), 1, -0.5, 0.25);
    const mask = shapeIn(s, [[tAtX(s, 7.5), -0.05], [tAtX(s, 12.5), -0.05], [tAtX(s, 14), 0.45], [tAtX(s, 13.4), 0.78], [tAtX(s, 9.6), 0.78], [tAtX(s, 8.6), 0.4]]);
    const white = shapeIn(s, [[tAtX(s, 12.5), -0.05], [tAtX(s, 21), -0.05], [tAtX(s, 18), 0.5], [tAtX(s, 16.5), 0.86], [tAtX(s, 13.4), 0.8], [tAtX(s, 14), 0.45]]);
    const crescent = shapeIn(s, [[tAtX(s, 17), 0.82], [tAtX(s, 19), 0.4], [tAtX(s, 25), 0.05], [tAtX(s, 34), -0.25], [tAtX(s, 38), -0.1], [tAtX(s, 30), 0.15], [tAtX(s, 24), 0.5], [tAtX(s, 21.5), 0.86]]);
    const line = region(s, tAtX(s, 50), tAtX(s, 77), -0.12, 0.06);
    const spot = { poly: ellipse(atX(s, 77, 0.24), 2.4, 2.2), paint: 'ink' as const, clip: 'body' as const };
    const stripes: Fill[] = [];
    for (let k = 0; k < 8; k++) {
      const x = 28 + k * 5.2;
      stripes.push({ poly: shapeIn(s, [[tAtX(s, x), 1.02], [tAtX(s, x + 1.2), 1.02], [tAtX(s, x + 10), 0.42], [tAtX(s, x + 8.8), 0.42]]), paint: '#C8642A', o: 0.85, clip: 'trunk' });
    }
    return {
      tint: [{ poly: dusky, paint: '#B98A2A', o: 0.5, clip: 'body' }],
      marks: [
        ...stripes,
        { poly: white, paint: 'light', clip: 'trunk' },
        { poly: mask, paint: 'ink', o: 0.92, clip: 'trunk' },
        { poly: crescent, paint: 'ink', o: 0.92, clip: 'body', edge: 1.6 },
        { poly: line, paint: 'ink', o: 0.9, clip: 'body' },
        spot,
      ],
      median: [
        { part: 'dorsal', index: 1, marks: [margin(c.dorsal[1].outline, 1.1, 'ink', 0.85)] },
        { part: 'anal', marks: [margin(c.anal[0].outline, 1.1, 'ink', 0.85)] },
        { part: 'caudal', marks: [{ poly: lerp(c.caudal.trailing[0], c.caudal.trailing[c.caudal.trailing.length - 1], 0) && region(s, 0.99, 1, 0, 1), paint: 'ink', o: 0 }] },
      ],
    };
  },
};

// ── Stoplight parrotfish (terminal male) ─────────────────────────────────────
// A beaked, blunt green parrotfish with a lunate tail; a yellow spot at the top of the gill cover;
// a yellow spot at the tail base; orange diagonal bands on the head; an orange crescent in the tail.
const stoplight: FishSpec = {
  tip: [0, 2],
  blunt: 0.8,
  top: [[0.5, -1], [2, -4.5], [4.5, -8], [8, -11.4], [13, -14], [20, -15.6], [30, -16.2], [40, -15.8], [50, -14], [60, -11], [68, -8], [74, -6.6], [78, -6.2]],
  bot: [[0.6, 3.4], [2.6, 6], [6, 8.6], [12, 11.6], [20, 13.8], [30, 15], [40, 15], [50, 13.6], [60, 10.8], [68, 8], [74, 6.6], [78, 6.2]],
  dorsal: [{ from: 27, to: 74, spines: 9, rays: 10, h: [[0, 4], [0.2, 5], [1, 5.4]], notch: 0.15, rake: [40, 60] }],
  anal: [{ from: 55, to: 74, spines: 3, rays: 9, h: 4.6, rake: [40, 60] }],
  caudal: { type: 'lunate', len: 22, h: 15, fork: 0.45, rays: 14 },
  pectoral: { at: [24, 0.5], base: 2.6, h: [[0, 11], [0.3, 10], [1, 4]], angles: [5, 45], rays: 10, smooth: false },
  pelvic: { at: [27, 0.94], base: 2, h: [[0, 6], [1, 3]], angles: [45, 75], rays: 6 },
  eye: { x: 11, f: 0.32, r: 1.5, iris: '#E0B83A' },
  gill: { x: 22, bow: 2.6 },
  scales: 8,
  lateral: (t) => 0.3 + 0.05 * t,
  belly: 1.5,
  softBelly: false,
  extra: (c) => {
    const s = c.s;
    const beak = shapeIn(s, [[tAtX(s, 0.1), 0.48], [tAtX(s, 2.4), 0.46], [tAtX(s, 3), 0.62], [tAtX(s, 2.4), 0.78], [tAtX(s, 0.4), 0.74]]);
    const bands: Fill[] = [
      [0, 0.5, 9, -0.05],
      [1, 0.72, 13, 0.05],
      [3, 0.92, 19, 0.3],
    ].map(([x0, f0, x1, f1]) => ({ poly: shapeIn(s, [[tAtX(s, x0), f0], [tAtX(s, x0 + 1.4), f0 + 0.02], [tAtX(s, x1 + 1.2), f1 + 0.04], [tAtX(s, x1), f1]]), paint: '#F0884A', o: 0.9, clip: 'trunk' as const }));
    const stop = { poly: ellipse(atX(s, 23, 0.22), 2, 1.6), paint: '#FFD319' as const, clip: 'trunk' as const };
    const tailSpot = { poly: ellipse(atX(s, 74, 0.28), 2.4, 1.6), paint: '#FFD319' as const, clip: 'trunk' as const };
    const crescent = c.caudal.trailing.map((p) => lerp(p, atX(s, 78, 0.5), 0.18));
    return {
      marks: [{ poly: beak, paint: '#EDEADE', edge: 0.9 }, ...bands, stop, tailSpot],
      median: [
        { part: 'caudal', marks: [{ poly: swell(crescent, 2.4, 'both'), paint: '#F5A623', o: 0.9 }] },
        { part: 'dorsal', marks: [margin(c.dorsal[0].outline, 0.8, '#F5A623', 0.9)] },
        { part: 'anal', marks: [margin(c.anal[0].outline, 0.8, '#F5A623', 0.9)] },
      ],
    };
  },
};

// Triggerfish shape: a huge head with the eye far back and a long sloping snout.
const triggerBody = (depth: number) => ({
  tip: [0, 4] as Pt,
  blunt: 0.5,
  top: [[0.4, 2.4], [3, -1.8], [7, -7], [12, -12.4], [17, -16.6], [23, -19.4], [30, -20.6], [38, -20.4], [47, -18.6], [56, -15.2], [64, -11], [71, -7.4], [77, -5.6], [80, -5.2]].map(([x, y]) => [x, y * depth] as [number, number]),
  bot: [[0.6, 5.6], [3, 7.6], [7, 10.4], [13, 14], [20, 17.4], [28, 19.8], [36, 20.6], [45, 19.6], [54, 16.8], [62, 13], [69, 8.8], [75, 6.2], [80, 5.4]].map(([x, y]) => [x, y * depth] as [number, number]),
  eye: { x: 21, f: 0.22, r: 1.5, iris: '#C9A54A' as const },
  gill: { x: 27, bow: 1.4, f0: 0.3, f1: 0.62, preopercle: false },
  pectoral: { at: [29, 0.42] as [number, number], base: 2.4, h: [[0, 5.5], [1, 3.5]] as [number, number][], angles: [-10, 40] as [number, number], rays: 8 },
  mouth: [[0.2, 0.7], [1.6, 0.74]] as [number, number][],
  lateral: false as const,
  belly: 1.5,
  softBelly: false,
  engraving: 'smooth' as const,
});
// The first dorsal: a low-slung triangle of three spines joined by membrane, not a tall serrated horn.
const trigger1 = { from: 28, to: 42, spines: 3, rays: 0, h: [[0, 9], [0.5, 7], [1, 4]] as [number, number][], notch: 0.2, rake: [20, 30] as [number, number] };

// ── Titan triggerfish ────────────────────────────────────────────────────────
// A dark moustache band above the mouth; a cross-hatched pattern of dark scales with pale edges;
// yellow fins with black edges; a huge head with the eye far back and a long snout; the raised
// first dorsal spine.
const titan: FishSpec = {
  ...triggerBody(1),
  dorsal: [trigger1, { from: 48, to: 75, rays: 24, h: [[0, 7], [0.2, 8], [1, 4]], rake: [40, 70] }],
  anal: [{ from: 50, to: 75, rays: 22, h: [[0, 7], [0.2, 7.5], [1, 4]], rake: [40, 70] }],
  caudal: { type: 'emarginate', len: 16, h: 11, rays: 14 },
  extra: (c) => {
    const s = c.s;
    // Checkerboard: a dark centre to every scale, the pale edges left between them.
    const cells: Fill[] = [];
    const t0 = tAtX(s, 24);
    for (let r = 0; r < 12; r++) {
      const f = 0.04 + (0.92 * (r + 0.5)) / 12;
      for (let k = 0; k < 24; k++) {
        const t = t0 + (1 - t0) * ((k + (r % 2) * 0.5) / 24);
        if (t > 0.98) continue;
        const cc = at(s, t, f);
        cells.push({ poly: [add(cc, [-0.9, 0]), add(cc, [0, -0.8]), add(cc, [0.9, 0]), add(cc, [0, 0.8])], paint: 'dark', o: 0.85, clip: 'trunk' });
      }
    }
    // The moustache: a thin dark band along the upper lip, with a yellow patch on the lips and cheek.
    const moustache = shapeIn(s, [[tAtX(s, 1.4), 0.6], [tAtX(s, 7), 0.55], [tAtX(s, 14), 0.56], [tAtX(s, 15), 0.62], [tAtX(s, 7), 0.64], [tAtX(s, 1.8), 0.68]]);
    const lipPatch = shapeIn(s, [[tAtX(s, 0.8), 0.68], [tAtX(s, 6), 0.65], [tAtX(s, 13.5), 0.68], [tAtX(s, 14.5), 0.82], [tAtX(s, 8), 0.92], [tAtX(s, 2.2), 0.86]]);
    const groove: Line = { pts: spline([atX(s, 13, 0.25), atX(s, 17, 0.22), atX(s, 19, 0.24)], false), w: 0.9 };
    return {
      marks: [...cells, { poly: lipPatch, paint: '#E9B53C', o: 0.8, clip: 'trunk' }, { poly: moustache, paint: 'ink', o: 0.6, clip: 'trunk' }],
      lines: [groove, { pts: spline([atX(s, 3, 0.62), atX(s, 9, 0.58), atX(s, 14, 0.66)], false), w: 0.8, o: 0.6 }],
      median: [
        { part: 'dorsal', index: 1, marks: [margin(c.dorsal[1].outline, 1.2, 'ink', 0.9)] },
        { part: 'anal', marks: [margin(c.anal[0].outline, 1.2, 'ink', 0.9)] },
        { part: 'caudal', marks: [margin(c.caudal.trailing, 1.6, 'ink', 0.9)] },
      ],
    };
  },
};

// ── Clown triggerfish ────────────────────────────────────────────────────────
// Large white spots on a black lower body; a yellow net pattern on the back; a yellow-orange mouth
// ring; a pale band across the snout; a pale vertical band on the black tail.
const clownTrigger: FishSpec = {
  ...triggerBody(0.95),
  dorsal: [trigger1, { from: 48, to: 75, rays: 24, h: [[0, 7], [0.2, 8], [1, 4]], rake: [40, 70], paint: '#E9E2C4' }],
  anal: [{ from: 50, to: 75, rays: 22, h: [[0, 7], [0.2, 7.5], [1, 4]], rake: [40, 70], paint: '#E9E2C4' }],
  caudal: { type: 'rounded', len: 16, h: 10.5, rays: 14, paint: 'ink' },
  extra: (c) => {
    const s = c.s;
    const rand = rng(23);
    // Big white spots in rows on the lower half.
    const spots: Fill[] = [];
    for (const [f, xs] of [
      [0.62, [34, 43, 52, 61]],
      [0.82, [30, 39, 48, 57, 66]],
      [0.98, [36, 45, 54]],
    ] as [number, number[]][])
      for (const x of xs) spots.push({ poly: ellipse(atX(s, x + (rand() - 0.5) * 1.5, f), 2.6 + rand() * 0.5, 2.4), paint: 'light', clip: 'trunk' });
    // The yellow net over the back: a saddle of yellow with black spots left in it.
    const saddle = region(s, tAtX(s, 28), tAtX(s, 72), -0.05, (t) => 0.32 - 0.1 * Math.abs(t - 0.6));
    const holes = scatter(s, { t0: tAtX(s, 29), t1: tAtX(s, 71), f0: 0.02, f1: 0.26, r: 0.8, gap: 0.5, paint: 'ink', rand, tries: 300 });
    const snoutBand = shapeIn(s, [[tAtX(s, 10), 0.02], [tAtX(s, 14), 0.0], [tAtX(s, 13), 0.7], [tAtX(s, 9.4), 0.7]]);
    const lips = { poly: ellipse(atX(s, 1.2, 0.72), 1.8, 1.2), paint: '#F59A23' as const, edge: 0.8 };
    const tailBand = region(s, 1, 1, 0, 1);
    void tailBand;
    const band = c.caudal.trailing.map((p) => lerp(atX(s, 80, 0.5), p, 0.5));
    return {
      marks: [{ poly: saddle, paint: '#E8C93A', clip: 'trunk' }, ...holes, ...spots, { poly: snoutBand, paint: '#EBDD9B', clip: 'trunk' }, lips],
      median: [{ part: 'caudal', marks: [{ poly: swell(band, 4.4, 'both'), paint: '#EBDD9B' }] }],
    };
  },
};

// ── Queen triggerfish ────────────────────────────────────────────────────────
// A lunate tail with long upper and lower streamers; tall pointed second dorsal and anal lobes; two
// blue bands across the face; dark lines radiating from the eye; an orange-yellow lower half and
// a blue band at the tail base.
const queenTrigger: FishSpec = {
  ...triggerBody(0.9),
  eye: { x: 22, f: 0.24, r: 1.3, iris: '#C9A54A' },
  dorsal: [
    { from: 28, to: 42, spines: 3, rays: 0, h: [[0, 9], [0.5, 7], [1, 4]], notch: 0.2, rake: [20, 30] },
    { from: 46, to: 74, rays: 28, h: [[0, 18], [0.15, 12], [0.45, 5], [1, 3.6]], rake: [40, 70] },
  ],
  anal: [{ from: 48, to: 74, rays: 26, h: [[0, 16], [0.15, 10], [0.45, 4.4], [1, 3.2]], rake: [40, 70] }],
  caudal: { type: 'lyre', len: 16, h: 12, fork: 0.35, filament: 18, rays: 14 },
  extra: (c) => {
    const s = c.s;
    const lower = region(s, 0, 1, (t) => 0.45 - 0.1 * t, 1.05);
    const blue = '#2FA8E8' as const;
    const bandA = spline([atX(s, 1, 0.56), atX(s, 10, 0.48), atX(s, 20, 0.4), atX(s, 28, 0.5)], false);
    const bandB = spline([atX(s, 2, 0.76), atX(s, 12, 0.72), atX(s, 22, 0.66), atX(s, 29, 0.66)], false);
    const eye = atX(s, 22, 0.24);
    const radiating: Line[] = [200, 240, 290, 330, 20].map((a) => {
      const r = (a * Math.PI) / 180;
      return { pts: [add(eye, [Math.cos(r) * 1.6, Math.sin(r) * 1.6]), add(eye, [Math.cos(r) * 4.4, Math.sin(r) * 4.4])], w: 1.1, o: 0.85, taper: 'end' };
    });
    const pedBand = region(s, tAtX(s, 74), tAtX(s, 77.5), -0.2, 1.2);
    return {
      tint: [{ poly: lower, paint: '#E9A93A', o: 0.85, clip: 'trunk' }],
      marks: [
        { poly: swell(bandA, 1.6, 'both'), paint: blue },
        { poly: swell(bandB, 1.6, 'both'), paint: blue },
        { poly: ring(atX(s, 1, 0.72), 1, 1.8), paint: blue },
        { poly: pedBand, paint: blue, o: 0.9, clip: 'body' },
      ],
      lines: radiating,
      median: [
        { part: 'caudal', marks: [margin(c.caudal.trailing, 1, blue, 0.9)] },
        { part: 'dorsal', index: 1, marks: [margin(c.dorsal[1].outline, 1, blue, 0.8)] },
        { part: 'anal', marks: [margin(c.anal[0].outline, 1, blue, 0.8)] },
      ],
    };
  },
};

// ── Red lionfish ─────────────────────────────────────────────────────────────
// Separate long dorsal spines held up like quills; huge feathered pectoral fans; red-and-white
// zebra bars; tentacles above the eyes; a spotted rounded tail and soft fins.
const lionfish: FishSpec = {
  tip: [0, 0.6],
  blunt: 0.4,
  top: [[0.8, -1.6], [3, -4.6], [6, -8], [10, -11], [15, -13], [22, -14], [30, -14.2], [40, -13.4], [50, -11.4], [60, -8.6], [68, -6], [74, -4.8], [78, -4.4]],
  bot: [[0.8, 2.6], [3, 5], [7, 7.6], [13, 10], [20, 11.6], [30, 12.4], [40, 12], [50, 10.6], [60, 8.2], [68, 6], [74, 4.8], [78, 4.4]],
  dorsal: [
    { from: 18, to: 52, spines: 13, rays: 0, h: [[0, 22], [0.25, 36], [0.5, 32], [1, 10]], notch: 0.94, rake: [22, 45], paint: 'paper' },
    { from: 54, to: 70, rays: 10, h: [[0, 9], [0.5, 10], [1, 5]], rake: [40, 70], paint: 'paper' },
  ],
  anal: [{ from: 56, to: 70, spines: 3, rays: 7, h: [[0, 6], [0.5, 9], [1, 5]], rake: [40, 70], paint: 'paper' }],
  caudal: { type: 'rounded', len: 22, h: 11, rays: 12, paint: 'paper' },
  pectoral: { at: [24, 0.5], base: 6, h: [[0, 30], [0.5, 36], [1, 28]], angles: [8, 96], rays: 15, notch: 0.25, paint: 'paper' },
  pelvic: { at: [27, 0.95], base: 2, h: [[0, 16], [1, 10]], angles: [60, 84], rays: 5 },
  eye: { x: 9, f: 0.3, r: 1.7, iris: '#B8372A' },
  mouth: [[0.4, 0.62], [3.6, 0.7], [6.4, 0.64]],
  lateral: false,
  belly: 1.5,
  softBelly: false,
  engraving: 'smooth',
  extra: (c) => {
    const s = c.s;
    // Zebra bars, wide and narrow, on the body; bars radiating from the eye on the head.
    const bars: Fill[] = [];
    let x = 14;
    let k = 0;
    while (x < 78) {
      const w = k % 2 ? 1.2 : 2.6;
      bars.push({ poly: vband(c, x, x + w, 1.6, -0.05, 1.05), paint: '#8E2A1E', o: 0.9, clip: 'trunk' });
      x += w + 1.8;
      k++;
    }
    const eye = atX(s, 9, 0.3);
    const headBars: Fill[] = [100, 150, 210, 250].map((a) => {
      const r = (a * Math.PI) / 180;
      return { poly: swell([add(eye, [Math.cos(r) * 2, Math.sin(r) * 2]), add(eye, [Math.cos(r) * 8, Math.sin(r) * 8])], 2.2, 'end'), paint: '#8E2A1E' as const, o: 0.85, clip: 'trunk' as const };
    });
    // Bands along the spines and the pectoral rays.
    const banding = (lines: Line[]): Fill[] =>
      lines.flatMap((l) => {
        const [a, b] = [l.pts[0], l.pts[l.pts.length - 1]];
        return [0.15, 0.4, 0.65, 0.9].map((t) => ({ poly: swell([lerp(a, b, t - 0.06), lerp(a, b, t + 0.06)], 1.3, 'both'), paint: '#8E2A1E' as const, o: 0.9 }));
      });
    const tentacle = (dx: number): Part => {
      const base = add(eye, [dx, -1.6]);
      return { poly: spline([add(base, [-0.4, 0]), add(base, [-1, -3]), add(base, [0.2, -6]), add(base, [0.8, -3]), add(base, [0.4, 0])], true), paint: 'paper', lines: [], edge: 0.7 };
    };
    const spotted = (poly: Pt[]) => scatterIn(poly, { r: 0.5, gap: 1.1, paint: '#3A1D18', rand: c.rand, tries: 160, o: 0.8 });
    return {
      marks: [...bars, ...headBars],
      near: [tentacle(-0.4), tentacle(1.2)],
      median: [
        { part: 'dorsal', index: 0, marks: banding(c.dorsal[0].rays) },
        { part: 'dorsal', index: 1, marks: spotted(c.dorsal[1].poly) },
        { part: 'anal', marks: spotted(c.anal[0].poly) },
        { part: 'caudal', marks: spotted(c.caudal.poly) },
        { part: 'pectoral', marks: banding(c.pectoral!.lines) },
      ],
    };
  },
};

export const REEF_FISH_1: Record<string, PlateDef> = {
  clownfish: F(clownfish, { back: '#F26B1D', belly: '#F26B1D', fin: '#F58A3A' }, 1),
  'moorish-idol': F(idol, { back: '#F7F5EE', belly: '#F7F5EE', fin: '#F6D23A' }, 2),
  'emperor-angelfish': F(emperor, { back: '#2A4FA0', belly: '#2A4FA0', fin: '#2A4FA0' }, 3),
  'french-angelfish': F(french, { back: '#1F1F26', belly: '#1F1F26', fin: '#22222A' }, 4),
  'queen-angelfish': F(queen, { back: '#2E7FA8', belly: '#3E9E8F', fin: '#2E6FA0' }, 5),
  'king-angelfish': F(king, { back: '#2B3A55', belly: '#2B3A55', fin: '#2B3A55' }, 6),
  'raccoon-butterflyfish': F(raccoon, { back: '#F2C12E', belly: '#F2C12E', fin: '#F2C12E' }, 7),
  'stoplight-parrotfish': F(stoplight, { back: '#1F9C78', belly: '#1F9C78', fin: '#2A9A7E' }, 8),
  'titan-triggerfish': F(titan, { back: '#E3CF8A', belly: '#E3CF8A', fin: '#D7B048', dark: '#3D4A2F' }, 9),
  'clown-triggerfish': F(clownTrigger, { back: '#1A1A1A', belly: '#1A1A1A', fin: '#1A1A1A' }, 10),
  'queen-triggerfish': F(queenTrigger, { back: '#6E8B5A', belly: '#E9A93A', fin: '#6E8B5A' }, 11),
  lionfish: F(lionfish, { back: '#F3E6D3', belly: '#F3E6D3', fin: '#F6EEDD' }, 12),
};
