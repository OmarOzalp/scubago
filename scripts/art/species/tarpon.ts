/**
 * Tarpon (Megalops atlanticus): the "silver king", a big, elongate, laterally compressed herring cousin
 * up to two and a half metres long, deepest about the dorsal fin with a fairly straight back and belly.
 * The head is large, with a steeply upturned mouth whose lower jaw juts past the snout over a long bony
 * plate between the jaw bones, a huge eye and a big gill cover. The body is armoured in enormous,
 * round-edged, mirror-bright scales, each the size of a palm, laid in clear staggered rows. One short
 * triangular dorsal fin sits at mid-body, its last ray drawn out into a long, thin filament trailing
 * toward the tail; the anal fin is short-based and falcate with a slightly long last ray; the pectorals
 * are low behind the gill cover, the pelvics under the dorsal, and the tail is a big, deeply forked fin
 * with long pointed lobes. Dark blue-green over the back, chrome silver flanks (a touch of brass on the
 * cheek), a white belly and dusky fins, the tail darkest at its edges.
 */
import { Vector3 } from 'three';
import { SWIM_RIGS, type SharkRig } from '../../../src/lib/marine-rigs';
import { blendSkins, clamp, curve, fin, hex, mix, noise, smoothstep, TAU, type RGB, type Skin } from './kit';
import { sharkContext, type SharkContext, type SharkDesign } from './shark';

// Body: a dark blue-green back, a slate shoulder and a mirror-bright silver flank over a white belly.
const BACK = hex('#1a2f37'), NAPE = hex('#2b4952'), UPPER = hex('#6b8f99'), SILVER = hex('#f4f6f2'), LOWER = hex('#d6dfe0'), SHEEN = hex('#ffffff'), BELLY = hex('#fdfefd');
const BRASS = hex('#f3e2a6');
// Scale margins, from a dark slate high on the flank to a faint grey low on it.
const EDGE_DARK = hex('#6a838c'), EDGE_MID = hex('#a2b3b9'), EDGE_BACK = hex('#6f929c');
// Fins.
const FIN = hex('#63767d'), FIN_DARK = hex('#34444b'), TAIL = hex('#2c3a41'), FIN_PALE = hex('#b3c1c3'), PELVIC = hex('#c2cdce');
// Head details.
const IRIS = hex('#e6d28c'), IRIS_RING = hex('#a58d3e'), PUPIL = hex('#05080a'), LID = hex('#c3d0ce'), MOUTH = hex('#262a2d'), NOSTRIL = hex('#1f2b31');
const GILL_RIM = hex('#f4f8f6'), GILL_LINE = hex('#6d8189'), PLATE = hex('#f6f6f0'), PLATE_EDGE = hex('#cdd3cf'), LATERAL = hex('#6e8790');

const rig = SWIM_RIGS.tarpon as SharkRig;

// Body sections: [s, back y, belly y, half width]. The lower jaw tip is the most forward point and sits
// low; the snout above it falls back steeply, then the forehead runs up in a long straight slope to a
// fairly flat back, deepest about a third of the way along.
const SECTIONS: readonly (readonly [number, number, number, number])[] = [
  [0, -.034, -.07, .012],
  [.007, -.024, -.075, .022],
  [.015, -.01, -.08, .031],
  [.028, .006, -.086, .038],
  [.048, .027, -.094, .044],
  [.075, .047, -.1, .048],
  [.105, .065, -.106, .05],
  [.14, .081, -.11, .05],
  [.19, .093, -.112, .05],
  [.25, .1, -.114, .05],
  [.33, .104, -.113, .049],
  [.41, .102, -.108, .046],
  [.48, .095, -.1, .042],
  [.55, .083, -.089, .036],
  [.62, .066, -.073, .029],
  [.69, .05, -.057, .021],
  [.75, .037, -.043, .014],
  [.8, .028, -.032, .009],
];
const column = (pick: (row: readonly number[]) => number) => SECTIONS.map((row) => [row[0], pick(row)] as const);
const SQUARE = [[0, 2.1], [.2, 2.3], [.5, 2.3], [.8, 2.1]] as const;

/** Height of the mouth line at axial position s: steep at the jutting lower jaw's tip, flattening toward the corner under the eye. */
const cleftY = (s: number) => -.068 + .06 * (clamp(s / .105)) ** .8;

