/**
 * Pelagic thresher shark (Alopias pelagicus): a slim torpedo of a body, deepest over the pectorals,
 * behind a short, conical snout with large round eyes set flush on the sides of the head and a small
 * arched mouth; long pectoral fins swept back and tapering to broad, rounded tips; a slightly falcate
 * first dorsal nearer the pectorals than the pelvics; big pelvic fins; tiny second dorsal and anal
 * fins; and the tail that names it, half its whole length: a scythe of an upper lobe, broad where it
 * leaves the body, then a long, narrowing blade curving gently upward to a small terminal lobe behind
 * a notch, above a short, falcate lower lobe. Metallic deep blue with a violet cast above, a silvery
 * sheen low on the flanks, and a crisp white belly that stays under the pectoral bases.
 */
import { Vector3 } from 'three';
import { SWIM_RIGS, type SharkRig } from '../../../src/lib/marine-rigs';
import { blendSkins, clamp, curve, fin, hex, mix, noise, smoothstep, TAU, type RGB } from './kit';
import { sharkContext, type SharkDesign } from './shark';

const TOP = hex('#2f4279'), VIOLET = hex('#43437f'), SHEEN = hex('#6d80b4'), BELLY = hex('#f3f5f6');
const FIN = hex('#2d3d70'), DUSK = hex('#222e57'), GILL = hex('#1d2645'), MOUTH = hex('#2a3150');
const IRIS = hex('#5a6684'), RIM = hex('#8792ad'), PUPIL = hex('#05070b');

const rig = SWIM_RIGS['thresher-shark'] as SharkRig;
/** Where the body ends inside the tail, and where the caudal fin leaves the body. */
const BODY_END = .52, CAUDAL = .49;

/** Where the blue back meets the white belly: under the pectoral bases, narrowing toward the tail. */
const boundary = (s: number) => 1.95 + .1 * smoothstep(.04, .16, s) + .45 * smoothstep(.3, .5, s) + .012 * noise(s * 16, 3);

/** The back's colour: deep blue with a violet cast, a silvery-blue sheen low on the flank. */
const back = (s: number, theta: number, p: Vector3): RGB => {
  const cast = mix(TOP, VIOLET, .35 + .3 * noise(p.z * 30 + p.y * 20, 5));
  return mix(cast, SHEEN, .75 * smoothstep(boundary(s) - 1.05, boundary(s) - .08, theta));
};

export const THRESHER_SHARK: SharkDesign = {
  rig, nose: .38, bodyEnd: BODY_END,
  // A short, conical snout, the body deepest over the pectorals, then a long taper to the slim tail stock.
  width: [[0, 0], [.01, .012], [.025, .021], [.05, .031], [.08, .038], [.12, .0425], [.17, .0445], [.22, .0435], [.28, .04], [.34, .035], [.4, .028], [.45, .019], [.48, .013], [.5, .009], [.52, .004]],
  top: [[0, 0], [.01, .008], [.025, .016], [.05, .026], [.08, .035], [.12, .043], [.17, .05], [.22, .053], [.28, .051], [.34, .045], [.4, .036], [.45, .026], [.48, .019], [.5, .013], [.52, .007]],
  bottom: [[0, 0], [.01, .006], [.025, .012], [.05, .019], [.08, .027], [.12, .035], [.17, .041], [.22, .043], [.28, .041], [.34, .036], [.4, .029], [.45, .021], [.48, .016], [.5, .011], [.52, .005]],
  // The tail's axis rises a little toward the caudal fin.
  center: [[0, -.004], [.1, 0], [.3, .003], [.45, .006], [.52, .008]],
  squareTop: [[0, 2], [.12, 2.05], [.3, 2.1], [.52, 2]],
  squareBottom: [[0, 2.1], [.12, 2.2], [.3, 2.3], [.52, 2]],
  rings: 42, columnsAbove: 7, columnsBelow: 5,
  boundary, boundaryGap: .02,
  paint: (s, theta, p) => (theta > boundary(s) ? mix(BELLY, SHEEN, .5 * smoothstep(.36, .48, s)) : back(s, theta, p)),
};

