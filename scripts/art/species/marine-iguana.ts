/**
 * Marine iguana (Amblyrhynchus cristatus): the only lizard that swims in the sea. A short, blunt,
 * box-like head crusted with pale salt and knobbly scales, a heavy jowl and small eyes; a thick
 * neck and a stout body; a long tail flattened side to side for swimming, more than half its length;
 * a crest of pale-tipped spines from the nape down the back and the tail. Swimming, it holds its
 * short legs folded back along its flanks, long clawed toes trailing. Sooty black all over, mottled
 * with rust red and dull green on the flanks, as the Galápagos' southern islands' iguanas are.
 */
import { Vector3 } from 'three';
import { SWIM_RIGS, type SharkRig } from '../../../src/lib/marine-rigs';
import { blendSkins, hex, mix, MeshBuilder, noise, path, smoothstep, TAU, type RGB, type Skin } from './kit';
import { sharkContext, type SharkDesign } from './shark';

const BLACK = hex('#232527'), SOOT = hex('#2f3235'), GREY = hex('#4b4e50'), BELLY = hex('#3c3e40');
const SALT = hex('#bdb9ae'), RUST = hex('#7c3626'), MOSS = hex('#3d5641');
const SPINE = hex('#8f8b80'), EYE = hex('#161211'), LID = hex('#5d5a54'), CLAW = hex('#151515');

const rig = SWIM_RIGS['marine-iguana'] as SharkRig;
const NOSE = .4;

/** Two-dimensional value noise from the kit's one-dimensional noise, for mottling. */
const mottle = (p: Vector3, scale: number, seed: number) =>
  (noise(p.z * scale + p.x * scale * .7, seed) + noise(p.y * scale * 1.3 - p.z * scale * .4, seed + 3)) / 2;

const skin = (s: number, theta: number, p: Vector3): RGB => {
  let c = mix(BLACK, SOOT, .5 + .5 * mottle(p, 70, 1));
  // Rust and moss mottling on the flanks of the body and the base of the tail.
  const flank = smoothstep(.12, .2, s) * (1 - smoothstep(.46, .62, s)) * smoothstep(.55, 1.05, theta) * (1 - smoothstep(1.9, 2.35, theta));
  c = mix(c, RUST, flank * smoothstep(.05, .45, mottle(p, 55, 7)) * .85);
  c = mix(c, MOSS, flank * smoothstep(.1, .5, mottle(p, 48, 11)) * .7);
  // Salt crust and pale scales on the top of the head and snout.
  const crown = (1 - smoothstep(.045, .12, s)) * (1 - smoothstep(.75, 1.35, theta));
  c = mix(c, SALT, crown * .8 * smoothstep(0, .45, mottle(p, 110, 5)));
  // A greyer belly; faint darker bands down the tail.
  c = mix(c, BELLY, smoothstep(2.2, 2.8, theta) * .6);
  c = mix(c, BLACK, smoothstep(.5, .6, s) * .35 * smoothstep(.2, .8, Math.sin(s * 70)));
  return c;
};

export const MARINE_IGUANA: SharkDesign = {
  rig, nose: NOSE, bodyEnd: .995, frontDome: .012,
  // A blunt box of a head with heavy jowls, a thick neck, a stout body and a long, tapering tail.
  width: [[0, .016], [.012, .024], [.028, .031], [.05, .036], [.075, .038], [.1, .033], [.13, .038], [.18, .053], [.26, .062], [.34, .059], [.4, .049], [.45, .035], [.52, .025], [.6, .0185], [.7, .0128], [.8, .0082], [.9, .0045], [.995, .001]],
  top: [[0, .01], [.012, .018], [.028, .025], [.05, .03], [.075, .032], [.1, .03], [.13, .033], [.18, .039], [.26, .043], [.34, .041], [.4, .037], [.45, .034], [.52, .032], [.6, .028], [.7, .022], [.8, .016], [.9, .009], [.995, .0015]],
  bottom: [[0, .008], [.012, .012], [.028, .018], [.05, .024], [.075, .029], [.1, .027], [.13, .028], [.18, .033], [.26, .036], [.34, .034], [.4, .03], [.45, .026], [.52, .023], [.6, .019], [.7, .015], [.8, .011], [.9, .006], [.995, .001]],
  center: [[0, .006], [.06, .006], [.14, .002], [.3, 0], [.995, 0]],
  // Boxy head; a rounded body; a tail flattened side to side.
  squareTop: [[0, 2.6], [.09, 2.6], [.16, 2.2], [.45, 2.1], [.995, 2]],
  squareBottom: [[0, 2.4], [.09, 2.4], [.16, 2.3], [.45, 2.1], [.995, 2]],
  rings: 50, columnsAbove: 7, columnsBelow: 5,
  boundary: () => 2.15, boundaryGap: .25,
  paint: skin,
};

