/**
 * Lemon shark (Negaprion brevirostris): the stocky, heavy-bodied requiem shark of mangrove creeks and
 * sand flats. A short, broad, bluntly rounded snout (shorter than the mouth is wide) with small eyes,
 * a gentle arc of a mouth and five short gill slits; a thick body that is deepest under the first
 * dorsal; two big, near-equal, slightly falcate dorsal fins, the first set well back behind the
 * pectorals' free rear tips and the second almost as large, with an anal fin to match; broad, sickle-
 * shaped pectorals; a heterocercal tail with a long upper lobe notched near its tip and a good lower
 * lobe. Plain sandy olive-yellow above, paling down the flanks to a yellowish-white belly: no spots,
 * stripes or dark fin tips, the fins just a touch more yellow-olive than the body.
 */
import { Vector3 } from 'three';
import { SWIM_RIGS, type SharkRig } from '../../../src/lib/marine-rigs';
import { clamp, hex, mix, noise, smoothstep, TAU, type RGB } from './kit';
import { sharkContext, type SharkContext, type SharkDesign } from './shark';

// Body: sandy olive-yellow on the back, lighter yellow-tan flanks, a creamy yellow-white belly.
const BACK = hex('#c0a75b'), FLANK = hex('#d2be80'), BELLY = hex('#f2ebd0');
// Fins: a little more yellow-olive than the body, faintly darker along the rear margin.
const FIN = hex('#b09a58'), FIN_PALE = hex('#c7b67d'), FIN_EDGE = hex('#8f7c45'), FIN_UNDER = hex('#efe6c4');
// Face and markings: olive-brown gill slits, nostrils and mouth, a dark eye in an amber-brown iris, a pale upper lip.
const GILL = hex('#7d6e38'), MOUTH = hex('#66562c'), NARE = hex('#6a5d30'), LIP = hex('#f0e7bd');
const EYE = hex('#0b0c08'), IRIS = hex('#4a3d16'), LID = hex('#8d7c3c');

const rig = SWIM_RIGS['lemon-shark'] as SharkRig;

/** Where the sandy back gives way to the pale belly: a soft transition a little below the flank's midline. */
const boundary = (s: number) => 1.78 + .06 * smoothstep(.05, .25, s) + .03 * noise(s * 11, 3);

/** Sandy back, yellower flanks, pale belly, with a faint cloudy unevenness so the sand colour is not flat. */
const skinColor = (s: number, theta: number, p: Vector3): RGB => {
  const cloud = .035 * noise(p.z * 17 + p.y * 9, 5) + .02 * noise(p.z * 53 + p.y * 31, 9);
  const upper = mix(BACK, FLANK, smoothstep(.1, 1.5, theta + cloud * 3));
  const lower = mix(upper, BELLY, smoothstep(boundary(s) - .24, boundary(s) + .24, theta));
  return mix(lower, BACK, clamp(cloud * 2.2, -.1, .1) * (1 - smoothstep(1.2, 2, theta)));
};

/**
 * A fin outline from `at(t)`, the leading and trailing edge positions at t = height / full height
 * (the two meet at t = 1), sampled densely toward the tip so its rounding survives.
 */
function outline(height: number, at: (t: number) => readonly [number, number], sink = .012) {
  const ts = [0, .05, .12, .2, .3, .4, .5, .6, .7, .8, .88, .93, .96, .98, 1];
  const le = ts.map((t) => [t * height, at(t)[0]] as const), te = ts.map((t) => [t * height, at(t)[1]] as const);
  // Below the skin the edges simply continue their slope.
  const below = (pts: typeof le) => (sink ? [[-sink, pts[0][1] - (pts[1][1] - pts[0][1]) / (pts[1][0] - pts[0][0]) * sink] as const] : []);
  return { le: [...below(le), ...le], te: [...below(te), ...te] };
}

export const LEMON_SHARK: SharkDesign = {
  rig, nose: .4, bodyEnd: .8,
  // A short, blunt, broad head; a thick body deepest under the first dorsal; a stout tail stock.
  width: [[0, 0], [.003, .02], [.01, .036], [.02, .048], [.035, .058], [.055, .066], [.08, .071], [.11, .074], [.15, .076], [.2, .078], [.27, .078], [.33, .076], [.4, .071], [.47, .062], [.54, .052], [.6, .042], [.66, .032], [.72, .024], [.77, .017], [.8, .0115]],
  top: [[0, 0], [.003, .014], [.01, .027], [.02, .036], [.035, .044], [.055, .05], [.08, .055], [.11, .06], [.15, .066], [.2, .073], [.27, .08], [.33, .084], [.4, .083], [.47, .077], [.54, .066], [.6, .054], [.66, .041], [.72, .03], [.77, .022], [.8, .017]],
  bottom: [[0, 0], [.003, .011], [.01, .022], [.02, .03], [.035, .037], [.055, .043], [.08, .048], [.11, .053], [.15, .059], [.2, .066], [.27, .072], [.33, .074], [.4, .071], [.47, .065], [.54, .056], [.6, .046], [.66, .037], [.72, .028], [.77, .021], [.8, .0165]],
  center: [[0, -.006], [.05, -.003], [.12, 0], [.3, 0], [.5, .002], [.8, .005]],
  squareTop: [[0, 2], [.08, 2.05], [.3, 2.1], [.6, 2.05], [.8, 2]],
  squareBottom: [[0, 2.2], [.08, 2.5], [.3, 2.4], [.6, 2.2], [.8, 2]],
  rings: 50, columnsAbove: 8, columnsBelow: 5,
  boundary, boundaryGap: .1,
  paint: skinColor,
};

