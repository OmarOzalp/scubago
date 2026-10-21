/**
 * Sand tiger shark (Carcharias taurus): the bulky, slightly humpbacked "grey nurse" that hangs over
 * wrecks and ledges. A heavy body, deepest behind the head, behind a conical, flattened, pointed
 * snout with small eyes; a long mouth that reaches back behind the eyes, with rows of long, ragged,
 * needle-like teeth that jut out even with the mouth closed. Two large dorsal fins of nearly equal
 * size, the first set well back (nearer the pelvics than the pectorals), and an anal fin as big as
 * they are; short, broad pectorals; an asymmetric tail with a long upper lobe notched near its tip
 * and a short lower lobe. Light bronze-brown above with scattered reddish-brown spots, more of them
 * on the rear half; a pale belly.
 */
import { Vector3 } from 'three';
import { SWIM_RIGS, type SharkRig } from '../../../src/lib/marine-rigs';
import { hex, mix, noise, smoothstep, type RGB, type Skin } from './kit';
import { eyeball, markedFins, outline, precaudalPits } from './reef-sharks';
import { sharkContext, type SharkContext, type SharkDesign } from './shark';

// Body: light bronze-brown above, a paler tan flank, a pale cream belly; reddish-brown spots.
const BACK = hex('#9b8666'), FLANK = hex('#b4a084'), BELLY = hex('#f0e9da'), SPOT = hex('#85503a');
// Fins: a little browner than the body, with a darker rear margin; ivory teeth on a darker gum line.
const FIN = hex('#8a7556'), FIN_PALE = hex('#a89574'), FIN_UNDER = hex('#e9e0cc'), FIN_EDGE = hex('#6b5a41');
const TOOTH = hex('#f1ead6'), TOOTH_ROOT = hex('#8f836a'), MOUTH = hex('#4f4333'), GILL = hex('#5b4e3b'), NARE = hex('#5d5040');
const EYE = hex('#080806'), IRIS = hex('#5a4720'), LID = hex('#7d6c4a');

const rig = SWIM_RIGS['sand-tiger-shark'] as SharkRig;

/** Where the bronze back meets the pale belly: low on the flank, a little wavy. */
const boundary = (s: number) => 1.82 + .05 * smoothstep(.06, .3, s) + .04 * noise(s * 12, 3);

const skinColor = (s: number, theta: number, p: Vector3): RGB => {
  const cloud = .03 * noise(p.z * 21 + p.y * 11, 5);
  const upper = mix(BACK, FLANK, smoothstep(.15, 1.6, theta + cloud * 4));
  return mix(upper, BELLY, smoothstep(boundary(s) - .08, boundary(s) + .08, theta));
};

export const SAND_TIGER_SHARK: SharkDesign = {
  rig, nose: .4, bodyEnd: .8,
  // A conical, flattened snout, a hump behind the head, a heavy body tapering to a slim, long tail stock.
  width: [[0, 0], [.004, .008], [.012, .019], [.025, .031], [.045, .043], [.07, .055], [.1, .066], [.14, .077], [.2, .083], [.27, .086], [.34, .085], [.42, .078], [.5, .068], [.58, .054], [.65, .041], [.71, .03], [.76, .022], [.8, .014]],
  top: [[0, 0], [.004, .007], [.012, .014], [.025, .024], [.045, .036], [.07, .05], [.1, .066], [.14, .08], [.2, .092], [.27, .098], [.34, .097], [.42, .088], [.5, .075], [.58, .059], [.65, .045], [.71, .033], [.76, .024], [.8, .017]],
  bottom: [[0, 0], [.004, .006], [.012, .012], [.025, .019], [.045, .028], [.07, .04], [.1, .052], [.14, .064], [.2, .073], [.27, .078], [.34, .078], [.42, .072], [.5, .063], [.58, .05], [.65, .039], [.71, .03], [.76, .023], [.8, .018]],
  center: [[0, -.01], [.05, -.006], [.12, -.001], [.3, .002], [.5, .004], [.8, .007]],
  squareTop: [[0, 2.3], [.1, 2.2], [.3, 2.1], [.6, 2.05], [.8, 2]],
  squareBottom: [[0, 2.4], [.1, 2.35], [.3, 2.4], [.6, 2.2], [.8, 2]],
  rings: 46, columnsAbove: 7, columnsBelow: 5,
  boundary, boundaryGap: .05,
  paint: skinColor,
};

