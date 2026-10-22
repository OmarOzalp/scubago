/**
 * Whitetip reef shark (Triaenodon obesus): the slender, lithe reef shark that rests on the bottom in
 * caves. A slim body with a broad, flattened head ending in a very short, blunt snout; prominent
 * tubular flaps beside the nostrils; oval eyes under a ridge of skin; a first dorsal fin set well back,
 * its origin behind the pectorals' free rear tips, and a second dorsal and anal fin nearly as big;
 * broad pectorals; a tail with a long upper lobe notched near its tip. Grey-brown above with a few
 * small dark spots, white below. The tips of the first dorsal fin and the upper caudal lobe are bright
 * white, and the lower lobe has a smaller white tip.
 */
import { Vector3 } from 'three';
import { SWIM_RIGS, type SharkRig } from '../../../src/lib/marine-rigs';
import { hex, mix, noise, smoothstep, TAU, type RGB } from './kit';
import { crisp, eyeball, markedFins, outline, precaudalPits } from './reef-sharks';
import { sharkContext, type SharkContext, type SharkDesign } from './shark';

// Body: warm brownish grey above, a paler flank, a white belly.
const BACK = hex('#7e766a'), FLANK = hex('#958d7f'), BELLY = hex('#f1efe7');
// Fins: a touch darker than the back, bright white tips, dark spots, a pale flap with a dark opening.
const FIN = hex('#766e62'), FIN_PALE = hex('#958d7f'), FIN_UNDER = hex('#e9e6dc'), TIP = hex('#fbfbf6');
const SPOT = hex('#3c382f'), FLAP = hex('#a8a292'), FLAP_IN = hex('#2c2a24'), BROW = hex('#92897a');
const GILL = hex('#4a463d'), MOUTH = hex('#58544a'), NARE = hex('#5a564b');
const EYE = hex('#06080a'), IRIS = hex('#3c3320'), LID = hex('#625b4a');

const rig = SWIM_RIGS['whitetip-reef-shark'] as SharkRig;

/** Where the brownish-grey back meets the white belly: a little wavy, lowest over the belly's middle. */
const boundary = (s: number) => 1.7 + .12 * smoothstep(.06, .26, s) + .03 * noise(s * 15, 3);

const skinColor = (s: number, theta: number): RGB => {
  const upper = mix(BACK, FLANK, smoothstep(.2, 1.5, theta));
  return mix(upper, BELLY, smoothstep(boundary(s) - .03, boundary(s) + .03, theta));
};

export const WHITETIP_REEF_SHARK: SharkDesign = {
  rig, nose: .4, bodyEnd: .8,
  // A broad, flat head with a very short, blunt snout, then a slim body and a long, slender tail stock.
  width: [[0, 0], [.003, .02], [.01, .036], [.02, .046], [.035, .053], [.055, .057], [.08, .06], [.12, .062], [.16, .063], [.22, .064], [.29, .063], [.36, .06], [.44, .054], [.52, .046], [.6, .037], [.66, .03], [.72, .022], [.77, .015], [.8, .0095]],
  top: [[0, 0], [.003, .008], [.01, .014], [.02, .02], [.035, .025], [.055, .031], [.08, .038], [.12, .045], [.16, .052], [.22, .058], [.29, .061], [.36, .06], [.44, .055], [.52, .047], [.6, .038], [.66, .03], [.72, .024], [.77, .017], [.8, .013]],
  bottom: [[0, 0], [.003, .007], [.01, .012], [.02, .017], [.035, .023], [.055, .028], [.08, .034], [.12, .04], [.16, .046], [.22, .051], [.29, .053], [.36, .052], [.44, .047], [.52, .04], [.6, .033], [.66, .027], [.72, .021], [.77, .016], [.8, .012]],
  center: [[0, -.005], [.04, -.003], [.1, 0], [.2, 0], [.4, .002], [.6, .004], [.8, .006]],
  squareTop: [[0, 2.5], [.1, 2.5], [.25, 2.15], [.6, 2.05], [.8, 2]],
  squareBottom: [[0, 2.5], [.1, 2.5], [.3, 2.3], [.6, 2.2], [.8, 2]],
  rings: 44, columnsAbove: 7, columnsBelow: 5,
  boundary, boundaryGap: .03,
  paint: (s, theta) => skinColor(s, theta),
};