/** A tube along a smooth path through `points`, its radius from `radius(t)`, capped at both ends. */
function tube(mesh: MeshBuilder, points: readonly Vector3[], radius: (t: number) => number, color: (t: number, a: number) => RGB, weights: (t: number) => Skin, options: { sides?: number; stations?: number; flat?: number } = {}) {
  const sides = options.sides ?? 6, stations = options.stations ?? 8, flat = options.flat ?? 1;
  const along = path(points.map((p) => [p.x, p.y, p.z] as const));
  mesh.begin();
  let normal = new Vector3(0, 1, 0);
  const rings: number[][] = [];
  const centers: Vector3[] = [];
  for (let i = 0; i <= stations; i++) {
    const t = i / stations;
    const c = along(t), tangent = along(Math.min(1, t + .01)).sub(along(Math.max(0, t - .01))).normalize();
    // Parallel transport keeps the cross-sections from twisting.
    normal = normal.sub(tangent.clone().multiplyScalar(normal.dot(tangent))).normalize();
    const binormal = tangent.clone().cross(normal);
    const r = radius(t);
    centers.push(c);
    rings.push(Array.from({ length: sides }, (_, k) => {
      const a = TAU * k / sides;
      const p = c.clone().addScaledVector(normal, Math.cos(a) * r * flat).addScaledVector(binormal, Math.sin(a) * r);
      return mesh.vertex(p, color(t, a), weights(t));
    }));
  }
  for (let i = 0; i < stations; i++) {
    for (let k = 0; k < sides; k++) mesh.quad(rings[i][k], rings[i][(k + 1) % sides], rings[i + 1][(k + 1) % sides], rings[i + 1][k]);
  }
  const start = mesh.vertex(centers[0], color(0, 0), weights(0));
  const end = mesh.vertex(along(1).addScaledVector(along(1).sub(along(.97)).normalize(), radius(1) * .6), color(1, 0), weights(1));
  for (let k = 0; k < sides; k++) {
    mesh.tri(start, rings[0][(k + 1) % sides], rings[0][k]);
    mesh.tri(end, rings[stations][k], rings[stations][(k + 1) % sides]);
  }
  mesh.end();
}

/** A conical spine of the crest, leaning back, its base sunk into the skin. */
function spine(mesh: MeshBuilder, base: Vector3, height: number, radius: number, lean: number, weights: Skin, pale: number) {
  mesh.begin();
  const tip = base.clone().add(new Vector3(0, height, -height * lean));
  const ring = Array.from({ length: 5 }, (_, k) => {
    const a = TAU * k / 5;
    return mesh.vertex(base.clone().add(new Vector3(Math.sin(a) * radius * .6, 0, Math.cos(a) * radius)), BLACK, weights);
  });
  const t = mesh.vertex(tip, mix(SOOT, SPINE, pale), weights);
  const b = mesh.vertex(base.clone().add(new Vector3(0, -height * .3, 0)), BLACK, weights);
  for (let k = 0; k < 5; k++) {
    mesh.tri(t, ring[k], ring[(k + 1) % 5]);
    mesh.tri(b, ring[(k + 1) % 5], ring[k]);
  }
  mesh.end();
}

