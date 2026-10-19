/**
 * Harbor seal (Phoca vitulina): a plump, spindle-shaped body with hardly any neck; a round head with
 * a short, dog-like muzzle, a V of nostrils on top of it, big dark eyes and beaded whiskers, and no
 * ear flaps (just small openings, as every true seal has); short fore flippers with dark claws, held
 * against the flanks; broad, fan-shaped hind flippers held close together behind the hips, the seal's
 * tail-like propeller. Silvery grey, darker along the back, dappled all over with dark spots
 * and rings, paler and more sparsely spotted on the belly.
 */
import { Vector3 } from 'three';
import { SWIM_RIGS, type PinnipedRig } from '../../../src/lib/marine-rigs';
import { blendSkins, curve, fin, hex, mix, noise, smoothstep, type RGB } from './kit';
import { sharkContext, type SharkDesign } from './shark';

const BACK = hex('#5f666c'), FLANK = hex('#8e9597'), BELLY = hex('#c4c1b6'), SPOT = hex('#2f3337'), RING = hex('#d2d0c6');
const FLIPPER = hex('#3a3e42'), CLAW = hex('#16181a'), NOSE = hex('#141618'), EYE = hex('#07080a'), WHISKER = hex('#e8e4d6');
const MOUTH = hex('#2a2c2e');

const rig = SWIM_RIGS['harbor-seal'] as PinnipedRig;

/** The coat under its spots (buildHarborSeal scatters those): silver, darker along the back, faintly mottled. */
const skin = (_s: number, theta: number, p: Vector3): RGB => {
  const t = Math.abs(theta);
  const base = mix(mix(BACK, FLANK, smoothstep(.5, 1.6, t)), BELLY, smoothstep(1.9, 2.6, t));
  return mix(base, BACK, .12 * noise(p.z * 30 + p.x * 20, 3) * (1 - smoothstep(1.6, 2.4, t)));
};

export const HARBOR_SEAL: SharkDesign = {
  rig, nose: .46, bodyEnd: .84, frontDome: .014,
  // A short, blunt, dog-like muzzle, low on the face, below a steep forehead; a big round head, a little
  // narrower behind it where the short neck is; the plump body deepest a little behind the middle, then a
  // quick taper to the hips.
  width: [[0, .019], [.03, .03], [.055, .043], [.08, .054], [.11, .059], [.14, .058], [.17, .054], [.21, .063], [.28, .078], [.36, .09], [.44, .095], [.52, .092], [.6, .082], [.67, .066], [.73, .05], [.79, .032], [.84, .016]],
  top: [[0, .015], [.03, .023], [.055, .043], [.08, .056], [.11, .06], [.14, .057], [.17, .051], [.21, .06], [.28, .074], [.36, .085], [.44, .089], [.52, .086], [.6, .076], [.67, .061], [.73, .046], [.79, .03], [.84, .015]],
  bottom: [[0, .013], [.03, .021], [.055, .033], [.08, .042], [.11, .048], [.14, .051], [.17, .052], [.21, .062], [.28, .076], [.36, .088], [.44, .092], [.52, .088], [.6, .077], [.67, .061], [.73, .045], [.79, .029], [.84, .014]],
  center: [[0, -.015], [.035, -.012], [.07, -.005], [.12, -.001], [.18, 0], [.5, 0], [.84, .003]],
  squareTop: [[0, 2], [.84, 2]],
  squareBottom: [[0, 2], [.4, 2.1], [.84, 2]],
  rings: 46, columnsAbove: 7, columnsBelow: 6,
  boundary: () => 1.9, boundaryGap: .45,
  paint: skin,
};

