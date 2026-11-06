/**
 * Zebra shark, also called the leopard shark (Stegostoma tigrinum), as an adult: a slender carpet shark with
 * five prominent ridges along its body (one on the back, two on each flank), a rounded blunt snout with a
 * short barbel at each nostril, small eyes with a large spiracle behind each, a small mouth well in
 * front of the eyes' line underneath; a big, rounded first dorsal and a smaller second one set far back,
 * broad rounded pectorals, and an immensely long, slender tail whose upper lobe makes up almost half its
 * length. Pale tan to yellowish, covered in small dark brown spots, cream underneath.
 */
import { Vector3 } from 'three';
import { SWIM_RIGS, type SharkRig } from '../../../src/lib/marine-rigs';
import { hex, mix, noise, smoothstep, type RGB } from './kit';
import { crisp, eyeball, markedFins, outline } from './reef-sharks';
import { barbel, dot, roundFin, slit } from './carpet-sharks';
import { sharkContext, type SharkDesign } from './shark';

const BACK = hex('#bba372'), FLANK = hex('#c9b080'), BELLY = hex('#efe6cf'), RIDGE = hex('#a68b5a');
const FIN = hex('#b39a68'), FIN_PALE = hex('#c8ae7e'), FIN_UNDER = hex('#e5dac0'), EDGE = hex('#d6c394');
const SPOT = hex('#503a22'), SPOT_SOFT = hex('#6b5232');
const GILL = hex('#6a5434'), MOUTH = hex('#5a4730'), BARBEL = hex('#d6c394'), BARBEL_TIP = hex('#e8dcb6');
const EYE = hex('#0a0a08'), IRIS = hex('#4a3a1c'), LID = hex('#8a7448'), SPIRACLE = hex('#4a3a22');

const rig = SWIM_RIGS['zebra-shark'] as SharkRig;

/** The belly line is the lower flank ridge (the ridges sit on the columns: 0, 1 and 2 rad from the back). */
const LOWER = 2, UPPER = .985;
const boundary = () => LOWER;

const skinColor = (s: number, theta: number): RGB => {
  const upper = mix(BACK, FLANK, smoothstep(.3, 1.9, theta) * .8);
  // The ridges are a touch darker than the skin between them.
  const ridges = Math.max(Math.exp(-((theta / .14) ** 2)), Math.exp(-(((theta - UPPER) / .14) ** 2)), Math.exp(-(((theta - LOWER + .03) / .14) ** 2)));
  const ridge = .5 * ridges * smoothstep(.1, .2, s) * (1 - smoothstep(.62, .75, s));
  return mix(mix(upper, RIDGE, ridge), BELLY, smoothstep(LOWER - .02, LOWER + .08, theta));
};

export const ZEBRA_SHARK: SharkDesign = {
  rig, nose: .4, bodyEnd: .88,
  // A rounded snout and a broad flat head, a slender trunk, then a long, narrowing tail stock.
  width: [[0, 0], [.004, .028], [.012, .043], [.028, .052], [.055, .058], [.1, .066], [.16, .068], [.24, .064], [.32, .057], [.4, .048], [.48, .04], [.56, .031], [.64, .024], [.72, .018], [.8, .013], [.88, .008]],
  top: [[0, 0], [.004, .009], [.012, .016], [.028, .024], [.055, .032], [.1, .041], [.16, .048], [.24, .051], [.32, .05], [.4, .045], [.48, .038], [.56, .03], [.64, .024], [.72, .018], [.8, .013], [.88, .009]],
  bottom: [[0, 0], [.004, .008], [.012, .014], [.028, .021], [.055, .028], [.1, .036], [.16, .041], [.24, .043], [.32, .042], [.4, .038], [.48, .032], [.56, .026], [.64, .02], [.72, .016], [.8, .012], [.88, .008]],
  center: [[0, -.012], [.04, -.007], [.1, -.001], [.2, 0], [.4, .002], [.6, .005], [.8, .01], [.88, .013]],
  squareTop: [[0, 2.6], [.1, 2.4], [.25, 2.2], [.6, 2.1], [.88, 2]],
  squareBottom: [[0, 2.8], [.1, 2.6], [.3, 2.4], [.6, 2.2], [.88, 2]],
  // Ridges along the back (0 rad) and flanks (about 1 and 2 rad), from behind the head to the base of the tail fin.
  ridges: [
    { angle: 0, height: [[0, 0], [.08, 0], [.14, .006], [.3, .008], [.56, .007], [.7, .004], [.8, 0]] },
    { angle: UPPER, height: [[0, 0], [.08, 0], [.14, .007], [.3, .009], [.56, .008], [.7, .004], [.8, 0]] },
    { angle: LOWER - .03, height: [[0, 0], [.08, 0], [.14, .007], [.3, .009], [.56, .008], [.7, .004], [.8, 0]] },
  ],
  rings: 52, columnsAbove: 4, columnsBelow: 4,
  boundary, boundaryGap: .03,
  paint: (s, theta) => skinColor(s, theta),
};

