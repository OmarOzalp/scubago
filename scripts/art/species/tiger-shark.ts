/**
 * Tiger shark (Galeocerdo cuvier): broad, blunt, squarish snout; a stout,
 * muscular front body that tapers to a slender keeled tail stock; a long,
 * narrow, notched upper caudal lobe; dark vertical bars over a gray-olive back
 * and a cream belly.
 */
import { Vector3 } from 'three';
import { SWIM_RIGS, type SharkRig } from '../../../src/lib/marine-rigs';
import { hex, mix, noise, smoothstep, type RGB } from './kit';
import { sharkContext, type SharkDesign } from './shark';

const TOP = hex('#6a6e63'), FLANK = hex('#878a79'), BELLY = hex('#f3eddb');
const BAR = hex('#34372f'), GILL = hex('#4a4d45'), EYE = hex('#0d1110'), MOUTH = hex('#5d5a50');

const rig = SWIM_RIGS['tiger-shark'] as SharkRig;

const skinColor = (theta: number, p: Vector3): RGB => {
  const pale = smoothstep(1.45, 1.85, theta + .05 * noise(p.z * 40, 3));
  return mix(mix(TOP, FLANK, smoothstep(.6, 1.6, theta)), BELLY, pale);
};

export const TIGER_SHARK: SharkDesign = {
  rig, nose: .42, bodyEnd: .8,
  width: [[0, 0], [.012, .034], [.03, .051], [.06, .065], [.1, .073], [.16, .078], [.22, .08], [.3, .077], [.38, .068], [.46, .056], [.54, .043], [.62, .03], [.68, .021], [.73, .015], [.77, .012], [.8, .0095]],
  top: [[0, 0], [.012, .015], [.03, .025], [.06, .036], [.1, .047], [.16, .06], [.22, .07], [.3, .078], [.38, .074], [.46, .062], [.54, .047], [.62, .033], [.68, .023], [.73, .017], [.77, .0135], [.8, .011]],
  bottom: [[0, 0], [.012, .014], [.03, .021], [.06, .029], [.1, .038], [.16, .049], [.22, .058], [.3, .064], [.38, .061], [.46, .052], [.54, .04], [.62, .028], [.68, .02], [.73, .0145], [.77, .012], [.8, .01]],
  center: [[0, -.006], [.06, -.004], [.16, -.001], [.3, 0], [.5, .002], [.7, .005], [.8, .007]],
  squareTop: [[0, 2.5], [.12, 2.4], [.3, 2.15], [.6, 2.1], [.8, 2]],
  squareBottom: [[0, 3.1], [.12, 2.9], [.3, 2.5], [.6, 2.2], [.8, 2]],
  keel: [[.66, 0], [.72, .003], [.765, .004], [.8, 0]],
  rings: 42, columnsAbove: 7, columnsBelow: 5,
  boundary: () => 1.64, boundaryGap: .14,
  paint: (_s, theta, p) => skinColor(theta, p),
};