export function buildHarborSeal() {
  const ctx = sharkContext(HARBOR_SEAL);
  const { mesh, bones, z } = ctx;
  ctx.body();
  const chainSkinAt = (zz: number) => ctx.skin(ctx.sOf(zz));

  // Short fore flippers low on the flanks behind the head, swept back along the body; dark claws at
  // their tips. The arm (`Fore?1`) carries the inner part, the hand (`Fore?2`) the outer.
  // Short and stubby, held in under the chest and swept back along the belly, not out like a fish's fins.
  const fore = { rootS: .24, theta: 2.25, span: .06, droop: 1, sweep: 1.45, sink: .012, thickness: .017, wrist: .5 };
  const foreLe = curve([[-.012, 0], [0, 0], [.03, .006], [.06, .016], [.08, .03], [.085, .042]]);
  const foreTe = curve([[-.012, .055], [0, .058], [.03, .062], [.06, .06], [.08, .052], [.085, .042]]);
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
      stations: 6, chordPoints: 6,
      le: (v) => at(span(v), foreLe(span(v))),
      te: (v) => at(span(v), foreTe(span(v))),
      thickness: (v) => fore.thickness * (1 - .55 * v),
      side: new Vector3(Math.sin(fore.droop) * side, Math.cos(fore.droop), 0),
      // Furred like the body near the root, darker toward the tip, the claws darkest of all.
      color: (_p, v, u) => mix(mix(FLANK, FLIPPER, smoothstep(.2, .6, v)), CLAW, smoothstep(.85, .95, v) * (.5 + .5 * Math.cos(u * Math.PI * 9))),
      skin: (p, v) => blendSkins(blendSkins(chainSkinAt(p.z), { [arm]: 1 }, smoothstep(.1, .3, v)), { [hand]: 1 }, smoothstep(fore.wrist - .1, fore.wrist + .1, v)),
    });
    const mid = (v: number) => at(span(v), (foreLe(span(v)) + foreTe(span(v))) * .4);
    foreBones.push({ arm: mid(fore.sink / (fore.span + fore.sink)), hand: mid(fore.wrist) });
  }

  // The hind flippers: broad fans behind the hips, held close together and raised into a shallow V
  // (so they show from above and from the side), each widening from the ankle to its webbed toes;
  // darker toward the tips.
  const hindRootS = .8, hindLength = .19;
  const hindBones: Vector3[] = [];
  for (const left of [true, false]) {
    const side = left ? 1 : -1;
    const tilt = .55, splay = .1;
    const origin = new Vector3(side * .008, ctx.center(hindRootS), z(hindRootS));
    const back = new Vector3(0, 0, -1).applyAxisAngle(new Vector3(0, 1, 0), -side * splay);
    const out = new Vector3(side * Math.cos(tilt), Math.sin(tilt), 0).applyAxisAngle(new Vector3(0, 1, 0), -side * splay);
    const outer = curve([[0, .008], [.3, .016], [.6, .03], [.82, .042], [.93, .04], [1, 0]]);
    const inner = curve([[0, .006], [.3, .008], [.6, .012], [.82, .016], [.93, .014], [1, 0]]);
    const bone = left ? 'HindL' : 'HindR';
    fin(mesh, {
      stations: 8, chordPoints: 6,
      le: (v) => origin.clone().addScaledVector(back, hindLength * v).addScaledVector(out, outer(v)),
      te: (v) => origin.clone().addScaledVector(back, hindLength * v).addScaledVector(out, -inner(v)),
      thickness: (v) => .013 * (1 - .75 * v),
      side: new Vector3(-side * Math.sin(tilt), Math.cos(tilt), 0),
      color: (_p, v, u) => {
        const toes = smoothstep(.75, .95, v) * (.5 + .5 * Math.cos(u * Math.PI * 8));
        return mix(mix(FLANK, FLIPPER, smoothstep(.05, .35, v)), CLAW, .45 * toes);
      },
      skin: (p, v) => blendSkins(chainSkinAt(p.z), { [bone]: 1 }, smoothstep(.05, .25, v)),
    });
    hindBones.push(origin.clone().addScaledVector(back, .02));
  }

  // The dappled coat: dark spots thrown at random over the back and flanks (none crowding another),
  // thinning and paling toward the belly, smaller on the head; a pale ring round some of them.
  const random = (n: number) => {
    const v = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
    return v - Math.floor(v);
  };
  const placed: { p: Vector3; r: number }[] = [];
  for (let n = 0; n < 3000 && placed.length < 96; n++) {
    const s = .09 + .68 * random(n * 3), theta = (random(n * 3 + 1) * 2 - 1) * 2.55, t = Math.abs(theta);
    if (random(n * 3 + 2) < smoothstep(1.7, 2.5, t) * .85) continue;
    const r = (.0045 + .0055 * random(n * 5 + 7) ** 1.5) * (1 - .3 * smoothstep(.62, .78, s)) * (1 - .3 * (1 - smoothstep(.1, .2, s)));
    const p = ctx.surface(s, theta, 0);
    if (placed.some((q) => q.p.distanceTo(p) < 1.5 * (q.r + r))) continue;
    placed.push({ p, r });
    const ringed = placed.length % 6 === 1 && t < 1.9;
    if (ringed) ctx.spot(s, theta, r * 1.6, mix(RING, FLANK, .45), 1.15, .001);
    ctx.spot(s, theta, r, mix(SPOT, FLANK, .45 * smoothstep(1.5, 2.4, t)), 1.25, ringed ? .0017 : .001);
  }

  // Big dark eyes, the V of nostrils on top of the muzzle, the mouth's line and beaded whiskers.
  ctx.eyes({ s: .082, theta: .95, radius: .0145, color: EYE, sink: .3 });
  for (const side of [1, -1]) {
    ctx.ribbon([[.01, side * .1], [.018, side * .32]], () => .0028, NOSE);
    ctx.ribbon(Array.from({ length: 6 }, (_, i) => [.008 + .034 * i / 5, side * (1.86 + .12 * i / 5)] as const), (t) => .0014 * (.5 + .5 * Math.sin(Math.PI * t)), MOUTH);
    for (const [s, theta, length, droop] of [[.02, 1.36, .042, .12], [.026, 1.5, .048, .24], [.032, 1.64, .044, .36]] as const) {
      const base = ctx.surface(s, side * theta, -.001);
      const dir = new Vector3(side * .78, -droop, -.6).normalize();
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
