/**
 * Sperm whale (Physeter macrocephalus): an enormous, blunt, box-like head a third of the body long,
 * its front squared off and tall, the single blowhole at its front left; under it a narrow rod of a
 * lower jaw, set well back from the snout, its lips white; small eyes near the corners of the mouth
 * and short paddle flippers just behind; a long body with the wrinkled, prune-like skin of the
 * species, a low rounded hump two thirds of the way back and a row of knuckles running from it to the
 * tail; broad, triangular flukes with a straight trailing edge and a deep notch. Dark slate grey with a
 * brownish cast, pale squid-sucker scars on the head, white about the mouth and patches on the belly.
 */
import { Vector3 } from 'three';
import { SWIM_RIGS, type CetaceanRig } from '../../../src/lib/marine-rigs';
import { blendSkins, fin, hex, mix, noise, smoothstep, type RGB } from './kit';
import { sharkContext, type SharkDesign } from './shark';

const BACK = hex('#3f4247'), BROWN = hex('#4c4744'), FLANK = hex('#555a5f'), WRINKLE = hex('#33363a');
const WHITE = hex('#e3e0d8'), SCAR = hex('#9a9c9c'), EYE = hex('#08090a'), BLOWHOLE = hex('#1d1f22');

const rig = SWIM_RIGS['sperm-whale'] as CetaceanRig;

/** Where the head ends and the body begins (body lengths from the snout). */
const HEAD = .33;

function skinColor(s: number, theta: number, p: Vector3): RGB {
  // Dark slate, browner along the back of the body; the flanks a shade lighter.
  const back = mix(BACK, BROWN, smoothstep(.2, .5, s) * (1 - smoothstep(.75, .95, s)));
  let color = mix(back, FLANK, smoothstep(.9, 1.8, theta));
  // The wrinkles: fine, wavy, dark folds across the body behind the head.
  if (s > HEAD - .02 && s < .85) {
    const fold = Math.abs(Math.sin(s * 150 + 2.4 * noise(theta * 6 + s * 9, 3) + theta * 3));
    color = mix(color, WRINKLE, .55 * smoothstep(.86, .99, fold) * smoothstep(HEAD - .02, HEAD + .04, s));
  }
  // White about the mouth and the lower jaw, and blotches on the belly.
  const lips = s > .05 && s < HEAD + .02 ? smoothstep(2.55, 2.75, theta) : 0;
  const belly = s > .4 && s < .7 ? smoothstep(.3, .65, noise(p.z * 8 + p.x * 11, 5)) * smoothstep(2.6, 2.95, theta) * (1 - smoothstep(.6, .7, s)) : 0;
  return mix(color, WHITE, Math.max(lips, belly));
}

export const SPERM_WHALE: SharkDesign = {
  rig, nose: .4, bodyEnd: .9, frontDome: .022,
  // The box of a head: tall and squared at the front, a little narrower than tall; the body behind it rounder.
  width: [[0, .046], [.02, .058], [.06, .066], [.12, .07], [.2, .072], [.28, .074], [.34, .078], [.42, .082], [.5, .08], [.58, .072], [.65, .061], [.71, .049], [.77, .036], [.82, .026], [.86, .019], [.9, .014]],
  top: [[0, .056], [.02, .07], [.06, .078], [.12, .082], [.2, .082], [.28, .08], [.34, .078], [.42, .08], [.5, .079], [.6, .072], [.64, .074], [.68, .068], [.73, .058], [.78, .05], [.83, .043], [.87, .035], [.9, .028]],
  // Under the front of the head the face recedes to the jaw, which runs back to the corner of the mouth.
  bottom: [[0, .024], [.02, .038], [.05, .05], [.1, .058], [.18, .066], [.26, .074], [.34, .085], [.42, .09], [.5, .087], [.58, .077], [.65, .065], [.71, .053], [.77, .043], [.82, .034], [.86, .027], [.9, .02]],
  center: [[0, .012], [.1, .008], [.3, 0], [.6, .004], [.9, .008]],
  // Boxy across the top of the head, its underside narrowing to the jaw; a rounder body; a tall, narrow tail stock.
  squareTop: [[0, 3], [.2, 3], [.3, 2.4], [.4, 2.05], [.7, 2], [.9, 1.65]],
  squareBottom: [[0, 1.6], [.2, 1.55], [.3, 1.8], [.4, 2], [.7, 1.9], [.9, 1.65]],
  rings: 44, columnsAbove: 8, columnsBelow: 7,
  boundary: () => 2.55, boundaryGap: .1,
  paint: skinColor,
};

/** Half the fluke span, and the rounding at each tip (body lengths). */
const FLUKE = .142, FLUKE_TIP = .009;

