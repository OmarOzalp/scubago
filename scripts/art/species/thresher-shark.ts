/**
 * Pelagic thresher shark (Alopias pelagicus): a compact, torpedo-shaped body, deepest around the
 * pectorals, behind a short conical snout with large round eyes and a small arched mouth; long,
 * nearly straight pectorals with broad rounded tips; a medium first dorsal at mid-body and tiny
 * second dorsal and anal fins; and the tail that names it: a narrow scythe of an upper lobe nearly as
 * long as the rest of the shark, curving gently upward to a tiny terminal lobe and notch, above a short
 * but distinct lower lobe. Deep metallic blue-violet grey above, white below, with a clean boundary
 * that stays under the pectoral bases.
 */
import { Vector3 } from 'three';
import { SWIM_RIGS, type SharkRig } from '../../../src/lib/marine-rigs';
import { blendSkins, clamp, curve, fin, hex, mix, noise, smoothstep, TAU } from './kit';
import { sharkContext, type SharkDesign } from './shark';

const TOP = hex('#485a88'), DARK = hex('#38487a'), FLANK = hex('#6a80ab'), BELLY = hex('#f0f2f3');
const GILL = hex('#2c3550'), EYE = hex('#05070b'), IRIS = hex('#2b3855'), MOUTH = hex('#30374d');

const rig = SWIM_RIGS['thresher-shark'] as SharkRig;
/** How far the paired fins' roots are buried in the skin. */
const SINK = .015;
/** Share of the rig's TailUpper flex the tip of the long lobe takes. */
const UPPER_FLEX = 1;

/** Where the blue back meets the white belly: low on the flank, well under the pectoral bases. */
const boundary = (s: number) => 1.9 + .26 * smoothstep(.05, .2, s) - .3 * smoothstep(.3, .52, s) + .015 * noise(s * 14, 3);

export const THRESHER_SHARK: SharkDesign = {
  rig, nose: .38, bodyEnd: .52,
  // A short conical snout, a deep rounded chest, then a long taper to a slim caudal peduncle.
  width: [[0, 0], [.008, .011], [.02, .0195], [.04, .031], [.07, .0415], [.11, .0495], [.16, .0535], [.21, .0545], [.26, .0515], [.31, .0465], [.36, .04], [.41, .0315], [.45, .0235], [.48, .0155], [.5, .0095], [.52, .0035]],
  top: [[0, 0], [.008, .007], [.02, .0155], [.04, .0265], [.07, .0395], [.11, .0505], [.16, .0595], [.21, .0645], [.26, .0635], [.31, .0565], [.36, .0475], [.41, .0375], [.45, .0285], [.48, .0205], [.5, .0145], [.52, .007]],
  bottom: [[0, 0], [.008, .006], [.02, .0125], [.04, .0205], [.07, .031], [.11, .041], [.16, .0485], [.21, .0515], [.26, .0505], [.31, .0445], [.36, .0375], [.41, .0305], [.45, .0235], [.48, .018], [.5, .0115], [.52, .005]],
  center: [[0, -.002], [.08, 0], [.2, 0], [.35, .002], [.52, .004]],
  squareTop: [[0, 2], [.1, 2.05], [.3, 2.1], [.52, 2]],
  squareBottom: [[0, 2.1], [.1, 2.25], [.3, 2.35], [.52, 2]],
  rings: 40, columnsAbove: 7, columnsBelow: 5,
  boundary, boundaryGap: .02,
  // The white belly dusks over the caudal peduncle.
  paint: (s, theta) => mix(
    mix(TOP, FLANK, smoothstep(.3, 1.85, theta) * .55),
    mix(BELLY, FLANK, .95 * smoothstep(.4, .47, s)),
    smoothstep(boundary(s) - .02, boundary(s) + .02, theta),
  ),
};

