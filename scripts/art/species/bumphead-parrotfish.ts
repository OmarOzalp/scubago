/**
 * Bumphead parrotfish (Bolbometopon muricatum): the largest of the parrotfishes, over a metre long and
 * built like a barrel: a deep, heavy body, and a huge, bulbous bump on the forehead that makes the front
 * of the head a steep, nearly vertical wall. Low on that wall sits a small mouth whose teeth have fused
 * into two exposed, beak-like plates, pale and knobbly, the upper overlapping the lower; the eye is small
 * and set well back. One long dorsal and one long anal fin of even height; big, broad pectoral fins; a
 * slightly lunate, truncate tail. Dull green to grey-green, the scales large and edged darker, the face
 * and bump paler (pale green, flushing pink at the front), the fins edged in blue.
 */
import { Vector3 } from 'three';
import { SWIM_RIGS, type SharkRig } from '../../../src/lib/marine-rigs';
import { blendSkins, clamp, fin, hex, mix, noise, path, smoothstep, TAU, type RGB } from './kit';
import { sharkContext, type SharkContext, type SharkDesign } from './shark';

// Body: a dull, dark green back and flank, paler and greyer below; the face and bump pale green, pinker at the front.
const BACK = hex('#33513f'), FLANK = hex('#49695a'), LOWER = hex('#63826a'), BELLY = hex('#8aa28a');
const BUMP = hex('#9db88b'), FACE = hex('#b9c6a4'), PINK = hex('#cdbfa8'), SCALE_EDGE = hex('#24392e'), SCALE_PALE = hex('#6d8c71');
// Beak plates and their lips; the blue rims of the gill cover and fins.
const BEAK = hex('#d6e2c8'), BEAK_SHADE = hex('#97ab8d'), MOUTH = hex('#1e2a24');
const BLUE_RIM = hex('#2f6f86'), FIN = hex('#3d6b52'), FIN_DARK = hex('#2a4a3b'), FIN_EDGE = hex('#3f86a0');
const PECTORAL = hex('#5f9a74'), PECTORAL_BASE = hex('#3a5f4b'), PELVIC = hex('#4e8d86'), PELVIC_TIP = hex('#9fcfc0');
const IRIS = hex('#b96b2a'), PUPIL = hex('#06090a');

const rig = SWIM_RIGS['bumphead-parrotfish'] as SharkRig;
const SQUARE = 2.2;

// Body sections: [s, back y, belly y, half width]. The face rises almost straight from the mouth to the crown
// of the bump just behind it, the back then falling in a long curve; the chin slopes steeply back and down
// to a deep, round belly. Deepest a quarter of the way along, tapering to a stout tail stock.
const SECTIONS: readonly (readonly [number, number, number, number])[] = [
  [0, .115, -.036, .03],
  [.01, .142, -.058, .043],
  [.03, .162, -.088, .058],
  [.06, .17, -.115, .07],
  [.1, .16, -.135, .077],
  [.15, .147, -.145, .083],
  [.2, .137, -.15, .086],
  [.28, .131, -.152, .087],
  [.36, .128, -.15, .085],
  [.44, .122, -.142, .079],
  [.52, .112, -.13, .071],
  [.6, .098, -.114, .06],
  [.68, .08, -.092, .048],
  [.75, .062, -.07, .036],
  [.81, .046, -.05, .025],
];
const column = (pick: (row: readonly number[]) => number) => SECTIONS.map((row) => [row[0], pick(row)] as const);

const skin = (s: number, theta: number, p: Vector3): RGB => {
  // A dark green back brightening a little down the flank, greyer below. The bump and the front of the face are
  // pale green, the very front flushed pink; the pale fades out over the nape and cheek, leaving the lower cheek
  // and gill cover the body's green.
  const t = theta + .05 * noise(p.z * 30 + p.y * 18, 3);
  const flank = mix(mix(BACK, FLANK, smoothstep(.2, 1.1, t)), LOWER, smoothstep(1.4, 2.3, t));
  const body = mix(flank, BELLY, smoothstep(2.3, 2.95, t));
  const pale = (1 - smoothstep(.09, .22, s + .05 * smoothstep(.9, 2.2, t))) * (1 - .75 * smoothstep(1.6, 2.5, t));
  const front = mix(mix(BUMP, FACE, smoothstep(0, .5, 1 - s / .12)), PINK, .55 * (1 - smoothstep(0, .07, s)));
  return mix(mix(body, front, .94 * pale), FLANK, .08 * noise(p.z * 110 + p.y * 90, 6));
};

