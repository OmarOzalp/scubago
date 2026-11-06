/**
 * Tasselled wobbegong (Eucrossorhinus dasypogon): the flattest of the carpet sharks, an ambush predator that
 * lies on the reef like a rug. A very broad, flat, rounded head, hung round the front and sides with a beard of
 * long, thin, branching skin filaments; a huge terminal mouth; small eyes close together on top of the head with a
 * spiracle behind each; broad, rounded pectoral and pelvic fins held out flat; two low dorsal fins set far
 * back and a short tail. Mid-brown netted with dark lines round pale cream cells, in broad dark saddles
 * across the back, the fins and filaments marked the same way; pale underneath.
 */
import { Vector3 } from 'three';
import { SWIM_RIGS, type SharkRig } from '../../../src/lib/marine-rigs';
import { clamp, hex, mix, noise, smoothstep, type RGB } from './kit';
import { crisp, eyeball, markedFins, outline } from './reef-sharks';
import { finSurface, finTile, frond, roundFin, slit, tile } from './carpet-sharks';
import { sharkContext, type SharkDesign } from './shark';

const CREAM = hex('#d9c797'), SAND = hex('#957b4a'), MID = hex('#5e4829'), GROUND = hex('#3a2a16'), TAN_DARK = hex('#6e5532'), DARK = hex('#2a1c0f'), SADDLE = hex('#34240f');
const BELLY = hex('#e0d3b0'), FIN_UNDER = hex('#d8caa4');
const GILL = hex('#4a3822'), MOUTH = hex('#2e2014'), LIP = hex('#6e5434');
const EYE = hex('#0a0806'), IRIS = hex('#8a7a34'), LID = hex('#5a4528'), SPIRACLE = hex('#2e2214');

const rig = SWIM_RIGS['tasselled-wobbegong'] as SharkRig;

/** Where the patterned back ends along the flank, over the edge of the flat body. */
const boundary = (s: number) => 1.6 + .05 * noise(s * 9, 3);

/** How far into one of the broad dark saddles a point is (0..1): irregular blotches across the back, fading out toward the flank. */
function saddleAt(s: number, x: number, seed = 0) {
  const blotch = noise(s * 7.5 + x * 4, 12 + seed) + .5 * noise(s * 19 - x * 13, 15 + seed);
  return smoothstep(.0, .7, blotch) * smoothstep(.08, .3, 1 - Math.abs(x) / .135);
}
/**
 * The wobbegong's coat between the tiles: the dark brown ground that shows through as the net (darker in the saddles).
 * The pale mosaic over it is geometry (`tile`), because a vertex colour cannot hold a thin line.
 */
function coatAt(s: number, x: number, seed: number): RGB {
  const ground = mix(GROUND, MID, clamp(.3 + .3 * noise(s * 17 + x * 9, 9 + seed), 0, 1));
  return mix(ground, SADDLE, .6 * saddleAt(s, x, seed));
}
/** The coat averaged over a few samples round the point, so a vertex between two lines keeps a hint of both rather than aliasing. */
function coat(s: number, x: number, seed = 0, spread = .006): RGB {
  const samples: RGB[] = [coatAt(s, x, seed), coatAt(s + spread, x, seed), coatAt(s - spread, x, seed), coatAt(s, x + spread, seed), coatAt(s, x - spread, seed)];
  return [0, 1, 2].map((k) => samples.reduce((sum, c) => sum + c[k], 0) / samples.length) as RGB;
}

const skinColor = (s: number, theta: number, p: { x: number }): RGB => {
  const back = coat(s, p.x);
  // Under the flank edge: a pale, plain belly.
  return mix(back, mix(BELLY, back, .1), smoothstep(boundary(s) - .04, boundary(s) + .06, theta));
};