const skin = (s: number, theta: number, p: Vector3): RGB => {
  // The dark back reaches a little lower on the head; the flank reflects like a mirror: a blazing shoulder
  // band, a cooler lower flank and a white belly, each scale catching the light a little differently.
  const head = 1 - smoothstep(.08, .3, s);
  const t = theta - .3 * head + .04 * noise(p.z * 34 + p.y * 18, 3);
  const glint = .5 + .5 * noise(p.z * 52 + p.y * 40, 9);
  const back = mix(mix(BACK, NAPE, head), UPPER, smoothstep(.28, .68, t));
  const flank = mix(back, SILVER, smoothstep(.56, .92, t));
  const band = smoothstep(.66, .98, t) * (1 - smoothstep(1.55, 1.95, t));
  // Slow patches where the flank mirrors a brighter or darker stretch of water.
  const patch = noise(p.z * 8 + Math.sin(t) * 1.5, 12);
  const shoulder = mix(mix(flank, SHEEN, band * (.75 + .25 * glint)), mix(flank, UPPER, .35), band * Math.max(0, patch - .35) * .8);
  const lower = mix(shoulder, LOWER, smoothstep(1.6, 2.05, t) * (1 - smoothstep(2.25, 2.6, t)) * (.7 + .3 * glint));
  const belly = mix(lower, BELLY, smoothstep(2.2, 2.65, t));
  // A faint wash of brass over the cheek and gill cover.
  const cheek = smoothstep(.07, .12, s) * (1 - smoothstep(.215, .245, s)) * smoothstep(.9, 1.4, t);
  const face = mix(belly, BRASS, .18 * cheek);
  // Two-tone head: slate above the mouth line, bright silver on the lower jaw below it.
  const above = smoothstep(-.014, .014, p.y - cleftY(s)) * (1 - smoothstep(.07, .13, s));
  return mix(face, UPPER, .8 * above * smoothstep(.0, .5, theta));
};

export const TARPON: SharkDesign = {
  rig, nose: .4, bodyEnd: .8, frontDome: .01,
  width: column((r) => r[3]),
  top: column((r) => (r[1] - r[2]) / 2),
  bottom: column((r) => (r[1] - r[2]) / 2),
  center: column((r) => (r[1] + r[2]) / 2),
  squareTop: SQUARE.map(([s, v]) => [s, v] as const),
  squareBottom: SQUARE.map(([s, v]) => [s, v] as const),
  rings: 27, columnsAbove: 5, columnsBelow: 5,
  boundary: () => Math.PI / 2, boundaryGap: .12,
  paint: skin,
};

/** A thin curved ray in the midline plane, drawn out behind a fin's base: points of [axial position, height off the skin]. */
function filament(ctx: SharkContext, options: {
  path: readonly (readonly [number, number])[]; width: number; ventral?: boolean; bone?: string; color: (v: number) => RGB; stations?: number;
}) {
  const height = curve(options.path);
  const [s0] = options.path[0], [s1] = options.path[options.path.length - 1];
  const edge = options.ventral ? ctx.yBottom : ctx.yTop;
  const sign = options.ventral ? -1 : 1;
  const at = (v: number) => {
    const s = s0 + (s1 - s0) * v;
    return new Vector3(0, edge(s) + sign * height(s), ctx.z(s));
  };
  fin(ctx.mesh, {
    stations: options.stations ?? 7, chordPoints: 3, spacing: (t) => t,
    le: (v) => at(v).add(new Vector3(0, options.width * (1 - .7 * v) * .5, 0)),
    te: (v) => at(v).add(new Vector3(0, -options.width * (1 - .7 * v) * .5, 0)),
    thickness: (v) => .0022 * (1 - .6 * v),
    side: new Vector3(1, 0, 0),
    color: (_p, v) => options.color(v),
    skin: (p, v): Skin => {
      const base = ctx.skin(ctx.sOf(p.z));
      return options.bone ? blendSkins(base, { [options.bone]: 1 }, 1 - smoothstep(.25, .8, v)) : base;
    },
  });
}