export function buildThresherShark() {
  const ctx = sharkContext(THRESHER_SHARK);
  const { mesh, bones } = ctx;
  ctx.body();
  const finColor = (_p: Vector3, v: number, u: number) => mix(FIN, DUSK, .2 + .25 * u + .25 * v);

  // The first dorsal: tall, a little falcate, its apex narrowly rounded, a short free rear tip.
  const dorsal = ctx.midlineFin({
    le: [[-.012, .255], [0, .258], [.02, .268], [.04, .281], [.058, .296], [.07, .31], [.076, .322], [.078, .328]],
    te: [[-.012, .338], [0, .341], [.004, .343], [.012, .337], [.03, .331], [.05, .329], [.066, .329], [.074, .329], [.078, .328]],
    height: .078, thickness: .015, stations: 9, chordPoints: 7, bone: 'Dorsal', color: finColor,
  });
  // Tiny second dorsal and anal fins before the tail.
  ctx.midlineFin({
    le: [[-.006, .462], [0, .464], [.007, .47], [.011, .476]],
    te: [[-.006, .484], [0, .486], [.004, .488], [.008, .481], [.011, .476]],
    height: .011, thickness: .005, stations: 4, color: finColor,
  });
  ctx.midlineFin({
    le: [[-.006, .468], [0, .47], [.007, .476], [.011, .482]],
    te: [[-.006, .49], [0, .492], [.004, .494], [.008, .487], [.011, .482]],
    height: .011, thickness: .005, stations: 4, ventral: true, color: finColor,
  });

  // Long pectorals swept back and angled down, tapering to broad rounded tips: blue above, white
  // below with dusky tips and trailing edges.
  const sink = .015, pectoral = sweptFin({ span: .16 + sink, rootChord: .074, tipChord: .047, rake: .5, bow: .08, round: .03, from: sink });
  const pectorals = ctx.pairedFin({
    rootS: .188, theta: 2.02, span: .16, droop: .3, sweep: 0, thickness: .015, stations: 16, sink,
    le: pectoral.le, te: pectoral.te,
    bone: (left) => (left ? 'PectoralL' : 'PectoralR'),
    color: (_p, v, u, _left, face) => face > 0
      ? mix(FIN, DUSK, .15 + .3 * u + .2 * v)
      : mix(mix(BELLY, SHEEN, .25 * v), DUSK, Math.max(smoothstep(.72, .97, v), smoothstep(.75, 1, u) * .7)),
  });
  // Big pelvic fins, rounded at the tips.
  const pelvic = sweptFin({ span: .046 + sink, rootChord: .05, tipChord: .026, rake: .55, bow: .3, round: .012, from: sink });
  ctx.pairedFin({
    rootS: .382, theta: 2.55, span: .046, droop: .85, sweep: .15, thickness: .008, stations: 7, sink,
    le: pelvic.le, te: pelvic.te,
    color: (_p, v, u, _left, face) => (face > 0 ? mix(FIN, DUSK, .2 + .2 * u) : mix(BELLY, FIN, .25 + .4 * v)),
  });

  const tail = caudal(ctx);

  // Large round eyes set flush on the sides of the head.
  roundEyes(ctx, { s: .058, theta: 1.15, radius: .0142 });
  // Five short gill slits, the last two over the pectoral base.
  ctx.gills({ from: .132, to: .178, count: 5, top: 1.72, bottom: 2.02, halfWidth: .0015, slant: 0, color: GILL });
  // A small mouth, strongly arched across the underside of the snout.
  ctx.ribbon(Array.from({ length: 9 }, (_, i) => {
    const t = i / 8, theta = Math.PI + (t - .5) * 1.45;
    return [.052 + .016 * (2 * t - 1) ** 2, theta] as const;
  }), (t) => .0017 * (.5 + .5 * Math.sin(Math.PI * t)), MOUTH);

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

/** A large, round eye barely domed out of the skin: a black pupil inside a dark blue-grey iris, finely enough faceted to stay round up close. */
function roundEyes(ctx: ReturnType<typeof sharkContext>, o: { s: number; theta: number; radius: number }) {
  const { mesh } = ctx, segments = 14, rings = 4;
  for (const side of [1, -1]) {
    const theta = side * o.theta, n = ctx.normal(o.s, theta), center = ctx.surface(o.s, theta, -.35 * o.radius);
    const t1 = new Vector3(0, 1, 0).cross(n).normalize(), t2 = n.clone().cross(t1), skin = ctx.skin(o.s);
    mesh.begin();
    // phi runs from the dome's top to its rim, which sinks just under the skin.
    const point = (phi: number, a: number) => center.clone()
      .addScaledVector(n, Math.cos(phi) * o.radius * .5)
      .addScaledVector(t1, Math.sin(phi) * Math.cos(a) * o.radius)
      .addScaledVector(t2, Math.sin(phi) * Math.sin(a) * o.radius);
    const color = (phi: number) => mix(mix(PUPIL, IRIS, smoothstep(.45, .6, phi / (Math.PI / 2))), RIM, smoothstep(.85, 1, phi / (Math.PI / 2)));
    const top = mesh.vertex(point(0, 0), PUPIL, skin);
    const rows = Array.from({ length: rings }, (_, r) => {
      const phi = Math.PI / 2 * (r + 1) / rings;
      return Array.from({ length: segments }, (_, k) => mesh.vertex(point(phi, TAU * k / segments), color(phi), skin));
    });
    const back = mesh.vertex(center.clone().addScaledVector(n, -o.radius * .2), IRIS, skin);
    for (let k = 0; k < segments; k++) {
      const k1 = (k + 1) % segments;
      mesh.tri(top, rows[0][k], rows[0][k1]);
      for (let r = 0; r < rings - 1; r++) mesh.quad(rows[r][k], rows[r + 1][k], rows[r + 1][k1], rows[r][k1]);
      mesh.tri(back, rows[rings - 1][k1], rows[rings - 1][k]);
    }
    mesh.end();
  }
}

/**
 * A swept fin's outline for `pairedFin` (chord offsets behind the root's leading edge against span):
 * the leading edge raked back (`rake`, bowing out by `bow`), the chord tapering from `rootChord` to
 * `tipChord`, and a rounded tip over the last `round` of the span. `from` is the buried root length.
 */
function sweptFin(o: { span: number; rootChord: number; tipChord: number; rake: number; bow: number; round: number; from: number }) {
  const free = o.span - o.from, straight = o.span - o.round;
  const lead = (b: number) => { const t = Math.max(0, b - o.from); return o.rake * t + o.bow * t * t / free; };
  const chord = (b: number) => o.rootChord + (o.tipChord - o.rootChord) * clamp((b - o.from) / (straight - o.from));
  const stations = [-.015, ...Array.from({ length: 7 }, (_, i) => straight * i / 7), ...Array.from({ length: 7 }, (_, i) => straight + o.round * Math.sin(Math.PI / 2 * (i + 1) / 7))];
  const at = (b: number, side: number) => {
    const c = chord(Math.min(b, straight)), mid = lead(b) + c / 2;
    // The tip: an ellipse closing the chord to a point at the end of the span.
    const half = b <= straight ? c / 2 : c / 2 * Math.sqrt(Math.max(0, 1 - ((b - straight) / o.round) ** 2));
    return [b, mid + side * half] as [number, number];
  };
  return { le: stations.map((b) => at(b, -1)), te: stations.map((b) => at(b, 1)) };
}

/**
 * The whole caudal fin as one blade sliced by vertical chords from where it leaves the body to the
 * tip: the dorsal edge rising gently along the long upper lobe; the ventral edge dropping to the short
 * lower lobe's tip, back up to the fork, then running up the upper lobe to a notch and the small
 * terminal lobe. The upper lobe bends along its whole length on `TailUpper` (a ramp of weight toward
 * its tip), the lower lobe on `TailLower`.
 */
function caudal(ctx: ReturnType<typeof sharkContext>) {
  const { mesh, skin, z, sOf } = ctx;
  const length = 1 - CAUDAL;
  const q = (s: number) => (s - CAUDAL) / length;
  /** The dorsal edge's height (the spine runs along it), rising and curving gently upward. */
  const dorsal = (s: number) => .025 + .112 * q(s) + .052 * q(s) ** 2;
  /** The ventral edge: down to the lower lobe's tip, back up to the fork, then up the blade with its notch. */
  const lower = curve([
    [.49, -.004], [.505, -.02], [.525, -.037], [.55, -.053], [.572, -.066], [.59, -.073],
    [.596, -.06], [.602, -.044], [.609, -.028], [.617, -.013], [.628, .001],
  ]);
  /** The blade's depth behind the fork: narrowing fast, then slowly, to the notch and the terminal lobe. */
  const blade = curve([[.628, .058], [.64, .044], [.66, .036], [.7, .031], [.76, .027], [.82, .023], [.88, .019], [.92, .016], [.943, .0105], [.956, .0165], [.98, .0105], [1, 0]]);
  const ventral = (s: number) => (s <= .628 ? lower(s) : dorsal(s) - blade(s));
  // Dense slices where the outline turns fastest: the lower lobe, the fork and the tip.
  const stations = [...Array.from({ length: 24 }, (_, i) => CAUDAL + (.18 * i) / 24), ...Array.from({ length: 16 }, (_, i) => .67 + (.33 * i) / 16)];
  const sAt = (v: number) => {
    const f = v * (stations.length - 1), i = Math.min(stations.length - 2, Math.floor(f));
    return stations[i] + (stations[i + 1] - stations[i]) * (f - i);
  };
  const upperRamp = (s: number) => .85 * clamp((s - .55) / .45) ** 1.2;
  const lowerRamp = (p: Vector3) => smoothstep(-.03, -.07, p.y) * (1 - smoothstep(.6, .64, sOf(p.z)));
  fin(mesh, {
    stations: stations.length, chordPoints: 7, spacing: (t) => t,
    le: (v) => new Vector3(0, dorsal(sAt(v)), z(sAt(v))),
    te: (v) => new Vector3(0, Math.min(dorsal(sAt(v)) - .002, ventral(sAt(v))), z(sAt(v))),
    // Thickest along the dorsal edge, as thick as the tail stock where it leaves it, the blade thinning toward the tip.
    thickness: (v) => .0062 + .0135 * (1 - q(sAt(v))) ** 1.6,
    side: new Vector3(1, 0, 0),
    color: (p, v, u) => mix(mix(FIN, DUSK, .2 + .35 * u + .25 * q(sOf(p.z))), TOP, .25 * (1 - u) * (1 - v)),
    skin: (p) => blendSkins(blendSkins(skin(sOf(p.z)), { TailUpper: 1 }, upperRamp(sOf(p.z))), { TailLower: 1 }, lowerRamp(p)),
  });
  return {
    upper: new Vector3(0, dorsal(.56) - .02, z(.56)),
    lower: new Vector3(0, -.03, z(.53)),
  };
}