export function buildSpermWhale() {
  const ctx = sharkContext(SPERM_WHALE);
  const { mesh, bones, z } = ctx;
  ctx.body();

  // The knuckles along the back: low, rounded bumps on the midline from the hump to the tail.
  for (let i = 0; i < 6; i++) {
    const s0 = .705 + i * .03, h = .0075 * (1 - .12 * i);
    ctx.midlineFin({
      le: [[-.01, s0 - .008], [0, s0 - .006], [h * .6, s0 - .002], [h, s0 + .004]],
      te: [[-.01, s0 + .018], [0, s0 + .016], [h * .6, s0 + .01], [h, s0 + .004]],
      height: h, thickness: .014, stations: 4, color: () => BROWN, sink: .006,
    });
  }
  // The low hump.
  ctx.midlineFin({
    le: [[-.01, .6], [0, .604], [.008, .622], [.014, .64], [.017, .652]],
    te: [[-.01, .7], [0, .698], [.008, .68], [.014, .664], [.017, .652]],
    height: .017, thickness: .03, color: () => BROWN, sink: .008,
  });

  // The narrow lower jaw: a rounded rod under the head, from well behind the snout back to the corner of the mouth.
  ctx.midlineFin({
    ventral: true, sink: .02, stations: 5,
    le: [[-.01, .07], [0, .075], [.008, .085], [.013, .11], [.015, .2]],
    te: [[-.01, .36], [0, .355], [.008, .345], [.013, .31], [.015, .2]],
    height: .015, thickness: .03, color: () => WHITE,
  });

  // Short, rounded paddle flippers just behind the mouth's corners.
  const flippers = ctx.pairedFin({
    rootS: .37, theta: 2.15, span: .075, droop: .55, sweep: .35, thickness: .016,
    le: [[-.012, 0], [0, 0], [.025, .008], [.05, .02], [.065, .032], [.075, .045]],
    te: [[-.012, .05], [0, .05], [.025, .056], [.05, .058], [.065, .055], [.075, .045]],
    bone: (left) => (left ? 'PectoralL' : 'PectoralR'),
    color: (_p, v, _u, _left, face) => mix(face > 0 ? BACK : FLANK, WRINKLE, .25 * v),
  });

  // Broad triangular flukes: a leading edge sweeping back to rounded tips, a straight trailing edge with a deep notch.
  const tipS = .975;
  const lead = (a: number) => .87 + .085 * (a / FLUKE) ** 1.25;
  const trail = (a: number) => .968 + .006 * (a / FLUKE) - .022 * Math.exp(-((a / .013) ** 2));
  const margins = (a: number) => {
    const inner = FLUKE - FLUKE_TIP;
    const round = a <= inner ? 1 : Math.sqrt(Math.max(0, 1 - ((a - inner) / FLUKE_TIP) ** 2));
    return { le: tipS - (tipS - lead(a)) * round, te: tipS + (trail(a) - tipS) * round };
  };
  const across = (v: number) => FLUKE * (1 - 2 * v);
  const flukeY = ctx.center(.9);
  fin(mesh, {
    stations: 26, rootPoint: true, chordPoints: 7,
    le: (v) => { const x = across(v), a = Math.abs(x); return new Vector3(x, flukeY, z(margins(a).le)); },
    te: (v) => { const x = across(v), a = Math.abs(x); return new Vector3(x, flukeY, z(margins(a).te)); },
    thickness: (v) => .007 + .022 * Math.max(0, 1 - Math.abs(across(v)) / FLUKE) ** 1.3,
    side: new Vector3(0, 1, 0),
    color: (_p, _v, u, face) => (face > 0 ? mix(BACK, WRINKLE, .3 * u) : mix(FLANK, BACK, .3 + .3 * u)),
    skin: (p) => blendSkins({ Tail: 1 }, { [p.x >= 0 ? 'FlukeL' : 'FlukeR']: 1 }, smoothstep(.04, .11, Math.abs(p.x))),
  });

  // The mouth's line along the jaw, white-lipped, and the small eyes above its corners.
  for (const side of [1, -1]) {
    ctx.ribbon([[.075, 2.62], [.12, 2.6], [.18, 2.58], [.24, 2.56], [.29, 2.5], [.325, 2.38]].map(([s, theta]) => [s, side * theta] as const),
      (t) => .0016 * (.6 + .4 * Math.sin(Math.PI * t)), WRINKLE);
  }
  ctx.eyes({ s: .335, theta: 2.12, radius: .0052, color: EYE, sink: .4 });
  // The single blowhole, at the front of the head, offset to the left.
  ctx.spot(.012, .42, .007, BLOWHOLE, .45);
  // Pale squid-sucker scars and scratches on the head.
  for (let i = 0; i < 9; i++) {
    const s0 = .03 + .028 * i + .01 * noise(i * 3.3, 2), t0 = (i % 2 ? 1 : -1) * (.5 + .7 * Math.abs(noise(i * 1.7, 4)));
    ctx.ribbon([[s0, t0], [s0 + .02, t0 + .12 * noise(i, 6)], [s0 + .04, t0 + .1 * noise(i + 9, 6)]], () => .0012, SCAR);
  }
  for (let i = 0; i < 7; i++) ctx.spot(.05 + .035 * i, (i % 2 ? 1 : -1) * (1.1 + .3 * noise(i * 2.1, 8)), .0035, SCAR);

  ctx.spineBones();
  const flukeTip = (side: number) => new Vector3(side * .055, flukeY, z(.93));
  bones.push(
    { name: 'FlukeL', parent: 'Tail', position: flukeTip(1) },
    { name: 'FlukeR', parent: 'Tail', position: flukeTip(-1) },
    { name: 'PectoralL', parent: 'Root', position: flippers[0] },
    { name: 'PectoralR', parent: 'Root', position: flippers[1] },
  );
  return { mesh, bones };
}
