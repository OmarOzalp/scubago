/**
 * Southern stingray (Hypanus americanus): the sand-flat stingray of the Caribbean. A flat, rhomboid
 * disc a little wider than long, its front edges almost straight into a slightly pointed snout, its
 * outer corners angular and its rear edges straight back to the pelvic fins, thin at the margins and
 * gently domed over the body. The eyes and the big, rimmed spiracles sit close together on top just
 * behind the snout, the eyes a little raised, and a row of small tubercles runs down the midline of
 * the back. A long, slender whip of a tail, longer than the disc, carries a serrated venomous spine
 * near its base, a long low fin fold underneath and a short one on top, and tapers to a thread.
 * Muddy olive-brown above (a touch paler toward the margins, the tail darker), pure white below with
 * a thin grey margin.
 *
 * The disc is one sheet lofted across the span, as the manta's and eagle ray's are, with a height
 * field that bevels it to a thin margin all round and skinned to five wing segments per side, so
 * small strokes with a lot of twist roll back over it as ripples.
 */
import { Vector3 } from 'three';
import { blendSkins, chainSkin, clamp, curve, fin, hex, MeshBuilder, mix, noise, smoothstep, TAU, type RGB, type Skin } from './kit';
import type { BoneSpec } from './export';

// Back: muddy olive-brown, paler toward the margins, darker over the tail. Belly: clean white, grey rim.
const TOP = hex('#6a5a41'), TOP_PALE = hex('#88795a'), TOP_DARK = hex('#4d4230');
const BELLY = hex('#fcfbf5'), MARGIN = hex('#9d978a');
const TUBERCLE = hex('#948c6d');
const TAIL = hex('#4d483a'), TAIL_TIP = hex('#2c2923'), FOLD = hex('#3a342a');
const SPINE = hex('#e3dcc6'), SPINE_BASE = hex('#6e6752');
const IRIS = hex('#6a521f'), IRIS_RIM = hex('#2c2310'), PUPIL = hex('#050504'), PIT = hex('#171510'), SPIRACLE_RIM = hex('#6f684e');
const MOUTH = hex('#4c473a'), LIP = hex('#bfb9a7'), GILL = hex('#7f796b'), NOSTRIL = hex('#6a6454');

/** Planform and section shape as functions of distance from the midline (half-span 0.5). */
const leadingEdge = curve([[0, .4], [.02, .384], [.06, .351], [.12, .302], [.2, .237], [.3, .156], [.4, .074], [.46, .02], [.5, -.02]]);
const trailingEdge = curve([[0, -.402], [.04, -.399], [.08, -.388], [.12, -.368], [.17, -.334], [.25, -.264], [.35, -.172], [.42, -.1], [.46, -.058], [.5, -.02]]);
/** Height of the back's dome over the span, and how the dome runs from snout to rear (1 at the top). */
const thickness = curve([[0, .068], [.03, .066], [.07, .057], [.11, .043], [.16, .029], [.22, .019], [.3, .0115], [.4, .007], [.5, .003]]);
const lengthwise = curve([[0, 0], [.03, .04], [.08, .15], [.15, .4], [.22, .66], [.3, .88], [.4, 1], [.5, .98], [.6, .88], [.7, .7], [.8, .48], [.9, .24], [.96, .1], [1, 0]]);
/** The margins droop a hair below the body. */
const lift = curve([[0, .004], [.15, .0015], [.5, -.006]]);
/** Joints of each wing chain, from the shoulder to near the tip. */
export const WING_JOINTS = [.075, .15, .23, .31, .39];
const TAIL_START = -.396, TAIL_LENGTH = .904, TAIL_AXIS = .004;
const TAIL_JOINTS = [-.46, -.72, -1.02];
const EDGE = .0022; // half the thickness of the disc's margin
const BELLY_FULL = .35; // how much of the dome's height hangs below the margin plane

const K = 12; // points along each surface of a section
const US = Array.from({ length: K }, (_, i) => {
  const s = i / (K - 1);
  return .6 * (1 - Math.cos(Math.PI * s)) / 2 + .4 * s;
});

/** The larger of two heights, rounded where they cross so the surface has no crease. */
const softMax = (a: number, b: number, k = .005) => (a + b + Math.sqrt((a - b) ** 2 + k * k)) / 2 - k / 2;

