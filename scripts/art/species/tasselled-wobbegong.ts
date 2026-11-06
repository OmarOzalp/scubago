/**
 * Tasselled wobbegong (Eucrossorhinus dasypogon): the flattest of the carpet sharks, an ambush predator that
 * lies on the reef like a rug. A very broad, flat head, ringed at the front and sides by a beard of
 * branching skin flaps; a huge terminal mouth; small eyes close together on top of the head with a
 * spiracle behind each; broad, rounded pectoral and pelvic fins held out flat; two low dorsal fins set far
 * back and a short tail. Pale sand and dark brown in a net of lines and blotches, in broad saddles
 * across the back, the fins and tassels marked the same way; pale underneath.
 */
import { Vector3 } from 'three';
import { SWIM_RIGS, type SharkRig } from '../../../src/lib/marine-rigs';
import { clamp, hex, mix, noise, smoothstep, type RGB } from './kit';
import { crisp, eyeball, markedFins, outline } from './reef-sharks';
import { barbel, roundFin, slit, tassel, worley } from './carpet-sharks';
import { sharkContext, type SharkDesign } from './shark';

const CREAM = hex('#d3bf8f'), SAND = hex('#a08454'), MID = hex('#745733'), DARK = hex('#2e1f11'), SADDLE = hex('#3d2b17');
const BELLY = hex('#e0d3b0'), FIN_UNDER = hex('#d8caa4');
const GILL = hex('#4a3822'), MOUTH = hex('#2e2014'), LIP = hex('#6e5434');
const EYE = hex('#0a0806'), IRIS = hex('#7a6a2c'), LID = hex('#5a4528'), SPIRACLE = hex('#2e2214');

const rig = SWIM_RIGS['tasselled-wobbegong'] as SharkRig;

/** Where the patterned back ends along the flank, over the edge of the flat body. */
const boundary = (s: number) => 1.58 + .05 * noise(s * 9, 3);

/**
 * The wobbegong's coat at a point of the body or a fin: a net of dark lines round pale and tan cells, with broad
 * darker saddles across the back (`s` along the body, `x` across it, in world units).
 */
function coat(s: number, x: number, seed = 0): RGB {
  const wx = x / .1 + .45 * noise(s * 9, 1 + seed), ws = s / .1 + .45 * noise(x * 9, 2 + seed);
  const cell = worley(wx, ws, 3 + seed);
  // Cells in three tones, the dark network between them.
  const ground = cell.id < .34 ? mix(SAND, CREAM, cell.id * 2) : cell.id < .7 ? mix(SAND, MID, (cell.id - .34) * 1.7) : mix(CREAM, SAND, (cell.id - .7) * 2);
  // Saddles: darker bands across the back, between pale gaps, broken up by the noise.
  const band = .5 + .5 * Math.cos((s - .12) / .105 * Math.PI * 2 + 1.6 * noise(x * 8, 5 + seed));
  const saddle = smoothstep(.55, .9, band) * smoothstep(.12, .3, 1 - Math.abs(x) / .12);
  const pale = cell.id > .7 ? .5 : 0;
  const fill = mix(ground, SADDLE, .42 * saddle * (1 - pale));
  const line = 1 - smoothstep(.04, .2, cell.edge);
  return mix(fill, DARK, .8 * line);
}

const skinColor = (s: number, theta: number, p: { x: number }): RGB => {
  const back = coat(s, p.x);
  // Under the flank edge: a pale, plain belly.
  return mix(back, mix(BELLY, back, .12), smoothstep(boundary(s) - .04, boundary(s) + .06, theta));
};