/** A ribbon decal whose color follows the surface position (the kit's ribbon takes one color per strip). */
function strip(ctx: SharkContext, line: readonly (readonly [number, number])[], halfWidth: (t: number) => number,
  color: (t: number, s: number, theta: number, behind: boolean) => RGB, lift = .001) {
  const { mesh, raw, normal, surface, skin: weights } = ctx;
  mesh.begin();
  const ids: number[][] = [];
  line.forEach(([s, theta], i) => {
    const t = i / (line.length - 1);
    const [s0, t0] = line[Math.max(0, i - 1)], [s1, t1] = line[Math.min(line.length - 1, i + 1)];
    const tangent = raw(s1, t1).sub(raw(s0, t0)).normalize();
    const across = normal(s, theta).cross(tangent).normalize();
    const gs = raw(s + .002, theta).sub(raw(s - .002, theta)).divideScalar(.004);
    const gt = raw(s, theta + .01).sub(raw(s, theta - .01)).divideScalar(.02);
    const w = halfWidth(t);
    const ds = across.dot(gs) / gs.lengthSq() * w, dt = across.dot(gt) / gt.lengthSq() * w;
    ids.push([1, -1].map((sign) => {
      const ps = clamp(s + sign * ds, 0, ctx.design.bodyEnd), pt = theta + sign * dt;
      return mesh.vertex(surface(ps, pt, lift), color(t, s, theta, sign * ds > 0), weights(ps), normal(ps, pt));
    }));
  });
  for (let i = 0; i < ids.length - 1; i++) mesh.quad(ids[i][0], ids[i][1], ids[i + 1][1], ids[i + 1][0]);
  mesh.end({ closed: false, normals: false, outward: (i) => new Vector3(mesh.normals[i * 3], mesh.normals[i * 3 + 1], mesh.normals[i * 3 + 2]) });
}

/**
 * The lower jaw's tip: a small swept loft that juts past the snout and curls up, skinned to the head. Its top
 * edge is dark, the lining of the closed mouth, so the lip reads as a crisp line against the upper jaw.
 * Stations are [axial position, height, half width, half height].
 */
function chin(ctx: SharkContext) {
  const { mesh } = ctx;
  const stations = [[.045, -.0745, .026, .0095], [.03, -.0725, .0245, .0095], [.014, -.0695, .0215, .0093], [0, -.0665, .0178, .009], [-.012, -.0635, .0148, .0088], [-.024, -.0575, .0108, .0078], [-.032, -.0545, .0058, .005]];
  const sides = 8;
  mesh.begin();
  const rings = stations.map(([s, y, w, h]) => Array.from({ length: sides }, (_, i) => {
    const a = TAU * i / sides;
    const top = Math.max(0, Math.sin(a)) ** 3;
    const p = new Vector3(w * Math.cos(a), y + h * Math.sin(a), ctx.z(s));
    // The same paint as the head it grows from, with the mouth's dark lining along the top edge.
    const color = mix(skin(.02, Math.PI / 2 - 1.1 * Math.sin(a), p), MOUTH, top);
    return mesh.vertex(p, color, ctx.skin(Math.max(0, s)));
  }));
  for (let j = 0; j < rings.length - 1; j++) {
    for (let i = 0; i < sides; i++) mesh.quad(rings[j][i], rings[j][(i + 1) % sides], rings[j + 1][(i + 1) % sides], rings[j + 1][i]);
  }
  const [s0, y0] = stations[0], [s1, y1] = stations[stations.length - 1];
  const back = mesh.vertex(new Vector3(0, y0, ctx.z(s0)), SILVER, ctx.skin(s0));
  const tip = mesh.vertex(new Vector3(0, y1, ctx.z(s1)), MOUTH, ctx.skin(0));
  for (let i = 0; i < sides; i++) {
    mesh.tri(back, rings[0][(i + 1) % sides], rings[0][i]);
    mesh.tri(tip, rings[rings.length - 1][i], rings[rings.length - 1][(i + 1) % sides]);
  }
  mesh.end();
}

/**
 * The eye: a flattened dome sunk into the head, a black pupil, a gold iris with a darker rim and a pale lid ring, each band
 * its own ring of vertices so the edges between them stay crisp.
 */