export function buildMarineIguana() {
  const ctx = sharkContext(MARINE_IGUANA);
  const { mesh, bones } = ctx;
  const axis = (s: number) => new Vector3(0, ctx.center(s), ctx.z(s));
  const first = mesh.vertexCount;
  ctx.body();
  // The last third of the tail whips on `TailUpper` (the rig flexes it sideways, lagging the stroke).
  const whip = .84;
  for (let i = first; i < mesh.vertexCount; i++) {
    const s = ctx.sOf(mesh.positions[i * 3 + 2]);
    mesh.skins[i] = blendSkins(mesh.skins[i], { TailUpper: 1 }, smoothstep(whip - .06, whip + .08, s));
  }

  // The crest: tall spines on the nape, a low saw down the back, rising a little over the hips and
  // dwindling along the tail.
  for (let s = .085; s < .93; s += s < .16 ? .011 : s < .5 ? .016 : .021) {
    const nape = Math.exp(-(((s - .115) / .045) ** 2)), hips = .35 * Math.exp(-(((s - .42) / .06) ** 2));
    const height = (.0065 + .022 * nape + .007 * hips) * (1 - .6 * smoothstep(.5, .93, s));
    const base = new Vector3(0, ctx.yTop(s) - .002, ctx.z(s));
    const weights = s > whip ? blendSkins(ctx.skin(s), { TailUpper: 1 }, smoothstep(whip - .06, whip + .08, s)) : ctx.skin(s);
    spine(mesh, base, height, Math.min(.0065, .0025 + height * .25), .55, weights, .4 + .6 * nape);
  }

  // Knobbly scales on the crown and the jowls.
  for (let i = 0; i < 11; i++) {
    const s = .014 + .07 * ((i * .618) % 1), theta = (i % 2 ? 1 : -1) * (.15 + 1.1 * ((i * .382) % 1));
    ctx.spot(s, theta, .0035 + .0015 * ((i * .73) % 1), mix(SALT, GREY, .35 + .3 * ((i * .41) % 1)), 1, .0012);
  }
  // Small eyes ringed with a scaly lid, high on the sides of the head; nostrils; the mouth's line.
  ctx.eyes({ s: .052, theta: 1.08, radius: .0085, color: LID, sink: .5 });
  ctx.eyes({ s: .052, theta: 1.08, radius: .0052, color: EYE, sink: -.1 });
  for (const side of [1, -1]) {
    ctx.spot(.007, side * .55, .0022, CLAW, 1, .0012);
    ctx.ribbon(Array.from({ length: 7 }, (_, i) => [.004 + .07 * i / 6, side * (1.72 + .25 * (i / 6) ** 1.5)] as const), (t) => .0012 * (.6 + .4 * Math.sin(Math.PI * t)), BLACK);
  }

  // Legs folded back along the flanks, elbows and knees a little out, long clawed toes trailing.
  const pectoral: Vector3[] = [];
  for (const side of [1, -1]) {
    const shoulder = ctx.surface(.15, side * 1.85, -.008);
    const elbow = shoulder.clone().add(new Vector3(side * .028, -.012, -.022));
    const wrist = elbow.clone().add(new Vector3(-side * .004, -.002, -.036));
    const bone = side > 0 ? 'PectoralL' : 'PectoralR';
    const fore = (t: number) => blendSkins(ctx.skin(.15), { [bone]: 1 }, smoothstep(.05, .35, t));
    tube(mesh, [shoulder, elbow, wrist], (t) => .011 - .0045 * t, (_t, a) => mix(SOOT, BELLY, .5 + .5 * Math.cos(a)), fore, { sides: 6, stations: 6 });
    toes(mesh, wrist, side, .028, () => fore(1));
    pectoral.push(shoulder.clone().lerp(elbow, .5));

    const hip = ctx.surface(.39, side * 1.95, -.008);
    const knee = hip.clone().add(new Vector3(side * .03, -.01, -.02));
    const ankle = knee.clone().add(new Vector3(-side * .012, -.002, -.042));
    const hind = () => ctx.skin(.4);
    tube(mesh, [hip, knee, ankle], (t) => .0145 - .0065 * t, (_t, a) => mix(SOOT, BELLY, .5 + .5 * Math.cos(a)), hind, { sides: 6, stations: 6 });
    toes(mesh, ankle, side, .036, hind);
  }

  ctx.spineBones();
  bones.push(
    { name: 'TailUpper', parent: 'Tail', position: axis(whip) },
    { name: 'TailLower', parent: 'Tail', position: axis(whip) },
    { name: 'Dorsal', parent: rig.dorsalParent, position: new Vector3(0, ctx.yTop(rig.dorsalAt), ctx.z(rig.dorsalAt)) },
    { name: 'PectoralL', parent: 'Root', position: pectoral[0] },
    { name: 'PectoralR', parent: 'Root', position: pectoral[1] },
  );
  return { mesh, bones };

  /** Four long toes fanned out behind a foot, each ending in a dark claw. */
  function toes(m: MeshBuilder, at: Vector3, side: number, length: number, weights: () => Skin) {
    for (let k = 0; k < 4; k++) {
      const fan = (k - 1.5) * .24, reach = length * (.75 + .25 * Math.sin(Math.PI * (k + .5) / 4));
      const dir = new Vector3(side * Math.sin(fan + side * .12), -.08, -Math.cos(fan)).normalize();
      const mid = at.clone().addScaledVector(dir, reach * .55).add(new Vector3(0, .002, 0));
      const tip = at.clone().addScaledVector(dir, reach).add(new Vector3(0, -.003, 0));
      tube(m, [at, mid, tip], (t) => .0034 * (1 - .7 * t), (t) => mix(SOOT, CLAW, smoothstep(.75, .9, t)), weights, { sides: 4, stations: 3, flat: .7 });
    }
  }
}
