/**
 * Longfin batfish (Platax teira): the silvery disc that schools around wrecks and jetties. A very deep,
 * strongly compressed, almost round body with a steep, nearly vertical face and a small mouth low down; the
 * dorsal and anal fins rise and sweep back into tall, pointed sails, so the fish with its fins is taller than
 * it is long, a diamond from the side; a small rounded tail, small rounded pectorals and long, pointed,
 * yellowish pelvic fins. Silvery grey, yellowish toward the tail, with two dark vertical bands (one through
 * the eye, one just behind the head over the pectoral base), a dark smudge at the front of the belly and
 * the anal fin, and dusky margins on the fins. It glides on slow, gentle beats.
 */
import { Vector3 } from 'three';
import { SWIM_RIGS, type SharkRig } from '../../../src/lib/marine-rigs';
import { blendSkins, clamp, fin, hex, mix, noise, smoothstep, type RGB } from './kit';
import type { BoneSpec } from './export';
import { sharkContext, type SharkContext, type SharkDesign } from './shark';

// Body: dusky grey-green on the back, silvery on the flank, pale below; a yellowish wash toward the tail.
const BACK = hex('#8a948f'), FLANK = hex('#dde3df'), BELLY = hex('#f3f6f1'), HEAD = hex('#b0b8b4'), YELLOW = hex('#e0d79c');
const BAND = hex('#2a2f2f'), SMUDGE = hex('#262a29'), SCALE = hex('#d3d9d5');
// Fins: dusky yellow-grey with darker margins; yellow pelvics.
const FIN = hex('#d3d6c3'), FIN_PALE = hex('#eaece0'), MARGIN = hex('#4a4c45'), PELVIC = hex('#ffcf3a'), PELVIC_TIP = hex('#75622b');
const EYE = hex('#c79f3d'), PUPIL = hex('#05070a'), MOUTH = hex('#2a2a26'), LIP = hex('#b9bbab');

const rig = SWIM_RIGS.batfish as SharkRig;
/** Points across each fin's chord (on each face). */
const CHORD = 13;

/** The two bands across the head: where each one's middle sits at the back (theta 0) and at the belly (pi), and its half-width. */
const bandOf = (s: number, theta: number) => {
  const k = theta / Math.PI;
  // Eye band: down through the eye, leaning a little forward toward the throat.
  const eye = 1 - smoothstep(.026, .05, Math.abs(s - (.13 - .026 * k)));
  // Second band: from the dorsal origin back across the gill cover and pectoral base, widening at the belly.
  const hind = 1 - smoothstep(.026 + .01 * k, .052 + .014 * k, Math.abs(s - (.238 + .07 * k * k)));
  return Math.max(eye, hind);
};

const skin = (s: number, theta: number, p: Vector3): RGB => {
  const t = theta + .05 * noise(p.z * 30 + p.y * 18, 3);
  // Dusky back, silvery flank, pale belly; a greyer head and a yellowish wash toward the tail.
  let color = mix(mix(BACK, FLANK, smoothstep(.2, 1.1, t)), BELLY, smoothstep(1.9, 2.8, t));
  color = mix(color, HEAD, .55 * (1 - smoothstep(.1, .2, s)));
  color = mix(color, YELLOW, .5 * smoothstep(.5, .78, s) * smoothstep(.3, 1.3, t) * (1 - smoothstep(2, 2.9, t)));
  // A silvery sheen along the upper flank, with a faint scale pattern.
  color = mix(color, SCALE, .22 * Math.exp(-(((t - 1.25) / .45) ** 2)) + .1 * smoothstep(.7, 1.5, t) * (.5 + .5 * noise(p.z * 150 + p.y * 130, 6)));
  // The bands (fainter toward the belly, where the second one gathers into a dark patch) and the smudge at the front of the belly.
  const band = bandOf(s, theta) * (.92 - .35 * smoothstep(2.1, 2.8, theta));
  color = mix(color, BAND, band);
  const smudge = Math.exp(-(((s - .385) / .065) ** 2 + ((theta - 2.1) / .4) ** 2));
  return mix(color, SMUDGE, .95 * smudge);
};

