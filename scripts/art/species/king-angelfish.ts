/**
 * King angelfish (Holacanthus passer): the Eastern Pacific's reef angel, a hand and a half long: an almost
 * disc-shaped, very compressed body about as deep as it is long, a short snout with a small mouth, a
 * steep rounded forehead and a strong spine at the lower corner of the gill cover. The dorsal and anal
 * fins run along the back and belly and draw their soft rear parts out into long pointed streamers
 * that trail past the tail; the tail is a rounded-square fan; the pectorals are rounded paddles it
 * rows with, the pelvics long and pointed. A deep slate-navy body sprinkled with fine pale dots and a
 * darker head, one crisp white bar just behind the gill cover (which has a thin blue edge), a bright
 * yellow-orange tail, dark blue dorsal and anal fins edged in thin turquoise (the dorsal's streamer
 * tipped with orange), yellowish dusky pectorals and white pelvic fins.
 */
import { Vector3 } from 'three';
import { SWIM_RIGS, type SharkRig } from '../../../src/lib/marine-rigs';
import { blendSkins, clamp, fin, hex, mix, noise, smoothstep, TAU, type RGB, type Skin } from './kit';
import { sharkContext, type SharkContext, type SharkDesign } from './shark';

// Body: a deep slate navy, the head darker, the belly a little greyer.
const BACK = hex('#2a3a62'), FLANK = hex('#3c4f7c'), BELLY = hex('#566a94'), HEAD = hex('#1d2847');
const DOT = hex('#8c9fc4'), GOLD_WASH = hex('#5b5a45');
const WHITE = hex('#ffffff'), GILL_EDGE = hex('#43b4ee');
// Fins.
const FIN_DEEP = hex('#0d2150'), FIN_BLUE = hex('#173c80'), TURQUOISE = hex('#35d6e6'), STREAMER = hex('#ffbc30');
const TAIL_ORANGE = hex('#ff7e00'), TAIL_YELLOW = hex('#ffb200');
const PECTORAL_DUSK = hex('#a8923a'), PECTORAL_YELLOW = hex('#e8c52a');
const PELVIC = hex('#e9f1f6'), PELVIC_TIP = hex('#b9c9d8');
const EYE = hex('#c7952c'), PUPIL = hex('#05070c'), MOUTH = hex('#0a0f1c'), LIP = hex('#7f93b8');

const rig = SWIM_RIGS['king-angelfish'] as SharkRig;

const skin = (s: number, theta: number, p: Vector3): RGB => {
  // Darker on the back, paler low on the flank; the head darker still; a faint warm wash toward the tail.
  const t = theta + .06 * noise(p.z * 36 + p.y * 20, 3);
  let color = mix(mix(BACK, FLANK, smoothstep(.25, 1.5, t)), BELLY, smoothstep(2, 2.95, t));
  color = mix(color, HEAD, .75 * (1 - smoothstep(.15, .26, s)));
  color = mix(color, GOLD_WASH, .3 * smoothstep(.6, .79, s));
  return mix(color, FLANK, .12 * noise(p.z * 130 + p.y * 110, 6));
};