/** A short, wide tube of skin standing off the snout at `[s, theta]`, leaning along `lean`, with a dark opening in its end. */
function nasalFlap(ctx: SharkContext, s: number, theta: number, lean: Vector3, length: number, radius: number) {
  const { mesh } = ctx;
  const n = ctx.normal(s, theta), base = ctx.surface(s, theta, -.003), weights = ctx.skin(s);
  const axis = n.clone().multiplyScalar(.45).add(lean.clone().normalize()).normalize();
  const t1 = new Vector3(0, 1, 0).cross(axis).normalize(), t2 = axis.clone().cross(t1);
  const sides = 8;
  mesh.begin();
  const ring = (at: number, r: number, color: RGB) => Array.from({ length: sides }, (_, i) => {
    const a = TAU * i / sides;
    const p = base.clone().addScaledVector(axis, at * length).addScaledVector(t1, Math.cos(a) * r).addScaledVector(t2, Math.sin(a) * r);
    return mesh.vertex(p, color, weights);
  });
  const bottom = ring(0, radius * 1.1, mix(FLAP, BELLY, .3)), top = ring(1, radius * .62, mix(FLAP, BELLY, .45));
  const hole = mesh.vertex(base.clone().addScaledVector(axis, length * .8), FLAP_IN, weights);
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    mesh.quad(bottom[i], bottom[j], top[j], top[i]);
    mesh.tri(hole, top[j], top[i]);
  }
  mesh.end({ closed: false, outward: (i) => mesh.point(i).sub(base.clone().addScaledVector(axis, length * .5)) });
}

/** A low, elongated ridge of skin over `[s, theta]`: `rs` long in s, `rt` wide in theta, `height` tall. */
function ridge(ctx: SharkContext, s: number, theta: number, rs: number, rt: number, height: number, color: RGB) {
  const { mesh } = ctx;
  const weights = ctx.skin(s), segments = 10, rings = [.55, 1];
  mesh.begin();
  const center = mesh.vertex(ctx.surface(s, theta, height), color, weights, ctx.normal(s, theta));
  const rows = rings.map((r) => Array.from({ length: segments }, (_, i) => {
    const a = TAU * i / segments;
    const ps = s + Math.cos(a) * rs * r, pt = theta + Math.sin(a) * rt * r;
    return mesh.vertex(ctx.surface(ps, pt, height * (r < 1 ? .6 : .02)), color, weights, ctx.normal(ps, pt));
  }));
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;
    mesh.tri(center, rows[0][i], rows[0][j]);
    mesh.quad(rows[0][i], rows[1][i], rows[1][j], rows[0][j]);
  }
  mesh.end({ closed: false, normals: false, outward: (i) => new Vector3(mesh.normals[i * 3], mesh.normals[i * 3 + 1], mesh.normals[i * 3 + 2]) });
}