/** Outline of the body: absolute y of the back and the belly along its length (s from the snout). */
const BACK_LINE = [[0, -.03], [.01, .025], [.03, .105], [.06, .19], [.1, .26], [.16, .31], [.24, .335], [.32, .335], [.42, .32], [.52, .28], [.62, .22], [.7, .14], [.74, .09], [.79, .058]] as const;
const BELLY_LINE = [[0, -.09], [.01, -.12], [.03, -.17], [.06, -.23], [.1, -.27], [.16, -.305], [.24, -.33], [.32, -.335], [.42, -.315], [.52, -.27], [.62, -.2], [.7, -.13], [.74, -.085], [.79, -.055]] as const;
const middle = BACK_LINE.map(([s, y], i) => [s, (y + BELLY_LINE[i][1]) / 2] as const);
const halfDepth = BACK_LINE.map(([s, y], i) => [s, (y - BELLY_LINE[i][1]) / 2] as const);

export const BATFISH: SharkDesign = {
  rig, nose: .4, bodyEnd: .79, frontDome: .03,
  // A tall disc, only a few centimetres thick: the forehead rises almost straight up from the small mouth.
  width: [[0, .03], [.03, .045], [.06, .06], [.1, .07], [.2, .074], [.3, .074], [.4, .068], [.5, .058], [.6, .046], [.7, .033], [.79, .021]],
  top: halfDepth, bottom: halfDepth, center: middle,
  squareTop: [[0, 2], [.79, 2]],
  squareBottom: [[0, 2], [.79, 2]],
  rings: 36, columnsAbove: 6, columnsBelow: 5,
  boundary: () => 2.2, boundaryGap: .3,
  paint: skin,
};

/** Smooth curve through control points, parameterized 0..1 along the list. */
function spline(points: readonly (readonly [number, number])[]) {
  const n = points.length;
  const at = (i: number) => points[Math.min(n - 1, Math.max(0, i))];
  return (t: number): [number, number] => {
    const x = clamp(t) * (n - 1);
    const i = Math.min(n - 2, Math.floor(x)), f = x - i, f2 = f * f, f3 = f2 * f;
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c = (k: 0 | 1) => .5 * (2 * p1[k] + (p2[k] - p0[k]) * f + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * f2 + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * f3);
    return [c(0), c(1)];
  };
}

/**
 * A fin along the back or belly drawn as an outline in the side view: matching points on its free
 * leading edge and its trailing edge, from the buried base to the tip, as [axial position, height].
 * Each pair becomes one section, so a sail swept back is a tall wedge.
 */
