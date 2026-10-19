/**
 * Dugong (Dugong dugon): the sea cow of the Indo-Pacific seagrass flats, up to about three metres: a fat,
 * smooth spindle, deepest and widest just behind the flippers and tapering to a narrow tail stock; a blunt,
 * heavy head with no neck whose broad, flattened muzzle (the rostral disc) is sharply turned down, its
 * underside a bristly grazing pad, with two crescent nostrils on top at the very front and small dark eyes
 * set well back on the sides; short, rounded paddle flippers far forward, just behind the head; and broad,
 * whale-like flukes (a quarter of the body long across) with pointed tips, a concave trailing edge and a
 * small central notch. No dorsal fin. Smooth slate grey-brown skin, paler and pinker below, with a few
 * pale scratches and scars and a faint stubble of dark dots on the snout.
 */
import { Matrix3, Vector3 } from 'three';
import { SWIM_RIGS, type CetaceanRig } from '../../../src/lib/marine-rigs';
import { blendSkins, fin, hex, mix, noise, smoothstep, type RGB } from './kit';
import { sharkContext, type SharkContext, type SharkDesign } from './shark';

const BACK = hex('#665b56'), FLANK = hex('#82746b'), BELLY = hex('#b7a39b'), PAD = hex('#cbb3a9');
const SCAR = hex('#bdada5'), STUBBLE = hex('#3d3534'), PAD_STUBBLE = hex('#5d4a46'), PAD_EDGE = hex('#7a6862'), PAD_BRISTLE = hex('#8c7469');
const FOLD = hex('#60544e'), SHADE = hex('#3d3430'), LID = hex('#554a45'), NOSTRIL = hex('#1c1a1a'), MOUTH = hex('#483a37'), EYE = hex('#080707'), FLUKE_UNDER = hex('#a8958e');

const rig = SWIM_RIGS.dugong as CetaceanRig;

/**
 * The body in side and plan view: axial position, then the top and bottom edges (height above the body
 * axis), the half-width and the section's squareness above and below. The muzzle is a blunt disc whose
 * lower lip hangs below the chin, the lowest point of the head, with a notch behind it; the tail stock
 * flattens into the flukes.
 */
const OUTLINE: readonly (readonly [number, number, number, number, number, number])[] = [
  [0, .03, -.03, .04, 2.4, 2.6],
  [.006, .043, -.065, .049, 2.4, 2.7],
  [.014, .054, -.09, .055, 2.35, 2.75],
  [.024, .062, -.104, .059, 2.3, 2.8],
  [.036, .068, -.108, .061, 2.3, 2.8],
  [.05, .073, -.103, .063, 2.25, 2.7],
  [.065, .077, -.094, .065, 2.2, 2.6],
  [.08, .08, -.08, .067, 2.15, 2.5],
  [.095, .084, -.071, .069, 2.1, 2.35],
  [.115, .089, -.072, .072, 2.05, 2.3],
  [.135, .093, -.078, .076, 2.05, 2.25],
  [.18, .103, -.094, .088, 2.05, 2.2],
  [.24, .111, -.106, .102, 2.05, 2.2],
  [.31, .116, -.112, .11, 2.05, 2.2],
  [.39, .116, -.114, .113, 2.05, 2.2],
  [.47, .112, -.111, .109, 2.05, 2.15],
  [.55, .103, -.102, .099, 2, 2.1],
  [.63, .09, -.09, .084, 2, 2.05],
  [.7, .077, -.076, .07, 1.95, 2],
  [.76, .063, -.062, .057, 1.9, 1.95],
  [.81, .049, -.047, .048, 1.85, 1.9],
  [.85, .034, -.032, .041, 1.8, 1.85],
  [.88, .02, -.018, .035, 1.8, 1.8],
  [.9, .012, -.011, .031, 1.8, 1.8],
];
const along = (pick: (row: (typeof OUTLINE)[number]) => number): [number, number][] => OUTLINE.map((row) => [row[0], pick(row)]);

