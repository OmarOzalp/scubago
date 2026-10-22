/**
 * The oddly shaped fish: stonefish, leaf scorpionfish and frogfish (built on the fish base and
 * pushed out of shape), seahorses and seadragons (drawn along a curving spine), and the ornate
 * ghost pipefish (head down, as divers find it).
 */
import { add, blob, clamp, type Ctrl, dist, ellipse, lerp, mul, norm, offsetLine, perp, type Pt, resample, rng, spline, sub } from '../kit';
import { scatter, scatterIn, shapeIn } from '../marks';
import { tube } from '../ray';
import type { PlateDef } from '../registry';
import { rotateGeom, swell } from '../render';
import { atX, region, tAtX } from '../side';
import { fish, type FishCtx, type FishSpec } from '../fish';
import { emptyGeom, type Fill, type Line, type Part, type PlateGeom } from '../types';

/** The sea floor under a fish that sits on it: a ground line and a few stones. */
function ground(c: FishCtx, y: number, x0: number, x1: number): { lines: Line[]; far: Part[] } {
  const rand = rng(5);
  const line: Line = { pts: Array.from({ length: 30 }, (_, i) => [x0 + ((x1 - x0) * i) / 29, y + Math.sin(i * 1.3) * 0.3] as Pt), w: 0.9, o: 0.7, taper: 'both' };
  const stones: Part[] = Array.from({ length: 5 }, (_, i) => ({ poly: blob([x0 + 6 + i * ((x1 - x0 - 12) / 4) + (rand() - 0.5) * 4, y + 0.8], 1 + rand() * 1.2, 0.3, rand, 8, 1.6), paint: '#C9BFA8', lines: [], edge: 0.6 }));
  void c;
  return { lines: [line], far: stones };
}

// ── Reef stonefish ───────────────────────────────────────────────────────────
// A lumpy, warty, rock-like outline; an upturned mouth opening on top of the face; small eyes on
// top of the head with pits behind; huge fleshy pectorals spread on the bottom; the dorsal a
// knobbly ridge.
const lumpy = (pts: [number, number][], amp: number, seed: number): [number, number][] => {
  const rand = rng(seed);
  return pts.map(([x, y], i) => [x, i > 1 ? y - Math.abs(rand() - 0.3) * amp : y]);
};
const stonefish: FishSpec = {
  tip: [0, -3],
  blunt: 0.8,
  top: lumpy([[0.6, -5.6], [2.4, -7.4], [5, -8.4], [7.4, -9.6], [10, -9], [13, -10.4], [17, -12], [22, -13.4], [28, -13.8], [34, -13.6], [40, -12.8], [46, -11.6], [52, -10.2], [58, -8.8], [64, -7.4], [70, -6], [75, -5], [78, -4.6]], 1.8, 3),
  bot: [[0.6, 1.4], [3, 5.4], [8, 8.8], [15, 10.4], [25, 11], [35, 11], [45, 10.6], [55, 9.4], [64, 7.6], [71, 5.8], [78, 4.8]],
  dorsal: [
    { from: 15, to: 58, spines: 13, rays: 0, h: [[0, 2.6], [0.4, 3.6], [1, 2.6]], notch: 0.45, rake: [20, 40] },
    { from: 60, to: 73, rays: 7, h: [[0, 3.6], [1, 3]], rake: [40, 60] },
  ],
  anal: [{ from: 56, to: 70, rays: 6, h: 3.6, rake: [40, 60] }],
  caudal: { type: 'rounded', len: 18, h: 7.5, rays: 10 },
  pectoral: { at: [20, 0.46], base: 9, h: [[0, 15], [0.5, 18], [1, 14]], angles: [28, 78], rays: 13 },
  eye: { x: 9.4, f: -0.04, r: 1.1, iris: '#B8862E', ring: true },
  lateral: false,
  belly: 1.5,
  softBelly: false,
  engraving: 'smooth',
  extra: (c) => {
    const s = c.s;
    const rand = rng(41);
    const warts: Fill[] = scatter(s, { t0: 0.04, t1: 1, f0: 0.02, f1: 0.9, r: (t) => 0.5 + rand() * 0.9, gap: 0.5, paint: 'back', rand, tries: 500, wobble: 0.3 }).map((f) => ({ ...f, edge: 0.7 }));
    const patches: Fill[] = ['#C8642A', '#B33A2E', '#D9B04A', '#7F8F5A', '#8A8478'].flatMap((paint, i) =>
      scatter(s, { t0: 0.05, t1: 1, f0: 0.05, f1: 0.9, r: 2.2 + i * 0.3, gap: 4, paint: paint as Fill['paint'], rand, tries: 20, o: 0.34, wobble: 0.45 }),
    );
    const pits: Fill[] = [{ poly: ellipse(atX(s, 12.6, 0.04), 1.2, 0.7), paint: 'ink', o: 0.7 }];
    // The huge upturned mouth, a dark crescent gape opening on top of the face.
    const gape = shapeIn(s, [[tAtX(s, 0.3), 0.08], [tAtX(s, 3.6), 0.02], [tAtX(s, 7.4), 0.12], [tAtX(s, 4.6), 0.3], [tAtX(s, 1), 0.36]]);
    const lip = spline([atX(s, 0.2, 0.4), atX(s, 4.4, 0.36), atX(s, 8, 0.16)], false);
    const flaps: Line[] = [0.3, 0.45, 0.6].map((f) => ({ pts: [atX(s, 0.6, f), add(atX(s, 0.6, f), [-1.6, 0.4])], w: 0.9 }));
    const g = ground(c, 11, 0, 84);
    return { marks: [...patches, ...warts, ...pits, { poly: gape, paint: '#3A2A22', edge: 1.2 }], lines: [...flaps, ...g.lines, { pts: lip, w: 1.2 }], far: g.far };
  },
};