/** Surface point at signed span x, chord fraction u (0 leading edge, 1 trailing edge), upper or lower side. */
function sheet(x: number, u: number, upper: boolean) {
  const a = Math.min(.5, Math.abs(x));
  const le = leadingEdge(a), te = trailingEdge(a), bulge = thickness(a) * lengthwise(u);
  // The body does not thin away at its rear but runs on, as a blunt ridge, into the root of the tail.
  const ridge = Math.exp(-((x / .015) ** 2)) * smoothstep(.6, .85, u);
  const height = upper ? softMax(bulge, .0108 * ridge) : softMax(BELLY_FULL * bulge, .0062 * ridge);
  return new Vector3(x, lift(a) + (upper ? EDGE + height : -EDGE - height), le - u * (le - te));
}
function sheetNormal(x: number, u: number, upper: boolean) {
  const du = Math.min(.01, u, 1 - u) || .005, dx = .004;
  const a = sheet(x + dx, u, upper).sub(sheet(x - dx, u, upper));
  const b = sheet(x, Math.min(1, u + du), upper).sub(sheet(x, Math.max(0, u - du), upper));
  const n = a.cross(b).normalize();
  if ((upper && n.y < 0) || (!upper && n.y > 0)) n.negate();
  return n;
}
/** Chord fraction of the point at span x and length z. */
const uOf = (x: number, z: number) => {
  const a = Math.min(.5, Math.abs(x)), le = leadingEdge(a), te = trailingEdge(a);
  return clamp((le - z) / (le - te), 0, 1);
};
const topPoint = (x: number, z: number) => sheet(x, uOf(x, z), true);
const topNormal = (x: number, z: number) => sheetNormal(x, uOf(x, z), true);

/** Roughly how far a point at (a, u) lies from the nearest margin of the disc. */
function marginDistance(a: number, u: number) {
  return Math.min(u, 1 - u) * (leadingEdge(a) - trailingEdge(a)) * .72;
}

function discSkin(x: number, z: number): Skin {
  const a = Math.abs(x);
  const side = x >= 0 ? 'L' : 'R';
  let skin = chainSkin(a, [0, ...WING_JOINTS], ['Root', ...WING_JOINTS.map((_, i) => `Wing${side}${i + 1}`)], .5);
  const center = 1 - smoothstep(.04, .09, a);
  skin = blendSkins(skin, { Head: 1 }, smoothstep(.2, .32, z) * center);
  return blendSkins(skin, { Tail1: 1 }, smoothstep(-.3, -.4, z) * (1 - smoothstep(.02, .05, a)) * .6);
}
const tailSkin = (z: number) => chainSkin(-z, [0, ...TAIL_JOINTS.map((j) => -j)], ['Root', 'Tail1', 'Tail2', 'Tail3'], -(TAIL_START - TAIL_LENGTH));

/** The back: olive-brown, paler toward the margins, with a soft mottle but no spots. */
function topColor(x: number, u: number): RGB {
  const a = Math.abs(x), le = leadingEdge(a), te = trailingEdge(a), z = le - u * (le - te);
  const d = marginDistance(a, u);
  const pale = clamp(.45 * (1 - smoothstep(0, .055, d)) + .22 * smoothstep(.28, .5, a));
  const tone = .55 * noise(z * 13 + x * 7, 3) + .45 * noise(x * 19 - z * 10, 8);
  const c = mix(TOP, TOP_PALE, pale);
  const mottled = tone > 0 ? mix(c, TOP_PALE, tone * .32) : mix(c, TOP_DARK, -tone * .38);
  // Over the head and shoulders the back is a shade darker.
  return mix(mottled, TOP_DARK, .14 * (1 - smoothstep(.04, .13, a)) * smoothstep(-.3, .1, z));
}
/** The belly is white to the edge, where a thin grey rim runs round the margin. */
function bottomColor(x: number, u: number): RGB {
  // The grey rim runs round the margin but stops short of the tail's root, which stays white.
  const rim = 1 - smoothstep(.004, .013, marginDistance(Math.abs(x), u));
  return mix(BELLY, MARGIN, rim * (1 - Math.exp(-((x / .03) ** 2)) * smoothstep(.85, .97, u)));
}