export const BUMPHEAD_PARROTFISH: SharkDesign = {
  rig, nose: .4, bodyEnd: .81, frontDome: .03,
  width: column((r) => r[3]),
  top: column((r) => (r[1] - r[2]) / 2),
  bottom: column((r) => (r[1] - r[2]) / 2),
  center: column((r) => (r[1] + r[2]) / 2),
  squareTop: [[0, 2.4], [.2, SQUARE], [.81, SQUARE]],
  squareBottom: [[0, 2.4], [.2, SQUARE], [.81, SQUARE]],
  rings: 30, columnsAbove: 6, columnsBelow: 5,
  boundary: () => 2.2, boundaryGap: .3,
  paint: skin,
};

/**
 * A smooth sausage along a path, tapering to nothing at both ends: a lip or a beak plate. `flat` squashes
 * it vertically; `color` is given the fraction along the path and the angle round it (0 = up).
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

export function buildBumpheadParrotfish() {
  const ctx = sharkContext(BUMPHEAD_PARROTFISH);
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

  // The beak: two plates of fused teeth jutting from the foot of the face, the upper one broad and overhanging
  // the lower, their cutting edges knobbly with the teeth.
  const mouth = (y: number, front: number, corner: number) => {
    const half = [corner, corner * .72, corner * .46, corner * .22, corner * .06].map((s) => ctx.surface(s, angle(s, y), -.001));
    const left = [...half, new Vector3(0, y, ctx.z(front))];
    return [...left, ...[...half].reverse().map((p) => new Vector3(-p.x, p.y, p.z))];
  };
  const teeth = (t: number) => 1 + .08 * Math.cos(TAU * 6 * t);
  tube(ctx, mouth(-.03, -.028, .07), (t) => (.004 + .023 * Math.sin(Math.PI * t) ** .6) * teeth(t),
    (t, a) => mix(BEAK, BEAK_SHADE, .5 * (.5 - .5 * Math.cos(a)) + .1 * (.5 - .5 * Math.cos(TAU * 6 * t))), { flat: 1.05, sides: 8, stations: 14 });
  tube(ctx, mouth(-.062, -.012, .062), (t) => (.004 + .0155 * Math.sin(Math.PI * t) ** .6) * teeth(t),
    (t, a) => mix(BEAK_SHADE, BEAK, .5 * (.5 + .5 * Math.cos(a))), { flat: .9, sides: 7, stations: 14 });
  // The gape between them.
  tube(ctx, mouth(-.0465, -.002, .062), (t) => .002 + .007 * Math.sin(Math.PI * t) ** .5, () => MOUTH, { sides: 4, stations: 8 });

  // One long dorsal fin of even height, spiny in front and rounded behind (on `Dorsal`).
  const dorsal = ctx.midlineFin({
    le: [[-.012, .2], [0, .205], [.02, .22], [.045, .25], [.06, .33], [.068, .5], [.072, .6]],
    te: [[-.012, .78], [0, .775], [.02, .76], [.045, .735], [.063, .69], [.07, .64], [.072, .6]],
    height: .072, thickness: .01, stations: 12, chordPoints: 7, bone: 'Dorsal',
    color: (_p, v, u) => mix(mix(FIN, FIN_DARK, .35 * (1 - u)), FIN_EDGE, smoothstep(.8, 1, v)),
  });
  // The anal fin: the same, under the soft dorsal.
  ctx.midlineFin({
    le: [[-.012, .49], [0, .495], [.02, .52], [.04, .56], [.058, .62]],
    te: [[-.012, .78], [0, .775], [.02, .76], [.04, .72], [.058, .62]],
    height: .058, thickness: .01, stations: 9, chordPoints: 6, ventral: true,
    color: (_p, v, u) => mix(mix(FIN, FIN_DARK, .3 * (1 - u)), FIN_EDGE, smoothstep(.78, 1, v)),
  });

  // Long, pointed pelvic fins under the pectoral bases.
  for (const side of [1, -1]) {
    const normal = ctx.normal(.3, side * 2.65);
    leafFin(ctx, {
      root: ctx.surface(.3, side * 2.65, 0).addScaledVector(normal, -.01),
      axis: new Vector3(side * .12, -.3, -.95).normalize(), up: new Vector3(side * .1, .95, -.3).normalize(),
      length: .15, half: (t) => .03 * Math.min(1, (t + .18) / .4) * (1 - t) ** .8,
      thickness: .007, stations: 5, chordPoints: 5, side,
      color: (t) => mix(PELVIC, PELVIC_TIP, smoothstep(.3, 1, t)),
    });
  }

  // Big, broad pectoral fins behind the gill cover, which it sculls with: green, darker at the base, rimmed in blue.
  const pectorals: Vector3[] = [];
  for (const side of [1, -1]) {
    const s = .285, theta = side * angle(s, -.025);
    const root = ctx.surface(s, theta, 0);
    const yaw = .62;
    leafFin(ctx, {
      root: root.clone().addScaledVector(ctx.normal(s, theta), -.012),
      axis: new Vector3(side * Math.sin(yaw), -.07, -Math.cos(yaw)).normalize(), up: new Vector3(side * .5, 1, 0).normalize(),
      length: .19, half: (t) => .078 * Math.sqrt(Math.max(0, 1 - ((t - .38) / (t > .38 ? .62 : .42)) ** 2)),
      thickness: .007, stations: 8, chordPoints: 7, bone: side > 0 ? 'PectoralL' : 'PectoralR', side,
      color: (t, u) => mix(mix(PECTORAL_BASE, PECTORAL, smoothstep(.05, .5, t)), FIN_EDGE, .8 * Math.max(smoothstep(.82, 1, t), 1 - smoothstep(0, .1, Math.min(u, 1 - u)))),
    });
    pectorals.push(root);
  }

  // A truncate tail, slightly lunate, its corners drawn out a little: dark green with a blue rim.
  const axis = ctx.center(rig.joints[4]);
  const tail = ctx.caudalFin({
    low: axis - .12, high: axis + .12,
    le: [[axis - .12, .96], [axis - .1, .9], [axis - .07, .845], [axis - .048, .815], [axis - .025, .803], [axis, .8], [axis + .025, .803], [axis + .048, .815], [axis + .07, .845], [axis + .1, .9], [axis + .12, .96]],
    te: [[axis - .12, .96], [axis - .114, .99], [axis - .09, 1], [axis - .05, .988], [axis, .975], [axis + .05, .988], [axis + .09, 1], [axis + .114, .99], [axis + .12, .96]],
    thickness: (y) => .004 + .014 * Math.max(0, 1 - Math.abs(y - axis) / .1) ** 1.2,
    upperPivot: .04, lowerPivot: .04, stations: 14,
    color: (_p, v, u) => mix(mix(FIN, FIN_DARK, .4 * smoothstep(.3, .8, u)), FIN_EDGE, smoothstep(.85, 1, u) + .5 * smoothstep(.86, 1, Math.abs(2 * v - 1))),
  });

  // The small eye, set back from the beak, a brown-orange iris round a black pupil.
  const eyeS = .075, eyeY = -.005;
  ctx.eyes({ s: eyeS, theta: angle(eyeS, eyeY), radius: .0165, color: IRIS, sink: .4 });
  ctx.eyes({ s: eyeS - .001, theta: angle(eyeS, eyeY), radius: .0085, color: PUPIL, sink: -.2 });

  for (const side of [1, -1]) {
    // The gill cover: a dark blue rim along its edge, a fine line inside it.
    const cover = (shift: number) => Array.from({ length: 9 }, (_, j) => {
      const t = j / 8;
      return [.255 + shift + .022 * Math.sin(Math.PI * t) ** .8 - .012 * t, .1 - .21 * t] as const;
    });
    ctx.ribbon(flank(side, cover(0)), (t) => .0035 * (.4 + .6 * Math.sin(Math.PI * t)), BLUE_RIM, .0012);
    ctx.ribbon(flank(side, cover(-.012)), (t) => .0016 * (.4 + .6 * Math.sin(Math.PI * t)), SCALE_EDGE, .0009);

    // Big scales: the rounded rear margin of each, in rows that stagger from one to the next.
    const rows = [.6, 1, 1.4, 1.8, 2.2];
    rows.forEach((theta, r) => {
      const pitch = .052;
      for (let s = .3 + (r % 2) * pitch / 2; s < .78; s += pitch) {
        const reach = .017 * (1 - .55 * smoothstep(.4, .8, s));
        const arc = [-1.35, -.45, .45, 1.35].map((phi) => [s + reach * Math.cos(phi), side * clamp(theta + .2 * Math.sin(phi), .15, 2.95)] as const);
        const mid = ctx.raw(s, side * theta);
        const dark = mix(skin(s, theta, mid), SCALE_EDGE, .3 + .15 * noise(s * 40 + r * 7, 33));
        ctx.ribbon(arc, () => .0017, theta > 2.3 ? mix(dark, SCALE_PALE, .3) : dark, .0009);
      }
    });
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
