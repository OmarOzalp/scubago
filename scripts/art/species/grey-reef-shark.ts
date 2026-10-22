/**
 * Grey reef shark (Carcharhinus amblyrhynchos): the patrolling requiem shark of Indo-Pacific reef walls.
 * A fairly stocky, solid body behind a moderately long, broadly rounded snout and large round eyes; a
 * plain grey, semifalcate first dorsal fin standing over the pectorals' free rear tips and no ridge
 * along the back to the small second dorsal; broad, sickle-shaped pectorals; a heterocercal tail with
 * a long upper lobe notched near its tip. Cool slate grey above (only a faint bronze sheen) and white
 * below. The mark that gives it away is the caudal fin's broad, crisp black trailing margin, running
 * along the whole rear edge of both lobes; the undersides of the pectoral tips, the pelvics, the
 * second dorsal and the anal fin are dusky.
 */
import { SWIM_RIGS, type SharkRig } from '../../../src/lib/marine-rigs';
import { hex, mix, noise, smoothstep, type RGB } from './kit';
import { crisp, eyeball, markedFins, nostrilsAndFurrows, outline, precaudalPits } from './reef-sharks';
import { sharkContext, type SharkDesign } from './shark';

// Body: cool slate grey on the back with only a faint bronze sheen, paler down the flanks, a white belly.
const BACK = hex('#7c8892'), FLANK = hex('#9aa2a4'), BELLY = hex('#f0f0eb');
// Fins: plain grey a little darker than the back; pale grey where light falls on a standing fin; the dark marks.
const FIN = hex('#6f7a83'), FIN_PALE = hex('#8e99a1'), FIN_UNDER = hex('#e9eceb'), DUSK = hex('#34373a'), BLACK = hex('#10100e');
const GILL = hex('#464a4d'), MOUTH = hex('#54575a'), EYE = hex('#06080a'), IRIS = hex('#5a4524'), LID = hex('#7b725e');

const rig = SWIM_RIGS['grey-reef-shark'] as SharkRig;

/** Where the slate back meets the white belly: fairly high over the jaw, a little wavy along the flank. */
const boundary = (s: number) => 1.6 + .13 * smoothstep(.06, .26, s) + .03 * noise(s * 14, 3);

/** Slate above, paler down the flank, then the white belly. */
const skinColor = (s: number, theta: number): RGB => {
  const upper = mix(BACK, FLANK, smoothstep(.2, 1.5, theta));
  return mix(upper, BELLY, smoothstep(boundary(s) - .03, boundary(s) + .03, theta));
};

export const GREY_REEF_SHARK: SharkDesign = {
  rig, nose: .4, bodyEnd: .8,
  // A broadly rounded, moderately long snout, a solid torpedo body and a stout tail stock.
  width: [[0, 0], [.006, .017], [.015, .031], [.03, .044], [.05, .054], [.08, .065], [.12, .073], [.16, .078], [.22, .083], [.29, .083], [.36, .078], [.44, .07], [.52, .059], [.6, .046], [.66, .035], [.72, .026], [.77, .018], [.8, .011]],
  top: [[0, 0], [.006, .018], [.015, .031], [.03, .043], [.05, .052], [.08, .062], [.12, .071], [.16, .079], [.22, .087], [.29, .091], [.36, .089], [.44, .081], [.52, .069], [.6, .054], [.66, .042], [.72, .03], [.77, .021], [.8, .015]],
  bottom: [[0, 0], [.006, .013], [.015, .024], [.03, .033], [.05, .042], [.08, .051], [.12, .059], [.16, .067], [.22, .072], [.29, .074], [.36, .072], [.44, .065], [.52, .054], [.6, .043], [.66, .033], [.72, .025], [.77, .019], [.8, .014]],
  center: [[0, -.007], [.04, -.003], [.1, 0], [.2, 0], [.4, .002], [.6, .004], [.8, .006]],
  squareTop: [[0, 2], [.1, 2.05], [.3, 2.1], [.6, 2.05], [.8, 2]],
  squareBottom: [[0, 2.1], [.1, 2.25], [.3, 2.35], [.6, 2.2], [.8, 2]],
  rings: 44, columnsAbove: 7, columnsBelow: 5,
  boundary, boundaryGap: .03,
  paint: (s, theta) => skinColor(s, theta),
};