/** A small dome eye set into the skin: a black pupil in a dark amber iris, ringed by a paler lid. */
function eyeball(ctx: SharkContext, s: number, theta: number, radius: number) {
  const { mesh } = ctx;
  const n = ctx.normal(s, theta), center = ctx.surface(s, theta, -.25 * radius);
  const t1 = (Math.abs(n.y) < .9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0)).cross(n).normalize(), t2 = n.clone().cross(t1);
  const weights = ctx.skin(s), segments = 12, rings = [.34, .7, 1];
  const colors: RGB[] = [EYE, mix(EYE, IRIS, .5), mix(IRIS, LID, .75)];
  mesh.begin();
  const top = mesh.vertex(center.clone().addScaledVector(n, radius * .6), EYE, weights);
  const rows = rings.map((r, k) => Array.from({ length: segments }, (_, i) => {
    const a = TAU * i / segments;
    const lift = radius * (.6 * Math.sqrt(Math.max(0, 1 - r * r)) + .02);
    const p = center.clone().addScaledVector(n, lift).addScaledVector(t1, Math.cos(a) * r * radius).addScaledVector(t2, Math.sin(a) * r * radius);
    return mesh.vertex(p, colors[k], weights);
  }));
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;
    mesh.tri(top, rows[0][i], rows[0][j]);
    for (let k = 0; k < rows.length - 1; k++) mesh.quad(rows[k][i], rows[k + 1][i], rows[k + 1][j], rows[k][j]);
  }
  // A shallow base so the shell is closed inside the skin.
  const base = mesh.vertex(center.clone().addScaledVector(n, -radius * .4), EYE, weights);
  for (let i = 0; i < segments; i++) mesh.tri(base, rows[rows.length - 1][(i + 1) % segments], rows[rows.length - 1][i]);
  mesh.end();
}

