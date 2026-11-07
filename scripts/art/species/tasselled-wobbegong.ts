/**
 * Tasselled wobbegong (Eucrossorhinus dasypogon): the flattest of the carpet sharks, an ambush predator that
 * lies on the reef like a rug. A very broad, flat, rounded head, hung round the front and sides with a beard of
 * long, thin, branching skin filaments; a huge terminal mouth; small eyes close together on top of the head with a
 * spiracle behind each; broad, rounded pectoral and pelvic fins held out flat; two low dorsal fins set far
 * back and a short tail. A beige coat all over (body, tail and fins), with a mosaic of darker beige and brown
 * squares, rectangles and irregular polygons laid on it like a shattered mirror, many of them brown outlines round a
 * beige centre, and a few soft darker-beige saddles across the back; the filaments the same; pale underneath.
 */
import { Vector3 } from 'three';
import { SWIM_RIGS, type SharkRig } from '../../../src/lib/marine-rigs';
import { clamp, curve, hex, mix, noise, smoothstep, type RGB } from './kit';
import { crisp, eyeball, markedFins, outline } from './reef-sharks';
import { finSurface, finTile, frond, roundFin, slit, tailTile, tile } from './carpet-sharks';
import { sharkContext, type SharkDesign } from './shark';

// The coat: a beige ground (the beige of the old pale tiles), darker beige and brown for the mosaic laid on it.
const CREAM = hex('#dcc99a'), BEIGE = hex('#c9b480'), BEIGE_DEEP = hex('#b39b68'), DBEIGE = hex('#a28858'), BROWN = hex('#6d5232'), DBROWN = hex('#4b3720'), SADDLE = hex('#a08658');
const BELLY = hex('#e0d3b0'), FIN_UNDER = hex('#d8caa4');
const GILL = hex('#4a3822'), MOUTH = hex('#2e2014'), LIP = hex('#6e5434');
const EYE = hex('#0a0806'), IRIS = hex('#8a7a34'), LID = hex('#5a4528'), SPIRACLE = hex('#2e2214');

const rig = SWIM_RIGS['tasselled-wobbegong'] as SharkRig;

/** Where the patterned back ends along the flank, over the edge of the flat body. */
const boundary = (s: number) => 1.6 + .05 * noise(s * 9, 3);

