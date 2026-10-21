/**
 * Napoleon wrasse (Cheilinus undulatus): the giant of the wrasses, up to two metres long: a long, deep,
 * thick-set body, compressed a little from side to side, with a big head whose forehead swells into a
 * bulging hump above the eye (the mark of an old adult), a pair of thick, fleshy lips round a small
 * mouth, and a small eye set low in the cheek. One long dorsal fin and one long anal fin run along
 * the back and belly, rising to rounded rear lobes; the pectorals are broad rounded paddles it rows
 * with, the pelvics long and pointed; the tail is a broad, rounded fan. Olive to blue-green, each scale
 * bearing a darker vertical bar that gives the flank a fine, wavy pattern; the head is crossed by
 * intricate wavy blue-green and yellow-green lines and has two dark lines running back from the eye.
 */
import { Vector3 } from 'three';
import { SWIM_RIGS, type SharkRig } from '../../../src/lib/marine-rigs';
import { blendSkins, clamp, fin, hex, mix, noise, path, smoothstep, TAU, type RGB } from './kit';
import { sharkContext, type SharkContext, type SharkDesign } from './shark';

// Body: a deep blue-green back, a teal flank, a paler greenish belly; the head olive, yellowing below.
const BACK = hex('#40766d'), FLANK = hex('#5a9d92'), LOWER = hex('#83b29d'), BELLY = hex('#b6cbae');
const HEAD_TOP = hex('#79975a'), HEAD_LOW = hex('#b2ad63'), LIP = hex('#a9b06c'), LIP_DARK = hex('#7f9656');
// Head lines and the bars on each scale.
const BLUE_LINE = hex('#43b0ad'), YELLOW_LINE = hex('#c5d062'), EYE_LINE = hex('#17242a'), BAR = hex('#1f3d3a');
// Fins.
const DORSAL = hex('#3f9488'), DORSAL_BASE = hex('#2c6a63'), DORSAL_EDGE = hex('#c3df78'), ANAL = hex('#3b8f9a'), ANAL_EDGE = hex('#93d2c0');
const TAIL = hex('#4f8f73'), TAIL_EDGE = hex('#a7cf84'), TAIL_BAND = hex('#2c6a63');
const PECTORAL = hex('#9fb56a'), PECTORAL_BASE = hex('#52845e'), PELVIC = hex('#4c9a92'), PELVIC_TIP = hex('#a8d2a0');
const IRIS = hex('#e0922e'), PUPIL = hex('#06090b'), MOUTH = hex('#3a1f1a'), GILL = hex('#2c4a45');

const rig = SWIM_RIGS['napoleon-wrasse'] as SharkRig;
const SQUARE = 2.2;

// Body sections: [s, back y, belly y, half width]. The lips sit on the snout's tip, low on the face; the
// forehead climbs steeply from them to a hump over the eye, then eases into the back at the dorsal fin;
// deepest at the hump and a third of the way back, narrowing to a stout tail stock.
const SECTIONS: readonly (readonly [number, number, number, number])[] = [
  [0, -.03, -.076, .024],
  [.008, -.02, -.083, .032],
  [.02, -.004, -.092, .042],
  [.035, .016, -.102, .052],
  [.05, .042, -.111, .06],
  [.065, .08, -.12, .067],
  [.082, .12, -.127, .072],
  [.1, .15, -.131, .075],
  [.12, .168, -.134, .077],
  [.148, .172, -.136, .078],
  [.18, .155, -.136, .078],
  [.215, .138, -.142, .077],
  [.26, .128, -.144, .076],
  [.31, .127, -.145, .074],
  [.37, .13, -.144, .071],
  [.43, .126, -.138, .066],
  [.5, .117, -.127, .06],
  [.58, .102, -.11, .051],
  [.66, .083, -.089, .04],
  [.73, .064, -.068, .03],
  [.79, .05, -.052, .024],
  [.83, .045, -.046, .02],
];
const column = (pick: (row: readonly number[]) => number) => SECTIONS.map((row) => [row[0], pick(row)] as const);