// ── Leaf scorpionfish ────────────────────────────────────────────────────────
// A paper-thin leaf body; a tall continuous sail dorsal starting right behind the eye; a small
// upturned mouth with tiny tassels; a single plain colour with a prickly texture; tilted as if
// rocking like a leaf.
const leafFish: FishSpec = {
  tip: [0, 1],
  blunt: 0.4,
  top: [[0.6, -0.6], [2, -2.6], [4, -4.2], [6, -7.6], [8.6, -11.8], [12, -14.4], [20, -15.4], [30, -15], [42, -13], [54, -10], [64, -7], [72, -5], [78, -4.4]],
  bot: [[0.8, 2.6], [3, 5], [7, 8], [13, 11], [22, 13], [32, 13.4], [42, 12.4], [52, 10.4], [62, 8], [70, 6], [78, 4.8]],
  dorsal: [{ from: 9, to: 75, spines: 12, rays: 9, h: [[0, 9], [0.15, 19.5], [0.28, 21], [0.62, 14], [0.85, 8.5], [1, 5.5]], notch: 0.08, rake: [12, 45] }],
  anal: [{ from: 55, to: 72, spines: 3, rays: 5, h: [[0, 6], [0.5, 8], [1, 5]], rake: [35, 60] }],
  caudal: { type: 'rounded', len: 22, h: 9, rays: 11 },
  pectoral: { at: [22, 0.66], base: 3, h: [[0, 7], [1, 5]], angles: [10, 50], rays: 8 },
  pelvic: { at: [24, 0.95], base: 2, h: [[0, 7], [1, 5]], angles: [70, 95], rays: 5 },
  eye: { x: 8, f: 0.34, r: 1.6, iris: '#B8862E' },
  mouth: [[0.5, 0.3], [3, 0.46], [6.6, 0.64]],
  lips: 0.7,
  lateral: false,
  belly: 1.5,
  softBelly: false,
  engraving: 'smooth',
  extra: (c) => {
    const s = c.s;
    const rand = rng(43);
    const prickles: Line[] = [];
    for (let k = 0; k < 220; k++) {
      const p = atX(s, 2 + rand() * 76, 0.05 + rand() * 0.9);
      prickles.push({ pts: [p, add(p, [0.35, -0.25])], w: 0.8, o: 0.45, detail: true });
    }
    const vein = spline([atX(s, 12, 0.5), atX(s, 40, 0.42), atX(s, 70, 0.5)], false);
    const tassels: Line[] = [0.48, 0.58].map((f) => ({ pts: [atX(s, 1, f), add(atX(s, 1, f), [-1.2, 0.8])], w: 0.8 }));
    const mottle = scatter(s, { t0: 0.1, t1: 1, f0: 0.1, f1: 0.9, r: 2.2, gap: 3, paint: 'pattern', rand, tries: 40, o: 0.3, wobble: 0.5 });
    return { marks: mottle, lines: [...prickles, { pts: vein, w: 0.8, o: 0.5, taper: 'both' }, ...tassels] };
  },
};