/** How far into one of the broad, soft darker-beige saddles a point is (0..1): irregular blotches across the back, fading out toward the flank. */
function saddleAt(s: number, x: number, seed = 0) {
  const blotch = noise(s * 7.5 + x * 4, 12 + seed) + .5 * noise(s * 19 - x * 13, 15 + seed);
  return smoothstep(.1, .8, blotch) * smoothstep(.08, .3, 1 - Math.abs(x) / .135);
}
/** The beige ground, a little lighter and deeper from place to place, with the soft saddles. The mosaic over it is geometry (`tile`), because a vertex colour cannot hold a sharp edge. */
function coatAt(s: number, x: number, seed: number): RGB {
  const ground = mix(BEIGE, BEIGE_DEEP, clamp(.3 + .5 * noise(s * 13 + x * 9, 9 + seed), 0, 1));
  return mix(ground, SADDLE, .55 * saddleAt(s, x, seed));
}
/** The coat averaged over a few samples round the point, so a vertex between two edges keeps a hint of both rather than aliasing. */
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

  /** A fin's own colour: the beige ground, the mosaic laid on top; the underside plain. */
  const finCoat = (p: Vector3, face: number, rim: number): RGB => (face > 0
    ? mix(coat(.4 - p.z, p.x * .6 + p.y * .8, 4, .01), CREAM, .12 * rim)
    : mix(FIN_UNDER, BEIGE_DEEP, .3));

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
  const tailLe = [[axis - .04, .935], [axis - .03, .9], [axis - .012, .85], [axis + .004, .83], [axis + .025, .845], [axis + .06, .9], [axis + .08, .955], [axis + .088, .99]] as const;
  const tailTe = [[axis - .04, .935], [axis - .03, .95], [axis - .012, .965], [axis + .01, .975], [axis + .04, .99], [axis + .07, .998], [axis + .088, 1]] as const;
  const tailThickness = (y: number) => .004 + .016 * Math.max(0, 1 - Math.abs(y - axis - .01) / .075) ** 1.2;
  const tail = fins.caudal({
    low: axis - .04, high: axis + .088, edges: [axis + .06],
    le: tailLe, te: tailTe, thickness: tailThickness,
    upperPivot: .035, lowerPivot: .025, stations: 14,
    color: (p, y) => mix(coat(.4 - p.z, p.y * 2.4, 5, .01), SADDLE, (p.y < axis - .01 ? .35 : 0) + .25 * crisp(axis + .06, y, .004)),
  });

  // The beard: long, thin, branching filaments hanging from the rim of the head, from the snout back to the
  // pectorals, in two ragged rows, the lengths and directions all different, a shaggy lace rather than a frill.
  const bw = (s: number) => (ctx.width(s + .004) - ctx.width(s - .004)) / .008;
  const up = new Vector3(0, 1, 0);
  // The colour follows the head's own pattern at the root, the tips paler.
  const tint = (s: number, x: number) => mix(coat(s, x), BROWN, .3);
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

  // The mosaic of the coat: flat squares, rectangles and irregular polygons of every size and angle laid on the beige ground like
  // a shattered mirror: about a third brown outlines round a beige centre, the rest solid brown or darker beige, some
  // touching, thicker in the soft saddles. Over the back, the tail stock, the fins and the tail.
  const rnd = (i: number, k: number) => { const v = Math.sin(i * 127.1 + k * 311.7 + 17.3) * 43758.5453; return v - Math.floor(v); };
  /** What patch number `i` is: its outer and inner colours (no inner for a solid patch), size, corner count and stretch. */
  const patch = (i: number, saddle: number) => {
    const kind = rnd(i, 1), sides = [4, 4, 4, 5, 5, 6, 7][Math.floor(rnd(i, 2) * 7)];
    const size = (.011 + .02 * rnd(i, 5) ** 1.5) * (1 + .15 * saddle);
    const ring = kind < .45;
    const outer = ring ? mix(BROWN, DBROWN, rnd(i, 6) * .8) : kind < .6 ? mix(BROWN, DBROWN, rnd(i, 6) * .5) : mix(DBEIGE, BEIGE_DEEP, rnd(i, 6) * .7);
    return { sides, size: ring ? size * 1.45 : size * (kind < .6 ? .75 : 1.1), outer, inner: ring ? mix(BEIGE, CREAM, rnd(i, 7) * .7) : null, stretch: .6 + 1.3 * rnd(i, 4), jitter: sides === 4 ? .2 : .4 };
  };
  let n = 0;
  for (let s = .03; s < .8;) {
    const f = clamp(ctx.width(s) / .13, .4, 1), arc = (ctx.width(s) + ctx.top(s)) * 1.05, count = Math.max(2, Math.round(arc / (.033 * f)));
    for (let i = 0; i < count; i++) {
      n++;
      if (rnd(n, 9) < .1) continue;
      const t = (i + .5 + .6 * (rnd(n, 10) - .5)) / count, theta = (-1 + 2 * t) * 1.5;
      const ps = s + .01 * (rnd(n, 11) - .5) + (i % 2 ? .014 * f : 0);
      if ((Math.abs(ps - .088) < .02 && Math.abs(Math.abs(theta) - .5) < .22) || (Math.abs(ps - .122) < .022 && Math.abs(Math.abs(theta) - .58) < .25)) continue;
      const x = ctx.raw(ps, theta).x, pt = patch(n, saddleAt(ps, x));
      tile(ctx, ps, theta, pt.size * f, pt.outer, pt.sides, pt.stretch, .0009, pt.jitter, n);
      if (pt.inner) tile(ctx, ps, theta, pt.size * f * .7, pt.inner, pt.sides, pt.stretch, .0017, pt.jitter, n);
    }
    s += .027 * Math.max(.55, f);
  }
  for (const [plan, left] of [[pectoralPlan, true], [pectoralPlan, false], [pelvicPlan, true], [pelvicPlan, false]] as const) {
    const fin = finSurface(ctx, plan, left);
    for (let a = .1; a < .97; a += .13) {
      for (let u = .12; u < .9; u += .16) {
        n++;
        if (rnd(n, 9) < .2) continue;
        const pt = patch(n, saddleAt(.4 - fin.at(a, u).z, fin.at(a, u).x * .6) * .6), r = pt.size * .85;
        finTile(ctx, fin, a + .03 * (rnd(n, 2) - .5), u + .05 * (rnd(n, 5) - .5), r, pt.outer, pt.sides, pt.jitter, n);
        if (pt.inner) finTile(ctx, fin, a + .03 * (rnd(n, 2) - .5), u + .05 * (rnd(n, 5) - .5), r * .7, pt.inner, pt.sides, pt.jitter, n, .0022);
      }
    }
  }
  const leOf = curve(tailLe), teOf = curve(tailTe), pivots = { axis, upper: .035, lower: .025 };
  for (let y = axis - .03; y < axis + .08; y += .02) {
    for (const face of [1, -1]) {
      for (const u of [.28, .62]) {
        n++;
        if (rnd(n, 9) < .25) continue;
        const pt = patch(n, 0), r = pt.size * .5;
        tailTile(ctx, leOf, teOf, tailThickness, y + .008 * (rnd(n, 2) - .5), u + .1 * (rnd(n, 5) - .5), face, r, pt.outer, pivots, pt.sides, n);
        if (pt.inner) tailTile(ctx, leOf, teOf, tailThickness, y + .008 * (rnd(n, 2) - .5), u + .1 * (rnd(n, 5) - .5), face, r * .7, pt.inner, pivots, pt.sides, n, .0022);
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