function sailFin(ctx: SharkContext, options: {
  front: readonly (readonly [number, number])[]; back: readonly (readonly [number, number])[];
  thickness: number; chordPoints?: number; ventral?: boolean; bone?: string; tilt?: number;
  color: (p: Vector3, v: number, u: number) => RGB;
}) {
  const front = spline(options.front), back = spline(options.back);
  // A fin held a little askew (`tilt`, as its sideways lean per unit of height) lets it show from above.
  const point = ([s, y]: readonly [number, number]) => new Vector3((options.tilt ?? 0) * y, y, ctx.z(s));
  const edge = options.ventral ? ctx.yBottom : ctx.yTop;
  fin(ctx.mesh, {
    stations: options.front.length - 1, chordPoints: options.chordPoints, spacing: (t) => t,
    le: (v) => point(front(v)), te: (v) => point(back(v)),
    thickness: (v) => options.thickness * (1 - .6 * smoothstep(.5, 1, v)),
    side: new Vector3(1, 0, 0),
    color: options.color,
    skin: (p) => {
      const s = ctx.sOf(p.z);
      const base = ctx.skin(s);
      if (!options.bone) return base;
      // The fin sways with the dorsal bone, more toward its tip.
      const lift = smoothstep(.015, .07, Math.abs(p.y - edge(s))) * (1 - smoothstep(.62, .78, s));
      return blendSkins(base, { [options.bone]: 1 }, lift);
    },
  });
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

/**
 * The whole fish lists a little to one side (the top toward its right): its disc is only a hand's width thick,
 * so from above it would be a thin line, and the tilt shows its flank, bands and the two fins' spread.
 */
const LIST = -.12;
function list(mesh: { positions: number[]; normals: number[] }, bones: BoneSpec[]) {
  const c = Math.cos(LIST), s = Math.sin(LIST);
  for (const array of [mesh.positions, mesh.normals]) {
    for (let i = 0; i < array.length; i += 3) [array[i], array[i + 1]] = [array[i] * c - array[i + 1] * s, array[i] * s + array[i + 1] * c];
  }
  for (const { position: p } of bones) p.set(p.x * c - p.y * s, p.x * s + p.y * c, p.z);
}

export function buildBatfish() {
  const ctx = sharkContext(BATFISH);
  const { mesh, bones } = ctx;
  ctx.body();

  /** A sail's two edges from the base to the tip at `apex`: the leading edge rises in a gentle curve, the trailing edge drops steeply then sweeps back, concave. */
  const sail = (n: number, sign: number, lead: { s: number; y: number }, apex: { s: number; y: number }, trail: { s: number; y: number }) => {
    const front: [number, number][] = [], back: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      front.push([lead.s + (apex.s - lead.s) * u ** 1.1, sign * (lead.y + (apex.y - lead.y) * u ** .85)]);
      back.push([apex.s + (trail.s - apex.s) * (1 - u) ** 1.7, sign * (trail.y + (apex.y - trail.y) * u)]);
    }
    return { front, back };
  };
  /** A fin's colour: dusky yellow-grey, paler toward the base, darkening to a margin along its free edges and tip. */
  const finColor = (p: Vector3, v: number, u: number) => {
    const edge = 1 - smoothstep(0, .09, Math.min(u, 1 - u));
    // The front of the fin is darker, as are its free edges and tip: the dusky margins.
    const margin = Math.max(edge * smoothstep(.3, .85, v), smoothstep(.78, 1, v), .6 * (1 - smoothstep(0, .1, u)) * smoothstep(.1, .4, v));
    // Fine rays run out from the base: a faint ribbing across the fin, one rib on every other vertex line of the loft.
    const ribs = Math.round(Math.acos(clamp(1 - 2 * u, -1, 1)) * CHORD / Math.PI) % 2;
    return mix(mix(mix(FIN_PALE, FIN, smoothstep(0, .45, v)), MARGIN, .22 * ribs * smoothstep(0, .25, v)), MARGIN, .8 * margin + .08 * noise(p.z * 60 + p.y * 40, 4));
  };

  // Dorsal: low and spiny from the nape, rising in a long leading edge to a tall pointed apex above the
  // middle of the back, then dropping steeply and sweeping back, concave, down to the tail stock (on `Dorsal`).
  const dorsal = sail(13, 1, { s: .15, y: .28 }, { s: .6, y: .6 }, { s: .8, y: .05 });
  sailFin(ctx, { ...dorsal, thickness: .012, chordPoints: CHORD + 1, bone: 'Dorsal', tilt: .1, color: finColor });
  // Anal fin: the same below, a little smaller, its front dark where the belly's smudge runs onto it.
  const anal = sail(13, -1, { s: .36, y: .29 }, { s: .6, y: .56 }, { s: .8, y: .05 });
  sailFin(ctx, {
    ...anal, ventral: true, thickness: .012, chordPoints: CHORD + 1, tilt: .1,
    color: (p, v, u) => mix(finColor(p, v, u), SMUDGE, .8 * Math.exp(-(((ctx.sOf(p.z) - .39) / .06) ** 2)) * (1 - smoothstep(.1, .5, v))),
  });

  // Long, pointed, yellowish pelvic fins hanging back from under the chest, dusky at the tips.
  for (const side of [1, -1]) {
    const normal = ctx.normal(.19, side * 2.8);
    leafFin(ctx, {
      root: ctx.surface(.19, side * 2.8, 0).addScaledVector(normal, -.01),
      axis: new Vector3(side * .42, -.36, -.83).normalize(), up: new Vector3(side * .1, .9, -.4).normalize(),
      length: .38, half: (t) => .036 * Math.min(1, (t + .15) / .4) * (1 - t) ** .75,
      thickness: .005, stations: 7, chordPoints: 5, side,
      color: (t) => mix(PELVIC, PELVIC_TIP, smoothstep(.55, 1, t)),
    });
  }

  // Small, rounded pectoral fins, clear and yellowish, set low behind the gill cover.
  const pectorals: Vector3[] = [];
  for (const side of [1, -1]) {
    const s = .245, theta = side * 1.78;
    const root = ctx.surface(s, theta, 0);
    leafFin(ctx, {
      root: root.clone().addScaledVector(ctx.normal(s, theta), -.01),
      axis: new Vector3(side * Math.sin(.75), -.12, -Math.cos(.75)).normalize(), up: new Vector3(0, 1, 0),
      length: .15, half: (t) => .042 * Math.sqrt(Math.max(0, 1 - ((t - .36) / (t > .36 ? .64 : .43)) ** 2)),
      thickness: .006, stations: 6, chordPoints: 6, bone: side > 0 ? 'PectoralL' : 'PectoralR', side,
      color: (t, u) => mix(mix(mix(FLANK, FIN_PALE, .6 * smoothstep(0, .6, t)), SMUDGE, .55 * (1 - smoothstep(.05, .3, t))), MARGIN, .45 * smoothstep(.85, 1, t) + .45 * (1 - smoothstep(0, .1, Math.min(u, 1 - u))) * smoothstep(.4, .8, t)),
    });
    pectorals.push(root);
  }

  // A small rounded tail, yellowish with a dusky rear margin.
  const axis = ctx.center(rig.joints[4]);
  const tail = ctx.caudalFin({
    low: axis - .15, high: axis + .15,
    le: [[axis - .15, .965], [axis - .14, .94], [axis - .115, .895], [axis - .085, .85], [axis - .055, .815], [axis - .025, .79], [axis, .78], [axis + .025, .79], [axis + .055, .815], [axis + .085, .85], [axis + .115, .895], [axis + .14, .94], [axis + .15, .965]],
    te: [[axis - .15, .965], [axis - .135, .985], [axis - .1, .998], [axis - .05, 1], [axis, .995], [axis + .05, 1], [axis + .1, .998], [axis + .135, .985], [axis + .15, .965]],
    thickness: (y) => .004 + .012 * Math.max(0, 1 - Math.abs(y - axis) / .13) ** 1.2,
    upperPivot: .04, lowerPivot: .04, stations: 18,
    color: (p, _v, u) => mix(mix(FIN, FIN_PALE, .5 * (1 - u)), MARGIN, .75 * smoothstep(.8, 1, u) + .15 * smoothstep(.9, 1, ctx.sOf(p.z))),
  });

  // Eyes: a gold-brown iris and black pupil, set in the dark band; a small mouth low on the steep face.
  ctx.eyes({ s: .122, theta: 1.34, radius: .035, color: EYE, sink: .45 });
  ctx.eyes({ s: .119, theta: 1.32, radius: .015, color: PUPIL, sink: -.1 });
  for (const side of [1, -1]) {
    const line = Array.from({ length: 5 }, (_, i) => [.004 + .028 * i / 4, side * (1.8 + .14 * i / 4)] as const);
    ctx.ribbon(line, (t) => .0065 * (.5 + .5 * Math.sin(Math.PI * t)), LIP, .0008);
    ctx.ribbon(line, (t) => .0035 * (.5 + .5 * Math.sin(Math.PI * t)), MOUTH, .0016);
  }

  ctx.spineBones();
  bones.push(
    { name: 'TailUpper', parent: 'Tail', position: tail.upper },
    { name: 'TailLower', parent: 'Tail', position: tail.lower },
    { name: 'Dorsal', parent: rig.dorsalParent, position: new Vector3(0, ctx.yTop(rig.dorsalAt), ctx.z(rig.dorsalAt)) },
    { name: 'PectoralL', parent: 'Root', position: pectorals[0] },
    { name: 'PectoralR', parent: 'Root', position: pectorals[1] },
  );
  list(mesh, bones);
  return { mesh, bones };
}