// ── Giant frogfish ───────────────────────────────────────────────────────────
// A lure on the snout with a tuft at its tip; a globular body with an upturned mouth at the front;
// elbowed, arm-like pectorals planted on the bottom; velvety skin with sponge-pore spots; a hump
// of skin-covered spines on the head.
const frogfish: FishSpec = {
  tip: [0, -2],
  blunt: 0.7,
  top: lumpy([[0.6, -5], [2.5, -8.6], [5, -11.6], [7, -13.4], [9, -13], [11.5, -14.8], [14, -17.4], [17, -19], [21, -21], [30, -22.6], [40, -22.2], [50, -20], [58, -16], [65, -11.5], [70, -8], [74, -6.4]], 1.2, 7),
  bot: [[1, 3], [3, 7], [7, 12], [13, 16.5], [21, 20], [30, 22], [40, 22], [49, 20], [57, 16], [64, 11.4], [70, 8], [74, 6.6]],
  dorsal: [{ from: 24, to: 70, rays: 12, h: [[0, 5], [0.5, 8], [1, 5]], rake: [35, 70] }],
  anal: [{ from: 52, to: 70, rays: 7, h: [[0, 5], [0.5, 7], [1, 5]], rake: [35, 65] }],
  caudal: { type: 'rounded', len: 24, h: 11, rays: 11 },
  pelvic: { at: [12, 0.96], base: 2, h: 4.5, angles: [70, 110], rays: 5 },
  eye: { x: 11, f: 0.26, r: 1.2, iris: '#B8862E' },
  mouth: [[0.4, 0.14], [3, 0.34], [7, 0.52], [11.6, 0.6]],
  lips: 1.3,
  lateral: false,
  belly: 1.5,
  softBelly: false,
  engraving: 'smooth',
  extra: (c) => {
    const s = c.s;
    const rand = rng(47);
    // Lure: a slim rod up and forward from the snout, a frilly tuft at its tip.
    const root = atX(s, 2.4, 0.02);
    const rod = spline([root, add(root, [-2, -5]), add(root, [-4.4, -9.6])], false);
    const tuft = blob(add(root, [-4.8, -10.6]), 1.5, 0.45, rand, 9, 1.3);
    // The arm: a stalk out and down from the body, bent at the elbow, ending in a hand of rays
    // spread flat on the bottom.
    const base = atX(s, 31, 0.66);
    const elbow = add(base, [6, 13]);
    const wrist = add(elbow, [-5, 9]);
    const arm = tube(spline([base, lerp(base, elbow, 0.5), add(elbow, [1.2, -0.6]), lerp(elbow, wrist, 0.5), wrist], false), (t) => 3.6 - 2.1 * t + 0.9 * Math.exp(-(((t - 0.5) / 0.14) ** 2)));
    const hand: Pt[] = [];
    const rays: Line[] = [];
    for (let k = 0; k <= 8; k++) {
      const a = ((150 - k * 14) * Math.PI) / 180;
      const tip = add(wrist, [Math.cos(a) * 6, Math.sin(a) * 3.6]);
      hand.push(tip);
      rays.push({ pts: [wrist, lerp(wrist, tip, 0.92)], w: 0.6, taper: 'end' });
    }
    const handPoly = spline([wrist, ...hand], true, 0.9);
    const pores: Fill[] = scatter(s, { t0: 0.05, t1: 1, f0: 0.05, f1: 0.95, r: (t) => 0.4 + rand() * 0.6, gap: 1.8, paint: 'pattern', rand, tries: 200, o: 0.85 });
    const velvet: Line[] = [];
    for (let k = 0; k < 260; k++) {
      const p = atX(s, 1 + rand() * 72, 0.04 + rand() * 0.92);
      velvet.push({ pts: [p, add(p, [0.25, 0.2])], w: 0.8, o: 0.4, detail: true });
    }
    const g = ground(c, 26.5, 0, 80);
    // The huge oblique mouth: a dark crescent from the snout back and down under the eye.
    const gape = shapeIn(s, [[tAtX(s, 0.5), 0.16], [tAtX(s, 4), 0.33], [tAtX(s, 9), 0.5], [tAtX(s, 13), 0.58], [tAtX(s, 9), 0.62], [tAtX(s, 4), 0.5], [tAtX(s, 0.8), 0.32]]);
    return {
      marks: [...pores, { poly: gape, paint: '#4A2F22', edge: 1 }],
      lines: [{ pts: rod, w: 1.3 }, ...velvet, ...g.lines],
      near: [
        { poly: tuft, paint: '#E8C9A0', lines: [], edge: 0.7 },
        { poly: arm, paint: 'back', lines: [], edge: 0.9 },
        { poly: handPoly, paint: 'fin', lines: rays, edge: 0.85 },
      ],
      far: g.far,
    };
  },
};

// ── Seahorses ────────────────────────────────────────────────────────────────
interface HorseSpec {
  /** Centre line from the neck down the trunk to the curled tail tip. */
  spine: Ctrl[];
  width: (t: number) => number;
  /** Snout length and depth, head depth. */
  snout: number;
  snoutDepth: number;
  headDepth: number;
  rings: boolean;
  tubercles?: { paint: Fill['paint']; r: number };
  coronet: 'curl' | 'knob';
  host: 'grass' | 'gorgonian';
}