export function buildLemonShark() {
  const ctx = sharkContext(LEMON_SHARK);
  const { mesh, bones } = ctx;
  ctx.body();

  /** Fin colour: yellow-olive, paler toward the base and faintly darker along the rear margin (`u`, 0 at the front). */
  const finColor = (_p: Vector3, v: number, u: number) =>
    mix(mix(FIN, FIN_PALE, .5 * (1 - smoothstep(0, .5, v))), FIN_EDGE, .32 * smoothstep(.72, 1, u) + .1 * smoothstep(.8, 1, v));
  // Upright fins are lit from the side, so they get a paler tone to read as the same colour as the body.
  const sailColor = (p: Vector3, v: number, u: number) => mix(finColor(p, v, u), FIN_PALE, .5);

  // First dorsal: tall, a convex raked front edge and a concave rear edge ending in a long free tip.
  const dorsal = ctx.midlineFin({
    ...outline(.108, (t) => [.384 + .072 * t ** 1.4, .459 + .05 * (1 - t) ** 2.1 + .018 * Math.sqrt(1 - t) * t ** 8]),
    height: .108, thickness: .019, bone: 'Dorsal', stations: 10, color: sailColor,
  });
  // Second dorsal: almost as big as the first, and the anal fin just ahead of it matches.
  ctx.midlineFin({
    ...outline(.1, (t) => [.616 + .066 * t ** 1.4, .688 + .046 * (1 - t) ** 2.1 + .017 * Math.sqrt(1 - t) * t ** 8], .01),
    height: .1, thickness: .016, stations: 8, color: sailColor,
  });
  ctx.midlineFin({
    ...outline(.09, (t) => [.598 + .06 * t ** 1.4, .664 + .044 * (1 - t) ** 2.1 + .016 * Math.sqrt(1 - t) * t ** 8], .01),
    height: .09, thickness: .015, stations: 7, ventral: true,
    color: (p, v, u) => mix(sailColor(p, v, u), FIN_UNDER, .5 * (1 - .6 * v)),
  });
  // Broad, sickle-shaped pectorals: a wide base, a convex front edge sweeping back to a pointed tip, a
  // concave rear edge. Yellow-olive above, pale below.
  const pectorals = ctx.pairedFin({
    rootS: .222, theta: 2.02, span: .17, droop: .34, sweep: .1, thickness: .02, stations: 13,
    ...outline(.17, (t) => {
      const front = .145 * (.3 * t + .7 * t ** 2.1);
      return [front, front + .108 * (1 - t) ** 1.15 + .02 * Math.sqrt(1 - t) * t ** 4];
    }, 0),
    bone: (left) => (left ? 'PectoralL' : 'PectoralR'),
    color: (p, v, u, _left, face) => (face > 0 ? finColor(p, v, u) : mix(FIN_UNDER, FIN_PALE, .35 * v + .2 * u)),
  });
  // Pelvic fins: small, broad-based and swept back to a rounded point.
  ctx.pairedFin({
    rootS: .55, theta: 2.45, span: .065, droop: .8, sweep: .15, thickness: .011, stations: 5,
    ...outline(.065, (t) => {
      const front = .04 * (.4 * t + .6 * t ** 2);
      return [front, front + .068 * (1 - t) ** 1.2 + .01 * Math.sqrt(1 - t) * t ** 3];
    }, 0),
    color: (_p, v, u, _left, face) => mix(face > 0 ? FIN : FIN_UNDER, FIN_PALE, .3 * v + .1 * u),
  });
  const axis = ctx.center(rig.joints[4]);
  // Heterocercal tail: a long, broad upper lobe with a notch near its tip, a good lower lobe.
  const tail = ctx.caudalFin({
    low: axis - .09, high: axis + .165,
    le: [[axis - .09, .935], [axis - .07, .905], [axis - .045, .865], [axis - .02, .828], [axis - .006, .802], [axis + .006, .792], [axis + .025, .802], [axis + .05, .826], [axis + .08, .862], [axis + .11, .9], [axis + .135, .938], [axis + .15, .965], [axis + .158, .982], [axis + .165, 1]],
    te: [[axis - .09, .935], [axis - .075, .93], [axis - .05, .915], [axis - .025, .895], [axis, .872], [axis + .025, .889], [axis + .055, .915], [axis + .085, .942], [axis + .11, .962], [axis + .13, .975], [axis + .143, .978], [axis + .15, .973], [axis + .158, .983], [axis + .165, 1]],
    thickness: (y) => .004 + .016 * Math.max(0, 1 - Math.abs(y - axis) / .11) ** 1.2,
    upperPivot: .05, lowerPivot: .04, stations: 21,
    color: (p, v, u) => mix(sailColor(p, v, u), FIN_PALE, p.y < axis ? .25 : 0),
  });
  // Small, round, dark eyes, set a little above the mouth corners.
  for (const side of [1, -1]) eyeball(ctx, .088, side * 1.4, .0072);
  // Five short gill slits, the last a little shorter and curving over the pectoral base.
  [[.164, 1.32, 2.0], [.1745, 1.34, 2.0], [.185, 1.36, 1.98], [.1955, 1.39, 1.95], [.206, 1.45, 1.9]].forEach(([s, top, bottom]) => {
    ctx.gills({ from: s, to: s, count: 1, top, bottom, halfWidth: .0019, slant: .007, color: GILL });
  });
  // A broad, gentle arc of a mouth under the snout: a dark gape with a pale upper lip just ahead of it.
  const mouth = (shift: number) => Array.from({ length: 11 }, (_, i) => {
    const t = i / 10, theta = Math.PI + (t - .5) * 1.6;
    return [.062 - shift + .032 * (2 * t - 1) ** 2, theta] as const;
  });
  ctx.ribbon(mouth(.0045), (t) => .0016 * (.45 + .55 * Math.sin(Math.PI * t)), LIP, .0006);
  ctx.ribbon(mouth(0), (t) => .0018 * (.3 + .7 * Math.sin(Math.PI * t)), MOUTH, .001);
  for (const side of [1, -1]) {
    // Labial furrows running back from the mouth corners, and the slanting nostrils ahead of the mouth.
    ctx.ribbon([[.092, side * (Math.PI - .8)], [.101, side * (Math.PI - .87)], [.11, side * (Math.PI - .96)]], (t) => .0011 * Math.sin(Math.PI * (.1 + .8 * t)) ** .5, MOUTH, .001);
    ctx.ribbon(Array.from({ length: 5 }, (_, i) => [.027 + .014 * i / 4, side * (Math.PI - .5 - .2 * i / 4)] as const),
      (t) => .0019 * Math.sin(Math.PI * (.12 + .76 * t)) ** .6, NARE, .001);
  }

  // The precaudal pits, a pair of shallow notches above and below the base of the tail.
  for (const [theta, color] of [[0, mix(BACK, FIN_EDGE, .55)], [Math.PI, mix(BELLY, FIN_EDGE, .45)]] as const) {
    ctx.ribbon(Array.from({ length: 7 }, (_, i) => {
      const t = i / 6, a = (t - .5) * .9;
      return [.768 + .006 * (2 * t - 1) ** 2, theta === 0 ? a : Math.PI + a] as const;
    }), (t) => .0016 * Math.sin(Math.PI * (.1 + .8 * t)) ** .6, color, .0008);
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