export function buildWhitetipReefShark() {
  const ctx = sharkContext(WHITETIP_REEF_SHARK);
  const { mesh, bones } = ctx;
  const fins = markedFins(ctx);
  ctx.body();

  /** Grey-brown, paler toward the front edge (standing fins are lit from the side, so they get a paler tone). */
  const grey = (u: number) => mix(FIN, FIN_PALE, .25 + .3 * (1 - u));

  // The first dorsal: set well back, fairly low, broadly rounded at the top; its top quarter bright white.
  const dorsal = fins.midline({
    ...outline(.088, (t) => [.386 + .056 * t ** 1.3, .442 + .032 * (1 - t) ** 1.7 + .008 * Math.sqrt(1 - t) * t ** 8]),
    height: .088, thickness: .016, bone: 'Dorsal', stations: 6, edges: [.58],
    color: (_p, t, u) => mix(grey(u), TIP, crisp(.58, t)),
  });
  // Second dorsal and anal fins nearly as big as the first, with long free rear tips.
  fins.midline({
    ...outline(.06, (t) => [.632 + .04 * t ** 1.2, .69 + .03 * (1 - t) ** 1.9 + .014 * Math.sqrt(1 - t) * t ** 6], .008),
    height: .06, thickness: .009, stations: 5,
    color: (_p, _t, u) => grey(u),
  });
  fins.midline({
    ...outline(.056, (t) => [.618 + .04 * t ** 1.2, .674 + .03 * (1 - t) ** 1.9 + .014 * Math.sqrt(1 - t) * t ** 6], .008),
    height: .056, thickness: .009, stations: 5, ventral: true,
    color: (_p, _t, u) => mix(mix(FIN_UNDER, FIN_PALE, .25 * (1 - u)), grey(u), .3),
  });
  // Broad pectorals, a wide base, a gently convex front edge and a rounded-pointed tip.
  const pectorals = fins.paired({
    rootS: .2, theta: 2, span: .138, droop: .32, sweep: .1, thickness: .016, stations: 8,
    ...outline(.138, (t) => {
      const b = t * .138;
      const front = .4 * b + 7 * b ** 3;
      return [front, front + .1 * (1 - t) ** 1.05 + .012 * Math.exp(-(((t - .1) / .1) ** 2)) + .03 * Math.sqrt(1 - t) * t ** 3];
    }, 0),
    bone: (left) => (left ? 'PectoralL' : 'PectoralR'),
    color: (_p, v, u, _left, face) => (face > 0 ? grey(u) : mix(FIN_UNDER, FIN_PALE, .2 * v)),
  });
  // Large-ish pelvic fins with a short, blunt tip.
  fins.paired({
    rootS: .5, theta: 2.4, span: .06, droop: .8, sweep: .15, thickness: .01, stations: 5,
    ...outline(.06, (t) => {
      const front = .03 * (.4 * t + .6 * t ** 2);
      return [front, front + .058 * (1 - t) ** .6];
    }, 0),
    color: (_p, v, u, _left, face) => (face > 0 ? grey(u) : mix(FIN_UNDER, FIN_PALE, .2 * v)),
  });
  const axis = ctx.center(rig.joints[4]);
  // A tail with a long upper lobe notched near its tip and a good lower lobe; bright white tips on both
  // lobes, the upper one larger.
  const tail = fins.caudal({
    low: axis - .095, high: axis + .178, edges: [axis - .052, axis + .088],
    le: [[axis - .095, .942], [axis - .074, .905], [axis - .048, .862], [axis - .024, .824], [axis - .008, .8], [axis + .006, .79], [axis + .02, .797], [axis + .05, .832], [axis + .088, .875], [axis + .12, .915], [axis + .14, .94], [axis + .153, .958], [axis + .16, .97], [axis + .178, 1]],
    te: [[axis - .095, .942], [axis - .074, .935], [axis - .048, .916], [axis - .024, .892], [axis + .004, .87], [axis + .03, .885], [axis + .062, .91], [axis + .095, .936], [axis + .12, .956], [axis + .14, .973], [axis + .146, .978], [axis + .153, .97], [axis + .16, .979], [axis + .178, 1]],
    thickness: (y) => .004 + .018 * Math.max(0, 1 - Math.abs(y - axis) / .115) ** 1.2,
    upperPivot: .05, lowerPivot: .04, stations: 18,
    color: (p, y, u) => {
      const base = mix(FIN, FIN_PALE, .25 + .2 * (1 - u) - (p.y < axis ? .1 : 0));
      return mix(base, TIP, Math.max(crisp(axis + .088, y, .002), 1 - crisp(axis - .052, y, .002)));
    },
  });

  // Oval eyes under a ridge of skin, set well forward on the broad head.
  for (const side of [1, -1]) {
    eyeball(ctx, .06, side * 1.28, .0075, { pupil: EYE, iris: IRIS, lid: LID }, { squash: .72 });
    ridge(ctx, .06, side * 1.02, .017, .1, .0048, BROW);
  }
  ctx.gills({ from: .148, to: .192, count: 5, top: 1.35, bottom: 1.95, halfWidth: .0014, slant: .006, color: GILL });
  // A broad, shallow arc of a mouth under the snout.
  ctx.ribbon(Array.from({ length: 9 }, (_, i) => {
    const t = i / 8, theta = Math.PI + (t - .5) * 1.8;
    return [.05 + .016 * (2 * t - 1) ** 2, theta] as const;
  }), (t) => .0016 * (.5 + .5 * Math.sin(Math.PI * t)), MOUTH);
  // The prominent tubular flaps beside the nostrils, leaning forward off the underside of the snout.
  for (const side of [1, -1]) {
    nasalFlap(ctx, .02, side * (Math.PI - .62), new Vector3(side * .15, -.1, 1), .019, .0062);
    ctx.ribbon(Array.from({ length: 5 }, (_, i) => [.03 + .012 * i / 4, side * (Math.PI - .66 - .12 * i / 4)] as const),
      (t) => .0017 * Math.sin(Math.PI * (.12 + .76 * t)) ** .6, NARE, .001);
  }
  // A few small dark spots on the back and upper flanks, irregular and well apart.
  [[.14, .55, .0048], [.22, 1.0, .0042], [.3, .4, .0052], [.38, .85, .0046], [.47, .3, .0044], [.52, 1.1, .005], [.6, .6, .0044], [.67, .95, .004]].forEach(([s, theta, r], i) => {
    ctx.spot(s, (i % 2 ? 1 : -1) * theta, r, SPOT, 1.4);
  });

  precaudalPits(ctx, mix(BACK, FIN, .5), mix(BELLY, FIN, .35));

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
