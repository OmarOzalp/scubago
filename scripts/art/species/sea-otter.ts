/**
 * Sea otter (Enhydra lutris): a long, supple body in the densest fur of any animal, dark chocolate
 * brown frosted with paler guard hairs; a broad, rounded head, pale cream to grey, with a blunt
 * muzzle, a dark nose, long pale whiskers, small dark eyes and small rounded ears; short forelegs
 * with small, mitten-like paws; a flattened tail about a third of its length; and big, webbed,
 * flipper-like hind feet. It floats on its back at the surface (the rig curls it, the motion rolls it
 * over) and swims belly-down when it dives.
 */
import { Vector3 } from 'three';
import { SWIM_RIGS, type PinnipedRig } from '../../../src/lib/marine-rigs';
import { blendSkins, curve, fin, hex, mix, noise, smoothstep, type RGB } from './kit';
import { sharkContext, type SharkDesign } from './shark';

const BODY = hex('#3d2b21'), FROST = hex('#6e5747'), BELLY = hex('#4a362a'), HEAD = hex('#cbbba3'), HEAD_SHADE = hex('#a8977f');
const FOOT = hex('#2a1f19'), PAW = hex('#33261e'), NOSE = hex('#121010'), EYE = hex('#080707'), WHISKER = hex('#efe9da');
const MOUTH = hex('#2a201b'), EAR = hex('#4a382c');

const rig = SWIM_RIGS['sea-otter'] as PinnipedRig;

/** Dark brown fur frosted with paler guard hairs; the head and neck pale, fading into the body behind them. */
const skin = (s: number, theta: number, p: Vector3): RGB => {
  const t = Math.abs(theta);
  const frost = smoothstep(.55, .85, noise(p.z * 80 + 5, 3) * .6 + noise(p.x * 90 + p.y * 70, 7) * .4) * .55;
  const body = mix(mix(BODY, BELLY, smoothstep(1.8, 2.6, t)), FROST, frost);
  const head = mix(HEAD, HEAD_SHADE, smoothstep(1.4, 2.6, t) * .6 + noise(p.z * 60, 2) * .2);
  return mix(head, body, smoothstep(.12, .22, s + .02 * noise(theta * 4, 1)));
};

export const SEA_OTTER: SharkDesign = {
  rig, nose: .45, bodyEnd: .985, frontDome: .015,
  // A blunt muzzle on a broad, round head, a thick neck, a long body deepest at the chest, the hips
  // narrowing into the long, flat tail.
  width: [[0, .016], [.02, .03], [.05, .045], [.09, .055], [.13, .053], [.18, .058], [.26, .068], [.36, .074], [.46, .071], [.55, .062], [.62, .046], [.68, .036], [.78, .033], [.88, .029], [.95, .02], [.985, .006]],
  top: [[0, .014], [.02, .026], [.05, .038], [.09, .047], [.13, .046], [.18, .052], [.26, .062], [.36, .066], [.46, .062], [.55, .052], [.62, .032], [.68, .016], [.78, .013], [.88, .011], [.95, .008], [.985, .003]],
  bottom: [[0, .013], [.02, .022], [.05, .032], [.09, .04], [.13, .043], [.18, .05], [.26, .062], [.36, .068], [.46, .064], [.55, .054], [.62, .034], [.68, .016], [.78, .012], [.88, .01], [.95, .007], [.985, .003]],
  center: [[0, -.006], [.08, -.002], [.15, 0], [.6, 0], [.985, .004]],
  squareTop: [[0, 2], [.55, 2], [.66, 2.6], [.985, 2.6]],
  squareBottom: [[0, 2], [.55, 2], [.66, 2.6], [.985, 2.6]],
  rings: 42, columnsAbove: 7, columnsBelow: 6,
  boundary: () => 1.9, boundaryGap: .5,
  paint: skin,
};