/** The head's own colour over the body's: olive above, yellowing lower on the cheek, fading by the pectoral fins. */
const headColor = (theta: number) => mix(HEAD_TOP, HEAD_LOW, smoothstep(1.2, 2.5, theta));

const skin = (s: number, theta: number, p: Vector3): RGB => {
  // A deep back fading to a teal flank, paler and greener low down; the head takes over ahead of the gill cover.
  const t = theta + .05 * noise(p.z * 36 + p.y * 20, 3);
  const back = mix(BACK, FLANK, smoothstep(.2, 1.1, t));
  const flank = mix(mix(back, LOWER, smoothstep(1.3, 2.2, t)), BELLY, smoothstep(2.3, 2.95, t));
  const head = 1 - smoothstep(.2, .3, s);
  const body = mix(flank, headColor(t), .85 * head);
  return mix(body, FLANK, .1 * noise(p.z * 120 + p.y * 100, 6));
};

export const NAPOLEON_WRASSE: SharkDesign = {
  rig, nose: .4, bodyEnd: .83, frontDome: .008,
  width: column((r) => r[3]),
  top: column((r) => (r[1] - r[2]) / 2),
  bottom: column((r) => (r[1] - r[2]) / 2),
  center: column((r) => (r[1] + r[2]) / 2),
  squareTop: [[0, SQUARE], [.83, SQUARE]],
  squareBottom: [[0, SQUARE], [.83, SQUARE]],
  rings: 30, columnsAbove: 6, columnsBelow: 5,
  boundary: () => 2.2, boundaryGap: .3,
  paint: skin,
};

/**
 * A smooth sausage along a path, tapering to nothing at both ends: a lip. `flat` squashes it
 * vertically; `color` is given the fraction along the path and the angle round it (0 = up).
 */
function tube(ctx: SharkContext, points: readonly Vector3[], radius: (t: number) => number, color: (t: number, a: number) => RGB,
  options: { sides?: number; stations?: number; flat?: number } = {}) {
  const { mesh } = ctx;
  const sides = options.sides ?? 8, stations = options.stations ?? 10, flat = options.flat ?? 1;
  const along = path(points.map((p) => [p.x, p.y, p.z] as const));
  mesh.begin();
  const rings: number[][] = [];
  const up = new Vector3(0, 1, 0);
  for (let i = 0; i <= stations; i++) {
    const t = i / stations;
    const c = along(t), tangent = along(Math.min(1, t + .01)).sub(along(Math.max(0, t - .01))).normalize();
    const binormal = tangent.clone().cross(up).normalize(), normal = binormal.clone().cross(tangent);
    const r = radius(t);
    rings.push(Array.from({ length: sides }, (_, k) => {
      const a = TAU * k / sides;
      const p = c.clone().addScaledVector(normal, Math.cos(a) * r * flat).addScaledVector(binormal, Math.sin(a) * r);
      return mesh.vertex(p, color(t, a), ctx.skin(0));
    }));
  }
  for (let i = 0; i < stations; i++) {
    for (let k = 0; k < sides; k++) mesh.quad(rings[i][k], rings[i][(k + 1) % sides], rings[i + 1][(k + 1) % sides], rings[i + 1][k]);
  }
  const start = mesh.vertex(along(0), color(0, 0), ctx.skin(0));
  const end = mesh.vertex(along(1), color(1, 0), ctx.skin(0));
  for (let k = 0; k < sides; k++) {
    mesh.tri(start, rings[0][(k + 1) % sides], rings[0][k]);
    mesh.tri(end, rings[stations][k], rings[stations][(k + 1) % sides]);
  }
  mesh.end();
}

/**
 * A flat, leaf-shaped fin on a straight axis out of a point on the body: `half(t)` is its half-width
 * (along `up`) at fraction t of its length, so a rounded paddle or a pointed blade is just a curve.
 */
