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
import { curve as curveOf, hex, mix, noise, smoothstep, type RGB } from './kit';
import { crisp, eyeball, markedFins, outline } from './reef-sharks';
import { barbel, finSpeck, finSurface, midlineSpeck, roundFin, slit, speck, tailSpeck } from './carpet-sharks';
import { sharkContext, type SharkDesign } from './shark';

const BACK = hex('#bba372'), FLANK = hex('#c9b080'), BELLY = hex('#efe6cf'), RIDGE = hex('#a68b5a'), CREST = hex('#d9c698');
const FIN = hex('#b39a68'), FIN_PALE = hex('#c8ae7e'), FIN_UNDER = hex('#e5dac0'), EDGE = hex('#d6c394');
const SPOT = hex('#503a22'), SPOT_SOFT = hex('#6b5232');
const GILL = hex('#6a5434'), MOUTH = hex('#5a4730'), BARBEL = hex('#d6c394'), BARBEL_TIP = hex('#e8dcb6');
const EYE = hex('#0a0a08'), IRIS = hex('#4a3a1c'), LID = hex('#8a7448'), SPIRACLE = hex('#4a3a22');

const rig = SWIM_RIGS['zebra-shark'] as SharkRig;

/** The belly line is the lower flank ridge (the ridges sit on the columns: 0, 1 and 2 rad from the back). */
const LOWER = 2, UPPER = .985;
const boundary = () => LOWER;
/** The five ridges (one on the back, two on each flank) as angles from the back, and the troughs between them. */
const CRESTS = [0, UPPER, LOWER - .03];
const TROUGHS = [.49, 1.48];

const skinColor = (s: number, theta: number): RGB => {
  const upper = mix(BACK, FLANK, smoothstep(.3, 1.9, theta) * .8);
  // Each crest is a touch paler than the skin beside it, the hollows between them a touch darker: the lines read in any light.
  const near = (angles: number[], width: number) => Math.max(...angles.map((a) => Math.exp(-(((theta - a) / width) ** 2))));
  const run = smoothstep(.1, .2, s) * (1 - smoothstep(.7, .84, s));
  const shaded = mix(mix(upper, CREST, .5 * near(CRESTS, .12) * run), RIDGE, .22 * near(TROUGHS, .2) * run);
  return mix(shaded, BELLY, smoothstep(LOWER - .02, LOWER + .08, theta));
};

/** An ellipse quarter: 0 at the nose rising to `peak` at `at` (a smooth, blunt, rounded front with no flat face). */
const blunt = (peak: number, at: number, stations: readonly number[]) => stations.map((s) => [s, peak * Math.sqrt(Math.max(0, 1 - (1 - s / at) ** 2))] as [number, number]);

export const ZEBRA_SHARK: SharkDesign = {
  rig, nose: .4, bodyEnd: .88,
  // A blunt, rounded snout and a broad head, a round trunk that is short (the tail is half the animal), then a long, narrowing tail stock.
  width: [...blunt(.066, .12, [0, .003, .008, .016, .028, .044, .065, .09]), [.12, .066], [.17, .0675], [.25, .0645], [.31, .058], [.37, .049], [.43, .039], [.49, .029], [.55, .021], [.64, .0158], [.76, .0122], [.88, .0085]],
  top: [...blunt(.046, .13, [0, .003, .008, .016, .028, .044, .065, .095]), [.13, .046], [.17, .051], [.25, .054], [.31, .05], [.37, .043], [.43, .036], [.49, .029], [.55, .022], [.64, .02], [.76, .0145], [.88, .009]],
  bottom: [...blunt(.04, .12, [0, .003, .008, .016, .028, .044, .065, .09]), [.12, .04], [.17, .0445], [.25, .0475], [.31, .0445], [.37, .039], [.43, .033], [.49, .0265], [.55, .02], [.64, .0175], [.76, .013], [.88, .0085]],
  center: [[0, -.011], [.03, -.007], [.1, -.001], [.2, 0], [.4, .002], [.6, .005], [.8, .01], [.88, .013]],
  // True ellipses everywhere: no flat sides or corners on the head or the trunk.
  squareTop: [[0, 2], [.3, 2.05], [.88, 2]],
  squareBottom: [[0, 2], [.3, 2.15], [.88, 2]],
  // Ridges along the back (0 rad) and flanks (about 1 and 2 rad), from behind the head onto the tail stock: low, with a sharp crest.
  ridges: CRESTS.map((angle) => ({ angle, height: [[0, 0], [.1, 0], [.17, .0085], [.3, .0108], [.46, .0098], [.6, .0068], [.74, .0046], [.86, 0]] as [number, number][] })),
  rings: 54, columnsAbove: 8, columnsBelow: 4,
  boundary, boundaryGap: .03,
  paint: (s, theta) => skinColor(s, theta),
};

