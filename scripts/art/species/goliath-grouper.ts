/**
 * Goliath grouper (Epinephelus itajara): the giant of the Atlantic reefs and wrecks, up to two and a half
 * metres long: massive and very robust, as thick as it is deep, with a huge, broad, flattened head, a wide
 * mouth whose lower jaw juts past the upper, and small eyes set high on the head. The fins are all
 * rounded: great fan-like pectorals, a dorsal whose spiny front part stands lower than its soft rear,
 * a rounded anal fin and a rounded tail. Yellowish brown to olive grey, mottled, with small dark spots
 * over the head and fins and a few faint, irregular, darker bars down the flanks.
 */
import { Vector3 } from 'three';
import { SWIM_RIGS, type SharkRig } from '../../../src/lib/marine-rigs';
import { blendSkins, clamp, curve, fin, hex, mix, noise, path, smoothstep, TAU, type RGB, type Skin } from './kit';
import { sharkContext, type SharkContext, type SharkDesign } from './shark';

// Body: an olive-brown back, a yellowish-khaki flank, a paler belly; the head a little browner; faint darker bars.
const BACK = hex('#6c6849'), FLANK = hex('#8d8860'), LOWER = hex('#a39d73'), BELLY = hex('#bdb68f');
const HEAD = hex('#7a7050'), CHEEK = hex('#948a62'), BAR = hex('#575239'), SPOT = hex('#2b2719');
const LIP = hex('#8a7d58'), MOUTH = hex('#2a211a'), JAW = hex('#a99c74');
// Fins: dusky olive-brown, darker toward their edges.
const FIN = hex('#7b7350'), FIN_DARK = hex('#3f3a26'), FIN_BASE = hex('#8d8660'), PELVIC = hex('#6f6848');
const IRIS = hex('#a88a3c'), PUPIL = hex('#07090a');

const rig = SWIM_RIGS['goliath-grouper'] as SharkRig;

// Body sections: [s, back y, belly y, half width]. A long, flat-topped head that climbs only gently from
// the snout to the nape, a deep, thick body behind it, and a stout, deep tail stock.
const SECTIONS: readonly (readonly [number, number, number, number])[] = [
  [0, .01, -.046, .03],
  [.012, .026, -.064, .046],
  [.03, .044, -.082, .06],
  [.06, .064, -.098, .076],
  [.1, .082, -.111, .089],
  [.15, .098, -.12, .096],
  [.2, .11, -.126, .1],
  [.27, .12, -.131, .102],
  [.35, .125, -.133, .102],
  [.43, .122, -.13, .097],
  [.51, .113, -.122, .088],
  [.59, .1, -.108, .076],
  [.67, .085, -.092, .063],
  [.74, .071, -.078, .047],
  [.81, .055, -.06, .032],
];
const column = (pick: (row: readonly number[]) => number) => SECTIONS.map((row) => [row[0], pick(row)] as const);
const SQUARE_TOP = [[0, 2.3], [.1, 2.9], [.25, 2.7], [.5, 2.3], [.81, 2.2]] as const;
const SQUARE_BOTTOM = [[0, 2.2], [.1, 2.5], [.3, 2.4], [.81, 2.2]] as const;

/** Irregular faint bars down the flank: a mask over the axial position and the angle round the body. */
const bars = (s: number, theta: number) => {
  const wobble = noise(theta * 2.2 + s * 9, 41);
  const stripe = Math.max(0, 1 - Math.abs(((s * 1.0 + .06 * wobble) % .125) - .0625) / .028);
  return smoothstep(.2, .9, stripe) * smoothstep(.2, .6, theta) * (1 - smoothstep(1.7, 2.4, theta + .35 * wobble)) * smoothstep(.27, .38, s) * (1 - smoothstep(.72, .8, s));
};

