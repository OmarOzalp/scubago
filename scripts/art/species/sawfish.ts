/**
 * Largetooth sawfish (Pristis pristis): a ray built like a shark. A long, flat, blade-like saw (the
 * rostrum, about a quarter of the length) broad at the base and tapering only slightly to a blunt tip,
 * set along both edges with evenly spaced, peg-like teeth that stand out sideways like the tines of a
 * comb. Behind it a flattened, triangular head with the small eyes on top and the spiracles just behind
 * them; the mouth and the five pairs of gill slits are on the underside. The pectorals are broad,
 * angular triangles that begin on the sides of the head, with no break between head and fin; the body
 * behind is stout and round, with two tall dorsal fins of nearly equal size (the first rising in front
 * of the pelvics), and a shark-like tail with a long upper lobe and a distinct lower one. Olive grey-brown
 * above, cream below, with ivory teeth and no spots.
 */
import { Vector3 } from 'three';
import { SWIM_RIGS, type SharkRig } from '../../../src/lib/marine-rigs';
import { hex, mix, noise, smoothstep, TAU, type RGB, type Skin } from './kit';
import { sharkContext, type SharkContext, type SharkDesign } from './shark';

const SPINE = hex('#5f5943'), BACK = hex('#6d6750'), FLANK = hex('#8a8466'), BELLY = hex('#eee8d4');
const EDGE = hex('#b3a77f');
const SAW = hex('#857b60'), SAW_EDGE = hex('#a89d7c'), SAW_UNDER = hex('#e2dbc4');
const TOOTH = hex('#e7dfc6'), TOOTH_ROOT = hex('#b3a782');
const GILL = hex('#4f4833'), EYE = hex('#070806'), IRIS = hex('#4a3b1c'), MOUTH = hex('#5b5239'), JAW = hex('#d6cdaf'), SPIRACLE = hex('#4a432f');

const rig = SWIM_RIGS.sawfish as SharkRig;

/** Axial position (from the saw tip) where the saw ends and the head begins to flare. */
const SAW_END = .225;

/** Where the dark back meets the cream underside: along the flat flank edge, a little lower on the rounder body. */
const boundary = (s: number) => 1.53 + .22 * smoothstep(.25, .62, s);

const skinColor = (s: number, theta: number, p: Vector3): RGB => {
  const saw = 1 - smoothstep(SAW_END - .012, SAW_END + .03, s);
  let upper = mix(mix(SPINE, BACK, smoothstep(.05, .7, theta)), FLANK, smoothstep(.5, 1.5, theta));
  // The saw is greyer, a little paler along the edges where the teeth are set.
  upper = mix(upper, SAW, saw);
  upper = mix(upper, SAW_EDGE, saw * .85 * smoothstep(.9, 1.45, theta));
  // A faint, irregular mottling keeps the hide from reading as flat plastic.
  upper = mix(upper, FLANK, .08 * noise(p.z * 58 + p.x * 46, 3));
  const under = mix(BELLY, SAW_UNDER, saw);
  return mix(upper, under, smoothstep(boundary(s) - .03, boundary(s) + .03, theta));
};

/** Section stations along the body: sparse along the straight saw, dense where the head flares. */
const STATIONS = [.0012, .005, .011, .02, .045, .09, .15, .2, .225, .235, .245, .255, .265, .277, .29, .305, .32, .34, .36, .4, .44, .48, .52, .56, .6, .64, .68, .72, .76, .8];