/** Skin: slate grey-brown over the back, paler down the flanks into a pinkish-grey belly, a pale snout pad. */
function skinColor(s: number, theta: number, p: Vector3): RGB {
  // Soft blotches in three directions, so no stripe shows from any side.
  const mottle = (noise(p.z * 30 + p.x * 21 + p.y * 12, 3) + noise(p.x * 33 - p.z * 14 + p.y * 26, 5) + noise(p.y * 29 + p.z * 17 - p.x * 19, 8)) / 3;
  let color = mix(BACK, FLANK, smoothstep(.45, 1.5, theta));
  color = mix(color, BELLY, smoothstep(1.75, 2.75, theta));
  color = mix(color, PAD, .7 * smoothstep(.07, .02, s) * smoothstep(1.3, 2.4, theta));
  // Shaded creases: under the chin and behind the flipper.
  color = mix(color, SHADE, .22 * smoothstep(2.1, 2.6, theta) * smoothstep(.06, .09, s) * smoothstep(.13, .1, s));
  color = mix(color, SHADE, .16 * smoothstep(1.6, 2.1, theta) * smoothstep(.2, .23, s) * smoothstep(.3, .26, s));
  return mix(color, mottle > 0 ? FLANK : BACK, .3 * Math.abs(mottle));
}

export const DUGONG: SharkDesign = {
  rig, nose: .44, bodyEnd: .9, frontDome: .007,
  width: along((r) => r[3]),
  top: along((r) => (r[1] - r[2]) / 2),
  bottom: along((r) => (r[1] - r[2]) / 2),
  center: along((r) => (r[1] + r[2]) / 2),
  squareTop: along((r) => r[4]),
  squareBottom: along((r) => r[5]),
  rings: 48, columnsAbove: 8, columnsBelow: 7,
  boundary: () => 1.6, boundaryGap: .12,
  paint: skinColor,
};

/** Half the fluke span (body lengths). */
const FLUKE = .13;
/** The flipper's length and its chord at the widest (body lengths). */
const FLIPPER = .1, FLIPPER_CHORD = .064;

/** A speck on the skin: a tiny diamond lying on the body surface, wound to face outward. */
function speck(ctx: SharkContext, s: number, theta: number, r: number, color: RGB, lift = .0008) {
  const { mesh } = ctx;
  const gs = ctx.raw(s + .002, theta).sub(ctx.raw(s - .002, theta)).length() / .004;
  const gt = ctx.raw(s, theta + .01).sub(ctx.raw(s, theta - .01)).length() / .02;
  const tilt = 7 * s + 3 * theta;
  const pts = [0, 1, 2, 3].map((i) => {
    const a = Math.PI / 2 * i + tilt;
    const ps = s + Math.cos(a) * r / gs, pt = theta + Math.sin(a) * r / gt;
    return { p: ctx.surface(ps, pt, lift), n: ctx.normal(ps, pt) };
  });
  const facing = pts[1].p.clone().sub(pts[0].p).cross(pts[2].p.clone().sub(pts[0].p)).dot(pts[0].n) >= 0;
  mesh.begin();
  const ids = pts.map(({ p, n }) => mesh.vertex(p, color, ctx.skin(s), n));
  if (facing) mesh.quad(ids[0], ids[1], ids[2], ids[3]); else mesh.quad(ids[0], ids[3], ids[2], ids[1]);
  mesh.end({ closed: false, normals: false });
}

/** Points on a circle of world radius r around [s, theta] on the skin, from angle `from` to `to` (radians). */
function circle(ctx: SharkContext, s: number, theta: number, r: number, from: number, to: number, count: number) {
  const gs = ctx.raw(s + .002, theta).sub(ctx.raw(s - .002, theta)).length() / .004;
  const gt = ctx.raw(s, theta + .01).sub(ctx.raw(s, theta - .01)).length() / .02;
  return Array.from({ length: count }, (_, i) => {
    const a = from + (to - from) * i / (count - 1);
    return [s + Math.cos(a) * r / gs, theta + Math.sin(a) * r / gt] as const;
  });
}