export function buildTigerShark() {
  const ctx = sharkContext(TIGER_SHARK);
  const { mesh, bones } = ctx;
  ctx.body();
  const finColor = (p: Vector3, v: number, u: number) => mix(TOP, FLANK, .25 * u + .2 * v * (p.y < 0 ? 1 : 0));
  const dorsal = ctx.midlineFin({
    le: [[-.012, .295], [0, .299], [.03, .312], [.06, .331], [.088, .352], [.1, .366]],
    te: [[-.012, .4], [0, .406], [.007, .411], [.02, .396], [.045, .38], [.078, .37], [.1, .366]],
    height: .1, thickness: .018, bone: 'Dorsal', color: finColor,
  });
  ctx.midlineFin({
    le: [[-.01, .612], [0, .615], [.02, .632], [.031, .646]],
    te: [[-.01, .66], [0, .663], [.006, .666], [.018, .652], [.031, .646]],
    height: .031, thickness: .008, stations: 5, color: finColor,
  });
  ctx.midlineFin({
    le: [[-.01, .63], [0, .633], [.018, .652], [.028, .664]],
    te: [[-.01, .676], [0, .679], [.006, .682], [.016, .669], [.028, .664]],
    height: .028, thickness: .008, stations: 5, ventral: true,
    color: (p, v, u) => mix(FLANK, BELLY, .5 - .3 * v + .1 * u),
  });
  const pectorals = ctx.pairedFin({
    rootS: .2, theta: 1.98, span: .162, droop: .4, sweep: .2, thickness: .018,
    le: [[-.015, 0], [0, 0], [.04, .018], [.08, .045], [.12, .078], [.15, .106], [.162, .119]],
    te: [[-.015, .082], [0, .085], [.03, .089], [.07, .096], [.11, .104], [.145, .112], [.162, .119]],
    bone: (left) => (left ? 'PectoralL' : 'PectoralR'),
    color: (p, v, u) => mix(TOP, BELLY, smoothstep(-.04, -.07, p.y) * .15 + .08 * u),
  });
  ctx.pairedFin({
    rootS: .5, theta: 2.45, span: .048, droop: .95, sweep: .15, thickness: .008, stations: 5,
    le: [[-.01, 0], [0, 0], [.025, .014], [.048, .036]],
    te: [[-.01, .046], [0, .047], [.02, .045], [.04, .04], [.048, .036]],
    color: (_p, v) => mix(FLANK, BELLY, .45 - .2 * v),
  });
  const axis = ctx.center(rig.joints[4]);
  const tail = ctx.caudalFin({
    low: axis - .086, high: axis + .142,
    le: [[axis - .086, .868], [axis - .06, .826], [axis - .032, .79], [axis - .011, .768], [axis + .004, .758], [axis + .016, .764], [axis + .035, .796], [axis + .07, .862], [axis + .105, .928], [axis + .13, .972], [axis + .142, 1]],
    te: [[axis - .086, .868], [axis - .06, .862], [axis - .032, .851], [axis - .008, .836], [axis + .006, .834], [axis + .03, .872], [axis + .07, .934], [axis + .098, .966], [axis + .108, .962], [axis + .118, .99], [axis + .142, 1]],
    thickness: (y) => .003 + .017 * Math.max(0, 1 - Math.abs(y - axis) / .11) ** 1.3,
    upperPivot: .05, lowerPivot: .028,
    color: (p, _v, u) => mix(TOP, FLANK, .15 + .15 * u + (p.y < axis ? .25 : 0)),
  });
  ctx.eyes({ s: .052, theta: 1.2, radius: .0078, color: EYE, sink: .38 });
  ctx.gills({ from: .146, to: .197, count: 5, top: 1.3, bottom: 2.02, halfWidth: .0015, slant: .007, color: GILL });
  // Broad ventral mouth arcing just behind the snout.
  ctx.ribbon(Array.from({ length: 9 }, (_, i) => {
    const t = i / 8, theta = Math.PI + (t - .5) * 1.5;
    return [.05 + .024 * (2 * t - 1) ** 2, theta] as const;
  }), (t) => .0022 * (.5 + .5 * Math.sin(Math.PI * t)), MOUTH);

  // Irregular dark bars, strongest over the rear body and fading toward the head.
  for (const side of [1, -1]) {
    let s0 = .2 + .01 * (side + 1);
    for (let i = 0; s0 < .752; i++, s0 += .0235 + .008 * (1 + noise(i * 2.9, 21 + side)) / 2) {
      const rear = smoothstep(.2, .5, s0);
      const reach = .95 + .7 * rear + .12 * noise(i * 2.3, 7 + side);
      const start = .07 + .12 * Math.max(0, noise(i * 3.1, 11 + side));
      const slant = .012 + .01 * noise(i * 1.3, 5);
      const line = Array.from({ length: 7 }, (_, j) => {
        const t = j / 6;
        const theta = start + (reach - start) * t;
        return [s0 + slant * t + .004 * noise(i * 4 + j * 1.9, 13), side * theta] as const;
      });
      const width = (.0045 + .0035 * rear) * (1 + .25 * noise(i * 5.3, 17 + side));
      // Some bars break into an upper stripe and a lower blotch.
      const split = noise(i * 7.1, 31 + side) > .35 ? Math.round(3 + 2 * Math.abs(noise(i, 3))) : 0;
      if (split) {
        ctx.ribbon(line.slice(0, split), (t) => width * Math.sin(Math.PI * (.12 + .82 * t)) ** .6, BAR);
        ctx.ribbon(line.slice(split), (t) => width * .85 * Math.sin(Math.PI * (.1 + .8 * t)) ** .6, BAR);
      } else {
        ctx.ribbon(line, (t) => width * Math.sin(Math.PI * (.12 + .82 * t)) ** .6, BAR);
      }
    }
  }
  // A few bars bridge the back, as on many tiger sharks.
  for (const s0 of [.39, .47, .55, .62, .69]) {
    ctx.ribbon(Array.from({ length: 5 }, (_, j) => [s0 + .003 * Math.sin(j), -.42 + .21 * j] as const), (t) => .0045 * Math.sin(Math.PI * (.15 + .7 * t)) ** .5, BAR);
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