export function buildThresherShark() {
  const ctx = sharkContext(THRESHER_SHARK);
  const { mesh, bones } = ctx;
  ctx.body();
  const finColor = (_p: Vector3, _v: number, u: number) => mix(TOP, DARK, .3 + .3 * u);

  // A medium first dorsal at mid-body: erect, with a narrow rounded apex and a short free rear tip.
  const dorsal = ctx.midlineFin({
    le: [[-.012, .245], [0, .248], [.02, .258], [.045, .273], [.068, .286], [.085, .296]],
    te: [[-.012, .33], [0, .333], [.005, .336], [.02, .324], [.045, .31], [.068, .302], [.085, .296]],
    height: .085, thickness: .016, stations: 8, bone: 'Dorsal', color: finColor,
  });
  // Tiny second dorsal and anal fins close to the caudal base.
  ctx.midlineFin({
    le: [[-.006, .462], [0, .464], [.008, .471], [.013, .477]],
    te: [[-.006, .486], [0, .488], [.004, .49], [.009, .483], [.013, .477]],
    height: .013, thickness: .005, stations: 4, color: finColor,
  });
  ctx.midlineFin({
    le: [[-.006, .472], [0, .474], [.008, .481], [.013, .487]],
    te: [[-.006, .497], [0, .499], [.004, .5], [.009, .493], [.013, .487]],
    height: .013, thickness: .005, stations: 4, ventral: true, color: finColor,
  });
  // Long, nearly straight pectorals: blue above, pale below with dusky tips, broad rounded ends.
  // `pairedFin` samples its outlines from the buried root out to the tip, so the outline spans `SINK` more.
  const pectoral = paddle({ span: .18 + SINK, rootHalf: .0375, tipHalf: .0255, lean: .36, tipLength: .026 });
  const pectorals = ctx.pairedFin({
    rootS: .205, theta: 1.86, span: .18, droop: .24, sweep: 0, thickness: .017, stations: 18, sink: SINK,
    le: pectoral.le, te: pectoral.te,
    bone: (left) => (left ? 'PectoralL' : 'PectoralR'),
    color: (_p, v, u, _left, face) => face > 0
      ? mix(TOP, DARK, .25 + .15 * u)
      : mix(mix(BELLY, FLANK, .22 * v), DARK, smoothstep(.6, .93, v) * .95),
  });
  // Small pelvic fins.
  ctx.pairedFin({
    rootS: .405, theta: 2.45, span: .042, droop: .85, sweep: .12, thickness: .008, stations: 5, sink: SINK,
    le: [[-.01, 0], [0, 0], [.02, .01], [.04, .026], [.052, .036], [.057, .04]],
    te: [[-.01, .04], [0, .041], [.02, .04], [.04, .04], [.052, .041], [.057, .04]],
    color: (_p, v, _u, _left, face) => (face > 0 ? mix(TOP, DARK, .2) : mix(BELLY, TOP, .2 * v)),
  });

  const tail = caudal(ctx);

  // Large round eyes, set high on the head.
  roundEyes(ctx, { s: .064, theta: 1.2, radius: .0145 });
  ctx.gills({ from: .15, to: .204, count: 5, top: 1.7, bottom: 2.02, halfWidth: .0016, slant: .006, color: GILL });
  // A small mouth, strongly arched across the underside of the snout.
  ctx.ribbon(Array.from({ length: 9 }, (_, i) => {
    const t = i / 8, theta = Math.PI + (t - .5) * 1.5;
    return [.055 + .017 * (2 * t - 1) ** 2, theta] as const;
  }), (t) => .0019 * (.5 + .5 * Math.sin(Math.PI * t)), MOUTH);

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

/** Large round eyes: a dark dome whose rim lightens to a dusky iris, faceted finely enough to read as round at this size. */
function roundEyes(ctx: ReturnType<typeof sharkContext>, o: { s: number; theta: number; radius: number }) {
  const { mesh } = ctx;
  const segments = 14, rings = 5, flatten = .6;
  for (const side of [1, -1]) {
    const theta = side * o.theta;
    const n = ctx.normal(o.s, theta);
    const center = ctx.surface(o.s, theta, -.22 * o.radius);
    const t1 = Math.abs(n.y) < .9 ? new Vector3(0, 1, 0).cross(n).normalize() : new Vector3(1, 0, 0).cross(n).normalize();
    const t2 = n.clone().cross(t1);
    const skin = ctx.skin(o.s);
    mesh.begin();
    const colorAt = (phi: number) => mix(EYE, IRIS, smoothstep(.45, 1, phi / (Math.PI / 2)));
    const point = (phi: number, a: number) => center.clone()
      .addScaledVector(n, Math.cos(phi) * o.radius * flatten)
      .addScaledVector(t1, Math.sin(phi) * Math.cos(a) * o.radius)
      .addScaledVector(t2, Math.sin(phi) * Math.sin(a) * o.radius);
    const top = mesh.vertex(point(0, 0), EYE, skin);
    const rows: number[][] = [];
    for (let r = 1; r <= rings; r++) {
      const phi = Math.PI * r / (rings * 2 + 1);
      rows.push(Array.from({ length: segments }, (_, k) => mesh.vertex(point(phi, TAU * k / segments), colorAt(phi), skin)));
    }
    const rim = rows[rings - 1];
    // Close the back of the dome with a flat disc just inside the skin.
    const backCenter = mesh.vertex(center.clone().addScaledVector(n, -o.radius * .1), IRIS, skin);
    for (let k = 0; k < segments; k++) {
      const k1 = (k + 1) % segments;
      mesh.tri(top, rows[0][k], rows[0][k1]);
      for (let r = 0; r < rings - 1; r++) mesh.quad(rows[r][k], rows[r + 1][k], rows[r + 1][k1], rows[r][k1]);
      mesh.tri(backCenter, rim[k1], rim[k]);
    }
    mesh.end();
  }
}

/**
 * A strap-shaped fin outline for `pairedFin`: chord offsets of the leading and trailing edges against
 * span, a half-chord tapering from the root to the tip, the whole leaning back at `lean`, and the end
 * closed by a round tip `tipLength` long.
 */
function paddle(o: { span: number; rootHalf: number; tipHalf: number; lean: number; tipLength: number }) {
  const straight = o.span - o.tipLength;
  const half = (b: number) => o.rootHalf + (o.tipHalf - o.rootHalf) * Math.min(1, b / straight);
  const centre = (b: number) => o.rootHalf + o.lean * b;
  const stations = [-.015, ...Array.from({ length: 5 }, (_, i) => straight * i / 5), ...Array.from({ length: 7 }, (_, i) => straight + o.tipLength * Math.sin(Math.PI / 2 * i / 6))];
  const outline = (sign: number) => stations.map((b) => {
    const h = b <= straight ? half(Math.max(0, b)) : o.tipHalf * Math.sqrt(Math.max(0, 1 - ((b - straight) / o.tipLength) ** 2));
    return [b, centre(Math.max(0, b)) + sign * h] as [number, number];
  });
  return { le: outline(-1), te: outline(1) };
}

/**
 * The caudal fin as two lofts: the long upper lobe, sliced by vertical chords so its edges can follow
 * a gentle upward arc, and the short lower lobe, sliced by horizontal chords. Both are skinned to
 * `TailUpper` / `TailLower` by a ramp along their length, so the scythe bends along its whole
 * length when the tail beats instead of hinging at its base.
 */
function caudal(ctx: ReturnType<typeof sharkContext>) {
  const { mesh, skin, z, sOf } = ctx;
  // Upper lobe: q runs 0..1 from s = .5 (the peduncle) to the tip at s = 1; its edges arc upward.
  const S0 = .48, at = (s: number) => (s - .5) / .5;
  const upperTop = (q: number) => .0185 + .11 * q + .0605 * q * q;
  // Vertical depth of the lobe: a broad base, a long strap, a small waist, then the terminal lobe.
  const upperDepth = curve([[-.04, .0245], [0, .0245], [.156, .034], [.3, .0365], [.5, .0335], [.7, .0295], [.8, .0265], [.865, .0215], [.9, .0145], [.945, .0185], [.975, .011], [1, 0]]);
  const upperEdge = (s: number) => upperTop(at(s));
  const lowerEdge = (s: number) => upperTop(at(s)) - upperDepth(at(s));
  const sAt = (v: number) => S0 + (1 - S0) * v;
  // Ramp of the TailUpper weight along the lobe: none at the base, about half at the tip. The rig flexes
  // `TailUpper` against the tail's own stroke to make the lobe lag, and over a lever this long the full
  // flex would cancel the stroke; this share keeps a deep S in the whip.
  const upperRamp = (s: number) => UPPER_FLEX * clamp((s - .54) / .44) ** 1.15;
  fin(mesh, {
    stations: 32, chordPoints: 5,
    le: (v) => new Vector3(0, upperEdge(sAt(v)), z(sAt(v))),
    te: (v) => new Vector3(0, lowerEdge(sAt(v)), z(sAt(v))),
    thickness: (v) => .0058 + .0127 * (1 - v) ** 2.2,
    side: new Vector3(1, 0, 0),
    color: (_p, v, u) => mix(TOP, DARK, .35 + .25 * u - .15 * v),
    skin: (p) => blendSkins(skin(sOf(p.z)), { TailUpper: 1 }, upperRamp(sOf(p.z))),
  });

  // Lower lobe: a short blade hanging from the hub, tip down and back. Its root rides inside the
  // upper lobe's web so only the free blade shows.
  const front = curve([[-.075, .608], [-.068, .59], [-.055, .566], [-.04, .543], [-.02, .516], [-.008, .5], [.004, .485], [.012, .475]]);
  const back = curve([[-.075, .608], [-.068, .606], [-.055, .602], [-.04, .596], [-.02, .588], [.004, .578], [.012, .572]]);
  const yAt = (v: number) => .012 - v * .087;
  const lowerRamp = (y: number) => clamp((.004 - y) / .079 - .1) ** 1.1;
  fin(mesh, {
    stations: 8, chordPoints: 5,
    le: (v) => new Vector3(0, yAt(v), z(front(yAt(v)))),
    te: (v) => new Vector3(0, yAt(v), z(back(yAt(v)))),
    thickness: (v) => .0045 + .0075 * (1 - v) ** 1.5,
    side: new Vector3(1, 0, 0),
    color: (_p, v, u) => mix(TOP, DARK, .35 + .25 * u - .1 * v),
    skin: (p) => blendSkins(skin(sOf(p.z)), { TailLower: 1 }, lowerRamp(p.y)),
  });
  return {
    upper: new Vector3(0, (upperEdge(.545) + lowerEdge(.545)) / 2, z(.545)),
    lower: new Vector3(0, -.012, z(.55)),
  };
}
