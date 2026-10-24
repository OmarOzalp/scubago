/**
 * California sea lion (Zalophus californianus): a sleek, torpedo-shaped body, deepest at the chest,
 * on a long, thick, flexible neck; a dog-like head with a rounded crown, a pointed muzzle with a
 * black nose and long pale whiskers, big dark eyes, and small external ear flaps (which no true seal
 * has); long, wing-like, hairless fore flippers, dark and leathery, that it flies with; short hind
 * flippers trailing together behind the hips, fanning out to their toes. Warm chocolate brown, paler
 * and tawnier on the face and belly; the flippers near black.
 */
import { Vector3 } from 'three';
import { SWIM_RIGS, type PinnipedRig } from '../../../src/lib/marine-rigs';
import { blendSkins, curve, fin, hex, mix, noise, smoothstep, type RGB } from './kit';
import { sharkContext, type SharkDesign } from './shark';

const BACK = hex('#8b5530'), UPPER = hex('#a86b3c'), FLANK = hex('#cd9560'), BELLY = hex('#ecc994'), MUZZLE = hex('#b98a5c');
const FLIPPER = hex('#2b221d'), SOLE = hex('#3a2f28'), NOSE = hex('#120f0d'), EYE = hex('#0a0807'), WHISKER = hex('#efe7d3');
const MOUTH = hex('#2a1f18');

const rig = SWIM_RIGS['california-sea-lion'] as PinnipedRig;

const skin = (s: number, theta: number, p: Vector3): RGB => {
  const t = theta + .05 * noise(p.z * 22, 8);
  const back = mix(BACK, UPPER, smoothstep(.4, 1.2, t));
  const flank = mix(back, FLANK, smoothstep(1.0, 1.6, t));
  const body = mix(flank, BELLY, smoothstep(1.45, 2.1, t));
  // The face and muzzle are paler, the crown stays dark.
  return mix(body, MUZZLE, (1 - smoothstep(.07, .12, s)) * smoothstep(.6, 1.3, t) * .7);
};

export const CALIFORNIA_SEA_LION: SharkDesign = {
  rig, nose: .46, bodyEnd: .84, frontDome: .008,
  // Pointed muzzle, a gentle stop up to the rounded crown, a long thick neck swelling into the chest,
  // deepest a little behind the fore flippers, then a long taper to the hips and the short tail.
  width: [[0, .008], [.02, .02], [.05, .032], [.08, .045], [.1, .044], [.125, .039], [.15, .043], [.19, .058], [.24, .083], [.32, .095], [.42, .092], [.52, .084], [.62, .071], [.7, .055], [.76, .04], [.8, .028], [.84, .014]],
  top: [[0, .008], [.02, .018], [.04, .028], [.065, .047], [.09, .06], [.12, .049], [.15, .045], [.19, .054], [.24, .077], [.32, .09], [.42, .086], [.52, .077], [.62, .065], [.7, .05], [.76, .037], [.8, .026], [.84, .013]],
  bottom: [[0, .007], [.02, .015], [.05, .022], [.08, .03], [.11, .033], [.14, .038], [.19, .052], [.24, .082], [.32, .097], [.42, .09], [.52, .078], [.62, .064], [.7, .048], [.76, .034], [.8, .024], [.84, .012]],
  center: [[0, -.01], [.05, -.008], [.1, -.002], [.16, 0], [.4, 0], [.84, .004]],
  squareTop: [[0, 2], [.84, 2]],
  squareBottom: [[0, 2], [.3, 2.1], [.84, 2]],
  rings: 40, columnsAbove: 7, columnsBelow: 6,
  boundary: () => 1.75, boundaryGap: .4,
  paint: skin,
};