export const KING_ANGELFISH: SharkDesign = {
  rig, nose: .4, bodyEnd: .79, frontDome: .032,
  // A disc: the forehead rises steeply from the snout, the back and belly arch to a peak a third of the
  // way along, and both curve round into a narrow tail stock; only a few centimetres thick.
  width: [[0, .014], [.03, .034], [.08, .048], [.16, .056], [.28, .06], [.4, .058], [.52, .05], [.62, .04], [.71, .03], [.79, .02]],
  top: [[0, .05], [.03, .115], [.08, .185], [.16, .245], [.28, .282], [.4, .285], [.52, .262], [.62, .21], [.71, .118], [.79, .04]],
  bottom: [[0, .04], [.03, .09], [.08, .15], [.16, .215], [.28, .262], [.4, .272], [.52, .25], [.62, .2], [.71, .108], [.79, .04]],
  center: [[0, -.035], [.08, -.012], [.2, -.004], [.4, .002], [.79, .002]],
  squareTop: [[0, 2], [.79, 2]],
  squareBottom: [[0, 2], [.79, 2]],
  rings: 32, columnsAbove: 6, columnsBelow: 5,
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
 * (front and top) edge and its trailing edge, from the buried base to the tip, as [axial position, height].
 * Each pair becomes one section, so a streamer swept back past the body is a long, thin wedge.
 */
function sailFin(ctx: SharkContext, options: {
  front: readonly (readonly [number, number])[]; back: readonly (readonly [number, number])[];
  thickness: number; stations?: number; chordPoints?: number; ventral?: boolean; bone?: string;
  color: (p: Vector3, v: number, u: number) => RGB;
}) {
  const front = spline(options.front), back = spline(options.back);
  const point = ([s, y]: readonly [number, number]) => new Vector3(0, y, ctx.z(s));
  const edge = options.ventral ? ctx.yBottom : ctx.yTop;
  fin(ctx.mesh, {
    stations: options.stations ?? options.front.length - 1, chordPoints: options.chordPoints, spacing: (t) => t,
    le: (v) => point(front(v)), te: (v) => point(back(v)),
    thickness: (v) => options.thickness * (1 - .6 * smoothstep(.5, 1, v)),
    side: new Vector3(1, 0, 0),
    color: options.color,
    skin: (p) => {
      const s = ctx.sOf(p.z);
      const base = ctx.skin(s);
      if (!options.bone) return base;
      // The front and middle sway with the dorsal bone; the streamer behind the body follows the tail.
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

/** A small curved thorn rising from the body: the preopercular spine. */
function thorn(ctx: SharkContext, from: Vector3, to: Vector3, bow: Vector3, radius: number, color: RGB, weights: Skin) {
  const { mesh } = ctx;
  const axis = to.clone().sub(from), w = axis.clone().normalize();
  const u = new Vector3(0, 1, 0).cross(w).normalize(), v = w.clone().cross(u);
  const sides = 5, segments = 3;
  mesh.begin();
  const rings: number[][] = [];
  for (let j = 0; j < segments; j++) {
    const t = j / segments;
    const c = from.clone().addScaledVector(axis, t).addScaledVector(bow, t * t);
    const r = radius * (1 - t) ** .8;
    rings.push(Array.from({ length: sides }, (_, i) => {
      const a = TAU * i / sides;
      return mesh.vertex(c.clone().addScaledVector(u, Math.cos(a) * r).addScaledVector(v, Math.sin(a) * r), color, weights);
    }));
  }
  for (let j = 0; j < segments - 1; j++) {
    for (let i = 0; i < sides; i++) mesh.quad(rings[j][i], rings[j][(i + 1) % sides], rings[j + 1][(i + 1) % sides], rings[j + 1][i]);
  }
  const tip = mesh.vertex(to.clone().add(bow), color, weights);
  const base = mesh.vertex(from, color, weights);
  for (let i = 0; i < sides; i++) {
    mesh.tri(tip, rings[segments - 1][i], rings[segments - 1][(i + 1) % sides]);
    mesh.tri(base, rings[0][(i + 1) % sides], rings[0][i]);
  }
  mesh.end();
}

export function buildKingAngelfish() {
  const ctx = sharkContext(KING_ANGELFISH);
  const { mesh, bones } = ctx;
  ctx.body();

  /** A fin's colour: dark blue, a thin turquoise margin along its free edges (u runs across the section). */
  const finBlue = (v: number, u: number) => {
    const margin = 1 - smoothstep(0, .035, Math.min(u, 1 - u));
    return mix(mix(FIN_DEEP, FIN_BLUE, smoothstep(0, .5, v)), TURQUOISE, margin);
  };

  // Dorsal: low spines from the nape, rising to the soft part, whose rear is drawn out into a pointed
  // streamer that trails over the tail (on `Dorsal`). Pairs of [axial position, height] from the buried
  // base to the tip: the free front edge, and the trailing edge sweeping back and up to meet it.
  sailFin(ctx, {
    front: [[.15, .226], [.185, .275], [.235, .318], [.3, .352], [.38, .372], [.46, .374], [.54, .358], [.62, .328], [.71, .292], [.805, .258], [.9, .238], [.995, .226]],
    back: [[.735, .035], [.745, .06], [.755, .085], [.765, .11], [.78, .14], [.8, .168], [.825, .19], [.855, .205], [.89, .216], [.925, .222], [.96, .225], [.995, .226]],
    thickness: .012, stations: 15, chordPoints: 9, bone: 'Dorsal',
    color: (_p, v, u) => mix(finBlue(v, u), STREAMER, smoothstep(.64, .82, v)),
  });
  // Anal fin: the same, mirrored on the belly, a touch smaller.
  sailFin(ctx, {
    ventral: true,
    front: [[.47, -.232], [.505, -.268], [.55, -.295], [.61, -.315], [.68, -.322], [.75, -.312], [.82, -.292], [.89, -.272], [.94, -.257], [.975, -.248], [.99, -.244], [.995, -.242]],
    back: [[.735, -.03], [.745, -.055], [.755, -.08], [.765, -.105], [.78, -.133], [.8, -.16], [.83, -.183], [.86, -.2], [.9, -.215], [.94, -.228], [.97, -.236], [.995, -.242]],
    thickness: .012, stations: 13, chordPoints: 9,
    color: (_p, v, u) => finBlue(v, u),
  });

  // Long, pointed white pelvic fins hanging back from under the chest.
  for (const side of [1, -1]) {
    const normal = ctx.normal(.33, side * 2.75);
    leafFin(ctx, {
      root: ctx.surface(.33, side * 2.75, 0).addScaledVector(normal, -.01),
      axis: new Vector3(side * .16, -.28, -.95).normalize(), up: new Vector3(side * .1, .95, -.3).normalize(),
      length: .2, half: (t) => .036 * Math.min(1, (t + .18) / .4) * (1 - t) ** .9,
      thickness: .007, stations: 6, chordPoints: 5, side,
      color: (t) => mix(PELVIC, PELVIC_TIP, .5 * smoothstep(.7, 1, t)),
    });
  }

  // Rounded pectoral paddles on the gill-cover side of the bar: dusky, yellowing toward the rim.
  const pectorals: Vector3[] = [];
  for (const side of [1, -1]) {
    const s = .205, theta = side * 1.72;
    const root = ctx.surface(s, theta, 0);
    const yaw = .66;
    leafFin(ctx, {
      root: root.clone().addScaledVector(ctx.normal(s, theta), -.01),
      axis: new Vector3(side * Math.sin(yaw), -.05, -Math.cos(yaw)).normalize(), up: new Vector3(0, 1, 0),
      length: .15, half: (t) => .062 * Math.sqrt(Math.max(0, 1 - ((t - .36) / (t > .36 ? .64 : .43)) ** 2)),
      thickness: .007, stations: 7, chordPoints: 7, bone: side > 0 ? 'PectoralL' : 'PectoralR', side,
      color: (t, u) => {
        const rim = Math.max(smoothstep(.55, .98, t), 1 - smoothstep(0, .2, Math.min(u, 1 - u)));
        return mix(PECTORAL_DUSK, PECTORAL_YELLOW, .45 + .55 * rim);
      },
    });
    pectorals.push(root);
  }

  // A rounded-square tail fan, yellow-orange, deeper at the base.
  const axis = ctx.center(rig.joints[4]);
  const tail = ctx.caudalFin({
    low: axis - .138, high: axis + .138,
    le: [[axis - .138, .965], [axis - .122, .93], [axis - .1, .87], [axis - .072, .82], [axis - .044, .795], [axis - .016, .783], [axis + .016, .783], [axis + .044, .795], [axis + .072, .82], [axis + .1, .87], [axis + .122, .93], [axis + .138, .965]],
    te: [[axis - .138, .965], [axis - .127, .985], [axis - .1, .998], [axis - .055, 1], [axis, .992], [axis + .055, 1], [axis + .1, .998], [axis + .127, .985], [axis + .138, .965]],
    thickness: (y) => .004 + .012 * Math.max(0, 1 - Math.abs(y - axis) / .11) ** 1.2,
    upperPivot: .04, lowerPivot: .04, stations: 20,
    color: (_p, _v, u) => mix(TAIL_ORANGE, TAIL_YELLOW, smoothstep(.1, .85, u)),
  });

  // Eyes: a golden iris and a black pupil; a small mouth with pale lips at the tip of the snout.
  ctx.eyes({ s: .1, theta: 1.3, radius: .031, color: EYE, sink: .4 });
  ctx.eyes({ s: .097, theta: 1.28, radius: .0125, color: PUPIL, sink: -.3 });
  for (const side of [1, -1]) {
    const line = Array.from({ length: 5 }, (_, i) => [.006 + .034 * i / 4, side * (1.72 + .16 * i / 4)] as const);
    ctx.ribbon(line, (t) => .0072 * (.5 + .5 * Math.sin(Math.PI * t)), LIP, .0008);
    ctx.ribbon(line, (t) => .0042 * (.5 + .5 * Math.sin(Math.PI * t)), MOUTH, .0016);
  }

  // The white bar behind the gill cover: from the dorsal fin's base across the flank, bowed back at
  // mid-flank, narrowing and rounding off at the pelvic fins; a thin blue line along the gill cover's edge.
  const bowS = (theta: number) => .222 + .036 * Math.exp(-(((Math.abs(theta) - 1.5) / .85) ** 2));
  const bar = Array.from({ length: 49 }, (_, i) => {
    const theta = -2.7 + 5.4 * i / 48;
    return [bowS(theta), theta] as const;
  });
  ctx.ribbon(bar, (t) => {
    const theta = Math.abs(-2.7 + 5.4 * t);
    return .042 * (1 - .22 * smoothstep(1.2, 2.6, theta)) * Math.sqrt(clamp((2.72 - theta) / .22));
  }, WHITE, .003);
  const edge = Array.from({ length: 41 }, (_, i) => {
    const theta = -2.25 + 4.5 * i / 40;
    return [bowS(theta) - .056, theta] as const;
  });
  ctx.ribbon(edge, (t) => .0042 * Math.sqrt(clamp(1 - (2 * t - 1) ** 8)), GILL_EDGE, .002);

  // The strong spine at the lower corner of the gill cover, pointing back and down.
  for (const side of [1, -1]) {
    const theta = side * 2.1;
    const from = ctx.surface(.17, theta, -.004);
    thorn(ctx, from, from.clone().add(new Vector3(side * .014, -.036, -.04)), new Vector3(side * .005, -.008, -.008), .009, mix(BELLY, DOT, .3), ctx.skin(.17));
  }

  // Fine pale dots sprinkled over the flank behind the bar.
  for (const side of [1, -1]) {
    for (let i = 0; i < 34; i++) {
      const k = i + (side > 0 ? 0 : 41);
      const s = .33 + .42 * ((.5 + .7548776662 * k) % 1), theta = .3 + 2.3 * ((.5 + .5698402910 * k) % 1);
      ctx.spot(s, side * theta, .0055, mix(FLANK, DOT, .42), 1.1, .0015);
    }
  }

  ctx.spineBones();
  bones.push(
    { name: 'TailUpper', parent: 'Tail', position: tail.upper },
    { name: 'TailLower', parent: 'Tail', position: tail.lower },
    { name: 'Dorsal', parent: rig.dorsalParent, position: new Vector3(0, ctx.yTop(rig.dorsalAt), ctx.z(rig.dorsalAt)) },
    { name: 'PectoralL', parent: 'Root', position: pectorals[0] },
    { name: 'PectoralR', parent: 'Root', position: pectorals[1] },
  );
  return { mesh, bones };
}