export const SAWFISH: SharkDesign = {
  rig, nose: .4, bodyEnd: .8,
  // A long flat plank for the saw, then a flat triangular head that flares into the pectoral girdle,
  // then a stout, rounder body narrowing to the tail stock.
  width: [[0, 0], [.003, .0068], [.011, .0098], [.03, .0112], [.08, .0138], [.14, .0170], [.2, .0200], [.225, .0235], [.245, .0335], [.265, .043], [.29, .0525], [.32, .0575], [.36, .0595], [.4, .0585], [.45, .0545], [.5, .0495], [.55, .0435], [.6, .0372], [.66, .0295], [.72, .0222], [.77, .0140], [.8, .0078]],
  top: [[0, 0], [.003, .0034], [.011, .0052], [.03, .0062], [.1, .0068], [.2, .0072], [.225, .0088], [.25, .0132], [.28, .0185], [.32, .0242], [.36, .0295], [.42, .0372], [.48, .0438], [.52, .0465], [.58, .0438], [.64, .0362], [.7, .028], [.75, .0202], [.8, .0115]],
  bottom: [[0, 0], [.003, .003], [.011, .0045], [.03, .0052], [.1, .0058], [.2, .0062], [.225, .0072], [.25, .0098], [.28, .0142], [.32, .0188], [.36, .024], [.42, .031], [.48, .0365], [.52, .039], [.58, .036], [.64, .0298], [.7, .0232], [.75, .0163], [.8, .0088]],
  center: [[0, -.003], [.2, -.003], [.3, 0], [.5, .003], [.8, .007]],
  squareTop: [[0, 2.6], [.19, 3.2], [.25, 3], [.35, 2.6], [.5, 2.2], [.8, 2]],
  squareBottom: [[0, 3], [.19, 3.6], [.25, 3.2], [.35, 2.8], [.5, 2.4], [.8, 2]],
  rings: STATIONS.length, columnsAbove: 8, columnsBelow: 5,
  boundary, boundaryGap: .03,
  paint: skinColor,
};

/** The body loft on this species' own stations (the shared one spaces its rings for a shark's snout). */
function loft(ctx: SharkContext) {
  const { mesh, raw, skin, z, design } = ctx;
  const fold = (theta: number) => Math.abs(Math.atan2(Math.sin(theta), Math.cos(theta)));
  const columns = (s: number) => {
    const b = design.boundary(s), gap = design.boundaryGap;
    const side: number[] = [];
    for (let i = 0; i <= design.columnsAbove; i++) side.push((b - gap) * i / design.columnsAbove);
    for (let i = 0; i <= design.columnsBelow; i++) side.push(b + gap + (Math.PI - b - gap) * i / design.columnsBelow);
    return [...side, ...side.slice(1, -1).reverse().map((t) => TAU - t)];
  };
  mesh.begin();
  const rows = STATIONS.map((s) => columns(s).map((theta) => {
    const p = raw(s, theta);
    return mesh.vertex(p, design.paint(s, fold(theta), p), skin(s));
  }));
  const m = rows[0].length;
  for (let j = 0; j < rows.length - 1; j++) {
    for (let k = 0; k < m; k++) mesh.quad(rows[j][k], rows[j][(k + 1) % m], rows[j + 1][(k + 1) % m], rows[j + 1][k]);
  }
  const tip = new Vector3(0, ctx.center(0), z(0));
  const c = mesh.vertex(tip, design.paint(0, 0, tip), skin(0));
  for (let k = 0; k < m; k++) mesh.tri(c, rows[0][(k + 1) % m], rows[0][k]);
  const last = rows[rows.length - 1];
  const endPoint = new Vector3(0, ctx.center(design.bodyEnd), z(design.bodyEnd) - .004);
  const e = mesh.vertex(endPoint, design.paint(design.bodyEnd, Math.PI / 2, endPoint), skin(design.bodyEnd));
  for (let k = 0; k < m; k++) mesh.tri(e, last[k], last[(k + 1) % m]);
  mesh.end();
}

/** One rostral tooth: a short peg with a rounded-off point, curving a little backward, its base buried in the saw. */
function peg(ctx: SharkContext, from: Vector3, dir: Vector3, length: number, radius: number, weights: Skin) {
  const { mesh } = ctx;
  const w = dir.clone().normalize();
  const up = new Vector3(0, 1, 0), across = w.clone().cross(up).normalize();
  const bow = new Vector3(0, 0, -.22 * length);
  const sides = 5;
  const stops = [[0, 1], [.76, .6]] as const;
  const radial = new Map<number, Vector3>();
  mesh.begin();
  const rings = stops.map(([t, r]) => {
    const center = from.clone().addScaledVector(w, length * t).addScaledVector(bow, t * t);
    const color = mix(TOOTH_ROOT, TOOTH, smoothstep(.02, .45, t));
    return Array.from({ length: sides }, (_, i) => {
      const a = TAU * i / sides + .3;
      const out = across.clone().multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a) * .85);
      const id = mesh.vertex(center.clone().addScaledVector(out, radius * r), color, weights);
      radial.set(id, out);
      return id;
    });
  });
  const tip = mesh.vertex(from.clone().addScaledVector(w, length).add(bow), TOOTH, weights);
  radial.set(tip, w);
  for (let i = 0; i < sides; i++) {
    mesh.quad(rings[0][i], rings[0][(i + 1) % sides], rings[1][(i + 1) % sides], rings[1][i]);
    mesh.tri(tip, rings[1][i], rings[1][(i + 1) % sides]);
  }
  mesh.end({ closed: false, outward: (i) => radial.get(i) ?? w });
}