export function buildCaliforniaSeaLion() {
  const ctx = sharkContext(CALIFORNIA_SEA_LION);
  const { mesh, bones, z } = ctx;
  ctx.body();
  const chainSkinAt = (zz: number) => ctx.skin(ctx.sOf(zz));

  // The fore flippers: long and wing-like, broad at the wrist, tapering to a rounded tip; low on the
  // flank behind the neck, angled out and back. The arm (`Fore?1`) carries the inner part, the hand
  // (`Fore?2`) the outer.
  const fore = { rootS: .3, theta: 2.08, span: .23, droop: .32, sweep: .55, sink: .02, thickness: .016, wrist: .4 };
  const foreLe = curve([[-.014, 0], [0, 0], [.06, .006], [.12, .02], [.17, .04], [.2, .06], [.22, .08], [.23, .095]]);
  const foreTe = curve([[-.014, .07], [0, .075], [.06, .09], [.12, .1], [.17, .105], [.2, .105], [.22, .1], [.23, .095]]);
  const foreBones: { arm: Vector3; hand: Vector3 }[] = [];
  for (const left of [true, false]) {
    const side = left ? 1 : -1;
    const theta = side * fore.theta;
    const origin = ctx.surface(fore.rootS, theta, 0).addScaledVector(ctx.normal(fore.rootS, theta), -fore.sink);
    const out = new Vector3(side * Math.cos(fore.droop), -Math.sin(fore.droop), 0).normalize();
    const back = new Vector3(0, 0, -1).applyAxisAngle(new Vector3(0, 1, 0), -side * fore.sweep);
    const span = (v: number) => v * (fore.span + fore.sink);
    const at = (b: number, along: number) => origin.clone().addScaledVector(out, b).addScaledVector(back, along);
    const arm = left ? 'ForeL1' : 'ForeR1', hand = left ? 'ForeL2' : 'ForeR2';
    fin(mesh, {
      stations: 9, chordPoints: 7,
      le: (v) => at(span(v), foreLe(span(v))),
      te: (v) => at(span(v), foreTe(span(v))),
      // Thick along the leading edge (the arm's bones), thinning to the tip.
      thickness: (v) => fore.thickness * (1 - .7 * v),
      side: new Vector3(Math.sin(fore.droop) * side, Math.cos(fore.droop), 0),
      color: (_p, v, u, face) => mix(face > 0 ? FLIPPER : SOLE, mix(FLANK, BACK, .4), (1 - smoothstep(.04, .14, v)) * .8 * (1 - .5 * u)),
      skin: (p, v) => blendSkins(blendSkins(chainSkinAt(p.z), { [arm]: 1 }, smoothstep(.04, .2, v)), { [hand]: 1 }, smoothstep(fore.wrist - .1, fore.wrist + .1, v)),
    });
    const mid = (v: number) => at(span(v), (foreLe(span(v)) + foreTe(span(v))) * .35);
    foreBones.push({ arm: mid(fore.sink / (fore.span + fore.sink)), hand: mid(fore.wrist) });
  }

  // The hind flippers: trailing together behind the hips, tilted down at their outer edges, each
  // widening from the ankle to its five toes (darker tips, the trailing edge scalloped by color).
  const hindRootS = .79, hindLength = .2;
  const hindBones: Vector3[] = [];
  for (const left of [true, false]) {
    const side = left ? 1 : -1;
    const tilt = .45, splay = .1;
    const origin = new Vector3(side * .01, ctx.center(hindRootS) - .004, z(hindRootS));
    const back = new Vector3(0, 0, -1).applyAxisAngle(new Vector3(0, 1, 0), -side * splay);
    const out = new Vector3(side * Math.cos(tilt), -Math.sin(tilt), 0).applyAxisAngle(new Vector3(0, 1, 0), -side * splay);
    const outer = curve([[0, .008], [.3, .016], [.6, .026], [.82, .034], [.93, .03], [1, 0]]);
    const inner = curve([[0, .006], [.3, .008], [.6, .012], [.82, .016], [.93, .014], [1, 0]]);
    const bone = left ? 'HindL' : 'HindR';
    fin(mesh, {
      stations: 8, chordPoints: 6,
      le: (v) => origin.clone().addScaledVector(back, hindLength * v).addScaledVector(out, outer(v)),
      te: (v) => origin.clone().addScaledVector(back, hindLength * v).addScaledVector(out, -inner(v)),
      thickness: (v) => .012 * (1 - .75 * v),
      side: new Vector3(Math.sin(tilt) * side, Math.cos(tilt), 0),
      color: (_p, v, u) => {
        // Toes: dark ridges toward the tip, fanned across the flipper.
        const toes = smoothstep(.7, .95, v) * (.5 + .5 * Math.cos(u * Math.PI * 8));
        return mix(mix(FLIPPER, mix(BACK, FLIPPER, .5), (1 - smoothstep(.05, .25, v)) * .6), NOSE, .5 * toes);
      },
      skin: (p, v) => blendSkins(chainSkinAt(p.z), { [bone]: 1 }, smoothstep(.05, .25, v)),
    });
    hindBones.push(origin.clone().addScaledVector(back, .02));
  }

  // Small, rolled ear flaps behind the eyes, pointing back and a little out.
  for (const side of [1, -1]) {
    const base = ctx.surface(.128, side * .98, -.002);
    const dir = new Vector3(side * .55, .32, -1).normalize();
    fin(mesh, {
      stations: 3, chordPoints: 4,
      le: (v) => base.clone().addScaledVector(dir, .04 * v).add(new Vector3(0, .006 * (1 - v), 0)),
      te: (v) => base.clone().addScaledVector(dir, .04 * v).add(new Vector3(0, -.005 * (1 - v), 0)),
      thickness: (v) => .007 * (1 - .6 * v),
      side: new Vector3(side, 0, 0),
      color: () => BACK,
      skin: () => ({ Head: 1 }),
    });
  }

  // Big dark eyes, the black nose on the muzzle's tip, the mouth's line and long pale whiskers.
  ctx.eyes({ s: .078, theta: 1.02, radius: .0125, color: EYE, sink: .3 });
  for (const side of [1, -1]) {
    ctx.spot(.01, side * .42, .0065, NOSE, 1.2);
    ctx.ribbon(Array.from({ length: 6 }, (_, i) => [.006 + .04 * i / 5, side * (1.78 + .14 * i / 5)] as const), (t) => .0015 * (.5 + .5 * Math.sin(Math.PI * t)), MOUTH);
    for (const [s, theta, length, droop] of [[.022, 1.32, .05, .1], [.028, 1.48, .056, .22], [.034, 1.62, .05, .34]] as const) {
      const base = ctx.surface(s, side * theta, -.001);
      const dir = new Vector3(side * .75, -droop, -.66).normalize();
      fin(mesh, {
        stations: 2, chordPoints: 3,
        le: (v) => base.clone().addScaledVector(dir, length * v).add(new Vector3(0, .0012 * (1 - v), 0)),
        te: (v) => base.clone().addScaledVector(dir, length * v).add(new Vector3(0, -.0012 * (1 - v), 0)),
        thickness: () => .0012,
        side: new Vector3(0, 0, 1),
        color: () => WHISKER,
        skin: () => ({ Head: 1 }),
      });
    }
  }

  ctx.spineBones();
  bones.push(
    { name: 'ForeL1', parent: 'Spine1', position: foreBones[0].arm },
    { name: 'ForeL2', parent: 'ForeL1', position: foreBones[0].hand },
    { name: 'ForeR1', parent: 'Spine1', position: foreBones[1].arm },
    { name: 'ForeR2', parent: 'ForeR1', position: foreBones[1].hand },
    { name: 'HindL', parent: 'Tail', position: hindBones[0] },
    { name: 'HindR', parent: 'Tail', position: hindBones[1] },
  );
  return { mesh, bones };
}