const skin = (s: number, theta: number, p: Vector3): RGB => {
  // A dark olive back washing to khaki down the flank and to a pale belly; the head browner over the top and
  // yellower on the cheek; a few faint dark bars; mottled all over.
  const t = theta + .08 * noise(p.z * 26 + p.y * 14, 3);
  const flank = mix(mix(BACK, FLANK, smoothstep(.2, 1.15, t)), LOWER, smoothstep(1.5, 2.3, t));
  const body = mix(flank, BELLY, smoothstep(2.3, 2.95, t));
  const head = 1 - smoothstep(.28, .38, s);
  const face = mix(HEAD, CHEEK, smoothstep(.8, 1.9, t));
  const mottled = mix(mix(body, face, .85 * head), BACK, .16 * (.5 + .5 * noise(p.z * 70 + p.y * 55, 6)));
  const blotch = smoothstep(.25, .85, .5 + .5 * noise(s * 16 + Math.sin(t) * 2.2, 17)) * smoothstep(.3, 1, t) * (1 - smoothstep(1.9, 2.6, t));
  return mix(mix(mottled, BAR, .55 * bars(s, t)), BAR, .2 * blotch);
};

export const GOLIATH_GROUPER: SharkDesign = {
  rig, nose: .4, bodyEnd: .81, frontDome: .012,
  width: column((r) => r[3]),
  top: column((r) => (r[1] - r[2]) / 2),
  bottom: column((r) => (r[1] - r[2]) / 2),
  center: column((r) => (r[1] + r[2]) / 2),
  squareTop: SQUARE_TOP.map(([s, v]) => [s, v] as const),
  squareBottom: SQUARE_BOTTOM.map(([s, v]) => [s, v] as const),
  rings: 30, columnsAbove: 6, columnsBelow: 5,
  boundary: () => 2.2, boundaryGap: .3,
  paint: skin,
};

/**
 * A smooth sausage along a path, tapering to nothing at both ends: a lip or the lower jaw. `flat`
 * squashes it vertically; `color` is given the fraction along the path and the angle round it (0 = up).
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
  color: (p: Vector3, t: number, u: number) => RGB;
}) {
  const centre = (t: number) => options.root.clone().addScaledVector(options.axis, options.length * t);
  fin(ctx.mesh, {
    stations: options.stations, chordPoints: options.chordPoints, spacing: (t) => t,
    le: (v) => centre(v).addScaledVector(options.up, options.half(v)),
    te: (v) => centre(v).addScaledVector(options.up, -options.half(v)),
    thickness: (v) => options.thickness * (1 - .6 * v),
    side: new Vector3(options.side, 0, 0),
    color: (p, v, u) => options.color(p, v, u),
    skin: (p, v) => {
      const base = ctx.skin(ctx.sOf(p.z));
      return options.bone ? blendSkins(base, { [options.bone]: 1 }, smoothstep(.1, .5, v)) : base;
    },
  });
}

/** A small dark disc laid on the face of a fin, `normal` pointing off that face. */
function finSpot(ctx: SharkContext, center: Vector3, normal: Vector3, radius: number, weights: Skin) {
  const { mesh } = ctx;
  const n = normal.clone().normalize();
  const t1 = Math.abs(n.y) < .9 ? new Vector3(0, 1, 0).cross(n).normalize() : new Vector3(1, 0, 0).cross(n).normalize();
  const t2 = n.clone().cross(t1);
  mesh.begin();
  const middle = mesh.vertex(center, SPOT, weights, n);
  const ring = Array.from({ length: 6 }, (_, i) => {
    const a = TAU * i / 6 + .3;
    return mesh.vertex(center.clone().addScaledVector(t1, Math.cos(a) * radius * 1.15).addScaledVector(t2, Math.sin(a) * radius), SPOT, weights, n);
  });
  for (let i = 0; i < 6; i++) mesh.tri(middle, ring[i], ring[(i + 1) % 6]);
  mesh.end({ closed: false, normals: false, outward: () => n });
}