function seahorse(h: HorseSpec): PlateGeom {
  const g = emptyGeom();
  const rand = rng(61);
  const spine = resample(spline(h.spine, false), 160);
  // The back (the right-hand side of the picture) and the throat and belly (the left).
  const left = offsetLine(spine, (t) => h.width(t));
  const right = offsetLine(spine, (t) => -h.width(t));
  // The head and the neck are one outline: the neck's two edges run up into the head, so there is
  // no step between them. Head points are (u, v): u forward (left) and v up from the neck's top.
  const H = spine[0];
  const K = 1.22;
  const P = ([u, v]: [number, number]): Pt => add(H, [-u * K, -v * K]);
  const hd = h.headDepth;
  const sn = h.snout;
  const sd = h.snoutDepth;
  const upper = (u: number) => hd * 0.8 - 0.57 * (u - 7.4);
  const tipU: [number, number] = [12.2 + sn, upper(12.2 + sn)];
  const tipL: [number, number] = [tipU[0] + 0.1, tipU[1] - sd * 0.8];
  const jaw: [number, number] = [9.2, upper(9.2) - sd * 1.15];
  const mid = (a: [number, number], b: [number, number], t: number, dv: number): [number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + dv];
  const crest: [number, number][] =
    h.coronet === 'curl'
      ? [[1.8, hd * 0.98], [0.2, hd * 1.1], [-1.8, hd * 1.16], [-3.8, hd * 1.08], [-4.6, hd * 0.84]]
      : [[1.8, hd * 0.97], [-0.8, hd * 1.08], [-3.4, hd * 0.98], [-4.4, hd * 0.8]];
  const headCtrl: Ctrl[] = [
    right[6],
    right[3],
    right[0],
    P([5.4, 2.8]),
    P([6.6, 1.8]),
    P(jaw),
    P(mid(jaw, tipL, 0.5, -0.1)),
    P(tipL),
    P([tipU[0] + 0.9, (tipU[1] + tipL[1]) / 2]),
    P(tipU),
    P(mid([7.4, hd * 0.8], tipU, 0.5, 0.35)),
    P([7.4, hd * 0.8]),
    P([4.4, hd * 0.92]),
    ...crest.map(P),
    P([-4.8, hd * 0.5]),
    P([-4.4, hd * 0.16]),
    left[0],
    left[3],
    left[6],
  ];
  const path = spline(headCtrl, false);
  const nearest = (to: Pt, from: number, to2: number) => {
    let best = from;
    for (let i = from; i < to2; i++) if (dist(path[i], to) < dist(path[best], to)) best = i;
    return best;
  };
  const iR = nearest(right[0], 0, Math.floor(path.length / 2));
  const iL = nearest(left[0], Math.floor(path.length / 2), path.length);
  const headPath = path.slice(iR, iL + 1);
  const body = [...left, ...right.slice().reverse(), ...headPath];
  g.body = body;
  g.trunk = body;
  // The host it clings to, behind everything.
  if (h.host === 'grass') {
    const blade = spline([[spine[spine.length - 1][0] - 1.6, spine[spine.length - 1][1] + 6], [spine[spine.length - 1][0] - 1, spine[spine.length - 1][1]], [spine[spine.length - 1][0] + 2.4, spine[spine.length - 1][1] - 26]], false);
    g.far.push({ poly: tube(blade, () => 1.6), paint: '#8FA56A', lines: [{ pts: blade, w: 0.6, o: 0.6 }], edge: 0.7 });
  } else {
    // A gorgonian: a curved stem forking into knobbly pink twigs, the tail wrapped round it.
    const tip = spine[spine.length - 1];
    const stems: [number, number][][] = [
      [[-32, 14], [-10, 3], [12, -5], [30, -17]],
      [[12, -5], [18, -13], [17, -25], [23, -35]],
      [[-10, 3], [-6, 13], [1, 23]],
      [[21, -11], [31, -9], [39, -14]],
    ];
    for (const st of stems) {
      const center = resample(spline(st.map((q) => add(tip, q)), false), 40);
      g.far.push({ poly: tube(center, (t) => 2.5 - 1.4 * t), paint: '#C9B3C6', lines: [], edge: 0.7 });
      g.far.push({ poly: ellipse(center[0], 2.5), paint: '#C9B3C6', lines: [], edge: 0.7 }, { poly: ellipse(center[center.length - 1], 1.1), paint: '#C9B3C6', lines: [], edge: 0.7 });
      center.forEach((p, i) => {
        if (i % 3 !== 1) return;
        const side = (i / 3) % 2 < 1 ? 1 : -1;
        const q = add(p, [side * 0.4, -2.6 * side + (rand() - 0.5)]);
        g.far.push({ poly: ellipse(q, 1.2 + rand() * 0.5), paint: '#D9475A', lines: [], edge: 0.6 });
      });
    }
  }
  // Rings across the trunk and tail, with small knobs where they meet the edges.
  if (h.rings) {
    const n = 44;
    for (let k = 1; k < n; k++) {
      const i = Math.round((k / n) * (spine.length - 1));
      g.lines.push({ pts: [left[i], right[i]], w: 0.7, o: 0.7, taper: 'both' });
      if (k % 2 === 0) g.marks.push({ poly: ellipse(left[i], 0.5), paint: 'back', edge: 0.6 }, { poly: ellipse(right[i], 0.45), paint: 'back', edge: 0.6 });
    }
  }
  // Shading along the shadowed (right) edge of the body.
  for (const k of [0.15, 0.3, 0.42]) g.engraving.push({ pts: offsetLine(spine, (t) => -h.width(t) * (1 - k * 1.4)), w: 1.2 - k, taper: 'both' });
  for (const k of [0.12, 0.25]) g.engraving.push({ pts: offsetLine(spine, (t) => h.width(t) * (1 - k * 1.6)), w: 0.6, taper: 'both' });
  // Dorsal fin on the back where the trunk meets the tail, a fan of rays standing off it.
  const di = Math.round(spine.length * 0.32);
  const dBase = left[di];
  const dfin: Pt[] = spline([add(dBase, [0, -3.4]), add(dBase, [5.2, -2.8]), add(dBase, [6, 0.6]), add(dBase, [5.2, 3]), add(dBase, [0, 3.4])], true);
  g.far.push({
    poly: dfin,
    paint: 'fin',
    lines: [0.2, 0.4, 0.6, 0.8].map((k) => ({ pts: [lerp(add(dBase, [0, -3.4]), add(dBase, [0, 3.4]), k), lerp(add(dBase, [5.2, -2.8]), add(dBase, [5.2, 3]), k)], w: 0.5, taper: 'end' as const })),
    edge: 0.6,
  });
  // The pectoral: a small fan on the neck just behind the gill cover.
  const pecBase = P([0.8, 2.8]);
  const pec = spline([P([0.8, 4.4]), P([-1.4, 5.4]), P([-3.4, 4.4]), P([-3.8, 2.8]), P([-2.2, 1.2]), P([0.4, 1])], true);
  g.near.push({
    poly: pec,
    paint: 'fin',
    lines: [P([-3.2, 4.2]), P([-3.4, 3]), P([-2.2, 1.8]), P([-1.2, 5])].map((p) => ({ pts: [pecBase, p], w: 0.4, o: 0.7, taper: 'end' as const })),
    edge: 0.65,
  });
  if (h.tubercles) {
    for (const f of scatterIn(body, { r: h.tubercles.r, gap: 0.3, paint: h.tubercles.paint, rand, tries: 420 })) g.marks.push({ ...f, edge: 0.6 });
  } else {
    g.marks.push(...scatterIn(body, { r: 0.25, gap: 1.2, paint: 'pattern', rand, tries: 300, o: 0.8 }));
  }
  // The gill cover behind the eye, the mouth at the snout's tip.
  g.lines.push(
    { pts: spline([P([2.8, hd * 0.78]), P([4.8, hd * 0.46]), P([3.4, hd * 0.2])], false), w: 0.9 },
    { pts: spline([P([tipL[0] - 0.1, (tipU[1] + tipL[1]) / 2 - sd * 0.06]), P([tipL[0] - 3.2, (tipU[1] + tipL[1]) / 2 - sd * 0.02 + 0.8])], false), w: 0.7, taper: 'end' },
    { pts: spline([P([hd * 0.2 + 2, hd * 0.9]), P([hd * 0.2 + 5.4, hd * 0.8]), P([hd * 0.2 + 8.4, hd * 0.66])], false), w: 0.5, o: 0.5, taper: 'both', detail: true },
  );
  g.eyes.push({ c: P([6.2, (hd * 0.8 + jaw[1]) / 2 + 0.4]), r: h.tubercles ? 1.5 : 1.2, iris: '#B8862E' });
  g.heavy.push(right);
  void dist;
  void clamp;
  return g;
}

