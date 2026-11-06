/**
 * Bull shark (Carcharhinus leucas): the heavyweight requiem shark of shallow coasts, estuaries and
 * river mouths. A very stout, deep, humpbacked body (heaviest over the shoulders) behind a very short,
 * broad, blunt snout, and small round eyes; a big, tall, triangular first dorsal fin over the
 * pectorals' free tips, a low ridge along the back to a second dorsal about a third its height; broad,
 * triangular, sickle-edged pectorals; a heterocercal tail with a long upper lobe. Plain grey above,
 * white below with a faint pale band along the flank; the fins are grey, the undersides of the
 * pectoral tips and the tips of the second dorsal, anal fin and lower tail lobe dusky (strongest in
 * young animals), never white or black.
 */
import { SWIM_RIGS, type SharkRig } from '../../../src/lib/marine-rigs';
import { hex, mix, noise, smoothstep, type RGB } from './kit';
import { crisp, eyeball, markedFins, nostrilsAndFurrows, outline, precaudalPits } from './reef-sharks';
import { sharkContext, type SharkDesign } from './shark';

// Body: a warm grey back (with a hint of brown), paler flanks with a faint band, a white belly.
const BACK = hex('#777870'), FLANK = hex('#939389'), BAND = hex('#b3b6b3'), BELLY = hex('#f1f1ec');
// Fins: grey a little darker than the back, paler where light falls on them; the dusky tips.
const FIN = hex('#696c6f'), FIN_PALE = hex('#868a8c'), FIN_UNDER = hex('#e8eae8'), DUSK = hex('#2f3133');
const TOOTH = hex('#ecebde'), GILL = hex('#46494b'), MOUTH = hex('#505355'), EYE = hex('#06080a'), IRIS = hex('#4e4a35'), LID = hex('#6d6f6c');

const rig = SWIM_RIGS['bull-shark'] as SharkRig;

/** The faint pale band: absent at the head, widest over the pelvics, gone toward the tail. */
const band = (s: number) => smoothstep(.2, .46, s) * (1 - smoothstep(.6, .72, s));

/** Where the grey back meets the white belly: high over the jaw, a little wavy, lifted by the band. */
const boundary = (s: number) => 1.55 + .16 * smoothstep(.05, .24, s) - .1 * band(s) + .03 * noise(s * 13, 5);

/** Grey above, paler down the flank (with the faint band), then the white belly. */
const skinColor = (s: number, theta: number): RGB => {
  const upper = mix(BACK, FLANK, smoothstep(.2, 1.4, theta));
  const pale = mix(upper, BAND, .6 * band(s) * smoothstep(.95, 1.4, theta));
  return mix(pale, BELLY, smoothstep(boundary(s) - .03, boundary(s) + .03, theta));
};

/** Girth scaled up through the shoulders and belly: the bull shark is the stoutest of the requiem sharks. */
const stout = (rows: readonly (readonly [number, number])[], k: number) => rows.map(([s, v]) => [s, v * (1 + k * Math.sin(Math.PI * Math.min(1, s / .8)) ** .8)] as [number, number]);

export const BULL_SHARK: SharkDesign = {
  rig, nose: .4, bodyEnd: .8,
  // A very short, blunt, broad snout; a thick, humpbacked torpedo body; a stout tail stock.
  width: stout([[0, 0], [.006, .02], [.015, .036], [.03, .052], [.05, .067], [.08, .08], [.12, .09], [.16, .096], [.22, .1], [.29, .1], [.36, .094], [.44, .083], [.52, .069], [.6, .053], [.66, .04], [.72, .029], [.77, .02], [.8, .012]], .07),
  top: stout([[0, 0], [.006, .02], [.015, .035], [.03, .05], [.05, .063], [.08, .076], [.12, .088], [.16, .099], [.22, .11], [.29, .114], [.36, .11], [.44, .098], [.52, .08], [.6, .06], [.66, .045], [.72, .032], [.77, .022], [.8, .016]], .07),
  bottom: stout([[0, 0], [.006, .014], [.015, .026], [.03, .037], [.05, .048], [.08, .058], [.12, .067], [.16, .074], [.22, .08], [.29, .081], [.36, .078], [.44, .07], [.52, .058], [.6, .045], [.66, .035], [.72, .026], [.77, .02], [.8, .014]], .1),
  center: [[0, -.007], [.04, -.003], [.1, 0], [.2, 0], [.4, .002], [.6, .004], [.8, .006]],
  squareTop: [[0, 2], [.1, 2.05], [.3, 2.1], [.6, 2.05], [.8, 2]],
  squareBottom: [[0, 2.1], [.1, 2.25], [.3, 2.35], [.6, 2.2], [.8, 2]],
  // The low interdorsal ridge, from behind the first dorsal to the second.
  ridges: [{ angle: 0, height: [[.43, 0], [.47, .004], [.55, .006], [.62, .0045], [.66, 0]] }],
  rings: 62, columnsAbove: 9, columnsBelow: 7,
  boundary, boundaryGap: .03,
  paint: (s, theta) => skinColor(s, theta),
};