export function buildGreyReefShark() {
  const ctx = sharkContext(GREY_REEF_SHARK);
  const { mesh, bones } = ctx;
  const fins = markedFins(ctx);
  ctx.body();

  /** Plain grey, a shade paler toward the front edge; standing fins are paler still (they are lit from the side). */
  const grey = (u: number) => mix(FIN, FIN_PALE, .25 + .3 * (1 - u));
  // The first dorsal: moderately tall and semifalcate, a straight raked front edge, a concave rear edge
  // ending in a free tip, a narrow apex. Plain grey.
  const dorsal = fins.midline({
    ...outline(.108, (t) => [.3 + .088 * t ** 1.15, .39 + .042 * (1 - t) ** 2.2 + .026 * Math.sqrt(1 - t) * t ** 8]),
    height: .108, thickness: .017, bone: 'Dorsal', stations: 9,
    color: (_p, _t, u) => grey(u),
  });
  // Small second dorsal and a slightly larger anal fin, each with a long slender rear tip, dusky at the tip.
  fins.midline({
    ...outline(.03, (t) => [.648 + .036 * t ** 1.1, .684 + .02 * (1 - t) ** 2 + .01 * Math.sqrt(1 - t) * t ** 6], .008),
    height: .03, thickness: .007, stations: 3, edges: [.55],
    color: (_p, t, u) => mix(grey(u), DUSK, .85 * crisp(.55, t)),
  });
  fins.midline({
    ...outline(.034, (t) => [.656 + .04 * t ** 1.1, .692 + .022 * (1 - t) ** 2 + .01 * Math.sqrt(1 - t) * t ** 6], .008),
    height: .034, thickness: .007, stations: 3, ventral: true, edges: [.55],
    color: (_p, t, u) => mix(mix(FIN_UNDER, FIN_PALE, .25 * (1 - u)), DUSK, .85 * crisp(.55, t)),
  });
  // Broad, sickle-shaped pectorals: a convex front edge sweeping back to a narrowly rounded tip and a
  // concave rear edge. Grey above, white below with a dusky tip.
  const pectorals = fins.paired({
    rootS: .205, theta: 2, span: .158, droop: .32, sweep: .1, thickness: .016, stations: 9, edges: [.7],
    ...outline(.158, (t) => {
      const b = t * .158;
      const front = .45 * b + 11 * b ** 3;
      return [front, front + .09 * (1 - t) ** 1.15 + .012 * Math.exp(-(((t - .12) / .1) ** 2)) + .03 * Math.sqrt(1 - t) * t ** 3];
    }, 0),
    bone: (left) => (left ? 'PectoralL' : 'PectoralR'),
    color: (_p, v, u, _left, face) => face > 0
      ? mix(grey(u), DUSK, .3 * crisp(.7, v))
      : mix(mix(FIN_UNDER, FIN_PALE, .15 * v), DUSK, .9 * crisp(.7, v)),
  });
  // Small pelvic fins with a short, blunt tip, dusky below.
  fins.paired({
    rootS: .5, theta: 2.4, span: .056, droop: .8, sweep: .15, thickness: .009, stations: 5, edges: [.6],
    ...outline(.056, (t) => {
      const front = .03 * (.4 * t + .6 * t ** 2);
      return [front, front + .054 * (1 - t) ** .6];
    }, 0),
    color: (_p, v, u, _left, face) => mix(face > 0 ? grey(u) : mix(FIN_UNDER, FIN_PALE, .2 * v), DUSK, (face > 0 ? .3 : .85) * crisp(.6, v)),
  });
  const axis = ctx.center(rig.joints[4]);
  // A heterocercal tail: the upper lobe long, slim and notched near its tip, the lower lobe well developed.
  // The whole rear edge carries a broad, crisp black margin.
  const tail = fins.caudal({
    low: axis - .105, high: axis + .19, rear: .026,
    le: [[axis - .105, .945], [axis - .08, .908], [axis - .05, .862], [axis - .025, .824], [axis - .008, .8], [axis + .006, .79], [axis + .02, .797], [axis + .05, .832], [axis + .09, .877], [axis + .13, .922], [axis + .15, .945], [axis + .164, .962], [axis + .172, .972], [axis + .19, 1]],
    te: [[axis - .105, .945], [axis - .08, .938], [axis - .05, .918], [axis - .025, .893], [axis + .004, .872], [axis + .03, .887], [axis + .065, .912], [axis + .1, .938], [axis + .13, .959], [axis + .15, .975], [axis + .157, .98], [axis + .164, .971], [axis + .172, .98], [axis + .19, 1]],
    thickness: (y) => .004 + .02 * Math.max(0, 1 - Math.abs(y - axis) / .12) ** 1.2,
    upperPivot: .05, lowerPivot: .04, stations: 20,
    color: (p, _y, u, _face, info) => mix(mix(FIN, FIN_PALE, .25 + .2 * (1 - u) - (p.y < axis ? .1 : 0)), BLACK, info.rear),
  });
  // Large, round, dark eyes in a ring of dusky lid, set a little above the mouth corners.
  for (const side of [1, -1]) eyeball(ctx, .076, side * 1.3, .0105, { pupil: EYE, iris: IRIS, lid: LID });
  ctx.gills({ from: .158, to: .212, count: 5, top: 1.3, bottom: 2, halfWidth: .0016, slant: .007, color: GILL });
  // A gentle arc of a mouth under the snout.
  ctx.ribbon(Array.from({ length: 9 }, (_, i) => {
    const t = i / 8, theta = Math.PI + (t - .5) * 1.9;
    return [.09 + .022 * (2 * t - 1) ** 2, theta] as const;
  }), (t) => .0017 * (.5 + .5 * Math.sin(Math.PI * t)), MOUTH);

  nostrilsAndFurrows(ctx, { nostril: .03, corner: .112, spread: .95, color: MOUTH });
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