/** Blend a fin's colour toward the skin where it leaves the body, so the join has no colour seam. */
const rooted = (fin: RGB, skinColour: RGB, v: number) => mix(skinColour, fin, smoothstep(0, .3, v));

export function buildZebraShark() {
  const ctx = sharkContext(ZEBRA_SHARK);
  const { mesh, bones } = ctx;
  const fins = markedFins(ctx);
  ctx.body();

  const tone = (u: number, x = 0, y = 0) => mix(mix(FIN, FIN_PALE, .2 + .35 * (1 - u)), SPOT_SOFT, .4 * smoothstep(.45, .8, .5 + .5 * noise(x * 40 + y * 31, 7)));

  // The dorsals and the anal fin rise from deep inside the back and belly on a long base.
  const dorsalPlan = { ...outline(.088, roundFin(.335, .026, .1, 1.7, .01), .02), height: .088, thickness: .02, sink: .02, bone: 'Dorsal' };
  const dorsal = fins.midline({
    ...dorsalPlan, stations: 7,
    color: (_p, t, u) => rooted(mix(tone(u), EDGE, .3 * crisp(.9, t)), BACK, t),
  });
  const dorsal2Plan = { ...outline(.05, roundFin(.47, .012, .06, 1.8, .008), .02), height: .05, thickness: .014, sink: .02 };
  fins.midline({
    ...dorsal2Plan, stations: 6,
    color: (_p, t, u) => rooted(mix(tone(u), EDGE, .3 * crisp(.88, t)), BACK, t),
  });
  const analPlan = { ...outline(.03, roundFin(.5, .008, .044, 1.8), .02), height: .03, thickness: .011, sink: .02, ventral: true };
  fins.midline({
    ...analPlan, stations: 5,
    color: (_p, t, u) => rooted(mix(mix(FIN_UNDER, FIN_PALE, .3 * (1 - u)), tone(u), .3), BELLY, t),
  });
  // Broad, rounded pectorals, wing-like from above: a wide root that sweeps out of the flank (the front edge starts well ahead of the
  // base and the rear edge well behind it, then both narrow into the fin), set deep into the body.
  const pectoralPlan = {
    rootS: .19, theta: 2.0, span: .15, droop: .34, sweep: .1, thickness: .022, sink: .03,
    // The outline runs from the sunk origin to span + sink, so its tip is the fin's tip (no zero-width needle beyond it).
    ...outline(.18, (T) => {
      const b = T * .18, d = Math.max(0, b - .03), t = d / .15;
      const flare = .017 * Math.exp(-b / .018);
      const front = .26 * d + 4.6 * d ** 3 - flare;
      return [front, front + flare + .12 * Math.sqrt(Math.max(0, 1 - t ** 2.2)) + .012 * Math.exp(-(((t - .1) / .1) ** 2)) + flare];
    }, 0),
    bone: (left: boolean) => (left ? 'PectoralL' : 'PectoralR'),
  };
  const pectorals = fins.paired({
    ...pectoralPlan, stations: 9,
    color: (p, v, u, _left, face) => (face > 0 ? rooted(tone(u, p.x, p.z), FLANK, v) : rooted(mix(FIN_UNDER, FIN_PALE, .25 * v), BELLY, v)),
  });
  // Pelvic fins, rounded and smaller, with the same wide root.
  const pelvicPlan = {
    rootS: .36, theta: 2.4, span: .062, droop: .5, sweep: .12, thickness: .014, sink: .024,
    ...outline(.086, (T) => {
      const b = T * .086, d = Math.max(0, b - .024), t = d / .062;
      const flare = .007 * Math.exp(-b / .012);
      const front = .012 * t - flare;
      return [front, front + flare + .07 * Math.sqrt(Math.max(0, 1 - t ** 2.4)) + flare];
    }, 0),
  };
  fins.paired({
    ...pelvicPlan, stations: 6,
    color: (_p, v, u, _left, face) => (face > 0 ? rooted(tone(u), FLANK, v) : rooted(mix(FIN_UNDER, FIN_PALE, .25 * v), BELLY, v)),
  });
  const axis = ctx.center(rig.joints[4]);
  // The tail: a very long, very flat blade, about half the animal. It is low (not much taller than the stalk it grows from) and thin from
  // side to side, its leading edge rising slowly along the whole length to a pointed upper tip, a small lobe below.
  const a = axis;
  const tailLe = [[a - .016, .9], [a - .011, .82], [a - .005, .7], [a, .59], [a + .004, .52], [a + .012, .6], [a + .021, .72], [a + .03, .85], [a + .04, .95], [a + .046, .99]] as const;
  const tailTe = [[a - .016, .9], [a - .012, .93], [a - .004, .965], [a + .01, .988], [a + .028, .997], [a + .046, 1]] as const;
  const tailThickness = (y: number) => .0045 + .0125 * Math.max(0, 1 - Math.abs(y - a - .012) / .062) ** .9;
  const tail = fins.caudal({
    low: a - .016, high: a + .046, edges: [a + .036],
    le: tailLe, te: tailTe, thickness: tailThickness,
    upperPivot: .022, lowerPivot: .012, stations: 14,
    color: (p, y, u) => mix(mix(FIN, FIN_PALE, .25 + .2 * (1 - u)), EDGE, .3 * crisp(a + .036, y, .004) + (p.y < a ? .1 : 0)),
  });

  // Small eyes, each with a large spiracle just behind it.
  for (const side of [1, -1]) {
    eyeball(ctx, .082, side * 1.2, .0058, { pupil: EYE, iris: mix(IRIS, LID, .4), lid: mix(LID, BACK, .3) }, { squash: .85, height: .5 });
    slit(ctx, .112, side * .95, .022, .0042, mix(FLANK, SPOT, .35), .0008);
    slit(ctx, .112, side * .95, .017, .0034, hex('#2a2012'), .0012);
  }
  ctx.gills({ from: .145, to: .2, count: 5, top: 1.25, bottom: 1.95, halfWidth: .0013, slant: .006, color: GILL });
  const mouthLine = (w: number) => Array.from({ length: 11 }, (_, i) => {
    const t = i / 10, theta = Math.PI + (t - .5) * w;
    return [.052 + .008 * (2 * t - 1) ** 2, theta] as const;
  });
  ctx.ribbon(mouthLine(1.3), (t) => .0036 * (.55 + .45 * Math.sin(Math.PI * t)), mix(BELLY, FLANK, .5), .0007);
  ctx.ribbon(mouthLine(1.1), (t) => .0016 * (.5 + .5 * Math.sin(Math.PI * t)), MOUTH, .0012);
  for (const side of [1, -1]) {
    barbel(ctx, .022, side * (Math.PI - .55), new Vector3(side * .1, -.5, 1), .044, .0115, BARBEL, BARBEL_TIP, -.003);
  }

  // The ridges as lines: a thin pale ribbon along each crest, from behind the head down onto the tail stock.
  for (const angle of CRESTS) {
    for (const side of angle === 0 ? [1] : [1, -1]) {
      const line = Array.from({ length: 22 }, (_, i) => [.125 + .68 * i / 21, side * angle] as const);
      ctx.ribbon(line, (t) => .0011 * (.35 + .65 * Math.sin(Math.PI * t)) * (1 - .4 * t), CREST, .0009);
    }
  }

  // Many small dark spots over the head, back and flanks (not the belly), thinning and shrinking along the tail. Rows of jittered, half-offset
  // spots spaced evenly by distance round the body, so they stay equally dense on the thin tail stock.
  let n = 0;
  const eyeAt = (s: number, th: number) => (Math.abs(s - .082) < .011 && Math.abs(th) > 1 && Math.abs(th) < 1.42) || (Math.abs(s - .112) < .017 && Math.abs(th) > .72 && Math.abs(th) < 1.18);
  for (let row = 0, s = .02; s < .86; s += .0112, row++) {
    const reach = s > .62 ? 1.45 : s > .5 ? 1.75 : 1.95;
    const thetas = Array.from({ length: 41 }, (_, i) => -reach + 2 * reach * i / 40);
    const pts = thetas.map((th) => ctx.raw(s, th));
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const total = cum[cum.length - 1], radius = total / (2 * reach);
    const space = s > .5 ? .0125 : .0138, count = Math.max(2, Math.round(total / space));
    const thetaAt = (len: number) => {
      let i = 1;
      while (i < cum.length - 1 && cum[i] < len) i++;
      return thetas[i - 1] + (thetas[i] - thetas[i - 1]) * (len - cum[i - 1]) / (cum[i] - cum[i - 1]);
    };
    for (let i = 0; i < count; i++) {
      n++;
      const len = total * (i + .5 + (row % 2 ? .5 : 0) + .32 * noise(n * 1.7, 4)) / count;
      if (len >= total) continue;
      const theta = thetaAt(len), ps = s + .0035 * noise(n * 2.9, 6);
      if (ps < .02 || ps > .86 || eyeAt(ps, theta)) continue;
      const size = s > .5 ? .8 : s < .1 ? .85 : 1;
      const r = (.0034 + .0022 * (.5 + .5 * noise(n * 3.3, 8)) + (n % 17 === 0 ? .0012 : 0)) * size;
      // Keep clear of the crest lines (a spot over a ridge would sink into the fold), the gill slits and the snout's tip.
      if (ps > .1 && ps < .8 && CRESTS.some((c) => Math.abs(Math.abs(theta) - c) * radius < r + .0022)) continue;
      if (ps > .135 && ps < .21 && Math.abs(theta) > 1.15 && Math.abs(theta) < 2.05) continue;
      if (ps < .045 && Math.abs(theta) > 2.6) continue;
      speck(ctx, ps, theta, r, n % 6 === 0 ? SPOT_SOFT : SPOT, n % 4 === 0 ? 6 : 5, 1 + .2 * noise(n * 4.1, 3), .0009, 6.28 * noise(n * 6.7, 2));
    }
  }

  // Spots on the fins and the tail as on the body: flat polygons lying on their faces, as dense as on the back.
  let m = 0;
  for (const [plan, left] of [[pectoralPlan, true], [pectoralPlan, false], [pelvicPlan, true], [pelvicPlan, false]] as const) {
    const fin = finSurface(ctx, plan, left);
    const big = plan === pectoralPlan;
    for (let b = .06; b < (big ? .97 : .8); b += big ? .075 : .13) {
      for (let u = .08 + (Math.round(b / .075) % 2) * .045; u < .94; u += big ? .095 : .17) {
        m++;
        finSpeck(ctx, fin, b + .02 * noise(m, 2), u + .03 * noise(m, 5), .0028 + .0016 * (.5 + .5 * noise(m * 3.3, 8)), SPOT, 5, m);
      }
    }
  }
  for (const [plan, step] of [[dorsalPlan, .02], [dorsal2Plan, .02]] as const) {
    for (const face of [1, -1]) {
      for (let h = .012; h < plan.height * .9; h += step) {
        for (let u = .12 + (Math.round(h / step) % 2) * .06; u < .9; u += .13) {
          m++;
          midlineSpeck(ctx, plan, h + .004 * noise(m, 3), u + .03 * noise(m, 6), face, .0028 + .0014 * (.5 + .5 * noise(m * 3.3, 8)), SPOT, 5, m);
        }
      }
    }
  }
  const leOf = curveOf(tailLe), teOf = curveOf(tailTe), pivots = { axis, upper: .022, lower: .012 };
  for (const face of [1, -1]) {
    for (let y = a - .008; y < a + .042; y += .0075) {
      for (let u = .05 + (Math.round((y - a) / .0075) % 2) * .025; u < .94; u += .05) {
        m++;
        tailSpeck(ctx, leOf, teOf, tailThickness, y + .0012 * noise(m, 3), u + .012 * noise(m, 6), face, .0026 + .001 * (.5 + .5 * noise(m * 3.3, 8)), SPOT, pivots, 5, m);
      }
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