export function buildBullShark() {
  const ctx = sharkContext(BULL_SHARK);
  const { mesh, bones } = ctx;
  const fins = markedFins(ctx);
  ctx.body();

  /** Grey, a shade paler toward the front edge. */
  const grey = (u: number) => mix(FIN, FIN_PALE, .25 + .3 * (1 - u));
  // The first dorsal: big, tall and triangular, a straight raked front edge, a concave rear edge ending
  // in a free tip, a fairly pointed apex.
  const dorsal = fins.midline({
    ...outline(.15, (t) => [.292 + .115 * t ** 1.15, .41 + .05 * (1 - t) ** 2.2 + .02 * Math.sqrt(1 - t) * t ** 8]),
    height: .15, thickness: .02, bone: 'Dorsal', stations: 10,
    color: (_p, _t, u) => grey(u),
  });
  // Second dorsal (about a third the first's height) and anal fin, each with a long slender rear tip, dusky at the tip.
  fins.midline({
    ...outline(.044, (t) => [.642 + .042 * t ** 1.1, .69 + .022 * (1 - t) ** 2 + .01 * Math.sqrt(1 - t) * t ** 6], .008),
    height: .044, thickness: .008, stations: 3, edges: [.6],
    color: (_p, t, u) => mix(grey(u), DUSK, .8 * crisp(.6, t)),
  });
  fins.midline({
    ...outline(.046, (t) => [.652 + .042 * t ** 1.1, .7 + .022 * (1 - t) ** 2 + .01 * Math.sqrt(1 - t) * t ** 6], .008),
    height: .046, thickness: .008, stations: 3, ventral: true, edges: [.6],
    color: (_p, t, u) => mix(mix(FIN_UNDER, FIN_PALE, .25 * (1 - u)), DUSK, .8 * crisp(.6, t)),
  });
  // Broad, triangular pectorals: a convex front edge sweeping back to a narrowly rounded tip and a
  // concave rear edge. Grey above; white below with a dusky tip.
  const pectorals = fins.paired({
    rootS: .2, theta: 2, span: .2, droop: .26, sweep: .1, thickness: .019, stations: 9, edges: [.7],
    ...outline(.2, (t) => {
      const b = t * .2;
      const front = .42 * b + 9 * b ** 3;
      return [front, front + .122 * (1 - t) ** 1.2 + .016 * Math.exp(-(((t - .12) / .1) ** 2)) + .03 * Math.sqrt(1 - t) * t ** 3];
    }, 0),
    bone: (left) => (left ? 'PectoralL' : 'PectoralR'),
    color: (_p, v, u, _left, face) => face > 0
      ? mix(grey(u), DUSK, .25 * crisp(.7, v))
      : mix(mix(FIN_UNDER, FIN_PALE, .15 * v), DUSK, .8 * crisp(.7, v)),
  });
  // Small pelvic fins with a short, blunt tip.
  fins.paired({
    rootS: .5, theta: 2.4, span: .06, droop: .8, sweep: .15, thickness: .01, stations: 5, edges: [.65],
    ...outline(.06, (t) => {
      const front = .03 * (.4 * t + .6 * t ** 2);
      return [front, front + .058 * (1 - t) ** .6];
    }, 0),
    color: (_p, v, u, _left, face) => mix(face > 0 ? grey(u) : mix(FIN_UNDER, FIN_PALE, .2 * v), DUSK, (face > 0 ? .2 : .6) * crisp(.65, v)),
  });
  const axis = ctx.center(rig.joints[4]);
  // A heterocercal tail: the long upper lobe notched near its tip, the lower lobe well developed and dusky at its tip.
  const tail = fins.caudal({
    low: axis - .105, high: axis + .19, edges: [axis - .06],
    le: [[axis - .105, .945], [axis - .08, .908], [axis - .05, .862], [axis - .025, .824], [axis - .008, .8], [axis + .006, .79], [axis + .02, .797], [axis + .05, .832], [axis + .09, .877], [axis + .13, .922], [axis + .15, .945], [axis + .164, .962], [axis + .172, .972], [axis + .19, 1]],
    te: [[axis - .105, .945], [axis - .08, .938], [axis - .05, .918], [axis - .025, .893], [axis + .004, .872], [axis + .03, .887], [axis + .065, .912], [axis + .1, .938], [axis + .13, .959], [axis + .15, .975], [axis + .157, .98], [axis + .164, .971], [axis + .172, .98], [axis + .19, 1]],
    thickness: (y) => .004 + .022 * Math.max(0, 1 - Math.abs(y - axis) / .12) ** 1.2,
    upperPivot: .05, lowerPivot: .04, stations: 20,
    color: (p, y, u) => mix(mix(FIN, FIN_PALE, .25 + .2 * (1 - u) - (p.y < axis ? .1 : 0)), DUSK, .75 * (1 - crisp(axis - .06, y, .002))),
  });
  // Small round eyes in a faint ring of lid, set a little above the mouth corners.
  for (const side of [1, -1]) eyeball(ctx, .082, side * 1.25, .0098, { pupil: EYE, iris: IRIS, lid: LID });
  ctx.gills({ from: .17, to: .228, count: 5, top: 1.3, bottom: 2, halfWidth: .0018, slant: .008, color: GILL });
  // A broad, shallow arc of a mouth under the snout, a little parted, its dark gape lined by teeth: the upper
  // ones broad, triangular and serrated-looking, hanging over a narrower row of lower ones.
  const mouthAt = (t: number) => [.086 + .04 * (2 * t - 1) ** 2, Math.PI + (t - .5) * 2.5] as const;
  ctx.ribbon(Array.from({ length: 9 }, (_, i) => mouthAt(i / 8)), (t) => .0036 * (.4 + .6 * Math.sin(Math.PI * t)), MOUTH);
  // Each tooth is a little pyramid standing out of the jaw line (upper ones broad and tall, lower ones narrow).
  const tooth = (t: number, back: number, halfWidth: number, height: number, shade: number) => {
    const [s0, th] = mouthAt(t);
    const color = mix(TOOTH, MOUTH, shade);
    const weights = ctx.skin(s0);
    mesh.begin();
    const a = mesh.vertex(ctx.surface(s0, th - halfWidth, .0004), color, weights);
    const b = mesh.vertex(ctx.surface(s0, th + halfWidth, .0004), color, weights);
    const c = mesh.vertex(ctx.surface(s0 + back * .9, th, .0004), color, weights);
    const apex = mesh.vertex(ctx.surface(s0 + back * .35, th, height), color, weights);
    mesh.tri(a, b, apex); mesh.tri(b, c, apex); mesh.tri(c, a, apex); mesh.tri(a, c, b);
    mesh.end();
  };
  for (let i = 0; i < 15; i++) {
    const k = Math.abs(i - 7) / 7;
    tooth(.08 + .84 * i / 14, .0075 * (1 - .3 * k), .05 * (1 - .25 * k), .0048 * (1 - .3 * k), .1 * k);
  }
  for (let i = 0; i < 14; i++) tooth(.085 + .83 * (i + .5) / 14, -.0055, .03, .0032, .15);

  nostrilsAndFurrows(ctx, { nostril: .028, corner: .126, spread: 1.05, color: MOUTH });
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