/** One long, needle-like tooth: a three-sided spike whose base is buried in the jaw. */
function tooth(ctx: SharkContext, base: Vector3, along: Vector3, dir: Vector3, length: number, width: number, weights: Skin) {
  const { mesh } = ctx;
  const sideways = along.clone().normalize();
  const fore = dir.clone().cross(sideways).normalize();
  const root = base.clone().addScaledVector(dir, -.003);
  mesh.begin();
  const a = mesh.vertex(root.clone().addScaledVector(sideways, -width / 2), TOOTH_ROOT, weights);
  const b = mesh.vertex(root.clone().addScaledVector(sideways, width / 2), TOOTH_ROOT, weights);
  const c = mesh.vertex(root.clone().addScaledVector(fore, width * .45).addScaledVector(dir, .001), TOOTH_ROOT, weights);
  const tip = mesh.vertex(base.clone().addScaledVector(dir, length), TOOTH, weights);
  mesh.tri(a, b, tip); mesh.tri(b, c, tip); mesh.tri(c, a, tip);
  mesh.end({ closed: false, outward: (i) => mesh.point(i).sub(root.clone().addScaledVector(dir, length * .3)) });
}

/**
 * Rows of teeth along both jaws, jutting out of the closed mouth: the upper row raked back and
 * the lower row forward so the two ranks cross and look ragged, the longest at the front.
 */
function teeth(ctx: SharkContext, line: (t: number) => readonly [number, number]) {
  const rows = [
    { shift: 0, count: 9, length: .024, rake: .5, width: .0056 },
    { shift: .0095, count: 8, length: .019, rake: -.55, width: .0052 },
  ];
  rows.forEach(({ shift, count, length, rake, width }, row) => {
    for (let i = 0; i < count; i++) {
      for (const side of [1, -1]) {
        // Evenly along each half of the mouth, from just off the midline to near the corner.
        const t = .5 + side * (.04 + .44 * (i + .5 * row) / count);
        const [s, theta] = line(t);
        const ps = s + shift * (1 - 2 * Math.abs(t - .5) * .5);
        const jitter = noise(i * 3.7 + row * 11 + side * 5, 2);
        const n = ctx.normal(ps, theta);
        const p = ctx.surface(ps, theta, 0);
        const [s2, th2] = line(t + .01);
        const along = ctx.raw(s2, th2).sub(ctx.raw(s, theta));
        const back = new Vector3(0, 0, -1).addScaledVector(n, -n.z);
        // Raked along the jaw, flaring out from the midline, with a ragged lean to each tooth.
        const dir = n.clone().multiplyScalar(1).addScaledVector(back.normalize(), rake * (.6 + .4 * jitter)).addScaledVector(along.clone().normalize(), side * .22 * (.5 + jitter)).normalize();
        tooth(ctx, p, along, dir, length * (1 - .45 * Math.abs(t - .5) * 2 + .12 * jitter), width, ctx.skin(ps));
      }
    }
  });
}