const TEETH = 20, TOOTH_FIRST = .038, TOOTH_LAST = .212;

/** Evenly spaced teeth along both edges of the saw, a little shorter and finer toward the tip. */
function teeth(ctx: SharkContext) {
  const { width, center, z, skin } = ctx;
  const back = .2;
  for (let i = 0; i < TEETH; i++) {
    const t = i / (TEETH - 1);
    const s = TOOTH_FIRST + (TOOTH_LAST - TOOTH_FIRST) * t;
    for (const side of [1, -1]) {
      const dir = new Vector3(side * Math.cos(back), 0, -Math.sin(back));
      const embed = .004, visible = .0158 + .0032 * t;
      const edge = new Vector3(side * width(s), center(s), z(s));
      peg(ctx, edge.addScaledVector(dir, -embed), dir, visible + embed, .0042 + .0004 * t, skin(s));
    }
  }
}

/**
 * A fin outline from `at(t)`, the leading and trailing edge positions at t = height / full height
 * (the two meet at t = 1), sampled densely toward the tip so its rounding survives.
 */
function outline(height: number, at: (t: number) => readonly [number, number], sink = .012) {
  const ts = [0, .05, .12, .2, .3, .4, .5, .6, .7, .8, .88, .93, .96, .98, 1];
  const le = ts.map((t) => [t * height, at(t)[0]] as const), te = ts.map((t) => [t * height, at(t)[1]] as const);
  const below = (pts: typeof le) => (sink ? [[-sink, pts[0][1] - (pts[1][1] - pts[0][1]) / (pts[1][0] - pts[0][0]) * sink] as const] : []);
  return { le: [...below(le), ...le], te: [...below(te), ...te] };
}