export function buildGoliathGrouper() {
  const ctx = sharkContext(GOLIATH_GROUPER);
  const { mesh, bones } = ctx;
  ctx.body();
  const squareTopAt = curve(SQUARE_TOP.map(([s, v]) => [s, v] as const)), squareBottomAt = curve(SQUARE_BOTTOM.map(([s, v]) => [s, v] as const));

  /** The angle round the body at axial position s of the flank point at height y. */
  const angle = (s: number, y: number) => {
    const c = ctx.center(s), up = y >= c;
    const f = clamp(Math.abs(y - c) / (up ? ctx.top(s) : ctx.bottom(s)), 0, 1);
    return Math.acos((up ? 1 : -1) * f ** ((up ? squareTopAt(s) : squareBottomAt(s)) / 2));
  };
  /** A flank line given as [s, y] points, as [s, theta] points on one side. */
  const flank = (side: number, points: readonly (readonly [number, number])[]) => points.map(([s, y]) => [s, side * angle(s, y)] as const);

  // The wide mouth: a gape sloping down and back from the snout's tip to below the eye's rear, the broad,
  // pale maxilla riding its upper edge and widening toward the corner; the heavy lower jaw juts beyond it,
  // wrapping round the front from corner to corner.
  const gape = (s: number) => -.006 - .046 * clamp(s / .17) ** 1.15;
  const lowerAt = (s: number) => gape(s) - .022;
  const lower = [.165, .13, .09, .055].map((s) => ctx.surface(s, angle(s, lowerAt(s)), -.004));
  const front = [[.052, .018], [.044, -.004], [.028, -.018], [.01, -.026]] as const;
  const jaw = [...lower, ...front.map(([x, s]) => new Vector3(x, lowerAt(0) - .004, ctx.z(s))), new Vector3(0, lowerAt(0) - .004, ctx.z(-.026))];
  tube(ctx, [...jaw, ...[...jaw].reverse().slice(1).map((p) => new Vector3(-p.x, p.y, p.z))],
    (t) => .005 + .017 * Math.sin(Math.PI * t) ** .35, (t, a) => mix(JAW, LIP, .5 * (.5 + .5 * Math.cos(a)) + .15 * Math.abs(2 * t - 1)), { flat: .85, sides: 7, stations: 14 });
  for (const side of [1, -1]) {
    const line = (offset: number, from: number, to: number) => Array.from({ length: 8 }, (_, i) => {
      const s = from + (to - from) * i / 7;
      return [s, gape(s) + offset] as const;
    });
    ctx.ribbon(flank(side, line(.0065, .012, .17)), (t) => .0028 + .0075 * t ** 1.4, JAW, .0012);
    ctx.ribbon(flank(side, line(0, .004, .172)), (t) => .0024 * (1 - .4 * t), MOUTH, .0022);
  }

  const finColor = (_p: Vector3, v: number, u: number) => mix(mix(FIN_BASE, FIN, smoothstep(0, .4, v)), FIN_DARK, .75 * smoothstep(.55, 1, v) + .3 * (1 - u) * smoothstep(.3, .8, v));

  // The dorsal fin: a low spiny part from the nape, then a taller, rounded soft part behind it (both on `Dorsal`).
  const dorsal = ctx.midlineFin({
    le: [[-.012, .27], [0, .275], [.012, .29], [.025, .33], [.034, .39], [.038, .47]],
    te: [[-.012, .56], [0, .555], [.012, .545], [.025, .52], [.034, .49], [.038, .47]],
    height: .038, thickness: .01, stations: 8, chordPoints: 6, bone: 'Dorsal', color: finColor,
  });
  ctx.midlineFin({
    le: [[-.012, .535], [0, .54], [.017, .553], [.042, .58], [.066, .62], [.078, .67]],
    te: [[-.012, .81], [0, .805], [.017, .79], [.042, .765], [.066, .72], [.078, .67]],
    height: .078, thickness: .011, stations: 9, chordPoints: 7, bone: 'Dorsal', color: finColor,
  });
  // The anal fin: short and rounded, under the soft dorsal.
  ctx.midlineFin({
    le: [[-.012, .55], [0, .555], [.015, .568], [.034, .595], [.048, .64], [.056, .68]],
    te: [[-.012, .81], [0, .805], [.015, .79], [.034, .765], [.048, .72], [.056, .68]],
    height: .056, thickness: .011, stations: 8, chordPoints: 6, ventral: true, color: finColor,
  });

  // Rounded pelvic fins under the pectoral bases.
  for (const side of [1, -1]) {
    const normal = ctx.normal(.33, side * 2.65);
    leafFin(ctx, {
      root: ctx.surface(.33, side * 2.65, 0).addScaledVector(normal, -.01),
      axis: new Vector3(side * .15, -.28, -.95).normalize(), up: new Vector3(side * .1, .95, -.3).normalize(),
      length: .12, half: (t) => .042 * Math.sqrt(Math.max(0, 1 - ((t - .4) / (t > .4 ? .6 : .5)) ** 2)),
      thickness: .008, stations: 6, chordPoints: 6, side,
      color: (_p, t) => mix(PELVIC, FIN_DARK, .6 * smoothstep(.4, 1, t)),
    });
  }

  // Great rounded pectoral fans behind the gill cover, which it holds out and sculls with.
  const pectorals: Vector3[] = [];
  for (const side of [1, -1]) {
    const s = .335, theta = side * angle(s, -.03);
    const root = ctx.surface(s, theta, 0);
    const yaw = .55, bone = side > 0 ? 'PectoralL' : 'PectoralR';
    const origin = root.clone().addScaledVector(ctx.normal(s, theta), -.014);
    const axis = new Vector3(side * Math.sin(yaw), -.07, -Math.cos(yaw)).normalize(), up = new Vector3(side * .5, 1, 0).normalize();
    const length = .18, half = (t: number) => .088 * Math.sqrt(Math.max(0, 1 - ((t - .42) / (t > .42 ? .58 : .46)) ** 2));
    // Small dark spots scattered over the fan's outer face.
    const face = axis.clone().cross(up).normalize();
    if (face.x * side < 0) face.negate();
    for (let i = 0; i < 9; i++) {
      const k = i + (side > 0 ? 0 : 17);
      const t = .22 + .62 * ((.5 + .7548776662 * k) % 1), across = (2 * ((.5 + .5698402910 * k) % 1) - 1) * .72;
      const at = origin.clone().addScaledVector(axis, length * t).addScaledVector(up, across * half(t)).addScaledVector(face, .0042);
      finSpot(ctx, at, face, .0036 + .0014 * (i % 3), blendSkins(ctx.skin(ctx.sOf(at.z)), { [bone]: 1 }, smoothstep(.1, .5, t)));
    }
    leafFin(ctx, {
      root: origin, axis, up, length, half,
      thickness: .008, stations: 9, chordPoints: 8, bone, side,
      color: (p, t, u) => {
        const mottle = .5 + .5 * noise(p.z * 160 + p.y * 120 + p.x * 90, 12);
        const edge = Math.max(smoothstep(.78, 1, t), 1 - smoothstep(0, .12, Math.min(u, 1 - u)));
        return mix(mix(mix(FIN_BASE, FIN, smoothstep(.05, .5, t)), FIN_DARK, .25 * mottle * smoothstep(.2, .8, t)), FIN_DARK, .75 * edge);
      },
    });
    pectorals.push(root);
  }

  // A broad, rounded tail, dusky with a dark margin.
  const axis = ctx.center(rig.joints[4]);
  const tail = ctx.caudalFin({
    low: axis - .12, high: axis + .12,
    le: [[axis - .12, .92], [axis - .1, .87], [axis - .075, .83], [axis - .055, .812], [axis - .03, .803], [axis, .8], [axis + .03, .803], [axis + .055, .812], [axis + .075, .83], [axis + .1, .87], [axis + .12, .92]],
    te: [[axis - .12, .92], [axis - .11, .955], [axis - .085, .985], [axis - .045, .998], [axis, 1], [axis + .045, .998], [axis + .085, .985], [axis + .11, .955], [axis + .12, .92]],
    thickness: (y) => .004 + .015 * Math.max(0, 1 - Math.abs(y - axis) / .1) ** 1.2,
    upperPivot: .04, lowerPivot: .04, stations: 14,
    color: (p, v, u) => mix(mix(FLANK, FIN, smoothstep(.0, .4, u)), FIN_DARK, .75 * smoothstep(.6, 1, u) + .15 * (.5 + .5 * noise(p.y * 90 + u * 20, 14)) * smoothstep(.2, .7, u)),
  });

  // Small dark spots on the soft dorsal fin and the tail, on both faces of each.
  const dorsalSkin = (y: number, s: number) => blendSkins(ctx.skin(s), { Dorsal: 1 }, smoothstep(.12, .55, y));
  for (const side of [1, -1]) {
    for (let i = 0; i < 7; i++) {
      const k = i + (side > 0 ? 0 : 11);
      const sPos = .6 + .17 * ((.5 + .7548776662 * k) % 1), height = (.18 + .6 * ((.5 + .5698402910 * k) % 1)) * .078 * Math.sqrt(Math.max(0, 1 - ((sPos - .67) / .14) ** 2));
      finSpot(ctx, new Vector3(side * .0052, ctx.yTop(sPos) + height, ctx.z(sPos)), new Vector3(side, 0, 0), .0034 + .0012 * (i % 3), dorsalSkin(height / .078, sPos));
    }
    for (let i = 0; i < 12; i++) {
      const k = i + (side > 0 ? 0 : 19);
      const sPos = .86 + .11 * ((.5 + .7548776662 * k) % 1), y = axis + (2 * ((.5 + .5698402910 * k) % 1) - 1) * .09 * Math.sqrt(Math.max(0, 1 - ((sPos - .915) / .1) ** 2));
      const weights = blendSkins(blendSkins(ctx.skin(sPos), { TailUpper: 1 }, smoothstep(.02, .11, y)), { TailLower: 1 }, smoothstep(-.025, -.09, y));
      finSpot(ctx, new Vector3(side * .0055, y, ctx.z(sPos)), new Vector3(side, 0, 0), .0036 + .0014 * (i % 3), weights);
    }
  }

  // The small eye high on the head, a yellow-brown iris round a black pupil.
  const eyeS = .105, eyeY = .05;
  ctx.eyes({ s: eyeS, theta: angle(eyeS, eyeY), radius: .0155, color: IRIS, sink: .4 });
  ctx.eyes({ s: eyeS - .001, theta: angle(eyeS, eyeY), radius: .0075, color: PUPIL, sink: -.2 });

  for (const side of [1, -1]) {
    // The gill cover: a rounded edge, a dark line along it.
    const cover = Array.from({ length: 9 }, (_, j) => {
      const t = j / 8;
      return [.3 + .024 * Math.sin(Math.PI * t) ** .8 - .014 * t, .09 - .21 * t] as const;
    });
    ctx.ribbon(flank(side, cover), (t) => .002 * (.4 + .6 * Math.sin(Math.PI * t)), SPOT, .0012);
    // The preopercle's rounded edge, a fainter arc across the cheek.
    const cheek = Array.from({ length: 8 }, (_, j) => {
      const t = j / 7;
      return [.246 - .03 * Math.sin(Math.PI * t) ** .9 + .01 * t, .05 - .15 * t] as const;
    });
    ctx.ribbon(flank(side, cheek), (t) => .0014 * (.4 + .6 * Math.sin(Math.PI * t)), BAR, .001);

    // Small dark spots over the head, thinning toward the gill cover, and a few on the shoulder.
    for (let i = 0; i < 40; i++) {
      const k = i + (side > 0 ? 0 : 53);
      const s = .015 + .33 * ((.5 + .7548776662 * k) % 1) ** 1.15, theta = .3 + 2.3 * ((.5 + .5698402910 * k) % 1);
      if (Math.abs(s - eyeS) < .028 && Math.abs(theta - angle(eyeS, eyeY)) < .3) continue;
      ctx.spot(s, side * theta, .0036 + .0022 * (.5 + .5 * noise(k * 3.7, 51)), SPOT, 1.15, .0011);
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