function eyeball(ctx: SharkContext, s: number, theta: number, radius: number, sink = .3) {
  const { mesh } = ctx;
  const n = ctx.normal(s, theta);
  const center = ctx.surface(s, theta, -sink * radius);
  const t1 = new Vector3(0, 1, 0).cross(n).normalize(), t2 = n.clone().cross(t1);
  const R = radius * 1.22, H = radius * .56, segments = 10;
  const stops = [
    { phi: Math.asin(.5 / 1.22), color: PUPIL },
    { phi: Math.asin(.76 / 1.22), color: IRIS },
    { phi: Math.asin(1 / 1.22), color: IRIS_RING },
    { phi: Math.PI * .47, color: LID },
  ];
  const ring = (phi: number, color: RGB) => Array.from({ length: segments }, (_, i) => {
    const a = TAU * i / segments;
    const p = center.clone().addScaledVector(n, Math.cos(phi) * H)
      .addScaledVector(t1, Math.sin(phi) * Math.cos(a) * R).addScaledVector(t2, Math.sin(phi) * Math.sin(a) * R);
    return mesh.vertex(p, color, ctx.skin(s));
  });
  mesh.begin();
  const apex = mesh.vertex(center.clone().addScaledVector(n, H), PUPIL, ctx.skin(s));
  let inner = ring(stops[0].phi, PUPIL);
  for (let i = 0; i < segments; i++) mesh.tri(apex, inner[i], inner[(i + 1) % segments]);
  stops.slice(1).forEach((stop, k) => {
    const from = ring(stops[k].phi, stop.color), to = ring(stop.phi, stop.color);
    for (let i = 0; i < segments; i++) mesh.quad(from[i], to[i], to[(i + 1) % segments], from[(i + 1) % segments]);
    inner = to;
  });
  mesh.end({ closed: false, outward: () => n });
}

