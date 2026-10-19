/**
 * Giant trevally (Caranx ignobilis): the great jack of the reef edge, a metre or more long: a deep,
 * oval body strongly compressed from side to side, with a very steep, blunt, bull-headed forehead
 * rising from a low snout to a high nape, a big terminal mouth with heavy lips and a large eye;
 * a low spiny first dorsal; a second dorsal and an anal fin each with a tall sickle-shaped front lobe
 * trailing into a long, low base; long sickle pectorals reaching back past the anal origin; and a
 * very narrow tail stock edged with a keel of bony scutes along the straight rear lateral line, ending
 * in a deeply forked, lunate tail. Bright silver flanks over a dark slate back and a silvery-white
 * belly, fine dark speckling on the upper flank, dusky fins and a darker tail.
 */
import { Vector3 } from 'three';
import { SWIM_RIGS, type SharkRig } from '../../../src/lib/marine-rigs';
import { clamp, curve, hex, mix, noise, smoothstep, type RGB } from './kit';
import { sharkContext, type SharkDesign } from './shark';

const BACK = hex('#505e61'), UPPER = hex('#84969d'), FLANK = hex('#d3dde0'), SILVER = hex('#ecf2f3'), SHEEN = hex('#fafcfc'), BELLY = hex('#fbfcfc');
const FIN = hex('#6b797f'), FIN_DARK = hex('#434e54'), TAIL = hex('#38444a'), PECTORAL = hex('#8a9698'), PELVIC = hex('#d3dad9');
const SPECK = hex('#3a484e'), LATERAL = hex('#8e9ca1'), SCUTE = hex('#303e45'), GILL = hex('#8c9a9f');
const IRIS = hex('#d9cf9c'), PUPIL = hex('#06080a'), MOUTH = hex('#2a2628');

const rig = SWIM_RIGS['giant-trevally'] as SharkRig;
const SQUARE = 2.2;

// Body sections: [s, back y, belly y, half width]. The head sits low and its underside runs almost flat,
// so the snout tip is low and the forehead climbs steeply to the nape; deepest about a third of the way back.
const SECTIONS: readonly (readonly [number, number, number, number])[] = [
  [0, -.034, -.112, .02],
  [.006, -.014, -.12, .028],
  [.02, .018, -.13, .037],
  [.04, .056, -.136, .045],
  [.065, .088, -.14, .05],
  [.09, .112, -.142, .053],
  [.12, .135, -.144, .055],
  [.16, .155, -.146, .057],
  [.21, .17, -.148, .058],
  [.27, .182, -.15, .059],
  [.34, .188, -.15, .059],
  [.41, .187, -.144, .057],
  [.48, .176, -.131, .052],
  [.55, .154, -.111, .045],
  [.62, .124, -.09, .036],
  [.68, .088, -.066, .028],
  [.72, .06, -.05, .02],
  [.76, .042, -.04, .012],
  [.8, .031, -.03, .007],
];
const column = (pick: (row: readonly number[]) => number) => SECTIONS.map((row) => [row[0], pick(row)] as const);

/** A fin's dusky color, darkening toward its free edge. */
const finColor = (_p: Vector3, v: number) => mix(FIN, FIN_DARK, .55 * v);

const skin = (s: number, theta: number, p: Vector3): RGB => {
  // The dark slate back reaches lower on the head; a silver flank brightens to a sheen along its middle.
  const head = 1 - smoothstep(.14, .3, s);
  const t = theta - .2 * head;
  const back = mix(BACK, UPPER, smoothstep(.15, .7, t));
  const flank = mix(back, FLANK, smoothstep(.6, 1.05, t));
  const silver = mix(flank, SILVER, smoothstep(.95, 1.4, t));
  const bright = mix(silver, SHEEN, .65 * Math.exp(-(((t - 1.75) / .34) ** 2)) + .05 * noise(p.z * 90 + p.y * 60, 8));
  return mix(bright, BELLY, smoothstep(1.9, 2.5, t));
};