// ── Common seahorse ──────────────────────────────────────────────────────────
// The classic S-silhouette with a thick, fairly long snout; smooth with low rounded bumps and
// visible rings; a low curled-back coronet; a deep head; a tail curled round a seagrass stem.
const commonHorse = (): PlateGeom =>
  seahorse({
    spine: [[31, 8], [27, 14], [24, 20], [27, 30], [25, 42], [27, 54], [31, 66], [31, 77], [26, 87], [17, 90], [12, 84], [15, 78], [20, 81]],
    width: (t) => (t < 0.08 ? 4.4 + t * 30 : t < 0.32 ? 6.8 + 3.6 * Math.sin(((t - 0.08) / 0.24) * Math.PI) : 6.8 * (1 - (t - 0.32) / 0.68) ** 0.9 + 0.5),
    snout: 6.4,
    snoutDepth: 4.8,
    headDepth: 12,
    rings: true,
    coronet: 'curl',
    host: 'grass',
  });

// ── Pygmy seahorse ───────────────────────────────────────────────────────────
// Tiny and plump, covered with round knobs; a very short snout; on a gorgonian with matching
// polyps; no visible rings.
const pygmyHorse = (): PlateGeom =>
  seahorse({
    spine: [[30, 10], [26, 16], [24, 22], [27, 31], [26, 42], [28, 52], [31, 61], [30, 70], [24, 76], [17, 76], [14, 70], [18, 66]],
    width: (t) => (t < 0.1 ? 4.4 + t * 30 : t < 0.38 ? 7.4 + 3 * Math.sin(((t - 0.1) / 0.28) * Math.PI) : 7.4 * (1 - (t - 0.38) / 0.62) ** 0.8 + 0.8),
    snout: 1.6,
    snoutDepth: 3.8,
    headDepth: 11,
    rings: false,
    tubercles: { paint: '#D9475A', r: 1.25 },
    coronet: 'knob',
    host: 'gorgonian',
  });

// ── Seadragons ───────────────────────────────────────────────────────────────
interface DragonSpec {
  spine: Ctrl[];
  width: (t: number) => number;
  /** Leaf clusters: where along the body (t), which side (-1 up, 1 down), stalk length, leaf size, lobes. */
  leaves: [number, -1 | 1, number, number, number][];
  leafPaint: Fill['paint'];
  spots?: Fill['paint'];
  bars?: Fill['paint'];
  lines?: boolean;
}