/** A stiff little bristle: a thin pyramid standing out of the skin at [s, theta], leaning along `lean` (s, theta). */
function bristle(ctx: SharkContext, s: number, theta: number, length: number, color: RGB, lean: readonly [number, number] = [0, 0]) {
  const { mesh } = ctx;
  const n = ctx.normal(s, theta);
  const slope = ctx.surface(s + lean[0], theta + lean[1], 0).sub(ctx.surface(s, theta, 0));
  const axis = n.clone().addScaledVector(slope, 1.5).normalize();
  const u = new Vector3(0, 1, 0).cross(axis).normalize(), v = axis.clone().cross(u);
  const base = ctx.surface(s, theta, -.001), skin = ctx.skin(s);
  mesh.begin();
  const ring = [0, 1, 2].map((i) => mesh.vertex(base.clone().addScaledVector(u, Math.cos(i * 2.094) * .0016).addScaledVector(v, Math.sin(i * 2.094) * .0016), color, skin));
  const tip = mesh.vertex(base.clone().addScaledVector(axis, length), color, skin);
  mesh.tri(ring[0], ring[1], ring[2]);
  for (let i = 0; i < 3; i++) mesh.tri(ring[i], ring[(i + 1) % 3], tip);
  mesh.end();
}

/** A flat decal over a polygon of [s, theta] points (star-shaped about its centroid), just above the skin. */
function patch(ctx: SharkContext, outline: readonly (readonly [number, number])[], color: RGB, lift = .0012) {
  const { mesh } = ctx;
  const cs = outline.reduce((sum, q) => sum + q[0], 0) / outline.length, ct = outline.reduce((sum, q) => sum + q[1], 0) / outline.length;
  mesh.begin();
  const c = mesh.vertex(ctx.surface(cs, ct, lift * 1.3), color, ctx.skin(cs), ctx.normal(cs, ct));
  const ring = outline.map(([s, theta]) => mesh.vertex(ctx.surface(s, theta, lift), color, ctx.skin(s), ctx.normal(s, theta)));
  for (let i = 0; i < ring.length; i++) mesh.tri(c, ring[i], ring[(i + 1) % ring.length]);
  mesh.end({ closed: false, normals: false, outward: (i) => new Vector3(mesh.normals[i * 3], mesh.normals[i * 3 + 1], mesh.normals[i * 3 + 2]) });
}

/**
 * A paddle flipper rooted on the flank at angle `theta`, hanging down and trailing back. `half(v)` and
 * `mid(v)` give the chord's half-width and its centre (offset back from the root) at fraction v of its
 * length, so an oval paddle is just a curve; sections bunch toward the rounded tip.
 */
function paddle(ctx: SharkContext, options: {
  rootS: number; theta: number; span: number; droop: number; sweep: number; thickness: number; stations: number;
  half: (v: number) => number; mid: (v: number) => number; sink?: number;
  color: (v: number, u: number, face: number) => RGB;
}) {
  const sink = options.sink ?? .015, length = options.span + sink;
  const roots: Vector3[] = [];
  for (const left of [true, false]) {
    const side = left ? 1 : -1, theta = side * options.theta;
    const origin = ctx.surface(options.rootS, theta, 0).addScaledVector(ctx.normal(options.rootS, theta), -sink);
    const out = new Vector3(side * Math.cos(options.droop), -Math.sin(options.droop), 0);
    const back = new Vector3(0, 0, -1).applyAxisAngle(new Vector3(0, 1, 0), -side * options.sweep);
    const at = (v: number, offset: number) => origin.clone().addScaledVector(out, v * length).addScaledVector(back, offset);
    fin(ctx.mesh, {
      stations: options.stations, spacing: (t) => 1 - (1 - t) ** 2,
      le: (v) => at(v, options.mid(v) - options.half(v)),
      te: (v) => at(v, options.mid(v) + options.half(v)),
      thickness: (v) => options.thickness * (1 - .78 * v),
      side: new Vector3(Math.sin(options.droop) * side, Math.cos(options.droop), 0),
      color: (_p, v, u, face) => options.color(v, u, face),
      skin: (p, v) => blendSkins(ctx.skin(ctx.sOf(p.z)), { [left ? 'PectoralL' : 'PectoralR']: 1 }, smoothstep(.1, .5, v)),
    });
    roots.push(at(0, options.mid(0)).addScaledVector(out, sink));
  }
  return roots;
}