export function buildSeaOtter() {
  const ctx = sharkContext(SEA_OTTER);
  const { mesh, bones } = ctx;
  ctx.body();
  const chainSkinAt = (zz: number) => ctx.skin(ctx.sOf(zz));

  // Short forelegs under the chest ending in small, rounded, mitten-like paws. The arm (`Fore?1`)
  // carries the leg, the hand (`Fore?2`) the paw.
  const fore = { rootS: .2, theta: 2.35, span: .05, droop: .9, sweep: .7, sink: .015, thickness: .02, wrist: .55 };
  const foreLe = curve([[-.012, 0], [0, 0], [.02, .004], [.04, .01], [.05, .02]]);
  const foreTe = curve([[-.012, .03], [0, .032], [.02, .034], [.04, .032], [.05, .02]]);
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
      stations: 5, chordPoints: 5,
      le: (v) => at(span(v), foreLe(span(v))),
      te: (v) => at(span(v), foreTe(span(v))),
      thickness: (v) => fore.thickness * (1 - .3 * v),
      side: new Vector3(Math.sin(fore.droop) * side, Math.cos(fore.droop), 0),
      color: (_p, v) => mix(BELLY, PAW, smoothstep(.4, .8, v)),
      skin: (p, v) => blendSkins(blendSkins(chainSkinAt(p.z), { [arm]: 1 }, smoothstep(.1, .3, v)), { [hand]: 1 }, smoothstep(fore.wrist - .1, fore.wrist + .1, v)),
    });
    const mid = (v: number) => at(span(v), (foreLe(span(v)) + foreTe(span(v))) * .45);
    foreBones.push({ arm: mid(fore.sink / (fore.span + fore.sink)), hand: mid(fore.wrist) });
  }

  // The hind feet: big, webbed, flipper-like, from the hips back along either side of the tail,
  // widening to five long toes; dark and leathery underneath, furred above near the ankle.
  const hindRootS = .6, hindLength = .17;
  const hindBones: Vector3[] = [];
  for (const left of [true, false]) {
    const side = left ? 1 : -1;
    const tilt = .25, splay = .32;
    const origin = ctx.surface(hindRootS, side * 1.75, -.01);
    const back = new Vector3(0, 0, -1).applyAxisAngle(new Vector3(0, 1, 0), -side * splay);
    const out = new Vector3(side * Math.cos(tilt), -Math.sin(tilt), 0).applyAxisAngle(new Vector3(0, 1, 0), -side * splay);
    const outer = curve([[0, .01], [.3, .018], [.6, .03], [.82, .04], [.94, .036], [1, 0]]);
    const inner = curve([[0, .008], [.3, .01], [.6, .016], [.82, .022], [.94, .02], [1, 0]]);
    const bone = left ? 'HindL' : 'HindR';
    fin(mesh, {
      stations: 8, chordPoints: 6,
      le: (v) => origin.clone().addScaledVector(back, hindLength * v).addScaledVector(out, outer(v)),
      te: (v) => origin.clone().addScaledVector(back, hindLength * v).addScaledVector(out, -inner(v)),
      thickness: (v) => .016 * (1 - .7 * v),
      side: new Vector3(Math.sin(tilt) * side, Math.cos(tilt), 0),
      color: (_p, v, u, face) => {
        const toes = smoothstep(.72, .95, v) * (.5 + .5 * Math.cos(u * Math.PI * 9));
        return mix(mix(face > 0 ? FROST : FOOT, FOOT, smoothstep(.1, .4, v)), NOSE, .35 * toes);
      },
      skin: (p, v) => blendSkins(chainSkinAt(p.z), { [bone]: 1 }, smoothstep(.05, .25, v)),
    });
    hindBones.push(origin.clone().addScaledVector(back, .015));
  }

  // Small, rounded ears on the sides of the head.
  for (const side of [1, -1]) {
    const base = ctx.surface(.098, side * 1.05, -.002);
    const dir = new Vector3(side * .55, .55, -.6).normalize();
    fin(mesh, {
      stations: 3, chordPoints: 4,
      le: (v) => base.clone().addScaledVector(dir, .013 * v).add(new Vector3(0, 0, .006 * (1 - v))),
      te: (v) => base.clone().addScaledVector(dir, .013 * v).add(new Vector3(0, 0, -.006 * (1 - v))),
      thickness: (v) => .005 * (1 - .5 * v),
      side: new Vector3(side, 0, 0),
      color: () => EAR,
      skin: () => ({ Head: 1 }),
    });
  }

  // Small dark eyes set high and forward, the broad dark nose, the mouth's line and long whiskers.
  ctx.eyes({ s: .052, theta: .82, radius: .0085, color: EYE, sink: .3 });
  ctx.spot(.006, 0, .012, NOSE, 1.1);
  for (const side of [1, -1]) {
    ctx.ribbon(Array.from({ length: 5 }, (_, i) => [.01 + .03 * i / 4, side * (1.9 + .1 * i / 4)] as const), (t) => .0014 * (.5 + .5 * Math.sin(Math.PI * t)), MOUTH);
    for (const [s, theta, length, droop] of [[.016, 1.3, .05, .1], [.021, 1.46, .056, .22], [.026, 1.62, .05, .34]] as const) {
      const base = ctx.surface(s, side * theta, -.001);
      const dir = new Vector3(side * .8, -droop, -.55).normalize();
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
    { name: 'HindL', parent: 'RearBody', position: hindBones[0] },
    { name: 'HindR', parent: 'RearBody', position: hindBones[1] },
  );
  return { mesh, bones };
}