function seadragon(d: DragonSpec): PlateGeom {
  const g = emptyGeom();
  const rand = rng(71);
  const spine = resample(spline(d.spine, false), 180);
  const body = tube(spine, d.width);
  g.body = body;
  g.trunk = body;
  const at = (t: number) => spine[Math.round(clamp(t, 0, 1) * (spine.length - 1))];
  const normalAt = (t: number) => {
    const a = at(t - 0.01);
    const b = at(t + 0.01);
    return perp(norm(sub(b, a)));
  };
  for (const [t, side, stalk, size, lobes] of d.leaves) {
    const base = add(at(t), mul(normalAt(t), d.width(t) * -side));
    const dir = norm(add(mul(normalAt(t), -side), [0.35, 0]));
    const end = add(base, mul(dir, stalk));
    // A cluster of rounded lobes fanning from the end of its stalk, each with a midrib.
    const parts: Part[] = [];
    for (let k = 0; k < lobes; k++) {
      const a = Math.atan2(dir[1], dir[0]) + (k - (lobes - 1) / 2) * 0.5 + (rand() - 0.5) * 0.2;
      const len = size * (0.8 + rand() * 0.35);
      const tip = add(end, [Math.cos(a) * len, Math.sin(a) * len]);
      const n = perp(norm(sub(tip, end)));
      const w = len * 0.3;
      // A broad blade with a ragged, wavy margin, pointed at the tip.
      const ctrl: Ctrl[] = [end];
      const jag = () => 1 + (rand() - 0.5) * 0.5;
      for (const [u, k2] of [
        [0.14, 0.62],
        [0.27, 0.9],
        [0.4, 1.05],
        [0.53, 0.88],
        [0.66, 0.98],
        [0.78, 0.7],
        [0.9, 0.42],
      ] as const)
        ctrl.push(add(lerp(end, tip, u), mul(n, w * k2 * jag())));
      ctrl.push([tip[0], tip[1], 1]);
      for (const [u, k2] of [
        [0.9, 0.4],
        [0.78, 0.72],
        [0.66, 0.95],
        [0.53, 0.86],
        [0.4, 1.02],
        [0.27, 0.86],
        [0.14, 0.58],
      ] as const)
        ctrl.push(add(lerp(end, tip, u), mul(n, -w * k2 * jag())));
      const leaf = spline(ctrl, true, 0.85);
      const veins: Line[] = [{ pts: [end, lerp(end, tip, 0.92)], w: 0.6, taper: 'end' }, ...[0.35, 0.6].flatMap((u) => [1, -1].map((sd) => ({ pts: [lerp(end, tip, u), add(lerp(end, tip, u + 0.15), mul(n, sd * w * 0.6))], w: 0.45, taper: 'end' as const })))];
      parts.push({ poly: leaf, paint: d.leafPaint, lines: veins, edge: 0.7 });
    }
    g.far.push({ poly: tube([base, end], () => 0.45), paint: d.leafPaint, lines: [], edge: 0.5 }, ...parts);
  }
  // The long tube snout and head at the front of the spine.
  for (const k of [0.2, 0.36]) g.engraving.push({ pts: offsetLine(spine, (t) => -d.width(t) * (1 - k * 1.5)), w: 1.1 - k, taper: 'both' });
  g.engraving.push({ pts: offsetLine(spine, (t) => d.width(t) * 0.7), w: 0.55, taper: 'both' });
  if (d.lines) {
    for (let k = 1; k < 16; k++) {
      const t = 0.1 + k * 0.045;
      const a = add(at(t), mul(normalAt(t), d.width(t)));
      const b = add(at(t), mul(normalAt(t), -d.width(t)));
      g.marks.push({ poly: swell([a, b], 0.9, 'both'), paint: '#FFF3D6', clip: 'trunk' });
      g.lines.push({ pts: [add(a, [0.5, 0]), add(b, [0.5, 0])], w: 0.5, o: 0.6 });
    }
  }
  if (d.spots) g.marks.push(...scatterIn(body, { r: 0.45, gap: 0.8, paint: d.spots, rand, tries: 400 }).map((f) => ({ ...f, clip: 'trunk' as const })));
  if (d.bars) {
    for (let k = 0; k < 7; k++) {
      const t = 0.12 + k * 0.022;
      g.marks.push({ poly: swell([add(at(t), mul(normalAt(t), d.width(t) * 1.1)), add(at(t), mul(normalAt(t), -d.width(t) * 1.1))], 1.1, 'both'), paint: d.bars, o: 0.9, clip: 'trunk' });
    }
  }
  g.eyes.push({ c: add(at(0.075), mul(normalAt(0.075), d.width(0.075) * 0.25)), r: 1, iris: '#B8862E' });
  g.lines.push({ pts: [add(at(0.005), [0, d.width(0) * 0.2]), add(at(0.02), [0, d.width(0.02) * 0.2])], w: 0.8 });
  g.heavy.push(offsetLine(spine, (t) => -d.width(t)));
  return g;
}