export function buildSouthernStingray() {
  const mesh = new MeshBuilder();
  const bones: BoneSpec[] = [];
  // Stations across the span: dense over the body and toward the corners where the outline turns.
  const half_ = [0, .02, .04, .06, .08, .1, .12, .145, .17, .195, .22, .25, .28, .31, .34, .37, .4, .425, .446, .464, .479, .49, .497];
  const xs = [...half_.slice(1).reverse().map((a) => -a), ...half_];

  mesh.begin();
  const rings = xs.map((x) => {
    const top: number[] = [], bottom: number[] = [];
    US.forEach((u) => {
      const p = sheet(x, u, true);
      top.push(mesh.vertex(p, topColor(x, u), discSkin(x, p.z)));
    });
    US.forEach((u) => {
      const p = sheet(x, u, false);
      bottom.push(mesh.vertex(p, bottomColor(x, u), discSkin(x, p.z)));
    });
    return [...top, ...bottom.reverse()];
  });
  const m = rings[0].length;
  for (let r = 0; r < rings.length - 1; r++) {
    for (let i = 0; i < m; i++) mesh.quad(rings[r][i], rings[r][(i + 1) % m], rings[r + 1][(i + 1) % m], rings[r + 1][i]);
  }
  // Each corner closes to a point; the two caps wind in opposite senses.
  for (const [ring, x] of [[rings[0], -.5], [rings[rings.length - 1], .5]] as const) {
    const tip = sheet(x, .5, true).add(sheet(x, .5, false)).multiplyScalar(.5);
    const t = mesh.vertex(tip, mix(TOP_PALE, MARGIN, .5), discSkin(x, tip.z));
    for (let i = 0; i < m; i++) {
      if (x > 0) mesh.tri(t, ring[i], ring[(i + 1) % m]);
      else mesh.tri(t, ring[(i + 1) % m], ring[i]);
    }
  }
  mesh.end();

  /** A round, slightly domed eye of `segments` facets set halfway into the skin; `shade(r)` paints it from its crown (0) outward. */
  const eyeball = (center: Vector3, outward: Vector3, radius: number, flatten: number, shade: (r: number) => RGB, skin: Skin, segments = 12) => {
    const n = outward.clone().normalize();
    const t1 = new Vector3(0, 1, 0).cross(n).normalize(), t2 = n.clone().cross(t1);
    const rows = 3;
    mesh.begin();
    const crown = mesh.vertex(center.clone().addScaledVector(n, radius * flatten), shade(0), skin);
    const rings: number[][] = [];
    for (let r = 1; r <= rows; r++) {
      const phi = Math.PI / 2 * r / rows;
      rings.push(Array.from({ length: segments }, (_, k) => {
        const a = TAU * k / segments + (r % 2) * .26;
        const p = center.clone().addScaledVector(n, Math.cos(phi) * radius * flatten)
          .addScaledVector(t1, Math.sin(phi) * Math.cos(a) * radius).addScaledVector(t2, Math.sin(phi) * Math.sin(a) * radius);
        return mesh.vertex(p, shade(r / rows), skin);
      }));
    }
    const floor = mesh.vertex(center.clone().addScaledVector(n, -radius * .2), shade(1), skin);
    for (let k = 0; k < segments; k++) {
      const k1 = (k + 1) % segments;
      mesh.tri(crown, rings[0][k], rings[0][k1]);
      for (let r = 0; r < rows - 1; r++) mesh.quad(rings[r][k], rings[r + 1][k], rings[r + 1][k1], rings[r][k1]);
      mesh.tri(floor, rings[rows - 1][k1], rings[rows - 1][k]);
    }
    mesh.end();
  };

  /** A low dome on the back at (x, z): an orbit, a tubercle. Its rim sinks into the skin. */
  const bump = (x: number, z: number, radius: number, height: number, color: RGB | ((k: number) => RGB), segments = 6, rows = 2) => {
    const paint = (k: number) => (typeof color === 'function' ? color(k) : color);
    mesh.begin();
    const n0 = topNormal(x, z);
    const apexAt = topPoint(x, z).addScaledVector(n0, height);
    const apex = mesh.vertex(apexAt, paint(0), discSkin(x, apexAt.z));
    const ringsAt: number[][] = [];
    for (let r = 1; r <= rows; r++) {
      const phi = Math.PI / 2 * r / rows;
      ringsAt.push(Array.from({ length: segments }, (_, k) => {
        const angle = TAU * k / segments + (r % 2) * .3;
        const px = x + Math.cos(angle) * radius * Math.sin(phi), pz = z + Math.sin(angle) * radius * Math.sin(phi);
        const p = topPoint(px, pz).addScaledVector(topNormal(px, pz), height * Math.cos(phi) - (r === rows ? .0016 : 0));
        return mesh.vertex(p, paint(r / rows), discSkin(px, pz));
      }));
    }
    const floorAt = topPoint(x, z).addScaledVector(n0, -.003);
    const floor = mesh.vertex(floorAt, paint(1), discSkin(x, floorAt.z));
    for (let k = 0; k < segments; k++) {
      const k1 = (k + 1) % segments;
      mesh.tri(apex, ringsAt[0][k], ringsAt[0][k1]);
      for (let r = 0; r < rows - 1; r++) mesh.quad(ringsAt[r][k], ringsAt[r + 1][k], ringsAt[r + 1][k1], ringsAt[r][k1]);
      mesh.tri(floor, ringsAt[rows - 1][k1], ringsAt[rows - 1][k]);
    }
    mesh.end();
  };

  // Eyes close together just behind the snout, each on a low raised orbit; a golden-brown iris round a black pupil.
  for (const side of [1, -1]) {
    const x = side * .042, z = .24;
    bump(x, z, .0225, .0058, (k) => mix(mix(TOP, TOP_PALE, .5), TOP, k), 12, 2);
    const n = topNormal(x, z);
    const out = n.clone().add(new Vector3(side * .38, 0, .12)).normalize();
    const c = topPoint(x, z).addScaledVector(n, .0092);
    const skin = discSkin(x, z);
    eyeball(c, out, .0148, .62, (r) => mix(IRIS, IRIS_RIM, smoothstep(.45, 1, r)), skin);
    eyeball(c.clone().addScaledVector(out, .0058), out, .0086, .55, () => PUPIL, skin);
  }

  // Spiracles behind and a little outside the eyes: a dark oval pit in a raised rim.
  for (const side of [1, -1]) {
    const cx = side * .066, cz = .198, rx = .0095, rz = .0168, tilt = .42;
    const axis = new Vector3(side * Math.sin(tilt), 0, Math.cos(tilt)), across = new Vector3(side * Math.cos(tilt), 0, -Math.sin(tilt));
    const loop = (scale: number, height: number, color: RGB) => Array.from({ length: 12 }, (_, k) => {
      const a = TAU * k / 12;
      const px = cx + axis.x * Math.cos(a) * rz * scale + across.x * Math.sin(a) * rx * scale;
      const pz = cz + axis.z * Math.cos(a) * rz * scale + across.z * Math.sin(a) * rx * scale;
      const p = topPoint(px, pz).addScaledVector(topNormal(px, pz), height);
      return mesh.vertex(p, color, discSkin(px, pz));
    });
    mesh.begin();
    const outer = loop(1.42, .0004, TOP), crest = loop(1.12, .0062, SPIRACLE_RIM), inner = loop(.72, .0012, PIT);
    const centerAt = topPoint(cx, cz).add(new Vector3(0, .0008, 0));
    const center = mesh.vertex(centerAt, PIT, discSkin(cx, cz));
    for (let k = 0; k < 12; k++) {
      const k1 = (k + 1) % 12;
      mesh.quad(outer[k], outer[k1], crest[k1], crest[k]);
      mesh.quad(crest[k], crest[k1], inner[k1], inner[k]);
      mesh.tri(center, inner[k], inner[k1]);
    }
    mesh.end({ closed: false, outward: () => new Vector3(0, 1, 0) });
  }

  // A row of small tubercles down the midline of the back, largest over the shoulders.
  const tubercles: [number, number, number][] = [[.128, .0004, .0052], [.088, -.0006, .0064], [.047, .0008, .0074], [.006, -.0004, .0082], [-.038, .0006, .0086], [-.084, -.0008, .0082], [-.127, .0005, .0076], [-.172, -.0004, .0068], [-.215, .0007, .006], [-.256, -.0005, .0052], [-.292, .0002, .0042]];
  for (const [z, x, r] of tubercles) bump(x, z, r * .85, r * .5, (k) => mix(TUBERCLE, TOP, .55 * k), 7, 2);

  // Decals lie just above the sheet so they bend with it.
  const decal = (line: readonly (readonly [number, number])[], upper: boolean, width: (t: number) => number, color: RGB, height = .0009) => {
    mesh.begin();
    const ids: number[][] = [];
    const pts = line.map(([x, z]) => [x, uOf(x, z)] as const);
    pts.forEach(([x, u], i) => {
      const t = i / (pts.length - 1);
      const [x0, u0] = pts[Math.max(0, i - 1)], [x1, u1] = pts[Math.min(pts.length - 1, i + 1)];
      const tangent = sheet(x1, u1, upper).sub(sheet(x0, u0, upper)).normalize();
      const n = sheetNormal(x, u, upper);
      const across = n.clone().cross(tangent).normalize();
      const gx = sheet(x + .003, u, upper).sub(sheet(x - .003, u, upper)).divideScalar(.006);
      const gu = sheet(x, Math.min(1, u + .005), upper).sub(sheet(x, Math.max(0, u - .005), upper)).divideScalar(.01);
      const w = width(t);
      const dx = across.dot(gx) / gx.lengthSq() * w, du = across.dot(gu) / gu.lengthSq() * w;
      ids.push([1, -1].map((sign) => {
        const px = x + sign * dx, pu = clamp(u + sign * du, .002, .998);
        const nn = sheetNormal(px, pu, upper);
        const p = sheet(px, pu, upper).addScaledVector(nn, height);
        return mesh.vertex(p, color, discSkin(px, p.z), nn);
      }));
    });
    for (let i = 0; i < ids.length - 1; i++) mesh.quad(ids[i][0], ids[i][1], ids[i + 1][1], ids[i + 1][0]);
    mesh.end({ closed: false, normals: false, outward: (i) => new Vector3(mesh.normals[i * 3], mesh.normals[i * 3 + 1], mesh.normals[i * 3 + 2]) });
  };
  const lens = (power = .5) => (t: number) => Math.sin(Math.PI * (.06 + .88 * t)) ** power;

  // Underside: the mouth in a pale lip well back from the snout, two nostrils with the flap between
  // them, and five short gill slits per side.
  const mouth = Array.from({ length: 9 }, (_, i) => {
    const s = i / 8 * 2 - 1;
    return [s * .036, .204 - .012 * s * s] as const;
  });
  decal(mouth, false, (t) => .0072 * lens(.6)(t), LIP);
  decal(mouth, false, (t) => .0022 * lens(.5)(t), MOUTH, .0018);
  decal(Array.from({ length: 5 }, (_, i) => [(i / 4 * 2 - 1) * .026, .252 - .004 * (i / 4 * 2 - 1) ** 2] as const), false, (t) => .0042 * lens(.7)(t), GILL);
  for (const side of [1, -1]) {
    decal(Array.from({ length: 4 }, (_, j) => [side * (.017 + .014 * j / 3), .285 - .02 * j / 3] as const), false, (t) => .0029 * lens(.5)(t), NOSTRIL);
    for (let i = 0; i < 5; i++) {
      const cx = .064 - .003 * i, cz = .165 - .029 * i, half = .0135 - .0008 * i;
      decal(Array.from({ length: 4 }, (_, j) => {
        const s = j / 3 * 2 - 1;
        return [side * (cx + s * half * .93), cz + s * half * .37 + .002 * s * s] as const;
      }), false, (t) => .0019 * lens(.5)(t), GILL);
    }
  }

  // Pelvic fins: rounded lobes showing behind the disc's rear edge either side of the tail base.
  for (const side of [1, -1]) {
    const axis = (v: number) => new Vector3(side * (.05 + .036 * v), .005, -.34 - .115 * v);
    const width = (v: number) => .043 * Math.sqrt(Math.max(0, 1 - v ** 2.4));
    fin(mesh, {
      stations: 6, chordPoints: 7, spacing: (t) => 1 - (1 - t) ** 1.9,
      le: (v) => axis(v).add(new Vector3(side * width(v), 0, .006 * v)),
      te: (v) => axis(v).add(new Vector3(-side * width(v), 0, -.006 * v)),
      thickness: (v) => .0075 * (1 - .5 * v),
      side: new Vector3(0, 1, 0),
      color: (_p, v, _u, face) => (face > 0 ? mix(TOP, TOP_PALE, .35) : mix(BELLY, MARGIN, .3 * smoothstep(.7, 1, v))),
      skin: (p) => discSkin(side * .02, p.z),
    });
  }

  // The whip of a tail: wide and a little flattened at the root, thinning to a thread.
  const tailZ = (t: number) => TAIL_START - TAIL_LENGTH * t;
  const tailRadius = (t: number) => .0013 + .0145 * (1 - t) ** 1.05;
  const tailWide = (t: number) => 1 + .24 * (1 - smoothstep(0, .25, t));
  const tailHigh = .8;
  const tailTop = (t: number) => TAIL_AXIS + tailHigh * tailRadius(t);
  const tailBottom = (t: number) => TAIL_AXIS - tailHigh * tailRadius(t);
  mesh.begin();
  const sides = 8, steps = 30;
  const tailRows: number[][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, z = tailZ(t), r = tailRadius(t);
    const skin = tailSkin(z);
    // Pale-backed at the root like the disc, darkening to a black thread; the underside stays white a while.
    const back = mix(mix(TOP, TAIL, smoothstep(0, .3, t)), TAIL_TIP, smoothstep(.3, 1, t) * .8);
    const white = 1 - smoothstep(.04, .26, t);
    tailRows.push(Array.from({ length: sides }, (_, k) => {
      const a = TAU * k / sides, s = Math.sin(a);
      const under = smoothstep(.1, -.6, s);
      const p = new Vector3(Math.cos(a) * r * tailWide(t), TAIL_AXIS + s * r * tailHigh, z);
      return mesh.vertex(p, mix(back, mix(back, BELLY, white), under), skin);
    }));
  }
  for (let i = 0; i < steps; i++) for (let k = 0; k < sides; k++) mesh.quad(tailRows[i][k], tailRows[i][(k + 1) % sides], tailRows[i + 1][(k + 1) % sides], tailRows[i + 1][k]);
  const tipAt = new Vector3(0, TAIL_AXIS, TAIL_START - TAIL_LENGTH - .008);
  const tip = mesh.vertex(tipAt, TAIL_TIP, { Tail3: 1 });
  const cap = mesh.vertex(new Vector3(0, TAIL_AXIS, TAIL_START + .004), TOP, { Root: .5, Tail1: .5 });
  for (let k = 0; k < sides; k++) {
    mesh.tri(tip, tailRows[steps][(k + 1) % sides], tailRows[steps][k]);
    mesh.tri(cap, tailRows[0][k], tailRows[0][(k + 1) % sides]);
  }
  mesh.end();

  /**
   * A thin blade of fin fold standing off the top or bottom of the tail between two distances behind
   * its root, rising quickly to `peak` and tapering away to nothing.
   */
  const fold = (from: number, to: number, down: boolean, peak: number, stations: number) => {
    mesh.begin();
    const rowsAt: number[][] = [];
    for (let i = 0; i <= stations; i++) {
      const s = i / stations, t = (from + (to - from) * s) / TAIL_LENGTH, z = tailZ(t);
      // A quick rise and a long taper; the ends close to a hair's breadth.
      const h = Math.max(.0004, peak * Math.min(1, (s / .22) ** .7) * (1 - s) ** .9);
      const base = down ? tailBottom(t) : tailTop(t), dir = down ? -1 : 1;
      const w = Math.min(.0022, tailRadius(t) * .45);
      const skin = tailSkin(z);
      const color = mix(FOLD, TAIL, .35 * smoothstep(.5, 1, s));
      rowsAt.push([
        mesh.vertex(new Vector3(-w, base - dir * .0025, z), color, skin),
        mesh.vertex(new Vector3(w, base - dir * .0025, z), color, skin),
        mesh.vertex(new Vector3(0, base + dir * h, z), mix(color, TAIL_TIP, .3), skin),
      ]);
    }
    for (let i = 0; i < stations; i++) {
      for (let k = 0; k < 3; k++) mesh.quad(rowsAt[i][k], rowsAt[i][(k + 1) % 3], rowsAt[i + 1][(k + 1) % 3], rowsAt[i + 1][k]);
    }
    for (const [row, near] of [[rowsAt[0], true], [rowsAt[stations], false]] as const) {
      const centre = row.reduce((sum, i) => sum.add(mesh.point(i)), new Vector3()).multiplyScalar(1 / 3);
      const end = mesh.vertex(centre, FOLD, tailSkin(centre.z));
      for (let k = 0; k < 3; k++) mesh.tri(end, row[near ? (k + 1) % 3 : k], row[near ? k : (k + 1) % 3]);
    }
    mesh.end();
  };
  // A long, low fold under the tail behind the spine, and a short low one on top.
  fold(.15, .7, true, .0095, 22);
  fold(.2, .34, false, .0052, 8);

  // The venomous spine: a long, flat, tapering blade lying back along the top of the tail, a little
  // raised at its tip, its edges cut into barbs that point toward the root.
  {
    const d0 = .075, length = .12, rise = .027;
    const t0 = d0 / TAIL_LENGTH;
    const baseY = tailTop(t0) - .0028, baseZ = tailZ(t0);
    const envelope = (s: number) => .0072 * (1 - s) ** .8 * (.7 + .3 * smoothstep(0, .12, s));
    const along: [number, number][] = [[0, envelope(0)], [.1, envelope(.1)]];
    const teeth = 9, first = .2, run = .77 / teeth;
    for (let k = 0; k < teeth; k++) {
      const s0 = first + k * run, s1 = s0 + run - .006;
      along.push([s0, envelope(s0) * 1.08], [s1, envelope(s1) * .6]);
    }
    mesh.begin();
    const bladeRows = along.map(([s, w]) => {
      const z = baseZ - length * s, y = baseY + rise * s ** 1.4;
      const th = .0027 * (1 - .65 * s);
      const color = mix(SPINE_BASE, SPINE, smoothstep(.05, .3, s));
      const skin = tailSkin(z);
      return [
        mesh.vertex(new Vector3(-w, y, z), color, skin),
        mesh.vertex(new Vector3(0, y + th, z), mix(color, BELLY, .25), skin),
        mesh.vertex(new Vector3(w, y, z), color, skin),
        mesh.vertex(new Vector3(0, y - th, z), mix(color, SPINE_BASE, .25), skin),
      ];
    });
    for (let i = 0; i < bladeRows.length - 1; i++) {
      for (let k = 0; k < 4; k++) mesh.quad(bladeRows[i][k], bladeRows[i][(k + 1) % 4], bladeRows[i + 1][(k + 1) % 4], bladeRows[i + 1][k]);
    }
    const tipZ = baseZ - length * 1.02;
    const spineTip = mesh.vertex(new Vector3(0, baseY + rise * 1.02, tipZ), SPINE, tailSkin(tipZ));
    const spineBase = mesh.vertex(new Vector3(0, baseY, baseZ + .002), SPINE_BASE, tailSkin(baseZ));
    const last = bladeRows[bladeRows.length - 1], firstRow = bladeRows[0];
    for (let k = 0; k < 4; k++) {
      mesh.tri(spineTip, last[(k + 1) % 4], last[k]);
      mesh.tri(spineBase, firstRow[k], firstRow[(k + 1) % 4]);
    }
    mesh.end();
  }

  const spar = (a: number) => leadingEdge(a) - .38 * (leadingEdge(a) - trailingEdge(a));
  bones.push(
    { name: 'Root', parent: null, position: new Vector3(0, 0, 0) },
    { name: 'Head', parent: 'Root', position: new Vector3(0, .01, .2) },
    // The manta rig's cephalic lobes: a stingray has none, so they sit inside the head, unweighted.
    { name: 'CephalicL', parent: 'Head', position: new Vector3(.02, .01, .3) },
    { name: 'CephalicR', parent: 'Head', position: new Vector3(-.02, .01, .3) },
    ...(['L', 'R'] as const).flatMap((side) => WING_JOINTS.map((a, i) => ({
      name: `Wing${side}${i + 1}`, parent: i === 0 ? 'Root' : `Wing${side}${i}`,
      position: new Vector3((side === 'L' ? 1 : -1) * a, lift(a), spar(a)),
    }))),
    ...TAIL_JOINTS.map((z, i) => ({ name: `Tail${i + 1}`, parent: i === 0 ? 'Root' : `Tail${i}`, position: new Vector3(0, TAIL_AXIS, z) })),
  );
  return { mesh, bones };
}