export function buildZebraShark() {
  const ctx = sharkContext(ZEBRA_SHARK);
  const { mesh, bones } = ctx;
  const fins = markedFins(ctx);
  ctx.body();

  const tone = (u: number) => mix(FIN, FIN_PALE, .2 + .35 * (1 - u));

  // A big, rounded first dorsal with a long base, over the pelvic fins; a smaller second one far back.
  const dorsal = fins.midline({
    ...outline(.088, roundFin(.38, .03, .12, 1.7, .01)),
    height: .088, thickness: .018, bone: 'Dorsal', stations: 7,
    color: (_p, t, u) => mix(tone(u), EDGE, .3 * crisp(.9, t)),
  });
  fins.midline({
    ...outline(.058, roundFin(.575, .014, .075, 1.8, .008), .008),
    height: .058, thickness: .012, stations: 6,
    color: (_p, t, u) => mix(tone(u), EDGE, .3 * crisp(.88, t)),
  });
  // The anal fin, small, just before the tail.
  fins.midline({
    ...outline(.034, roundFin(.605, .008, .045, 1.8), .008),
    height: .034, thickness: .01, stations: 5, ventral: true,
    color: (_p, _t, u) => mix(mix(FIN_UNDER, FIN_PALE, .3 * (1 - u)), tone(u), .3),
  });
  // Broad, rounded pectorals, wing-like from above.
  const pectorals = fins.paired({
    rootS: .19, theta: 2.0, span: .15, droop: .34, sweep: .1, thickness: .018, stations: 8,
    ...outline(.15, (t) => {
      const b = t * .15;
      const front = .26 * b + 4.6 * b ** 3;
      return [front, front + .12 * Math.sqrt(Math.max(0, 1 - t ** 2.2)) + .012 * Math.exp(-(((t - .1) / .1) ** 2))];
    }, 0),
    bone: (left) => (left ? 'PectoralL' : 'PectoralR'),
    color: (_p, v, u, _left, face) => (face > 0 ? tone(u) : mix(FIN_UNDER, FIN_PALE, .25 * v)),
  });
  // Pelvic fins, rounded and smaller.
  fins.paired({
    rootS: .43, theta: 2.4, span: .062, droop: .85, sweep: .12, thickness: .012, stations: 5,
    ...outline(.062, (t) => {
      const front = .012 * t;
      return [front, front + .07 * Math.sqrt(Math.max(0, 1 - t ** 2.4))];
    }, 0),
    color: (_p, v, u, _left, face) => (face > 0 ? tone(u) : mix(FIN_UNDER, FIN_PALE, .25 * v)),
  });
  const axis = ctx.center(rig.joints[4]);
  // The tail: a long, narrow blade, its upper edge rising gently from the body all the way to the tip, only a
  // small lobe below.
  const tail = fins.caudal({
    low: axis - .024, high: axis + .05, edges: [axis + .034],
    le: [[axis - .024, .94], [axis - .016, .87], [axis - .006, .77], [axis + .003, .67], [axis + .012, .64], [axis + .024, .68], [axis + .036, .78], [axis + .046, .91], [axis + .05, .985]],
    te: [[axis - .024, .94], [axis - .016, .955], [axis - .006, .975], [axis + .01, .99], [axis + .03, .997], [axis + .05, 1]],
    thickness: (y) => .003 + .012 * Math.max(0, 1 - Math.abs(y - axis - .005) / .06) ** 1.2,
    upperPivot: .03, lowerPivot: .015, stations: 14,
    color: (p, y, u) => mix(mix(FIN, FIN_PALE, .25 + .2 * (1 - u)), EDGE, .3 * crisp(axis + .034, y, .004) + (p.y < axis ? .1 : 0)),
  });

  // Small eyes, each with a large spiracle just behind it.
  for (const side of [1, -1]) {
    eyeball(ctx, .082, side * 1.2, .0048, { pupil: EYE, iris: IRIS, lid: LID }, { squash: .9 });
    slit(ctx, .112, side * .95, .015, .0032, SPIRACLE);
  }
  ctx.gills({ from: .145, to: .2, count: 5, top: 1.25, bottom: 1.95, halfWidth: .0013, slant: .006, color: GILL });
  ctx.ribbon(Array.from({ length: 9 }, (_, i) => {
    const t = i / 8, theta = Math.PI + (t - .5) * 1.1;
    return [.052 + .008 * (2 * t - 1) ** 2, theta] as const;
  }), (t) => .0016 * (.5 + .5 * Math.sin(Math.PI * t)), MOUTH);
  for (const side of [1, -1]) {
    barbel(ctx, .022, side * (Math.PI - .55), new Vector3(side * .1, -.5, 1), .036, .009, BARBEL, BARBEL_TIP);
  }

  // Many small dark spots over the back and flanks (not the belly), thinning along the tail.
  let n = 0;
  for (let s = .05; s < .86; s += .0175) {
    const w = ctx.width(s), count = Math.max(2, Math.round((ctx.top(s) + w) * (s < .62 ? 70 : 50)));
    const reach = s > .62 ? 1.5 : 1.95;
    for (let i = 0; i < count; i++) {
      n++;
      const t = (i + .5 + .4 * noise(n * 1.7, 4)) / count, theta = (-1 + 2 * t) * reach;
      const ps = s + .01 * noise(n * 2.9, 6) + (i % 2 ? .01 : 0);
      if (ps < .06 || ps > .86) continue;
      const r = (.0048 + .0018 * (.5 + .5 * noise(n * 3.3, 8))) * (s > .62 ? .8 : 1);
      dot(ctx, ps, theta, r, n % 6 === 0 ? SPOT_SOFT : SPOT, 5, 1.1);
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