export const GIANT_TREVALLY: SharkDesign = {
  rig, nose: .4, bodyEnd: .8, frontDome: .014,
  width: column((r) => r[3]),
  top: column((r) => (r[1] - r[2]) / 2),
  bottom: column((r) => (r[1] - r[2]) / 2),
  center: column((r) => (r[1] + r[2]) / 2),
  squareTop: [[0, SQUARE], [.8, SQUARE]],
  squareBottom: [[0, SQUARE], [.8, SQUARE]],
  // A lateral keel along the narrow tail stock, where the scutes sit.
  keel: [[.5, 0], [.62, .003], [.7, .0055], [.77, .0045], [.8, .002]],
  rings: 34, columnsAbove: 7, columnsBelow: 6,
  // A column pair at the flank's midline carries the keel and the lateral line.
  boundary: () => Math.PI / 2, boundaryGap: .1,
  paint: (s, theta, p) => skin(s, theta, p),
};

export function buildGiantTrevally() {
  const ctx = sharkContext(GIANT_TREVALLY);
  const { mesh, bones } = ctx;
  ctx.body();

  /** The angle round the body at axial position s of the flank point at height y. */
  const angle = (s: number, y: number) => {
    const c = ctx.center(s), up = y >= c;
    const f = clamp(Math.abs(y - c) / (up ? ctx.top(s) : ctx.bottom(s)), 0, 1);
    const cos = f ** (SQUARE / 2);
    return Math.acos(up ? cos : -cos);
  };

  // First dorsal: low and spiny, tallest at its third spine.
  ctx.midlineFin({
    le: [[-.012, .304], [0, .308], [.02, .318], [.04, .33], [.05, .338]],
    te: [[-.012, .418], [0, .414], [.015, .395], [.03, .365], [.042, .345], [.05, .338]],
    height: .05, thickness: .009, stations: 6, chordPoints: 6, color: (_p, v) => mix(FIN_DARK, FIN, .35 * v),
  });
  // Second dorsal: a tall sickle lobe in front, then a long, low base fading toward the tail stock (on `Dorsal`).
  const dorsal = ctx.midlineFin({
    le: [[-.012, .43], [0, .433], [.02, .441], [.05, .458], [.08, .48], [.1, .499], [.12, .52]],
    te: [[-.012, .79], [0, .786], [.006, .775], [.012, .745], [.018, .695], [.026, .64], [.034, .585], [.05, .556], [.075, .538], [.1, .528], [.12, .52]],
    height: .12, thickness: .01, stations: 12, chordPoints: 5, bone: 'Dorsal', color: finColor,
  });
  // The anal fin mirrors it, a little shorter, its sickle lobe just behind the dorsal's.
  ctx.midlineFin({
    le: [[-.012, .5], [0, .503], [.02, .515], [.045, .53], [.07, .55], [.095, .572], [.115, .59]],
    te: [[-.012, .775], [0, .772], [.006, .76], [.012, .735], [.02, .695], [.03, .65], [.042, .62], [.06, .606], [.085, .598], [.1, .594], [.115, .59]],
    height: .115, thickness: .01, stations: 11, chordPoints: 5, ventral: true,
    color: (_p, v) => mix(mix(FIN, PELVIC, .35), FIN_DARK, .6 * v),
  });
  // Small pelvic fins under the pectoral bases.
  ctx.pairedFin({
    rootS: .3, theta: 2.75, span: .055, droop: 1.3, sweep: .08, thickness: .006, stations: 4, sink: .01,
    le: [[0, 0], [.015, .018], [.03, .045], [.05, .08], [.065, .105]],
    te: [[0, .045], [.015, .057], [.03, .078], [.05, .098], [.065, .105]],
    color: (_p, v) => mix(PELVIC, FIN, .45 * v),
  });
  // Long, sickle-shaped pectorals behind the gill cover, reaching back past the anal origin.
  const pectorals = ctx.pairedFin({
    rootS: .27, theta: angle(.27, 0), span: .07, droop: 1, sweep: .1, thickness: .008, stations: 7, sink: .012,
    le: [[0, 0], [.02, .02], [.04, .075], [.06, .16], [.082, .27]],
    te: [[0, .085], [.02, .13], [.04, .175], [.06, .22], [.082, .27]],
    bone: (left) => (left ? 'PectoralL' : 'PectoralR'),
    color: (_p, v) => mix(PECTORAL, FIN_DARK, .85 * smoothstep(.1, .9, v)),
  });
  // A deeply forked, lunate tail with long pointed lobes, the darkest fin.
  const axis = ctx.center(rig.joints[4]);
  const tail = ctx.caudalFin({
    low: axis - .15, high: axis + .15,
    le: [[axis - .15, 1], [axis - .125, .958], [axis - .095, .905], [axis - .065, .855], [axis - .035, .8], [axis, .778], [axis + .035, .8], [axis + .065, .855], [axis + .095, .905], [axis + .125, .958], [axis + .15, 1]],
    te: [[axis - .15, 1], [axis - .13, .985], [axis - .1, .95], [axis - .07, .915], [axis - .04, .89], [axis, .875], [axis + .04, .89], [axis + .07, .915], [axis + .1, .95], [axis + .13, .985], [axis + .15, 1]],
    thickness: (y) => .004 + .014 * Math.max(0, 1 - Math.abs(y - axis) / .1) ** 1.2,
    upperPivot: .04, lowerPivot: .04, stations: 16,
    // Grey where it grows from the tail stock, darkening outward.
    color: (p, v, u) => mix(mix(TAIL, FIN_DARK, .35 * u + .2 * Math.abs(2 * v - 1)), UPPER, .7 * (1 - smoothstep(.79, .86, GIANT_TREVALLY.nose - p.z))),
  });

  // The large eye: a pale gold iris round a black pupil, set low on the cheek of the steep head.
  const eyeS = .105, eyeY = -.004;
  ctx.eyes({ s: eyeS, theta: angle(eyeS, eyeY), radius: .03, color: IRIS, sink: .3 });
  ctx.eyes({ s: eyeS - .001, theta: angle(eyeS, eyeY), radius: .0165, color: PUPIL, sink: -.15 });
  for (const side of [1, -1]) {
    const flank = (s: number, y: number) => [s, side * angle(s, y)] as const;
    // The big terminal mouth: a heavy lip line sloping down and back to below the eye.
    ctx.ribbon(Array.from({ length: 8 }, (_, i) => flank(.012 + .102 * i / 7, -.072 - .034 * (i / 7) ** 1.2)), (t) => .0032 * (1 - .55 * t) * smoothstep(-.1, .1, t), MOUTH, .0014);
    // The gill cover's rounded edge, a bright silver rim in front of a fine dark line.
    const cover = (shift: number) => Array.from({ length: 9 }, (_, j) => {
      const t = j / 8;
      return flank(.235 + shift + .028 * Math.sin(Math.PI * t) ** .8, .13 - .245 * t);
    });
    ctx.ribbon(cover(-.007), (t) => .0042 * Math.sin(Math.PI * (.08 + .84 * t)), SHEEN, .0006);
    ctx.ribbon(cover(0), (t) => .0016 * (.4 + .6 * Math.sin(Math.PI * t)), GILL);

    // The lateral line: high, arching over the pectoral, then running straight back along the midline.
    const height = curve([[.26, .62], [.34, .5], [.44, .26], [.54, .06], [.6, 0], [.8, 0]]);
    ctx.ribbon(Array.from({ length: 14 }, (_, j) => {
      const s = .26 + .42 * j / 13;
      return flank(s, ctx.center(s) + height(s) * ctx.top(s));
    }), () => .0009, LATERAL);
    // The scutes: a darker, serrated ridge along the straight part, the shields larger toward the tail.
    const scutes = 24;
    ctx.ribbon(Array.from({ length: scutes * 2 + 1 }, (_, j) => [.58 + .215 * j / (scutes * 2), side * Math.PI / 2] as const),
      (t) => (Math.round(t * scutes * 2) % 2 ? .0026 + .0018 * t : .0019 + .0012 * t) * smoothstep(0, .06, t), SCUTE, .0012);

    // Fine dark speckling on the upper flank and cheek.
    for (let i = 0; i < 24; i++) {
      const s = .08 + .6 * ((i + .5 + .5 * noise(i * 3.1, 71 + side)) / 24);
      const y = ctx.center(s) + ctx.top(s) * (.15 + .6 * (.5 + .5 * noise(i * 5.3, 73 + side))) * (1 - .6 * smoothstep(.5, .75, s));
      ctx.spot(s, side * angle(s, y), .0013 + .0008 * (.5 + .5 * noise(i * 7.7, 75)), SPECK, 1.1);
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