export const TASSELLED_WOBBEGONG: SharkDesign = {
  rig, nose: .4, bodyEnd: .86,
  // A very broad head and trunk, flattened like a rug, then a narrowing tail stock.
  width: [[0, 0], [.004, .034], [.012, .05], [.03, .07], [.06, .088], [.1, .1], [.16, .11], [.22, .11], [.3, .102], [.4, .088], [.5, .072], [.58, .062], [.66, .05], [.74, .04], [.8, .032], [.86, .022]],
  top: [[0, 0], [.004, .01], [.012, .017], [.03, .023], [.06, .027], [.1, .031], [.16, .037], [.22, .042], [.3, .043], [.4, .04], [.5, .035], [.58, .031], [.66, .027], [.74, .023], [.8, .019], [.86, .013]],
  bottom: [[0, 0], [.004, .007], [.012, .011], [.03, .015], [.06, .018], [.1, .021], [.16, .025], [.22, .029], [.3, .031], [.4, .03], [.5, .026], [.58, .024], [.66, .02], [.74, .017], [.8, .014], [.86, .011]],
  center: [[0, -.006], [.04, -.003], [.1, 0], [.3, 0], [.6, .003], [.86, .007]],
  squareTop: [[0, 2.4], [.1, 2.6], [.25, 2.7], [.6, 2.4], [.86, 2]],
  squareBottom: [[0, 3], [.1, 3.2], [.3, 3.4], [.6, 3], [.86, 2.2]],
  rings: 50, columnsAbove: 10, columnsBelow: 3,
  boundary, boundaryGap: .03,
  paint: (s, theta, p) => skinColor(s, theta, p),
};