export const TASSELLED_WOBBEGONG: SharkDesign = {
  rig, nose: .4, bodyEnd: .86,
  // A very broad, rounded head and trunk, flattened like a rug, then a narrowing tail stock.
  width: [[0, 0], [.004, .044], [.012, .07], [.03, .1], [.06, .126], [.1, .14], [.16, .15], [.24, .15], [.32, .142], [.4, .13], [.48, .112], [.55, .092], [.62, .072], [.7, .052], [.78, .037], [.86, .022]],
  top: [[0, 0], [.004, .009], [.012, .015], [.03, .021], [.06, .026], [.1, .031], [.16, .037], [.22, .042], [.3, .043], [.4, .04], [.5, .035], [.58, .031], [.66, .027], [.74, .023], [.8, .019], [.86, .013]],
  bottom: [[0, 0], [.004, .006], [.012, .01], [.03, .014], [.06, .017], [.1, .02], [.16, .024], [.22, .028], [.3, .03], [.4, .03], [.5, .026], [.58, .024], [.66, .02], [.74, .017], [.8, .014], [.86, .011]],
  center: [[0, -.006], [.04, -.003], [.1, 0], [.3, 0], [.6, .003], [.86, .007]],
  squareTop: [[0, 2.4], [.1, 2.6], [.25, 2.7], [.6, 2.4], [.86, 2]],
  squareBottom: [[0, 3], [.1, 3.2], [.3, 3.4], [.6, 3], [.86, 2.2]],
  rings: 46, columnsAbove: 9, columnsBelow: 2,
  boundary, boundaryGap: .03,
  paint: (s, theta, p) => skinColor(s, theta, p),
};