/**
 * Turn the muzzle down: bend the front of the finished mesh nose-down about a pivot on the body axis.
 * Each section there is rotated by an angle that eases from nothing at `pivotS` to `angle` (radians) a
 * `length` ahead of it and stays tilted beyond, so the head's decals and eyes ride along with it.
 */
function bendSnout(ctx: SharkContext, pivotS: number, length: number, angle: number) {
  const { mesh } = ctx;
  const y0 = ctx.center(pivotS), zp = ctx.z(pivotS);
  const step = .0005, count = Math.ceil(length / step);
  const phi = (d: number) => angle * smoothstep(0, length, d);
  const ahead = [0], down = [0];
  for (let i = 0; i < count; i++) {
    const f = phi((i + .5) * step);
    ahead.push(ahead[i] + Math.cos(f) * step);
    down.push(down[i] + Math.sin(f) * step);
  }
  const axis = (d: number): [number, number] => {
    if (d >= count * step) return [ahead[count] + (d - count * step) * Math.cos(angle), down[count] + (d - count * step) * Math.sin(angle)];
    const k = Math.min(count - 1, Math.floor(d / step)), f = d / step - k;
    return [ahead[k] + (ahead[k + 1] - ahead[k]) * f, down[k] + (down[k + 1] - down[k]) * f];
  };
  const bent = (p: Vector3) => {
    const d = p.z - zp;
    if (d <= 0) return p.clone();
    const [a, b] = axis(d), f = phi(d), y = p.y - y0;
    return new Vector3(p.x, y0 - b + y * Math.cos(f), zp + a + y * Math.sin(f));
  };
  const h = 1e-4, basis = [new Vector3(h, 0, 0), new Vector3(0, h, 0), new Vector3(0, 0, h)];
  for (let i = 0; i < mesh.vertexCount; i++) {
    const p = mesh.point(i);
    if (p.z <= zp) continue;
    // Normals follow the surface through the inverse transpose of the bend's Jacobian.
    const j = basis.map((e) => bent(p.clone().add(e)).sub(bent(p.clone().sub(e))).divideScalar(2 * h));
    const m = new Matrix3().set(j[0].x, j[1].x, j[2].x, j[0].y, j[1].y, j[2].y, j[0].z, j[1].z, j[2].z);
    const n = new Vector3(mesh.normals[i * 3], mesh.normals[i * 3 + 1], mesh.normals[i * 3 + 2]).applyMatrix3(m.invert().transpose()).normalize();
    const q = bent(p);
    mesh.positions.splice(i * 3, 3, q.x, q.y, q.z);
    mesh.normals.splice(i * 3, 3, n.x, n.y, n.z);
  }
}