// ── Leafy seadragon ──────────────────────────────────────────────────────────
// Large, broad, lobed leaves all over; a horizontal, uncoiled tail; a long tube snout; thin
// red-edged pale lines on a yellow-brown body; near-invisible fins.
const leafy = (): PlateGeom =>
  seadragon({
    spine: [[0, 40], [8, 39.2], [14, 38.6], [20, 39.6], [28, 41.4], [40, 43], [54, 42.6], [70, 43.6], [86, 45.6], [100, 44]],
    width: (t) => (t < 0.1 ? 1.1 + (t / 0.1) * 1.9 : t < 0.18 ? 3 + ((t - 0.1) / 0.08) * 0.1 : t < 0.42 ? 3.1 + 1.2 * Math.sin(((t - 0.18) / 0.24) * Math.PI) : 3.1 - ((t - 0.42) / 0.58) * 2.6),
    leaves: [
      [0.06, -1, 1.6, 5.1, 3],
      [0.14, -1, 3.1, 10.2, 4],
      [0.15, 1, 2.6, 8.5, 4],
      [0.24, -1, 4.4, 15.3, 5],
      [0.27, 1, 4.2, 14.6, 5],
      [0.34, -1, 4.7, 16.0, 5],
      [0.38, 1, 4.2, 13.6, 4],
      [0.48, -1, 3.9, 13.6, 4],
      [0.52, 1, 3.6, 12.6, 4],
      [0.64, -1, 3.4, 11.2, 4],
      [0.68, 1, 3.1, 10.2, 4],
      [0.8, -1, 2.6, 8.5, 4],
      [0.84, 1, 2.6, 7.8, 3],
      [0.94, -1, 2.1, 6.1, 3],
    ],
    leafPaint: '#A88B3E',
    lines: true,
  });

// ── Weedy seadragon ──────────────────────────────────────────────────────────
// A long slender red body with yellow spots; purple-blue bars on the chest; a few small leaf flaps;
// a very long thin snout; a straight trailing tail.
const weedy = (): PlateGeom =>
  seadragon({
    spine: [[0, 40], [11, 39.4], [17, 39], [23, 40.8], [31, 43.2], [42, 44.2], [56, 43.4], [72, 44], [88, 45.4], [100, 44.6]],
    width: (t) => (t < 0.13 ? 0.9 + (t / 0.13) * 2.4 : t < 0.2 ? 3.3 + ((t - 0.13) / 0.07) * 0.1 : t < 0.42 ? 3.4 + 2.4 * Math.sin(((t - 0.2) / 0.22) * Math.PI) : 3.4 - ((t - 0.42) / 0.58) * 2.9),
    leaves: [
      [0.17, -1, 2.4, 5.4, 4],
      [0.3, -1, 2.6, 6, 5],
      [0.33, 1, 2.2, 5, 4],
      [0.46, -1, 2.2, 5, 4],
      [0.6, -1, 2.2, 4.8, 4],
      [0.66, 1, 2.2, 4.6, 4],
      [0.82, -1, 1.8, 4, 3],
    ],
    leafPaint: '#6E4C9A',
    spots: '#F2C94C',
    bars: '#4B4FA8',
  });