export function buildTasselledWobbegong() {
  const ctx = sharkContext(TASSELLED_WOBBEGONG);
  const { mesh, bones } = ctx;
  const fins = markedFins(ctx);
  ctx.body();

  /** A fin's own colour: the dark ground, the pale tiles laid on top; the underside plain. */
  const finCoat = (p: Vector3, face: number, rim: number): RGB => (face > 0
    ? mix(coat(.4 - p.z, p.x * .6 + p.y * .8, 4, .01), CREAM, .12 * rim)
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
  // Broad, rounded pectorals with a wide base, an elliptical outline swept back, lying close along the body like the edges of a rug.
  const pectoralPlan = {
    rootS: .15, theta: 2.1, span: .2, droop: .06, sweep: .05, thickness: .018,
    ...outline(.2, (t) => {
      const mid = .1 + .08 * t, half = .12 * Math.sqrt(Math.max(0, 1 - t ** 2));
      return [mid - half, mid + half];
    }, 0),
    bone: (left: boolean) => (left ? 'PectoralL' : 'PectoralR'),
  };
  const pectorals = fins.paired({
    ...pectoralPlan, stations: 9,
    color: (p, v, _u, _left, face) => finCoat(p, face, v),
  });
  // Large, rounded pelvic fins, the same.
  const pelvicPlan = {
    rootS: .4, theta: 2.25, span: .13, droop: .18, sweep: .1, thickness: .014,
    ...outline(.13, (t) => {
      const mid = .09 + .06 * t, half = .09 * Math.sqrt(Math.max(0, 1 - t ** 2));
      return [mid - half, mid + half];
    }, 0),
  };
  fins.paired({
    ...pelvicPlan, stations: 6,
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
    color: (p, y) => (p.y < axis - .01 ? mix(SAND, DARK, .15) : mix(coat(.4 - p.z, p.y * 2.4, 5, .01), SADDLE, .25 * crisp(axis + .06, y, .004))),
  });

  // The beard: long, thin, branching filaments hanging from the rim of the head, from the snout back to the
  // pectorals, in two ragged rows, the lengths and directions all different, a shaggy lace rather than a frill.
  const bw = (s: number) => (ctx.width(s + .004) - ctx.width(s - .004)) / .008;
  const up = new Vector3(0, 1, 0);
  // The colour follows the head's own pattern at the root, the tips paler.
  const tint = (s: number, x: number) => mix(coat(s, x), MID, .2);
  const pale = (c: RGB) => mix(c, CREAM, .7);
  let k = 0;
  for (const side of [1, -1]) {
    for (const row of [0, 1]) {
      for (let s = .008 + row * .006; s <= .165; s += .0125 * (.85 + .3 * noise(k * 1.9, 4))) {
        k++;
        const w = bw(s);
        const yaw = .6 * noise(k * 1.3, 11);
        // Out from the rim (forward at the snout, sideways along the flank, back toward the pectoral), hanging down to the bottom.
        const lean = new Vector3(side * 1, -.1 - .15 * row, clamp(w, -.6, 2.2) * .8 + (s < .05 ? .6 : 0) - (s > .17 ? .4 : 0)).applyAxisAngle(up, yaw);
        const length = (.036 + .022 * noise(k, 2) + .012 * (1 - smoothstep(0, .12, s))) * (row ? .8 : 1) * (1 - .35 * smoothstep(.1, .165, s));
        const c = tint(s, ctx.width(s) * (.7 + .3 * noise(k, 3)));
        frond(ctx, s, side * (1.46 + .17 * row + .06 * noise(k * 3.1, 7)), lean, length, .011, c, pale(c),
          { branches: row ? 2 : 3, spread: .45 + .3 * noise(k * 2.1, 3), sag: .12, droop: 1 });
      }
    }
  }
  // Across the front of the snout: the longest and densest, hanging forward.
  for (let i = 0; i < 11; i++) {
    const theta = -1.35 + 2.7 * i / 10;
    const c = tint(.01, .05 * theta);
    frond(ctx, .005 + .004 * (i % 2), theta, new Vector3(Math.sin(theta) * 1.2, -.12, Math.cos(theta) + .6), .048 + .014 * noise(i, 6), .011, c, pale(c), { branches: 3, spread: .5, sag: .12 });
  }
  // The two long, branched nasal barbels under the snout, and a few tassels under the chin.
  for (const side of [1, -1]) {
    frond(ctx, .03, side * (Math.PI - .5), new Vector3(side * .15, -.15, 1), .06, .011, tint(.03, .05), pale(tint(.03, .05)), { branches: 3, spread: .5, sag: .3 });
    for (let j = 0; j < 3; j++) {
      const c = tint(.04 + .02 * j, .05);
      frond(ctx, .04 + .012 * j, side * (Math.PI - 1.0 - .22 * j), new Vector3(side * .7, -.15, .8), .042, .009, c, pale(c), { branches: 2, spread: .6, sag: .3 });
    }
  }

  // The pale mosaic of the coat: many irregular five- to seven-sided tiles in slightly different tans laid over the dark ground
  // with small gaps between them (the gaps are the dark net), darker inside the saddles. Over the back, the tail stock and
  // the fins.
  const shade = (n: number, saddle: number): RGB => mix(mix(CREAM, SAND, clamp(.3 + .5 * (.5 + .5 * noise(n * 2.7, 3)), 0, 1)), TAN_DARK, .7 * saddle);
  let n = 0;
  for (let s = .03; s < .8;) {
    const f = clamp(ctx.width(s) / .13, .4, 1), arc = (ctx.width(s) + ctx.top(s)) * 1.05, count = Math.max(2, Math.round(arc / (.0325 * f)));
    for (let i = 0; i < count; i++) {
      n++;
      const t = (i + .5 + .5 * noise(n * 1.7, 4)) / count, theta = (-1 + 2 * t) * 1.5;
      const ps = s + .008 * noise(n * 2.9, 6) + (i % 2 ? .014 * f : 0);
      if ((Math.abs(ps - .088) < .02 && Math.abs(Math.abs(theta) - .5) < .22) || (Math.abs(ps - .122) < .022 && Math.abs(Math.abs(theta) - .58) < .25)) continue;
      const x = ctx.raw(ps, theta).x;
      tile(ctx, ps, theta, (.0178 + .004 * noise(n * 3.3, 8)) * f, shade(n, saddleAt(ps, x)), 5 + Math.floor(3 * (.5 + .5 * noise(n * 4.1, 9)) * .99), 1.05, .0009, .35, n);
    }
    s += .0285 * Math.max(.55, f);
  }
  for (const [plan, left] of [[pectoralPlan, true], [pectoralPlan, false], [pelvicPlan, true], [pelvicPlan, false]] as const) {
    const fin = finSurface(ctx, plan, left);
    for (let a = .1; a < .97; a += .12) {
      for (let u = .12; u < .9; u += .14) {
        n++;
        finTile(ctx, fin, a + .02 * noise(n, 2), u + .03 * noise(n, 5),   .0165 + .003 * noise(n * 3.3, 8), shade(n, saddleAt(.4 - fin.at(a, u).z, fin.at(a, u).x * .6) * .6), 5 + (n % 3), .3, n);
      }
    }
  }

  // Small eyes close together on top of the head, a spiracle behind each, then the gill slits under the flank.
  for (const side of [1, -1]) {
    eyeball(ctx, .088, side * .5, .0085, { pupil: EYE, iris: IRIS, lid: LID }, { squash: .8, height: .5 });
    slit(ctx, .122, side * .58, .016, .0036, SPIRACLE);
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