export function buildTarpon() {
  const ctx = sharkContext(TARPON);
  const { mesh, bones } = ctx;
  ctx.body();
  chin(ctx);
  const squareAt = curve(SQUARE.map(([s, v]) => [s, v] as const));

  /** The angle round the body at axial position s of the flank point at height y. */
  const angle = (s: number, y: number) => {
    const c = ctx.center(s), up = y >= c;
    const f = clamp(Math.abs(y - c) / (up ? ctx.top(s) : ctx.bottom(s)), 0, 1);
    return Math.acos((up ? 1 : -1) * f ** (squareAt(s) / 2));
  };
  /** A flank line given as [s, y] points, as [s, theta] points on one side. */
  const flank = (side: number, points: readonly (readonly [number, number])[]) => points.map(([s, y]) => [s, side * angle(s, y)] as const);

  // Dorsal: one short triangular fin at mid-body, tallest at its front rays, the rear edge concave.
  const dorsal = ctx.midlineFin({
    le: [[-.012, .424], [0, .427], [.03, .435], [.06, .445], [.094, .457]],
    te: [[-.012, .516], [0, .514], [.012, .503], [.03, .49], [.05, .478], [.072, .466], [.094, .457]],
    height: .094, thickness: .008, stations: 8, chordPoints: 5, bone: 'Dorsal',
    color: (_p, v, u) => mix(mix(FIN_PALE, FIN, smoothstep(0, .35, v)), FIN_DARK, .55 * smoothstep(.3, 1, v) + .2 * (1 - u)),
  });
  // Its last ray, drawn out into a long thread that arcs up and trails back along the body.
  filament(ctx, {
    path: [[.512, -.004], [.533, .011], [.562, .026], [.605, .036], [.655, .035], [.705, .027], [.75, .016]], width: .007, bone: 'Dorsal', stations: 8,
    color: (v) => mix(FIN, FIN_DARK, .5 + .4 * v),
  });
  // The anal fin: a short, falcate base under the dorsal's thread, its last ray a little long.
  ctx.midlineFin({
    le: [[-.012, .552], [0, .555], [.02, .563], [.045, .574], [.058, .582]],
    te: [[-.012, .672], [0, .67], [.01, .655], [.025, .63], [.04, .607], [.05, .592], [.058, .582]],
    height: .058, thickness: .008, stations: 8, chordPoints: 5, ventral: true,
    color: (_p, v, u) => mix(mix(FIN_PALE, FIN, smoothstep(0, .4, v)), FIN_DARK, .4 * smoothstep(.4, 1, v) + .12 * (1 - u)),
  });
  filament(ctx, {
    path: [[.668, -.003], [.69, .012], [.715, .02], [.74, .018]], width: .005, ventral: true, stations: 5,
    color: (v) => mix(FIN, FIN_DARK, .4 + .3 * v),
  });
  // Small pelvic fins under the dorsal's front.
  ctx.pairedFin({
    rootS: .415, theta: 2.78, span: .03, droop: 1.15, sweep: .1, thickness: .005, stations: 4, sink: .008,
    le: [[0, 0], [.01, .012], [.02, .03], [.03, .056]],
    te: [[0, .03], [.01, .04], [.02, .05], [.03, .056]],
    color: (_p, v) => mix(PELVIC, FIN, .5 * v),
  });
  // Pectorals low behind the gill cover: long, pointed and a little falcate.
  const pectorals = ctx.pairedFin({
    rootS: .262, theta: angle(.262, -.078), span: .05, droop: 1.15, sweep: .05, thickness: .006, stations: 6, sink: .012,
    le: [[0, 0], [.013, .015], [.027, .052], [.039, .1], [.05, .15]],
    te: [[0, .068], [.013, .088], [.027, .11], [.039, .134], [.05, .15]],
    bone: (left) => (left ? 'PectoralL' : 'PectoralR'),
    color: (_p, v) => mix(FIN_PALE, FIN_DARK, .75 * smoothstep(.15, 1, v)),
  });
  // A big, deeply forked tail with long, pointed lobes, the darkest fin; silver where it grows from the stock.
  const axis = ctx.center(rig.joints[4]);
  const stations = 15;
  const tail = ctx.caudalFin({
    low: axis - .14, high: axis + .14,
    le: [[axis - .14, 1], [axis - .115, .94], [axis - .09, .885], [axis - .06, .83], [axis - .03, .79], [axis, .772], [axis + .03, .79], [axis + .06, .83], [axis + .09, .885], [axis + .115, .94], [axis + .14, 1]],
    te: [[axis - .14, 1], [axis - .12, .978], [axis - .09, .94], [axis - .06, .9], [axis - .03, .876], [axis, .868], [axis + .03, .876], [axis + .06, .9], [axis + .09, .94], [axis + .12, .978], [axis + .14, 1]],
    thickness: (y) => .004 + .014 * Math.max(0, 1 - Math.abs(y - axis) / .1) ** 1.2,
    upperPivot: .04, lowerPivot: .04, stations,
    color: (p, v, u) => {
      const ray = (Math.round(Math.acos(1 - 2 * v) / Math.PI * (stations + 1)) % 2 ? 1 : -1) * .09;
      const edge = mix(TAIL, FIN_DARK, .3 * u + .25 * Math.abs(2 * v - 1));
      return mix(mix(edge, FIN, ray + .1), SILVER, .75 * (1 - smoothstep(.785, .89, TARPON.nose - p.z)));
    },
  });

  // The eye: huge, gold and black, in a pale lid ring set high on the cheek.
  const eyeS = .088, eyeY = .017;
  for (const side of [1, -1]) eyeball(ctx, eyeS, side * angle(eyeS, eyeY), .027);

  for (const side of [1, -1]) {
    // The upturned mouth: a cleft sloping steeply up and back from the jutting lower jaw's tip to below the eye.
    const cleft = Array.from({ length: 9 }, (_, i) => {
      const t = i / 8;
      return [.008 + .097 * t, cleftY(.008 + .097 * t)] as const;
    });
    const above = (dy: number) => cleft.map(([s, y]) => [s, y + dy] as const);
    ctx.ribbon(flank(side, cleft), (t) => (.0016 + .0022 * t) * smoothstep(-.1, .1, t) * (1 - .7 * smoothstep(.8, 1, t)), MOUTH, .0016);
    // The long maxilla riding the upper jaw, ending behind the eye's front edge.
    ctx.ribbon(flank(side, above(.0105).slice(1)), (t) => .0056 * Math.sin(Math.PI * (.08 + .84 * t)) ** .6, hex('#d6dccf'), .0008);
    // The gill cover: a bright silver rim in front of a fine dark line, and the preopercle's arc inside it.
    const cover = (shift: number) => Array.from({ length: 9 }, (_, j) => {
      const t = j / 8;
      return [.224 + shift + .026 * Math.sin(Math.PI * t) ** .7 - .02 * t, .06 - .16 * t] as const;
    });
    ctx.ribbon(flank(side, cover(-.006)), (t) => .0045 * Math.sin(Math.PI * (.06 + .88 * t)), GILL_RIM, .0008);
    ctx.ribbon(flank(side, cover(0)), (t) => .0017 * (.4 + .6 * Math.sin(Math.PI * t)), GILL_LINE, .0014);
    const pre = Array.from({ length: 8 }, (_, j) => {
      const t = j / 7;
      return [.163 - .05 * t ** 2.2, .05 - .12 * t] as const;
    });
    ctx.ribbon(flank(side, pre), (t) => .0013 * Math.sin(Math.PI * (.1 + .8 * t)), GILL_LINE, .0012);
    // A nostril on the snout, ahead of the eye.
    ctx.spot(.044, side * angle(.044, .01), .0025, NOSTRIL, 1.3, .0012);
  }
  // The bony plate between the jaw bones: a long, pointed shield along the throat.
  const throat = Array.from({ length: 7 }, (_, i) => [.03 + .12 * i / 6, Math.PI] as const);
  ctx.ribbon(throat, (t) => .0125 * Math.sin(Math.PI * (.04 + .92 * t)) ** .7, PLATE_EDGE, .0009);
  ctx.ribbon(throat, (t) => .0092 * Math.sin(Math.PI * (.04 + .92 * t)) ** .7, PLATE, .0016);

  // Scales: huge round-edged discs in staggered rows, drawn as the scalloped trailing margins of each
  // vertical chain. A chain runs from back to belly through every other row; the chains between are offset
  // half a scale, so the margins interlock the way overlapping scales do.
  const rowStep = .34;
  const theta0 = 1;
  const radiusAt = (s: number) => rowStep * .95 * ctx.top(s);
  const pitchAt = (s: number) => Math.max(.035, 1.5 * radiusAt(s));
  const ARC = 5;
  const arcPhi = Array.from({ length: ARC }, (_, m) => -Math.PI / 2 + Math.PI * m / ARC);
  for (const side of [1, -1]) {
    let index = 0;
    for (let parity = 0; parity < 2; parity++) {
      const centres: number[] = [];
      for (let j = parity; theta0 + j * rowStep <= 2.45; j += 2) centres.push(theta0 + j * rowStep);
      for (let s = .27 + parity * .5 * pitchAt(.27); s < .79; s += pitchAt(s), index++) {
        const pitch = pitchAt(s);
        const x = s + .1 * pitch * noise(index * 1.7, 31 + side);
        const line: (readonly [number, number])[] = [];
        for (const c of centres) {
          // Each scale is round: its horizontal reach matches its vertical one, which shrinks toward the back and belly.
          const around = ctx.raw(x, c + .01).sub(ctx.raw(x, c - .01)).length() / .02;
          const bulge = Math.min(rowStep * around, Math.max(radiusAt(s), pitch / 1.6));
          for (const phi of arcPhi) line.push([x + bulge * Math.cos(phi), side * (c + rowStep * Math.sin(phi))]);
        }
        line.push([x, side * (centres[centres.length - 1] + rowStep)]);
        const strength = .8 + .2 * noise(index * 2.3, 37);
        // Each margin is bevelled: a bright lip on the scale's own edge, a dark shadow where it overlaps the next
        // scale. The shadow is slate high on the flank and fades to a faint grey low down.
        strip(ctx, line, () => .002, (_t, _s, theta, behind) => {
          const t = Math.abs(theta);
          const shade = mix(EDGE_BACK, mix(EDGE_DARK, EDGE_MID, smoothstep(1.0, 2.1, t)), smoothstep(.5, .95, t));
          const dark = mix(mix(shade, SILVER, smoothstep(1.95, 2.6, t) * .85), SILVER, 1 - strength);
          const lip = mix(mix(UPPER, SHEEN, smoothstep(.4, 1.1, t)), dark, .12);
          // High on the back the margins are foreshortened and sit on dark ground: keep them quiet.
          return mix(behind ? dark : lip, mix(BACK, UPPER, .35), .7 * (1 - smoothstep(.75, 1.25, t)));
        }, .0011);
      }
    }
    // The lateral line: a fine dark thread arching over the pectoral, then straight along the midline.
    const arch = curve([[.25, .5], [.32, .3], [.42, .12], [.52, .03], [.6, 0], [.79, 0]]);
    ctx.ribbon(flank(side, Array.from({ length: 12 }, (_, j) => {
      const s = .25 + .54 * j / 11;
      return [s, ctx.center(s) + arch(s) * ctx.top(s)] as const;
    })), () => .0011, LATERAL, .0019);
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