export function buildDugong() {
  const ctx = sharkContext(DUGONG);
  const { mesh, bones, z } = ctx;
  ctx.body();

  // Short, rounded paddles far forward on the lower flank: broad ovals narrowing to a round tip.
  const flippers = paddle(ctx, {
    rootS: .225, theta: 2.05, span: FLIPPER, droop: .65, sweep: .4, thickness: .015, stations: 9,
    half: (v) => FLIPPER_CHORD / 2 * Math.sqrt(Math.max(0, 1 - (Math.max(0, v - .3) / .7) ** 2)),
    mid: (v) => .036 + .028 * v,
    color: (v, _u, face) => (face > 0 ? mix(FLANK, BACK, .3 * v) : mix(BELLY, FLANK, .3 * v)),
  });

  // Broad flukes, one blade from tip to tip: the leading edge sweeps back to pointed tips, the trailing edge
  // is concave with a small notch at the middle. The tail bone carries them; the tips flex.
  const tipS = .988;
  const lead = (a: number) => .856 + (tipS - .856) * (a / FLUKE) ** 1.45;
  const trail = (a: number) => .944 + (tipS - .944) * (a / FLUKE) ** 1.5 - .014 * Math.max(0, 1 - a / .017);
  const across = (v: number) => FLUKE * (1 - 2 * v);
  const flukeY = ctx.center(.9);
  fin(mesh, {
    stations: 29, rootPoint: true, chordPoints: 6, spacing: (t) => t,
    le: (v) => new Vector3(across(v), flukeY, z(lead(Math.abs(across(v))))),
    te: (v) => new Vector3(across(v), flukeY, z(trail(Math.abs(across(v))))),
    thickness: (v) => .004 + .032 * Math.max(0, 1 - Math.abs(across(v)) / FLUKE) ** 1.6,
    side: new Vector3(0, 1, 0),
    color: (_p, _v, u, face) => mix(face > 0 ? mix(BACK, FLANK, .25 * u) : mix(FLUKE_UNDER, BELLY, .4 * u), BELLY, .3 * smoothstep(.82, 1, u)),
    skin: (p) => blendSkins({ Tail: 1 }, { [p.x >= 0 ? 'FlukeL' : 'FlukeR']: 1 }, smoothstep(.035, .1, Math.abs(p.x))),
  });

  ctx.eyes({ s: .125, theta: 1.5, radius: .0062, color: EYE, sink: .35 });
  // A heavy, wrinkled lid ringing each small eye.
  for (const side of [1, -1]) {
    ctx.ribbon(circle(ctx, .125, side * 1.5, .0108, -.5, 4.6, 12), (t) => .0015 * Math.sin(Math.PI * (.05 + .9 * t)), LID, .0009);
  }
  // A faint skin fold behind the head where there is no neck, and the tiny ear opening behind each eye.
  for (const side of [1, -1]) {
    const fold = Array.from({ length: 8 }, (_, i) => {
      const t = i / 7;
      return [.178 + .012 * Math.sin(Math.PI * t) - .01 * t, side * (1.1 + 1.45 * t)] as const;
    });
    ctx.ribbon(fold, (t) => .0013 * Math.sin(Math.PI * (.05 + .9 * t)), FOLD, .0009);
    speck(ctx, .152, side * 1.46, .0021, EYE, .0006);
  }

  // Crescent nostrils on top of the snout, at the very front.
  for (const side of [1, -1]) {
    const line = Array.from({ length: 7 }, (_, i) => {
      const t = i / 6;
      return [.02 + .012 * t + .007 * Math.sin(Math.PI * t), side * (.09 + .2 * t)] as const;
    });
    ctx.ribbon(line, (t) => .0028 * Math.sin(Math.PI * (.08 + .84 * t)), NOSTRIL, .0012);
  }
  // The upper lip's crease down each side of the muzzle, setting the broad disc off from the cheek.
  for (const side of [1, -1]) {
    const crease = [[.062, 2.1], [.056, 1.85], [.049, 1.55], [.042, 1.25], [.034, .95], [.027, .68]] as const;
    ctx.ribbon(crease.map(([s, theta]) => [s, side * theta] as const), (t) => .0012 * Math.sin(Math.PI * (.05 + .9 * t)), FOLD, .0009);
  }

  // The bristly grazing pad on the underside of the muzzle, edged by a darker lip, and the mouth's cleft behind it.
  const rounded = (a: number, p: number) => Math.sign(a) * Math.abs(a) ** p;
  const padOutline = (grow: number) => Array.from({ length: 20 }, (_, i) => {
    const a = Math.PI * 2 * i / 20;
    return [Math.max(.006, .034 + (.027 + grow) * rounded(Math.cos(a), .75)), Math.PI + (.95 + 6 * grow) * rounded(Math.sin(a), .75)] as const;
  });
  patch(ctx, padOutline(.0015), PAD_EDGE, .0009);
  patch(ctx, padOutline(-.0015), PAD, .0014);
  const mouth = Array.from({ length: 13 }, (_, i) => {
    const t = i / 12, a = -1 + 2 * t;
    return [.066 + .016 * a * a, Math.PI + .8 * a] as const;
  });
  ctx.ribbon(mouth, (t) => .002 * (.4 + .6 * Math.sin(Math.PI * t)), MOUTH, .0014);
  // A fringe of short stiff bristles around the front of the pad.
  for (let i = 0; i < 12; i++) {
    const a = -.95 + 1.9 * i / 11, k = (.3 + .6180339 * i) % 1;
    bristle(ctx, .012 + .006 * Math.cos(a * 1.5), Math.PI + a, .0042 + .0028 * k, PAD_BRISTLE, [-.01, .06 * (k - .5)]);
  }

  // Stubble: dark dots over the face, denser on the pad.
  for (let i = 0; i < 45; i++) {
    const onPad = i % 3 > 0;
    const s = onPad ? .01 + .05 * ((.3 + .7548776662 * i) % 1) : .006 + .075 * ((.3 + .7548776662 * i) % 1);
    const theta = onPad ? Math.PI + .85 * (2 * ((.2 + .5698402910 * i) % 1) - 1) : Math.PI * ((.2 + .5698402910 * i) % 1) * (i % 2 ? 1 : -1);
    speck(ctx, s, theta, onPad ? .0015 : .0016, onPad ? PAD_STUBBLE : STUBBLE);
  }

  // Pale scars: groups of parallel rake marks and a few single scratches.
  const rake = (s0: number, theta0: number, length: number, slant: number, count: number, gap: number, side: number) => {
    for (let k = 0; k < count; k++) {
      const long = length * (1 - .18 * Math.abs(k - (count - 1) / 2));
      const line = Array.from({ length: 6 }, (_, i) => {
        const t = i / 5;
        return [s0 + long * t, side * (theta0 + k * gap + slant * t + .05 * Math.sin(Math.PI * t))] as const;
      });
      ctx.ribbon(line, (t) => .0011 * Math.sqrt(Math.sin(Math.PI * (.04 + .92 * t))), SCAR, .0011);
    }
  };
  rake(.34, .78, .1, .1, 3, .075, 1);
  rake(.57, 1.2, .08, -.08, 2, .07, -1);
  rake(.17, .95, .06, .1, 1, 0, -1);
  rake(.66, .55, .06, .12, 2, .06, 1);
  rake(.44, -.35, .15, .12, 1, 0, 1);
  ctx.spot(.47, 1.22, .0065, SCAR, 1.4, .001);
  rake(.2, -.58, .035, .08, 2, .05, 1);
  // Healed nicks: short pale dashes scattered over the back and flanks.
  for (let i = 0; i < 14; i++) {
    const s = .14 + .6 * ((.4 + .7548776662 * i) % 1), theta = (.2 + 1.6 * ((.3 + .5698402910 * i) % 1)) * (i % 2 ? 1 : -1);
    const slant = 1.2 * ((.7 + .618034 * i) % 1) - .6, length = .011 + .008 * ((.1 + .3819660 * i) % 1);
    ctx.ribbon([[s, theta], [s + length * .5, theta + slant * .02], [s + length, theta + slant * .05]], (t) => .0009 * Math.sin(Math.PI * (.1 + .8 * t)), SCAR, .001);
  }

  bendSnout(ctx, .13, .12, .32);

  ctx.spineBones();
  const flukeTip = (side: number) => new Vector3(side * .05, flukeY, z(.93));
  bones.push(
    { name: 'FlukeL', parent: 'Tail', position: flukeTip(1) },
    { name: 'FlukeR', parent: 'Tail', position: flukeTip(-1) },
    { name: 'PectoralL', parent: 'Root', position: flippers[0] },
    { name: 'PectoralR', parent: 'Root', position: flippers[1] },
  );
  return { mesh, bones };
}