export function buildSandTigerShark() {
  const ctx = sharkContext(SAND_TIGER_SHARK);
  const { mesh, bones } = ctx;
  const fins = markedFins(ctx);
  ctx.body();

  /** Brown, paler toward the front edge (standing fins are lit from the side, so they get a paler tone), darker along the rear margin. */
  const brown = (u: number, rear = 0) => mix(mix(FIN, FIN_PALE, .25 + .3 * (1 - u)), FIN_EDGE, .6 * rear);
  // Two big, nearly equal dorsal fins: upright, broad-based triangles with a rounded apex. The first
  // stands well back, over the gap between the pectorals and the pelvics but nearer the pelvics.
  const dorsal = fins.midline({
    ...outline(.09, (t) => [.44 + .04 * t ** 1.2, .482 + .044 * (1 - t) ** 1.8 + .006 * Math.sqrt(1 - t) * t ** 8]),
    height: .09, thickness: .02, bone: 'Dorsal', stations: 7, rear: .006,
    color: (_p, _t, u, _f, info) => brown(u, info.rear),
  });
  fins.midline({
    ...outline(.08, (t) => [.654 + .034 * t ** 1.2, .688 + .032 * (1 - t) ** 1.8 + .006 * Math.sqrt(1 - t) * t ** 6], .01),
    height: .08, thickness: .016, stations: 6, rear: .005,
    color: (_p, _t, u, _f, info) => brown(u, info.rear),
  });
  // The anal fin, a match for the second dorsal and just ahead of it.
  fins.midline({
    ...outline(.082, (t) => [.64 + .036 * t ** 1.2, .676 + .032 * (1 - t) ** 1.8 + .006 * Math.sqrt(1 - t) * t ** 6], .01),
    height: .082, thickness: .016, stations: 6, ventral: true, rear: .005,
    color: (_p, _t, u, _f, info) => mix(brown(u, info.rear), FIN_UNDER, .35),
  });
  // Short, broad pectorals, pointed at the tip.
  const pectorals = fins.paired({
    rootS: .243, theta: 2, span: .13, droop: .34, sweep: .08, thickness: .018, stations: 7, rear: .005,
    ...outline(.13, (t) => {
      const front = .06 * (.4 * t + .6 * t ** 1.8);
      return [front, front + .098 * (1 - t) ** 1.1 + .02 * Math.sqrt(1 - t) * t ** 3];
    }, 0),
    bone: (left) => (left ? 'PectoralL' : 'PectoralR'),
    color: (_p, v, u, _left, face, info) => (face > 0 ? brown(u, info.rear) : mix(FIN_UNDER, FIN_PALE, .3 * v + .15 * info.rear)),
  });
  // Pelvic fins, broad-based.
  fins.paired({
    rootS: .536, theta: 2.4, span: .07, droop: .8, sweep: .15, thickness: .012, stations: 5,
    ...outline(.07, (t) => {
      const front = .04 * (.4 * t + .6 * t ** 2);
      return [front, front + .075 * (1 - t) ** .85 + .012 * Math.sqrt(1 - t) * t ** 3];
    }, 0),
    color: (_p, v, u, _left, face) => (face > 0 ? brown(u) : mix(FIN_UNDER, FIN_PALE, .3 * v)),
  });
  const axis = ctx.center(rig.joints[4]);
  // The asymmetric tail: a long, tapering upper lobe with a notch near its tip and a short, pointed lower lobe.
  const tail = fins.caudal({
    low: axis - .066, high: axis + .205, rear: .006,
    le: [[axis - .066, .91], [axis - .05, .878], [axis - .032, .846], [axis - .014, .818], [axis, .8], [axis + .012, .79], [axis + .03, .798], [axis + .06, .83], [axis + .1, .874], [axis + .14, .918], [axis + .17, .953], [axis + .18, .962], [axis + .19, .972], [axis + .198, .986], [axis + .205, 1]],
    te: [[axis - .066, .91], [axis - .054, .905], [axis - .036, .888], [axis - .014, .866], [axis + .004, .855], [axis + .03, .875], [axis + .07, .905], [axis + .11, .935], [axis + .15, .962], [axis + .168, .972], [axis + .18, .969], [axis + .19, .981], [axis + .198, .992], [axis + .205, 1]],
    thickness: (y) => .004 + .02 * Math.max(0, 1 - Math.abs(y - axis) / .12) ** 1.2,
    upperPivot: .05, lowerPivot: .035, stations: 18,
    color: (p, _y, u, _f, info) => brown(u - (p.y < axis ? .1 : 0), info.rear),
  });
  // Small eyes, set above and a little ahead of the mouth's corner.
  for (const side of [1, -1]) eyeball(ctx, .085, side * 1.2, .0058, { pupil: EYE, iris: IRIS, lid: LID });
  ctx.gills({ from: .182, to: .24, count: 5, top: 1.3, bottom: 2, halfWidth: .0017, slant: .008, color: GILL });
  // The long mouth: a wide, low arc under the snout whose corners reach back behind the eyes.
  const mouth = (t: number) => [.058 + .052 * (2 * t - 1) ** 2, Math.PI + (t - .5) * 2.9] as const;
  ctx.ribbon(Array.from({ length: 15 }, (_, i) => mouth(i / 14)), (t) => .0022 * (.4 + .6 * Math.sin(Math.PI * t)), MOUTH, .0008);
  teeth(ctx, mouth);
  for (const side of [1, -1]) {
    ctx.ribbon(Array.from({ length: 5 }, (_, i) => [.028 + .012 * i / 4, side * (Math.PI - .55 - .15 * i / 4)] as const),
      (t) => .0017 * Math.sin(Math.PI * (.12 + .76 * t)) ** .6, NARE, .001);
  }
  // Reddish-brown spots scattered over the back and flanks, sparse on the front half, many on the rear.
  for (let i = 0; i < 26; i++) {
    const u = (i * .6180339887) % 1, w = (i * .7548776662 + .21) % 1;
    const s = .15 + .6 * u ** .65, theta = .3 + 1.25 * w;
    ctx.spot(s, (i % 2 ? 1 : -1) * theta, .0045 + .004 * (noise(i * 2.3, 6) * .5 + .5) * (.5 + s), SPOT, 1.3);
  }

  precaudalPits(ctx, mix(BACK, FIN_EDGE, .4), mix(BELLY, FIN_EDGE, .35));

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