function leafFin(ctx: SharkContext, options: {
  root: Vector3; axis: Vector3; up: Vector3; length: number; half: (t: number) => number;
  thickness: number; stations: number; chordPoints?: number; bone?: string; side: number;
  color: (t: number, u: number) => RGB;
}) {
  const centre = (t: number) => options.root.clone().addScaledVector(options.axis, options.length * t);
  fin(ctx.mesh, {
    stations: options.stations, chordPoints: options.chordPoints, spacing: (t) => t,
    le: (v) => centre(v).addScaledVector(options.up, options.half(v)),
    te: (v) => centre(v).addScaledVector(options.up, -options.half(v)),
    thickness: (v) => options.thickness * (1 - .6 * v),
    side: new Vector3(options.side, 0, 0),
    color: (_p, v, u) => options.color(v, u),
    skin: (p, v) => {
      const base = ctx.skin(ctx.sOf(p.z));
      return options.bone ? blendSkins(base, { [options.bone]: 1 }, smoothstep(.1, .5, v)) : base;
    },
  });
}

export function buildNapoleonWrasse() {
  const ctx = sharkContext(NAPOLEON_WRASSE);
  const { mesh, bones } = ctx;
  ctx.body();

  /** The angle round the body at axial position s of the flank point at height y. */
  const angle = (s: number, y: number) => {
    const c = ctx.center(s), up = y >= c;
    const f = clamp(Math.abs(y - c) / (up ? ctx.top(s) : ctx.bottom(s)), 0, 1);
    return Math.acos((up ? 1 : -1) * f ** (SQUARE / 2));
  };
  /** A flank line given as [s, y] points, as [s, theta] points on one side. */
  const flank = (side: number, points: readonly (readonly [number, number])[]) => points.map(([s, y]) => [s, side * angle(s, y)] as const);

  // The thick lips: an upper and a lower pad wrapped round the snout from one corner of the mouth to the other,
  // half sunk into the head, with a dark crease between them.
  const mouth = (y: number, front: number, corner: number) => {
    const half = [corner, corner * .68, corner * .42, corner * .2, corner * .06].map((s) => ctx.surface(s, angle(s, y), -.001));
    const left = [...half, new Vector3(0, y, ctx.z(front))];
    return [...left, ...[...half].reverse().map((p) => new Vector3(-p.x, p.y, p.z))];
  };
  const lipColor = (t: number, a: number) => mix(LIP, LIP_DARK, .35 * (.5 - .5 * Math.cos(a - Math.PI)) + .12 * Math.abs(2 * t - 1));
  tube(ctx, mouth(-.047, .008, .088), (t) => .004 + .019 * Math.sin(Math.PI * t) ** .75, lipColor, { flat: 1, sides: 6, stations: 12 });
  tube(ctx, mouth(-.079, .01, .084), (t) => .004 + .0175 * Math.sin(Math.PI * t) ** .75, lipColor, { flat: 1, sides: 6, stations: 12 });
  tube(ctx, mouth(-.063, .014, .086), (t) => .003 + .008 * Math.sin(Math.PI * t) ** .5, () => MOUTH, { sides: 4, stations: 8 });

  // One long dorsal fin: low spines from the nape, rising along the back to a rounded soft rear (on `Dorsal`).
  const dorsal = ctx.midlineFin({
    le: [[-.012, .26], [0, .265], [.023, .285], [.053, .35], [.076, .47], [.096, .57], [.105, .63]],
    te: [[-.012, .79], [0, .786], [.023, .77], [.053, .74], [.082, .7], [.1, .65], [.105, .63]],
    height: .105, thickness: .01, stations: 12, chordPoints: 7, bone: 'Dorsal',
    color: (_p, v, u) => mix(mix(mix(DORSAL_BASE, DORSAL, smoothstep(0, .55, v)), DORSAL_EDGE, .1 * (Math.round(u * 6) % 2)), DORSAL_EDGE, smoothstep(.8, 1, v)),
  });
  // The anal fin: the same, beneath the soft dorsal.
  ctx.midlineFin({
    le: [[-.012, .48], [0, .485], [.023, .52], [.053, .58], [.08, .64]],
    te: [[-.012, .79], [0, .786], [.023, .765], [.053, .73], [.08, .64]],
    height: .08, thickness: .01, stations: 9, chordPoints: 6, ventral: true,
    color: (_p, v, u) => mix(mix(mix(DORSAL_BASE, ANAL, smoothstep(0, .55, v)), ANAL_EDGE, .1 * (Math.round(u * 5) % 2)), ANAL_EDGE, smoothstep(.78, 1, v)),
  });

  // Long, pointed pelvic fins under the pectoral bases.
  for (const side of [1, -1]) {
    const normal = ctx.normal(.3, side * 2.7);
    leafFin(ctx, {
      root: ctx.surface(.3, side * 2.7, 0).addScaledVector(normal, -.01),
      axis: new Vector3(side * .12, -.3, -.95).normalize(), up: new Vector3(side * .1, .95, -.3).normalize(),
      length: .17, half: (t) => .03 * Math.min(1, (t + .18) / .4) * (1 - t) ** .8,
      thickness: .007, stations: 5, chordPoints: 5, side,
      color: (t) => mix(PELVIC, PELVIC_TIP, smoothstep(.2, 1, t)),
    });
  }

  // Broad, rounded pectoral paddles just behind the gill cover, which it rows with: olive-yellow, darker at the base.
  const pectorals: Vector3[] = [];
  for (const side of [1, -1]) {
    const s = .29, theta = side * angle(s, -.03);
    const root = ctx.surface(s, theta, 0);
    const yaw = .6;
    leafFin(ctx, {
      root: root.clone().addScaledVector(ctx.normal(s, theta), -.012),
      axis: new Vector3(side * Math.sin(yaw), -.06, -Math.cos(yaw)).normalize(), up: new Vector3(side * .55, 1, 0).normalize(),
      length: .185, half: (t) => .08 * Math.sqrt(Math.max(0, 1 - ((t - .4) / (t > .4 ? .6 : .46)) ** 2)),
      thickness: .007, stations: 8, chordPoints: 7, bone: side > 0 ? 'PectoralL' : 'PectoralR', side,
      color: (t, u) => mix(mix(PECTORAL_BASE, PECTORAL, smoothstep(.05, .45, t)), TAIL_EDGE, .5 * Math.max(smoothstep(.8, 1, t), 1 - smoothstep(0, .14, Math.min(u, 1 - u)))),
    });
    pectorals.push(root);
  }

  // A broad, rounded tail: green with a darker band near its pale edge.
  const axis = ctx.center(rig.joints[4]);
  const tail = ctx.caudalFin({
    low: axis - .125, high: axis + .125,
    le: [[axis - .125, .925], [axis - .1, .875], [axis - .065, .84], [axis - .025, .82], [axis, .815], [axis + .025, .82], [axis + .065, .84], [axis + .1, .875], [axis + .125, .925]],
    te: [[axis - .125, .925], [axis - .115, .958], [axis - .09, .985], [axis - .05, .998], [axis, 1], [axis + .05, .998], [axis + .09, .985], [axis + .115, .958], [axis + .125, .925]],
    thickness: (y) => .004 + .014 * Math.max(0, 1 - Math.abs(y - axis) / .1) ** 1.2,
    upperPivot: .04, lowerPivot: .04, stations: 14,
    color: (_p, v, u) => mix(mix(TAIL, TAIL_BAND, smoothstep(.45, .8, u)), TAIL_EDGE, smoothstep(.88, 1, u)),
  });

  // The small eye low in the cheek, under the hump: an orange iris round a black pupil.
  const eyeS = .108, eyeY = -.002;
  ctx.eyes({ s: eyeS, theta: angle(eyeS, eyeY), radius: .02, color: IRIS, sink: .4 });
  ctx.eyes({ s: eyeS - .0015, theta: angle(eyeS, eyeY), radius: .0095, color: PUPIL, sink: -.2 });

  for (const side of [1, -1]) {
    // Two dark lines running back from the eye: one level across the cheek, one slanting down toward the throat.
    const level = Array.from({ length: 8 }, (_, i) => [.126 + .135 * i / 7, eyeY - .002 - .012 * (i / 7) ** 1.5] as const);
    ctx.ribbon(flank(side, level), (t) => .0046 * (1 - .55 * t) * smoothstep(0, .12, t), EYE_LINE, .0014);
    const slant = Array.from({ length: 8 }, (_, i) => [.12 + .1 * i / 7, eyeY - .016 - .062 * (i / 7) ** 1.15] as const);
    ctx.ribbon(flank(side, slant), (t) => .0042 * (1 - .5 * t) * smoothstep(0, .12, t), EYE_LINE, .0014);
    // The gill cover's edge: a fine dark arc.
    const cover = Array.from({ length: 9 }, (_, j) => {
      const t = j / 8;
      return [.272 + .02 * Math.sin(Math.PI * t) ** .8 - .012 * t, .09 - .2 * t] as const;
    });
    ctx.ribbon(flank(side, cover), (t) => .0022 * (.4 + .6 * Math.sin(Math.PI * t)), GILL, .0012);
  }

  for (const side of [1, -1]) {
    // The head's maze: wavy blue-green and yellow-green lines running back over the forehead, cheek and jaw,
    // each weaving to its own beat so no two run alike.
    const lines = [.32, .55, .8, 1.05, 1.28, 1.95, 2.2, 2.45, 2.7];
    lines.forEach((theta0, i) => {
      const s0 = .03 + .02 * ((i * 7) % 3), s1 = .225 + .02 * ((i * 5) % 3);
      const n = 9, period = .05 + .012 * ((i * 3) % 4), phase = i * 1.9;
      const line = Array.from({ length: n }, (_, j) => {
        const t = j / (n - 1), s = s0 + (s1 - s0) * t;
        const wave = .1 * Math.sin(TAU * (s - s0) / period + phase) + .04 * Math.sin(TAU * (s - s0) / (period * .43) + 2 * phase);
        return [s, side * clamp(theta0 + .1 * (t - .5) + wave, .12, Math.PI - .15)] as const;
      });
      ctx.ribbon(line, (t) => .0032 * Math.sin(Math.PI * (.05 + .9 * t)) ** .5, i % 2 ? YELLOW_LINE : BLUE_LINE, .0011);
    });
    // The flank's fine wavy pattern: the dark bar of each scale, a short wavering vertical stroke, in two rows
    // that stagger by half a scale.
    for (let row = 0; row < 2; row++) {
      for (let k = 0; k < 20; k++) {
        const s0 = .3 + .0245 * (k + .5 * row) + .003 * noise(k * 2.3 + row * 9, 21 + side);
        const top = (row ? 1.36 : .45) + .08 * noise(k * 1.7, 23 + side), bottom = (row ? 2.42 : 1.42) - .1 * (.5 + .5 * noise(k * 3.1, 25 + side));
        const line = Array.from({ length: 4 }, (_, j) => {
          const t = j / 3, theta = top + (bottom - top) * t;
          return [s0 + .0042 * Math.sin(6.5 * theta + k * 1.3 + row * 2), side * theta] as const;
        });
        const p = ctx.raw(s0, side * (top + bottom) / 2);
        ctx.ribbon(line, () => .0015, mix(skin(s0, (top + bottom) / 2, p), BAR, .5), .0009);
      }
    }
  }
  ctx.spineBones();
  bones.push(
    { name: 'TailUpper', parent: 'Tail', position: tail.upper },
    { name: 'TailLower', parent: 'Tail', position: tail.lower },
    { name: 'Dorsal', parent: rig.dorsalParent, position: dorsal.base },
    { name: 'PectoralL', parent: 'Root', position: pectorals[0] },
    { name: 'PectoralR', parent: 'Root', position: pectorals[1] },
  );
  return { mesh, bones };
}