export function buildTasselledWobbegong() {
  const ctx = sharkContext(TASSELLED_WOBBEGONG);
  const { mesh, bones } = ctx;
  const fins = markedFins(ctx);
  ctx.body();

  /** The coat on a fin, bands crossing it; paler toward the margin, the underside plain. */
  const finCoat = (p: Vector3, face: number, rim: number): RGB => (face > 0
    ? mix(coat(.4 - p.z, p.x * .6 + p.y * .8, 4), CREAM, .35 * rim)
    : mix(FIN_UNDER, SAND, .3));

  // Two low, rounded dorsal fins set far back, and a small anal fin.
  const dorsal = fins.midline({
    ...outline(.058, roundFin(.535, .02, .088, 1.8, .008)),
    height: .058, thickness: .016, bone: 'Dorsal', stations: 6,
    color: (p, t) => finCoat(p, 1, t),
  });
  fins.midline({
    ...outline(.05, roundFin(.655, .014, .072, 1.8, .008), .008),
    height: .05, thickness: .014, stations: 5,
    color: (p, t) => finCoat(p, 1, t),
  });
  fins.midline({
    ...outline(.034, roundFin(.7, .01, .05, 1.8), .008),
    height: .034, thickness: .011, stations: 4, ventral: true,
    color: (p, t) => finCoat(p, -1, t),
  });
  // Broad, rounded pectorals, held out flat like the edges of a rug.
  const pectorals = fins.paired({
    rootS: .17, theta: 2.15, span: .13, droop: .16, sweep: .06, thickness: .018, stations: 7,
    ...outline(.13, (t) => {
      const b = t * .13;
      const front = .1 * b + 2.4 * b ** 3;
      return [front, front + .125 * Math.sqrt(Math.max(0, 1 - t ** 2.1)) + .012 * Math.exp(-(((t - .1) / .1) ** 2))];
    }, 0),
    bone: (left) => (left ? 'PectoralL' : 'PectoralR'),
    color: (p, v, _u, _left, face) => finCoat(p, face, v),
  });
  // Large, rounded pelvic fins.
  fins.paired({
    rootS: .47, theta: 2.3, span: .075, droop: .3, sweep: .1, thickness: .014, stations: 5,
    ...outline(.075, (t) => {
      const front = .012 * t;
      return [front, front + .1 * Math.sqrt(Math.max(0, 1 - t ** 2.2))];
    }, 0),
    color: (p, v, _u, _left, face) => finCoat(p, face, v),
  });
  const axis = ctx.center(rig.joints[4]);
  // A short tail: a small lower lobe and an upper lobe about as long as the tail stock is deep.
  const tail = fins.caudal({
    low: axis - .04, high: axis + .088, edges: [axis + .06],
    le: [[axis - .04, .935], [axis - .03, .9], [axis - .012, .85], [axis + .004, .83], [axis + .025, .845], [axis + .06, .9], [axis + .08, .955], [axis + .088, .99]],
    te: [[axis - .04, .935], [axis - .03, .95], [axis - .012, .965], [axis + .01, .975], [axis + .04, .99], [axis + .07, .998], [axis + .088, 1]],
    thickness: (y) => .004 + .016 * Math.max(0, 1 - Math.abs(y - axis - .01) / .075) ** 1.2,
    upperPivot: .035, lowerPivot: .025, stations: 14,
    color: (p, y) => (p.y < axis - .01 ? mix(SAND, DARK, .15) : mix(coat(.4 - p.z, p.y * 2.4, 5), SADDLE, .25 * crisp(axis + .06, y, .004))),
  });

  // The beard: tassels all round the front and down each side of the head, each a stem with two or
  // three branches, leaning out and forward from the head's edge, longer and denser at the front.
  const bw = (s: number) => (ctx.width(s + .004) - ctx.width(s - .004)) / .008;
  // Colours follow the head's own pattern at the tassel's root, with paler tips.
  const tint = (i: number, s = .1, x = .08) => mix(coat(s, x * (1 + .1 * noise(i, 3))), MID, .15);
  const pale = (c: RGB) => mix(c, CREAM, .6);
  let k = 0;
  // One row down each side along the rim: broad, flat, leaf-like flaps lying low and out, each fanning into three lobes.
  for (const side of [1, -1]) {
    for (let s = .016; s <= .235; s += .022) {
      k++;
      const w = bw(s);
      const yaw = .3 * noise(k * 1.3, 11);
      const lean = new Vector3(side * 1, -.12, clamp(w, -.4, 2.2) * .8 - .05 * (s > .16 ? 1 : 0)).applyAxisAngle(new Vector3(0, 1, 0), yaw);
      const front = 1 - smoothstep(0, .09, s);
      const length = .05 + .014 * front + .005 * noise(k, 2);
      const c = tint(k, s, ctx.width(s));
      tassel(ctx, s, side * (1.5 + .04 * noise(k * 3.1, 7)), lean, length, .05, c, pale(c),
        { branches: 3, spread: .85 + .15 * noise(k * 2.1, 3), curl: -.002, lift: 0, flat: .12 });
    }
  }
  // Across the front of the head.
  [-1, -.55, -.18, .18, .55, 1].forEach((theta, i) => {
    const c = tint(i + 40, .01, .05 * theta);
    tassel(ctx, .006 + .004 * (i % 2), theta, new Vector3(theta * .5, -.1, 1), .056, .05, c, pale(c), { branches: 3, spread: .85, curl: -.002, lift: 0, flat: .12 });
  });
  // The two long, branched nasal barbels under the snout, and a few tassels under the chin.
  for (const side of [1, -1]) {
    barbel(ctx, .03, side * (Math.PI - .5), new Vector3(side * .12, -.4, 1), .034, .0085, tint(60), pale(tint(60)));
    tassel(ctx, .03, side * (Math.PI - .85), new Vector3(side * .6, -.5, .9), .034, .014, tint(61), pale(tint(61)), { branches: 2, spread: .8, curl: -.002, lift: 0, flat: .12 });
  }

  // Small eyes close together on top of the head, a spiracle behind each, then the gill slits under the flank.
  for (const side of [1, -1]) {
    eyeball(ctx, .088, side * .5, .0078, { pupil: EYE, iris: IRIS, lid: LID }, { squash: .8, height: .5 });
    slit(ctx, .122, side * .58, .014, .0032, SPIRACLE);
  }
  ctx.gills({ from: .17, to: .21, count: 5, top: 1.5, bottom: 2.05, halfWidth: .0012, slant: .005, color: GILL });
  // The enormous mouth: a broad curve right across the front, lips a little darker.
  ctx.ribbon(Array.from({ length: 13 }, (_, i) => {
    const t = i / 12, theta = Math.PI + (t - .5) * 2.5;
    return [.034 + .03 * (2 * t - 1) ** 2, theta] as const;
  }), (t) => .0028 * (.4 + .6 * Math.sin(Math.PI * t)), MOUTH);
  ctx.ribbon(Array.from({ length: 13 }, (_, i) => {
    const t = i / 12, theta = Math.PI + (t - .5) * 2.4;
    return [.042 + .03 * (2 * t - 1) ** 2, theta] as const;
  }), (t) => .0016 * (.4 + .6 * Math.sin(Math.PI * t)), LIP);

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