// ── Ornate ghost pipefish ────────────────────────────────────────────────────
// Head down, hovering; huge fan-like pelvic fins below a tall spiny first dorsal; a big
// lance-shaped tail; a long tube snout with spiky filaments; a red, yellow and white scribbled
// pattern.
const ghostPipefish: FishSpec = {
  tip: [0, 0],
  blunt: 0.2,
  top: [[2, -0.9], [10, -1.1], [20, -1.4], [26, -2.6], [32, -5], [40, -6.6], [50, -6.6], [60, -5], [68, -3.2], [74, -2.2], [78, -1.8]],
  bot: [[2, 0.9], [10, 1.1], [20, 1.4], [26, 2.4], [32, 4.4], [40, 6], [50, 6], [60, 4.6], [68, 3], [74, 2.1], [78, 1.8]],
  dorsal: [
    { from: 36, to: 46, spines: 5, rays: 0, h: [[0, 16], [0.5, 19], [1, 12]], notch: 0.7, rake: [10, 30] },
    { from: 62, to: 74, spines: 10, rays: 0, h: [[0, 6], [1, 4]], notch: 0.45, rake: [30, 50] },
  ],
  anal: [{ from: 62, to: 74, spines: 10, rays: 0, h: [[0, 6], [1, 4]], notch: 0.45, rake: [30, 50] }],
  caudal: { type: 'pointed', len: 22, h: 9, rays: 13 },
  pelvic: { at: [40, 0.95], base: 8, h: [[0, 15], [0.5, 18], [1, 14]], angles: [70, 150], rays: 7, notch: 0.35 },
  eye: { x: 27, f: 0.4, r: 1.2, iris: '#B3262E' },
  lateral: false,
  belly: 1.5,
  softBelly: false,
  engraving: 'smooth',
  extra: (c) => {
    const s = c.s;
    const rand = rng(83);
    // Red-orange scribbles, short white bars and yellow flecks on a dark brown body.
    const scribbles: Line[] = [];
    for (let k = 0; k < 14; k++) {
      const x0 = 24 + rand() * 52;
      const pts = Array.from({ length: 5 }, (_, i) => atX(s, x0 + i * 1.2, 0.1 + rand() * 0.8));
      scribbles.push({ pts: spline(pts, false), w: 1, o: 0.9 });
    }
    const red: Fill[] = scribbles.map((l) => ({ poly: swell(l.pts, 0.8, 'both'), paint: '#D4472A', clip: 'body' }));
    const bars: Fill[] = [];
    for (let x = 27; x < 76; x += 3.4 + rand() * 1.4) {
      const f0 = 0.08 + rand() * 0.3;
      bars.push({ poly: swell([atX(s, x, f0), atX(s, x + 0.4, f0 + 0.3 + rand() * 0.4)], 0.9, 'both'), paint: '#F3E9DA', clip: 'trunk' });
    }
    const flecks = scatter(s, { t0: tAtX(s, 26), t1: 1, f0: 0.1, f1: 0.9, r: 0.55, gap: 1.6, paint: '#EDB93A', rand, tries: 160, o: 0.95 });
    const dots = scatter(s, { t0: tAtX(s, 26), t1: 1, f0: 0.1, f1: 0.9, r: 0.4, gap: 2, paint: '#F6F0E2', rand, tries: 120, o: 0.95 });
    // Ragged filaments: a fringe along the head and the back and belly of the body.
    const filaments: Line[] = [];
    for (let x = 3; x < 30; x += 1.6) {
      for (const f of [-0.2, 1.2]) filaments.push({ pts: [atX(s, x, f < 0 ? 0 : 1), add(atX(s, x, f < 0 ? 0 : 1), [0.6, f < 0 ? -1.4 - rand() : 1.4 + rand()])], w: 0.6 });
    }
    for (let x = 28; x < 76; x += 2.2 + rand()) {
      for (const f of [0, 1]) {
        const p0 = atX(s, x, f);
        filaments.push({ pts: [p0, add(p0, [1 + rand() * 0.8, (f ? 1 : -1) * (1.6 + rand() * 1.8)])], w: 0.7, taper: 'end' });
      }
    }
    // Fringes: every fin ray carries on past the membrane as a bare filament.
    const fringe = (tips: Pt[], bases: Pt[]): Line[] => tips.map((t, i) => ({ pts: [t, add(t, mul(norm(sub(t, bases[i])), 2.2 + rand() * 1.8))], w: 0.6, taper: 'end' as const }));
    const fringes = [...fringe(c.pelvic!.tips, c.pelvic!.tips.map((_, i, arr) => lerp(atX(s, 40, 0.95), add(atX(s, 40, 0.95), [2.8, 7.5]), i / (arr.length - 1)))), ...fringe(c.dorsal[0].tips, c.dorsal[0].bases)];
    return {
      marks: [...flecks, ...dots, ...bars, ...red],
      lines: [...filaments, ...fringes],
      median: [
        { part: 'pelvic', marks: scatterIn(c.pelvic!.poly, { r: 0.8, gap: 1.6, paint: '#D4472A', rand, tries: 80, o: 0.85 }) },
        { part: 'dorsal', index: 0, marks: scatterIn(c.dorsal[0].poly, { r: 0.7, gap: 1.6, paint: '#EDB93A', rand, tries: 60, o: 0.85 }) },
        { part: 'caudal', marks: scatterIn(c.caudal.poly, { r: 0.8, gap: 1.6, paint: '#D4472A', rand, tries: 60, o: 0.8 }) },
      ],
    };
  },
};

export const ODD_FISH: Record<string, PlateDef> = {
  stonefish: { build: () => fish({ ...stonefish, seed: 1 }), palette: { back: '#6B5B4B', belly: '#6B5B4B', fin: '#6E604E' } },
  'leaf-scorpionfish': { build: () => rotateGeom(fish({ ...leafFish, seed: 2 }), -14), palette: { back: '#E6C64A', belly: '#E6C64A', fin: '#E6C64A', pattern: '#C9A23A' } },
  'giant-frogfish': { build: () => fish({ ...frogfish, seed: 3 }), palette: { back: '#E2B23A', belly: '#E2B23A', fin: '#D9A632', pattern: '#3B2A20' } },
  'common-seahorse': { build: commonHorse, palette: { back: '#E8C14A', belly: '#E8C14A', fin: '#F0DCA0', pattern: '#5A4020' } },
  'pygmy-seahorse': { build: pygmyHorse, palette: { back: '#C9B3C6', belly: '#C9B3C6', fin: '#E3D6E2' } },
  'leafy-seadragon': { build: leafy, palette: { back: '#C9A74A', belly: '#C9A74A' } },
  'weedy-seadragon': { build: weedy, palette: { back: '#C8452F', belly: '#C8452F' } },
  'ornate-ghost-pipefish': { build: () => rotateGeom(fish({ ...ghostPipefish, seed: 4 }), -50), palette: { back: '#4A2A24', belly: '#6B4033', fin: '#7A4A3A' } },
};
void region;
void shapeIn;