export function buildSawfish() {
  const ctx = sharkContext(SAWFISH);
  const { mesh, bones } = ctx;
  loft(ctx);
  teeth(ctx);

  /** Fins are the back colour, a touch paler toward their free edges. */
  const finColor = (_p: Vector3, v: number, u: number) => mix(mix(BACK, FLANK, .25 + .35 * v + .25 * u), EDGE, .4 * smoothstep(.86, 1, u));

  // Two tall dorsals of nearly equal size, each a raked triangle with a concave rear edge.
  const dorsal = ctx.midlineFin({
    ...outline(.115, (t) => [.445 + .062 * t ** 1.2, .507 + .04 * (1 - t) ** 1.9 + .012 * Math.sqrt(1 - t) * t ** 8]),
    height: .115, thickness: .017, bone: 'Dorsal', stations: 12, color: finColor,
  });
  ctx.midlineFin({
    ...outline(.106, (t) => [.618 + .052 * t ** 1.2, .668 + .026 * (1 - t) ** 1.9 + .011 * Math.sqrt(1 - t) * t ** 8]),
    height: .106, thickness: .016, stations: 11, color: finColor,
  });

  // Broad triangular pectorals that begin on the side of the head: the front edge runs on out from the
  // head's flare in a long, slightly convex sweep to an angular tip, the rear edge nearly straight back to the pelvic origin.
  const SPAN = .13, SINK = .01, B = SPAN + SINK;
  const ts = [0, .1, .2, .3, .4, .5, .6, .7, .8, .88, .92, .95, .97, .985, 1];
  // Front and rear edges, then the corner at the tip rounded off a little so it is angular, not needle-sharp.
  const edge = (t: number) => {
    const front = B * (1.3 * t - .15 * t * t), rear = B * (1.4 - .25 * t + .03 * Math.sin(Math.PI * t));
    const round = t < .9 ? 1 : Math.sqrt(Math.max(0, 1 - ((t - .9) / .1) ** 2));
    const mid = (front + rear) / 2, half = (rear - front) / 2 * round;
    return [mid - half, mid + half] as const;
  };
  const pectorals = ctx.pairedFin({
    rootS: .25, theta: 1.75, span: SPAN, droop: .1, sweep: 0, thickness: .013, stations: 15, sink: SINK,
    le: ts.map((t) => [t * B, edge(t)[0]] as const),
    te: ts.map((t) => [t * B, edge(t)[1]] as const),
    bone: (left) => (left ? 'PectoralL' : 'PectoralR'),
    color: (_p, v, u, _left, face) => (face > 0 ? mix(mix(BACK, FLANK, .2 + .3 * u + .2 * v), EDGE, .55 * smoothstep(.86, 1, u)) : mix(BELLY, SAW_UNDER, .4 * v)),
  });
  // Small pelvics under the first dorsal's rear half.
  ctx.pairedFin({
    rootS: .495, theta: 2.35, span: .06, droop: .7, sweep: .15, thickness: .009, stations: 5,
    le: [[-.01, 0], [0, 0], [.025, .014], [.06, .042]],
    te: [[-.01, .056], [0, .057], [.025, .054], [.05, .048], [.06, .042]],
    color: (_p, v, _u, _left, face) => (face > 0 ? mix(BACK, FLANK, .4) : mix(BELLY, SAW_UNDER, .3 * v)),
  });

  const axis = ctx.center(rig.joints[4]);
  // A heterocercal tail: a long, tapering upper lobe with only a shallow notch, and a distinct, well-developed lower lobe.
  const tail = ctx.caudalFin({
    low: axis - .07, high: axis + .135,
    le: [[axis - .07, .93], [axis - .05, .895], [axis - .03, .852], [axis - .01, .81], [axis + .004, .782], [axis + .02, .786], [axis + .05, .822], [axis + .08, .868], [axis + .105, .915], [axis + .125, .96], [axis + .135, 1]],
    te: [[axis - .07, .93], [axis - .05, .925], [axis - .03, .905], [axis - .008, .885], [axis + .008, .875], [axis + .035, .9], [axis + .065, .94], [axis + .095, .972], [axis + .115, .986], [axis + .135, 1]],
    thickness: (y) => .004 + .015 * Math.max(0, 1 - Math.abs(y - axis) / .12) ** 1.2,
    upperPivot: .05, lowerPivot: .035, stations: 24,
    color: (_p, v, u) => mix(mix(BACK, FLANK, .15 + .3 * u + .1 * v), EDGE, .4 * smoothstep(.86, 1, u)),
  });

  // Small dark eyes on top of the head, the spiracles just behind them.
  ctx.eyes({ s: .247, theta: 1.0, radius: .0058, color: IRIS, sink: .35 });
  ctx.eyes({ s: .2455, theta: .985, radius: .0034, color: EYE, sink: -.2 });
  for (const side of [1, -1]) {
    const line = Array.from({ length: 5 }, (_, i) => [.27 + .015 * i / 4, side * (.84 - .08 * i / 4)] as const);
    ctx.ribbon(line, (t) => .0022 * Math.sin(Math.PI * (.1 + .8 * t)), SPIRACLE, .0008);
  }

  // Underside: a broad crescent mouth over a faintly darker jaw band, the nostrils ahead of it, and five pairs of gill slits.
  ctx.ribbon(Array.from({ length: 11 }, (_, i) => {
    const t = i / 10;
    return [.2785 - .006 * (1 - (2 * t - 1) ** 2), Math.PI + (t - .5) * 1.05] as const;
  }), (t) => .0046 * Math.sin(Math.PI * (.04 + .92 * t)) ** .8, JAW, .0004);
  ctx.ribbon(Array.from({ length: 11 }, (_, i) => {
    const t = i / 10;
    return [.274 - .006 * (1 - (2 * t - 1) ** 2), Math.PI + (t - .5) * 1.1] as const;
  }), (t) => .0024 * (.35 + .65 * Math.sin(Math.PI * t) ** .6), MOUTH);
  for (const side of [1, -1]) {
    ctx.ribbon(Array.from({ length: 4 }, (_, i) => [.252 + .006 * i / 3, side * (2.55 + .12 * i / 3)] as const), (t) => .0016 * Math.sin(Math.PI * (.1 + .8 * t)), MOUTH);
  }
  ctx.gills({ from: .326, to: .392, count: 5, top: 2.42, bottom: 2.95, halfWidth: .0017, slant: .01, color: GILL });

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
