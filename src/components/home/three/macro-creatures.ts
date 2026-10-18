import { CatmullRomCurve3, Color, DoubleSide, Group, Mesh, MeshLambertMaterial, Quaternion, Vector3, type Object3D } from 'three';
import type { MacroKind } from '@/lib/macro-life';
import { blob, fan, hash, lathe, mix, place, Sculpt, tube, v3, type Paint } from './macro-shapes';

/**
 * The reef's small life (macro-life.ts), built in code like the anemone: each creature and its home,
 * in its home's own frame (the bottom at y = 0, +z the way it faces, which MacroLife turns toward the
 * camera or along the coast). Sizes are world units: a nudibranch is about .16 long, so up close in
 * the explorer it is a fingertip across. `home` always shows in the explorer; `body` fades in as it
 * zooms in close; `animate` moves them for time t (seconds), cheaply (moving parts, a few vertices).
 */
export type MacroModel = { home: Group; body: Group; animate: (t: number) => void };

const color = (hex: string) => new Color(hex);
/** Every part is drawn from this: MacroLife gives each creature its own underwater copy (prepareUnderwater). */
const SOURCE = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide });
function mesh(sculpt: Sculpt, parent: Object3D) {
  const part = new Mesh(sculpt.geometry(), SOURCE);
  part.raycast = () => {};
  parent.add(part);
  return part;
}
const group = (parent?: Object3D, x = 0, y = 0, z = 0) => { const g = new Group(); g.position.set(x, y, z); parent?.add(g); return g; };
const curve = (points: readonly (readonly [number, number, number])[]) => {
  const path = new CatmullRomCurve3(points.map(([x, y, z]) => new Vector3(x, y, z)));
  return (t: number) => path.getPoint(Math.min(1, Math.max(0, t)));
};
/** A face's own shade of a color: lighter or darker by up to `amount`, the same face always. */
const vary = (base: Color, at: Vector3, amount = .12, seed = 0) => {
  const n = hash(at.x * 211 + seed, at.y * 157 + at.z * 263) * 2 - 1;
  return base.clone().offsetHSL(0, 0, n * amount);
};

const ROCK = color('#6E7A66'), SAND = color('#CDBB92'), RUBBLE = color('#D3C6A6');
/** A low rock, lumpy and flat-topped at `top` above the bottom, sunk a little into the sand. */
function rock(sculpt: Sculpt, at: Vector3, axes: readonly [number, number, number], top: number, seed: number, base = ROCK) {
  blob(sculpt, at, axes, { detail: 1, lumps: .14, seed, above: top - at.y, below: -.03 - at.y, paint: (_u, _v, p) => vary(base, p, .09, seed) });
}
/** Broken branching coral lying on the sand: short pale sticks. */
function rubble(sculpt: Sculpt, seed: number, count: number, near: number, far: number) {
  for (let i = 0; i < count; i++) {
    const a = (i + hash(seed, i) * .6) / count * Math.PI * 2, r = near + (far - near) * hash(seed, i + 9), yaw = hash(seed, i + 17) * Math.PI;
    const length = .035 + .03 * hash(seed, i + 23), base = mix(RUBBLE, SAND, hash(seed, i + 31) * .6);
    sculpt.at(place(Math.cos(a) * r, .006, Math.sin(a) * r, yaw), () => tube(sculpt, (t) => v3(0, 0, (t - .5) * length), () => [.007, .006], { segments: 1, sides: 5, paint: (_u, _v, p) => vary(base, p, .06) }));
  }
}

// ── Nudibranchs ────────────────────────────────────────────────────────────────────────────────────

/** A sea slug's oval body with a flat sole, `h` high at the middle: `paint` gets how far up its side a face is (0 at the sole, 1 on top), and where. */
function slug(sculpt: Sculpt, w: number, h: number, l: number, paint: (up: number, x: number, z: number) => Color, detail = 2) {
  blob(sculpt, v3(0, 0, 0), [w, h, l], { detail, below: 0, paint: (_u, _v, p) => paint(p.y / (h * Math.sqrt(Math.max(.02, 1 - (p.z / l) ** 2))), p.x, p.z) });
}
/** A rhinophore (a slug's scented "horn"): a little ringed cone `height` tall, its tip `tip` colored. */
function horn(sculpt: Sculpt, at: Vector3, height: number, radius: number, body: Color, tip: Color, tipFrom = .7, lean = 0, sides = 6) {
  sculpt.at(place(at.x, at.y, at.z, 0, lean, at.x > 0 ? -.18 : .18), () => lathe(sculpt, [[radius, 0], [radius * 1.05, height * .3], [radius * .85, height * .6], [radius * .55, height * .85], [0, height]],
    { sides, paint: (u, _v) => (u >= tipFrom ? tip : u % .5 < .25 ? body : body.clone().offsetHSL(0, 0, -.06)) }));
}
/** A ring of little gill leaves standing up around a point, leaning out. */
function gills(sculpt: Sculpt, count: number, ring: number, height: number, paint: Paint) {
  for (let i = 0; i < count; i++) {
    const a = i / count * Math.PI * 2, ux = Math.cos(a), uz = Math.sin(a), root = v3(ux * ring * .4, 0, uz * ring * .4);
    const side = v3(-uz, 0, ux).multiplyScalar(height * .22);
    const tip = v3(ux * (ring + height * .45), height, uz * (ring + height * .45));
    const mid = root.clone().lerp(tip, .5);
    fan(sculpt, root, [mid.clone().add(side), tip, mid.clone().sub(side), root.clone().addScaledVector(v3(ux, 0, uz), ring * .5)], paint);
  }
}
/** Crawling slowly round a small loop on its perch (radius rx by rz, one lap in `lap` seconds), facing the way it goes. */
function crawl(slugGroup: Group, t: number, rx: number, rz: number, lap: number, sense = 1) {
  const a = sense * t * Math.PI * 2 / lap, x = Math.cos(a) * rx, z = Math.sin(a) * rz;
  slugGroup.position.x = x; slugGroup.position.z = z;
  slugGroup.rotation.y = Math.atan2(-Math.sin(a) * rx * sense, Math.cos(a) * rz * sense);
}

/**
 * Anna's chromodoris: a blue slug with a white mantle edge rimmed in yellow and a black line down its
 * back, orange rhinophores and gills, crawling over a low rock grown with an orange sponge.
 */
function chromodoris(lite: boolean): MacroModel {
  const home = group(), perch = new Sculpt(), top = .1;
  rock(perch, v3(0, .03, 0), [.14, .085, .12], top, 3);
  const sponge = color('#E3803A');
  blob(perch, v3(.1, .02, .06), [.045, .055, .04], { detail: 1, lumps: .2, seed: 5, paint: (_u, _v, p) => vary(sponge, p, .08) });
  blob(perch, v3(-.1, .01, -.05), [.035, .04, .035], { detail: 0, lumps: .2, seed: 6, paint: (_u, _v, p) => vary(sponge, p, .08) });
  mesh(perch, home);
  const body = group(), crawler = group(body, 0, top, 0), sculpt = new Sculpt();
  const blue = color('#3352D6'), white = color('#F4F6FF'), yellow = color('#F2BE3C'), black = color('#141833'), orange = color('#F0802C');
  slug(sculpt, .032, .022, .085, (up, x) => (up < .16 ? yellow : up < .38 ? white : Math.abs(x) < .0045 && up > .75 ? black : blue), lite ? 1 : 2);
  // The foot's tail, showing past the mantle behind.
  tube(sculpt, (t) => v3(0, .004, -.07 - t * .035), (t) => [.012 * (1 - t) + .002, .005 * (1 - t) + .001], { segments: 2, sides: 5, paint: color('#C9D5F7') });
  for (const side of [-1, 1]) horn(sculpt, v3(side * .012, .017, .055), .024, .0055, orange, orange.clone().offsetHSL(0, 0, .08), .8, -.25, lite ? 5 : 6);
  mesh(sculpt, crawler);
  const plume = new Sculpt();
  gills(plume, lite ? 6 : 8, .009, .022, (u) => mix(white, orange, .4 + u));
  const gill = mesh(plume, crawler);
  gill.position.set(0, .016, -.05);
  return {
    home, body,
    animate(t) {
      crawl(crawler, t, .03, .022, 70);
      gill.rotation.z = .12 * Math.sin(t * 1.7);
      gill.scale.setScalar(1 + .06 * Math.sin(t * 2.3));
    },
  };
}

/**
 * The Pikachu nudibranch (Thecacera pacifica): a plump yellow slug with black flecks, its "ears"
 * (rhinophores) and the two horns behind its gills tipped with deep blue, on a rock tufted with hydroids.
 */
function pikachu(lite: boolean): MacroModel {
  const home = group(), perch = new Sculpt(), top = .085;
  rock(perch, v3(0, .02, 0), [.12, .075, .1], top, 11);
  const stalk = color('#CDBE9A');
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2 + .4, r = .095 + .02 * hash(i, 4), h = .05 + .03 * hash(i, 7), x = Math.cos(a) * r, z = Math.sin(a) * r;
    tube(perch, (t) => v3(x + Math.sin(t * 3 + i) * .006, t * h, z), () => [.0025, .0025], { segments: 3, sides: 3, paint: stalk });
    for (let k = 1; k <= 3; k++) fan(perch, v3(x, h * k / 3.4, z), [v3(x + .012, h * k / 3.4 + .012, z), v3(x + .006, h * k / 3.4 + .016, z + .004)], stalk);
  }
  mesh(perch, home);
  const body = group(), crawler = group(body, 0, top, 0), sculpt = new Sculpt();
  const yellow = color('#F7C52C'), deep = color('#1D2463'), black = color('#1E1A12'), orange = color('#EFA020');
  slug(sculpt, .024, .021, .052, (up, x, z) => {
    if (up < .2) return orange;
    // Black flecks scattered over the back, never the same twice.
    const cell = hash(Math.floor(x * 140), Math.floor(z * 140));
    return cell > .84 && up > .35 ? black : yellow;
  }, lite ? 1 : 2);
  // The "ears", then the two horns flanking the gills behind.
  for (const side of [-1, 1]) horn(sculpt, v3(side * .01, .015, .03), .032, .0066, yellow, deep, .62, -.15, lite ? 5 : 6);
  for (const side of [-1, 1]) horn(sculpt, v3(side * .014, .012, -.03), .019, .0042, yellow, deep, .6, .35, 5);
  gills(sculpt, 5, .006, .014, color('#E9D25A'));
  mesh(sculpt, crawler);
  return { home, body, animate(t) { crawl(crawler, t, .022, .018, 80, -1); crawler.rotation.z = .04 * Math.sin(t * 1.3); } };
}

/**
 * The Spanish dancer: a large crimson slug, its broad mantle rimmed in pale pink and rippling as it
 * crawls, a white gill rosette on its back, over a sandy patch scattered with coral rubble.
 */
function dancer(lite: boolean): MacroModel {
  const home = group(), patch = new Sculpt();
  rubble(patch, 41, 7, .17, .24);
  mesh(patch, home);
  const body = group(), crawler = group(body), mantle = new Sculpt();
  const red = color('#C42339'), rim = color('#F4D6CC'), edge = color('#FFF2EC'), deep = color('#93182C');
  // The mantle: an oval dome with a thin, frilled edge, in rings out from the middle.
  const a = .078, b = .15, sides = lite ? 18 : 36, rings = [0, .4, .7, .86, 1];
  const at = (f: number, k: number) => {
    const th = k / sides * Math.PI * 2, frill = f > .7 ? .014 * Math.sin(th * 9) * (f - .7) / .3 : 0, flare = 1 + .1 * Math.sin(th * 9) * (f > .85 ? 1 : 0);
    return v3(Math.cos(th) * a * f * flare, .032 * (1 - f * f) + .006 + frill, Math.sin(th) * b * f * flare);
  };
  for (let r = 0; r < rings.length - 1; r++) {
    for (let k = 0; k < sides; k++) {
      const f = (rings[r] + rings[r + 1]) / 2, band = Math.floor(k / sides * 18) % 2, shade = f > .9 ? (band ? edge : rim) : f > .78 ? (band ? rim : mix(red, rim, .4)) : f > .6 ? mix(red, deep, .25) : red;
      if (r === 0) mantle.tri(at(0, 0), at(rings[1], k + 1), at(rings[1], k), shade);
      else mantle.quad(at(rings[r], k), at(rings[r], k + 1), at(rings[r + 1], k + 1), at(rings[r + 1], k), shade);
    }
  }
  const sheet = mesh(mantle, crawler);
  const extras = new Sculpt();
  for (const side of [-1, 1]) horn(extras, v3(side * .02, .036, .11), .028, .006, red, rim, .85, -.3);
  extras.at(place(0, .033, -.1), () => gills(extras, 6, .01, .026, (u) => mix(color('#FBE7EA'), color('#F3A9B6'), u)));
  mesh(extras, crawler);
  // Where each corner of the mantle is at rest, and how much it ripples (only its edge does).
  const positions = sheet.geometry.attributes.position, rest = Float32Array.from(positions.array as Float32Array);
  const reach = Float32Array.from({ length: positions.count }, (_, i) => Math.hypot(rest[i * 3] / a, rest[i * 3 + 2] / b));
  return {
    home, body,
    animate(t) {
      crawl(crawler, t, .045, .03, 90);
      // The prepared copy of the mantle (MacroLife replaces each mesh's geometry with its own) is the one to move.
      const live = sheet.geometry.attributes.position;
      for (let i = 0; i < live.count; i++) {
        const f = reach[i];
        if (f < .7) continue;
        const th = Math.atan2(rest[i * 3 + 2] / b, rest[i * 3] / a);
        live.setY(i, rest[i * 3 + 1] + .009 * (f - .7) / .3 * Math.sin(th * 3 - t * 2.2));
      }
      live.needsUpdate = true;
    },
  };
}

// ── Pygmy seahorse and its sea fan ─────────────────────────────────────────────────────────────────

/** How far back a sea fan leans (rad), so that seen from the camera above it is not edge-on. */
const FAN_LEAN = -.55;

/**
 * A pygmy seahorse (Hippocampus bargibanti) on its sea fan: the fan a lattice of dusky pink branches
 * dotted with pale polyps; the seahorse no bigger than a fingernail, pink with rounder red-pink bumps,
 * its tail wound round a branch. Both sway in the swell; the seahorse, pinker than the fan, is just
 * findable.
 */
function seahorse(lite: boolean): MacroModel {
  const home = group(), sway = group(home), tilt = group(sway), fanSculpt = new Sculpt();
  tilt.rotation.x = FAN_LEAN;
  const branch = color('#B9597A'), tipColor = color('#D27C98'), polyp = color('#F2BCCB');
  blob(fanSculpt, v3(0, .008, 0), [.03, .02, .025], { detail: 0, lumps: .2, seed: 2, paint: color('#7C5560') });
  const polyps: Vector3[] = [];
  const grow = (from: Vector3, angle: number, length: number, radius: number, depth: number, seed: number) => {
    const to = from.clone().add(v3(Math.sin(angle) * length, Math.cos(angle) * length, 0));
    tube(fanSculpt, (t) => from.clone().lerp(to, t), (t) => [radius * (1 - .3 * t), radius * (1 - .3 * t)], { segments: 1, sides: lite ? 3 : 4, up: v3(0, 0, 1), paint: mix(branch, tipColor, 1 - depth / 5) });
    for (let k = 1; k <= 2; k++) if (hash(seed, k) > .3) polyps.push(from.clone().lerp(to, k / 2.5).add(v3(0, 0, .004)));
    if (depth === 0) return;
    const spread = .32 + .2 * hash(seed, 3);
    grow(to, angle - spread, length * (.72 + .1 * hash(seed, 4)), radius * .78, depth - 1, seed * 2 + 1);
    grow(to, angle + spread, length * (.72 + .1 * hash(seed, 5)), radius * .78, depth - 1, seed * 2 + 2);
  };
  grow(v3(0, .01, 0), 0, .07, .0065, lite ? 4 : 5, 1);
  for (const p of polyps) blob(fanSculpt, p, [.0045, .0045, .0045], { detail: 0, paint: polyp });
  mesh(fanSculpt, tilt);
  const body = group(), bodySway = group(body), bodyTilt = group(bodySway), sculpt = new Sculpt();
  bodyTilt.rotation.x = FAN_LEAN;
  const pink = color('#F5A3BE'), bump = color('#D9456F'), H = .09;
  // Snout to tail tip, in the fan's plane, facing right: the tail curls round under it.
  const spine = curve([[.42, .84, 0], [.2, .9, 0], [.07, .8, 0], [.13, .6, 0], [.1, .38, 0], [0, .24, 0], [-.04, .1, 0], [.06, .02, 0], [.12, .1, 0], [.06, .14, 0]].map(([x, y, z]) => [x * H, y * H, z] as const));
  const girth = (t: number) => (t < .12 ? .035 : t < .22 ? .1 : t < .3 ? .075 : t < .5 ? .14 - (t - .3) * .2 : .1 * (1 - (t - .5) * 1.7)) * H;
  tube(sculpt, spine, (t) => [Math.max(.002, girth(t)), Math.max(.002, girth(t))], { segments: lite ? 14 : 22, sides: lite ? 5 : 6, up: v3(0, 0, 1), paint: (u) => (u < .1 ? pink.clone().offsetHSL(0, 0, -.05) : pink) });
  // The big round bumps that give it away (on the fan, they match the polyps).
  for (let i = 0; i < 9; i++) {
    const t = .22 + i * .045, p = spine(t), r = girth(t);
    blob(sculpt, p.clone().add(v3(r * .6 * (i % 2 ? 1 : -.2), r * .3, r * .7)), [.0038, .0038, .0038], { detail: 0, paint: bump });
  }
  blob(sculpt, spine(.17).add(v3(0, .002, .006)), [.0018, .0018, .0018], { detail: 0, paint: color('#2A1B22') });
  const pony = mesh(sculpt, bodyTilt);
  // On a branch near the fan's top left, a little in front of it.
  pony.position.set(-.07, .19, .01);
  return {
    home, body,
    animate(t) {
      const x = .045 * Math.sin(t * .9) + .015 * Math.sin(t * 2.1), z = .025 * Math.sin(t * .7 + 1);
      sway.rotation.set(x, 0, z); bodySway.rotation.set(x, 0, z);
      pony.rotation.z = .06 * Math.sin(t * 1.3);
    },
  };
}

// ── Ornate ghost pipefish and its feather star ─────────────────────────────────────────────────────

/**
 * An ornate ghost pipefish (Solenostomus paradoxus): long-snouted and spindly, black flecked with
 * white and red, with big lace-edged fins, hanging head-down beside a black-and-yellow feather star
 * perched on a rock, drifting gently as it hovers.
 */
function pipefish(lite: boolean): MacroModel {
  const home = group(), perch = new Sculpt();
  rock(perch, v3(0, .015, 0), [.1, .065, .09], .07, 21);
  blob(perch, v3(0, .075, 0), [.018, .014, .018], { detail: 0, paint: color('#2B2420') });
  mesh(perch, home);
  // The feather star's arms: ten ribbons, raised and curving out, feathery in black and yellow.
  const arms = group(home, 0, .078, 0), armSculpt = new Sculpt(), black = color('#1B1816'), gold = color('#E7C03C');
  const count = lite ? 8 : 10;
  for (let i = 0; i < count; i++) {
    const a = i / count * Math.PI * 2 + .2, ux = Math.cos(a), uz = Math.sin(a), side = v3(-uz, 0, ux);
    const point = (t: number) => v3(ux * (.02 + .1 * t), .07 * Math.sin(t * 2.2) - .02 * t, uz * (.02 + .1 * t));
    const steps = lite ? 5 : 8;
    for (let j = 0; j < steps; j++) {
      const p = point(j / steps), q = point((j + 1) / steps), w = .012 * (1 - j / steps * .6);
      armSculpt.quad(p.clone().addScaledVector(side, -w), q.clone().addScaledVector(side, -w * .8), q.clone().addScaledVector(side, w * .8), p.clone().addScaledVector(side, w), j % 2 ? gold : black);
    }
  }
  mesh(armSculpt, arms);
  const body = group(), hover = group(body, .13, .13, .06), sculpt = new Sculpt();
  hover.rotation.set(1.05, .5, 0);
  hover.scale.setScalar(1.45);
  const dark = color('#2A2023'), fleck = color('#F1E6D4'), red = color('#B8352F'), yellow = color('#F0CF5A');
  const speckle = (_u: number, _v: number, p: Vector3) => { const n = hash(p.x * 900, p.z * 900 + p.y * 700); return n > .8 ? fleck : n > .55 ? red : dark; };
  tube(sculpt, (t) => v3(0, .004 * Math.sin(t * Math.PI), -.075 + t * .16), (t) => {
    const r = t > .82 ? .0025 : t > .7 ? .007 : .0055 - .003 * (1 - t / .7) ** 2;
    return [r * .7, r];
  }, { segments: lite ? 8 : 12, sides: 5, paint: speckle });
  const lace = (_u: number, _v: number, p: Vector3) => { const n = hash(p.x * 700 + 3, p.y * 800 + p.z * 600); return n > .7 ? yellow : n > .3 ? red : n > .15 ? fleck : dark; };
  // The big pelvic fins below, a dorsal fin above, the tail fin behind.
  for (const side of [-1, 1]) fan(sculpt, v3(side * .002, -.003, -.005), [v3(side * .012, -.012, -.03), v3(side * .016, -.032, -.012), v3(side * .012, -.034, .012), v3(side * .004, -.016, .028)], lace);
  fan(sculpt, v3(0, .005, -.01), [v3(0, .012, -.04), v3(0, .028, -.025), v3(0, .03, .0), v3(0, .012, .02)], lace);
  fan(sculpt, v3(0, 0, -.07), [v3(0, .02, -.09), v3(0, .01, -.1), v3(0, -.01, -.1), v3(0, -.02, -.09)], lace);
  mesh(sculpt, hover);
  return {
    home, body,
    animate(t) {
      hover.position.y = .13 + .008 * Math.sin(t * 1.4);
      hover.position.x = .13 + .01 * Math.sin(t * .37);
      hover.rotation.y = .5 + .25 * Math.sin(t * .6);
      arms.rotation.y = .05 * Math.sin(t * .5);
      arms.scale.y = 1 + .05 * Math.sin(t * 1.1);
    },
  };
}

// ── Harlequin shrimp and its starfish ──────────────────────────────────────────────────────────────

/**
 * A harlequin shrimp (Hymenocera picta) at its meal: cream-white, splashed with blue-ringed magenta
 * spots, holding up its great flat claws like petals, on a bright blue starfish (Linckia).
 */
function harlequin(lite: boolean): MacroModel {
  const home = group(), star = new Sculpt(), blue = color('#2D59CF');
  blob(star, v3(0, .012, 0), [.03, .012, .03], { detail: 1, paint: (_u, _v, p) => vary(blue, p, .05) });
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2 + .3 + .12 * hash(i, 1), ux = Math.cos(a), uz = Math.sin(a), bend = .3 * (hash(i, 2) - .5);
    tube(star, (t) => v3(ux * t * .17 - uz * bend * t * t * .1, .012 - .004 * t, uz * t * .17 + ux * bend * t * t * .1), (t) => { const r = .013 * (1 - .35 * t) * (t > .92 ? Math.sqrt((1 - t) / .08) : 1); return [Math.max(.002, r), Math.max(.002, r * .85)]; },
      { segments: lite ? 4 : 6, sides: lite ? 5 : 6, paint: (_u, _v, p) => vary(blue, p, .06, i) });
  }
  mesh(star, home);
  const body = group(), shrimp = group(body, .02, .024, .03), sculpt = new Sculpt();
  shrimp.rotation.y = -.5;
  shrimp.scale.setScalar(1.6);
  const cream = color('#F6F0E4'), magenta = color('#B33A8C'), ring = color('#3D45A8');
  const spots = (_u: number, _v: number, p: Vector3) => {
    // Round spots on a grid, jittered: magenta in a thin blue ring.
    const g = 70, cx = Math.floor(p.x * g), cz = Math.floor(p.z * g), cy = Math.floor(p.y * g);
    const n = hash(cx * 3 + cy, cz), dx = p.x * g - cx - .5, dz = p.z * g - cz - .5, d = Math.hypot(dx, dz);
    return n > .55 ? (d < .3 ? magenta : d < .45 ? ring : cream) : cream;
  };
  // Head to tail: a humped body, its tail curling under at the back.
  const spine = curve([[0, .004, .045], [0, .014, .02], [0, .018, -.005], [0, .013, -.03], [0, .004, -.045]]);
  tube(sculpt, spine, (t) => { const r = (.013 - .006 * t) * (t < .08 ? .6 : 1); return [r * 1.15, r * .9]; }, { segments: lite ? 7 : 10, sides: 6, paint: spots });
  fan(sculpt, v3(0, .004, -.045), [v3(-.012, .002, -.058), v3(0, .001, -.062), v3(.012, .002, -.058)], magenta);
  // Petal antennules and the walking legs.
  for (const side of [-1, 1]) fan(sculpt, v3(side * .004, .01, .045), [v3(side * .014, .02, .06), v3(side * .01, .016, .07), v3(side * .002, .012, .062)], (u) => (u > .5 ? magenta : ring));
  for (let k = 0; k < 4; k++) for (const side of [-1, 1]) {
    tube(sculpt, (t) => v3(side * (.006 + .016 * t), .008 - .008 * t * t, .012 - k * .01 + .004 * t), () => [.0013, .0013], { segments: 2, sides: 3, paint: k % 2 ? magenta : cream });
  }
  mesh(sculpt, shrimp);
  // The great claws, raised.
  const claws = [-1, 1].map((side) => {
    const claw = new Sculpt(), pivot = group(shrimp, side * .007, .014, .035);
    tube(claw, (t) => v3(side * .006 * t, .012 * t, .012 * t), () => [.0018, .0018], { segments: 2, sides: 4, paint: cream });
    const plate = Array.from({ length: 11 }, (_, i) => { const a = i / 10 * Math.PI; return v3(side * (.006 + Math.sin(a) * .022), .012 + .034 * (1 - Math.cos(a)) / 2 + .004, .014 + Math.sin(a) * .012); });
    fan(claw, v3(side * .006, .012, .012), plate, spots);
    mesh(claw, pivot);
    return pivot;
  });
  return {
    home, body,
    animate(t) {
      claws.forEach((claw, i) => { claw.rotation.x = -.2 + .22 * Math.sin(t * 1.9 + i * 1.3); });
      shrimp.position.y = .024 + .003 * Math.sin(t * 2.4);
    },
  };
}

// ── Peacock mantis shrimp and its burrow ───────────────────────────────────────────────────────────

/** One look out of the burrow: seconds in, coming out, out, going in (a cycle). */
const MANTIS_CYCLE = { inside: 6, out: 7, move: 1.2 };

/**
 * A peacock mantis shrimp (Odontodactylus scyllarus): a green body banded in olive and orange, pink
 * folded striking claws, stalked teal eyes and a blue-edged orange tail fan. It lives in a burrow
 * ringed with rubble and comes out to look about, then backs in again.
 */
function mantis(lite: boolean): MacroModel {
  const home = group(), burrow = new Sculpt();
  lathe(burrow, [[.045, -.01], [.06, .006], [.085, .012], [.12, 0]], { sides: lite ? 10 : 14, paint: (_u, _v, p) => vary(SAND, p, .05) });
  fan(burrow, v3(0, .004, 0), Array.from({ length: 13 }, (_, i) => { const a = i / 12 * Math.PI * 2; return v3(Math.cos(a) * .046, .002, Math.sin(a) * .046); }), color('#231F19'));
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2 + hash(i, 3), r = .075 + .02 * hash(i, 5);
    blob(burrow, v3(Math.cos(a) * r, .01, Math.sin(a) * r), [.014 + .01 * hash(i, 6), .011, .013], { detail: 0, lumps: .2, seed: i, paint: (_u, _v, p) => vary(color('#A89E8C'), p, .1) });
  }
  mesh(burrow, home);
  const body = group(), crawler = group(body), sculpt = new Sculpt();
  const green = color('#3F9C52'), olive = color('#7DA03C'), orange = color('#F07A2C'), pink = color('#E2507E'), teal = color('#4CC7A6'), blue = color('#2F6FD1');
  tube(sculpt, (t) => v3(0, .012 + .004 * Math.sin(t * Math.PI), -.085 + t * .16), (t) => { const r = t > .9 ? .012 * (1 - (t - .9) * 5) : .014 + .003 * Math.sin(t * Math.PI); return [Math.max(.003, r), Math.max(.003, r * .72)]; }, {
    segments: lite ? 9 : 14, sides: lite ? 5 : 6,
    paint: (u) => (u > .62 ? green : Math.floor(u * 14) % 3 === 0 ? orange : mix(green, olive, .5)),
  });
  // The tail fan: orange plates edged with blue.
  fan(sculpt, v3(0, .012, -.085), [v3(-.024, .01, -.1), v3(-.012, .011, -.112), v3(0, .012, -.115), v3(.012, .011, -.112), v3(.024, .01, -.1)], (u) => (u < .2 || u > .8 ? blue : orange));
  // Stalked eyes, antennae with their pink scales, and the folded striking claws.
  for (const side of [-1, 1]) {
    tube(sculpt, (t) => v3(side * .006 * t, .02 + .01 * t, .078 + .004 * t), () => [.0018, .0018], { segments: 1, sides: 4, paint: green });
    blob(sculpt, v3(side * .007, .032, .083), [.0045, .006, .0045], { detail: 0, paint: (u) => (u > .55 ? teal : color('#1F5E4F')) });
    tube(sculpt, (t) => v3(side * (.004 + .03 * t), .02 + .006 * t, .08 + .05 * t), () => [.0012, .0012], { segments: 2, sides: 3, paint: color('#E8C9A0') });
    fan(sculpt, v3(side * .008, .016, .078), [v3(side * .02, .016, .095), v3(side * .014, .017, .1)], pink);
    tube(sculpt, curve([[side * .008, .008, .07], [side * .016, .004, .05], [side * .012, .006, .035], [side * .006, .01, .055]]), () => [.0032, .0028], { segments: 4, sides: 4, paint: pink });
  }
  mesh(sculpt, crawler);
  return {
    home, body,
    animate(t) {
      // Starting partway through a look out, so that it is out when the reef holds still (time 0, with reduced motion).
      const { inside, out, move } = MANTIS_CYCLE, period = inside + out + 2 * move, s = (t + inside + move + 1) % period;
      // How far out (0 in the burrow, 1 all the way out), easing in and out.
      const raw = s < inside ? 0 : s < inside + move ? (s - inside) / move : s < inside + move + out ? 1 : 1 - (s - inside - move - out) / move;
      const e = raw * raw * (3 - 2 * raw);
      crawler.position.set(0, -.07 * (1 - e) ** .8, -.13 + .23 * e);
      crawler.rotation.x = -.55 * (1 - e);
      crawler.rotation.y = e > .99 ? .12 * Math.sin(t * .8) : 0;
    },
  };
}

// ── Caribbean spiny lobster under its ledge ────────────────────────────────────────────────────────

/**
 * A Caribbean spiny lobster (Panulirus argus) peering out from under a rock ledge: a spiny
 * orange-brown carapace with cream spots, banded legs and its two long, thick antennae sweeping
 * slowly in front of it.
 */
function lobster(lite: boolean): MacroModel {
  const home = group(), ledge = new Sculpt();
  rock(ledge, v3(0, .04, -.14), [.22, .1, .13], .12, 31);
  rock(ledge, v3(.2, .02, -.06), [.08, .05, .07], .06, 33);
  rock(ledge, v3(-.19, .015, -.04), [.07, .045, .06], .05, 34);
  // The shadow of the crevice under its front.
  fan(ledge, v3(0, .003, -.04), Array.from({ length: 9 }, (_, i) => { const a = i / 8 * Math.PI; return v3(Math.cos(a) * .14, .003, -.04 + Math.sin(a) * .06); }), color('#2E3029'));
  mesh(ledge, home);
  const body = group(), crawler = group(body, 0, 0, .05), sculpt = new Sculpt();
  const shell = color('#B5612F'), cream = color('#EED7A5'), dark = color('#7A3A1C');
  const spotted = (_u: number, _v: number, p: Vector3) => { const g = 60, n = hash(Math.floor(p.x * g) * 7 + Math.floor(p.y * g), Math.floor(p.z * g)); return n > .8 ? cream : n < .15 ? dark : shell; };
  tube(sculpt, (t) => v3(0, .03 + .006 * Math.sin(t * Math.PI), -.12 + t * .22), (t) => { const r = t > .85 ? .028 * (1 - (t - .85) * 3) : .028; return [r * 1.1, r * .85]; }, { segments: lite ? 6 : 9, sides: lite ? 6 : 7, paint: spotted });
  // Spines along the carapace, and the two "horns" over the eyes.
  for (let i = 0; i < 6; i++) for (const side of [-1, 1]) {
    sculpt.at(place(side * .016, .052, .02 + i * .013, 0, -.4, side * -.3), () => lathe(sculpt, [[.0035, 0], [0, .012]], { sides: 4, paint: dark }));
  }
  for (const side of [-1, 1]) sculpt.at(place(side * .012, .045, .1, 0, .9, side * -.4), () => lathe(sculpt, [[.006, 0], [0, .03]], { sides: 5, paint: shell }));
  // Banded legs.
  for (let k = 0; k < 4; k++) for (const side of [-1, 1]) {
    tube(sculpt, curve([[side * .022, .025, .07 - k * .022], [side * .045, .03, .075 - k * .022], [side * .055, .004, .085 - k * .022]]), () => [.0032, .0032],
      { segments: 4, sides: 4, paint: (u) => (Math.floor(u * 6) % 2 ? cream : shell) });
  }
  mesh(sculpt, crawler);
  // The antennae: thick at the base, banded, curving out and forward.
  const feelers = [-1, 1].map((side) => {
    const feeler = new Sculpt(), pivot = group(crawler, side * .014, .04, .1);
    tube(feeler, curve([[0, 0, 0], [side * .06, .012, .1], [side * .14, .01, .2], [side * .2, -.005, .3]]), (t) => [.0075 * (1 - t) + .0015, .0075 * (1 - t) + .0015],
      { segments: lite ? 8 : 12, sides: 4, paint: (u) => (Math.floor(u * 12) % 2 ? cream : shell) });
    mesh(feeler, pivot);
    return pivot;
  });
  return {
    home, body,
    animate(t) {
      feelers[0].rotation.y = .22 * Math.sin(t * .8);
      feelers[1].rotation.y = .22 * Math.sin(t * .8 + 1.7);
      feelers.forEach((f, i) => { f.rotation.x = -.06 + .05 * Math.sin(t * 1.1 + i); });
      crawler.position.z = .05 + .01 * Math.sin(t * .23);
    },
  };
}

// ── Christmas tree worms on a coral head ───────────────────────────────────────────────────────────

const UP = v3(0, 1, 0), spin = new Quaternion();
const WORM_COLORS = ['#3A63D6', '#E8462F', '#F6B532', '#F4F1E8', '#E8762F', '#8E54C9', '#2FB3A0'].map(color);
/** Seconds a worm takes to snap back into its tube, stays hidden, and takes to unfurl again. */
const WORM_HIDE = { snap: .25, hidden: 2.5, unfurl: 2 };

/**
 * Christmas tree worms (Spirobranchus giganteus): pairs of little spiral "trees", each worm its own
 * color, on a rounded coral head. Now and then one snaps back into its tube and slowly unfurls again.
 */
function treeWorms(lite: boolean): MacroModel {
  const home = group(), coral = new Sculpt(), tan = color('#B8A26E');
  const dome = [.19, .13, .17] as const;
  blob(coral, v3(0, .03, 0), dome, { detail: 1, lumps: .08, seed: 51, below: -.06, paint: (_u, _v, p) => vary(tan, p, .1, 2) });
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 + .5, r = .1;
    blob(coral, v3(Math.cos(a) * r, .1 - .02 * hash(i, 2), Math.sin(a) * r * .9), [.06, .05, .06], { detail: 0, lumps: .15, seed: 60 + i, paint: (_u, _v, p) => vary(tan, p, .1, 3) });
  }
  mesh(coral, home);
  const body = group();
  // Whorls tapering up a cone, a crown's spiral seen as rings.
  const whorls = ([[.003, 0], [.012, .006], [.0045, .009], [.0102, .015], [.004, .018], [.0083, .024], [.0035, .027], [.006, .032], [.0025, .035], [0, .04]] as const).map(([r, y]) => [r * 1.9, y * 2.6] as const);
  const spots = [[0, .16, 0], [.07, .14, .06], [-.08, .13, .05], [.1, .11, -.06], [-.05, .14, -.08], [.02, .12, .11], [-.12, .08, -.02]].slice(0, lite ? 5 : 7);
  const worms = spots.map(([x, y, z], i) => {
    const worm = group(body, x, y, z), sculpt = new Sculpt(), base = WORM_COLORS[i % WORM_COLORS.length];
    // Lean out from the dome, as its surface faces.
    const normal = v3(x / dome[0] ** 2, (y - .03) / dome[1] ** 2, z / dome[2] ** 2).normalize();
    // Toward the camera a little more than the surface faces, so their whorls show from above.
    normal.add(v3(normal.x * .6, 0, normal.z * .6 + .35)).normalize();
    worm.quaternion.setFromUnitVectors(v3(0, 1, 0), normal);
    for (const side of [-1, 1]) {
      sculpt.at(place(side * .016, 0, 0, i, 0, side * .2), () => lathe(sculpt, whorls, { sides: lite ? 5 : 7, paint: (u) => (Math.floor(u * 9) % 2 ? base.clone().offsetHSL(0, 0, -.12) : base.clone().offsetHSL(0, 0, .06)) }));
    }
    mesh(sculpt, worm);
    const period = 11 + i * 1.7, hide = WORM_HIDE.snap + WORM_HIDE.hidden + WORM_HIDE.unfurl;
    // Ducking in at the end of a cycle, never at its start: at time 0 (the reef held still, with reduced motion) every worm is out.
    return { worm, lean: worm.quaternion.clone(), phase: hash(i, 7) * (period - hide - .5), period, from: period - hide };
  });
  return {
    home, body,
    animate(t) {
      for (const [i, w] of worms.entries()) {
        const cycle = Math.floor((t + w.phase) / w.period), s = (t + w.phase) % w.period;
        // About half its cycles, a worm ducks into its tube for a moment.
        let out = 1;
        if (hash(i, cycle) > .5 && s >= w.from) {
          const { snap, hidden, unfurl } = WORM_HIDE, r = s - w.from;
          out = r < snap ? 1 - r / snap : r < snap + hidden ? 0 : r < snap + hidden + unfurl ? (r - snap - hidden) / unfurl : 1;
        }
        const e = out * out * (3 - 2 * out);
        w.worm.scale.set(.35 + .65 * e, .06 + .94 * e, .35 + .65 * e);
        // Turning slowly about its own tube.
        w.worm.quaternion.copy(w.lean).multiply(spin.setFromAxisAngle(UP, t * .25 + i));
      }
    },
  };
}

// ── Giant clam ─────────────────────────────────────────────────────────────────────────────────────

/**
 * A giant clam (Tridacna gigas) bedded in coral rubble: two heavy, ribbed, off-white valves with
 * scalloped lips that interlock, and between them its mantle, blue and teal mottled with green, with
 * a dark siphon. The mantle breathes, and now and then the clam half-closes, then opens again.
 */
function clam(lite: boolean): MacroModel {
  const home = group(), patch = new Sculpt();
  rubble(patch, 71, 8, .2, .27);
  for (let i = 0; i < 3; i++) blob(patch, v3(Math.cos(i * 2.1) * .24, .008, Math.sin(i * 2.1) * .22), [.025, .015, .02], { detail: 0, lumps: .2, seed: i, paint: (_u, _v, p) => vary(color('#A89E8C'), p, .1) });
  mesh(patch, home);
  const body = group(), seat = group(body, 0, -.03, 0);
  const L = .2, W = .085, H = .115, gape = .03;
  const shell = color('#E8E2D2'), band = color('#C9C0A8');
  /** One valve (side -1 or 1): from the hinge along the bottom up to its scalloped lip, along the clam's length. */
  const valve = (side: number) => {
    const sculpt = new Sculpt(), along = lite ? 12 : 18, up = lite ? 5 : 7;
    const at = (i: number, j: number) => {
      const zf = i / along * 2 - 1, s = j / up, e = Math.sqrt(Math.max(0, 1 - zf * zf)) ** .7;
      const scallop = .016 * Math.sin(zf * 5 * Math.PI) * s ** 2, rib = .005 * Math.sin(zf * 5 * Math.PI) * Math.sin(Math.PI * s);
      return v3(side * ((W * Math.sin(Math.PI * s) * .9 + gape * s) * e + rib) + scallop * e, H * e * (1 - Math.cos(Math.PI * s)) / 2, zf * L);
    };
    for (let i = 0; i < along; i++) for (let j = 0; j < up; j++) {
      const shade = j % 2 ? band : shell;
      if (side > 0) sculpt.quad(at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1), shade);
      else sculpt.quad(at(i, j), at(i, j + 1), at(i + 1, j + 1), at(i + 1, j), shade);
    }
    const pivot = group(seat);
    mesh(sculpt, pivot);
    return pivot;
  };
  const valves = [valve(-1), valve(1)];
  // The mantle between the lips: a long low dome across the gape, mottled.
  const mantle = new Sculpt(), blue = color('#2F70C6'), teal = color('#27A596'), green = color('#9BDA4E'), rim = color('#5B4A34');
  const along = lite ? 14 : 20, across = 4;
  const point = (i: number, j: number) => {
    const zf = i / along * 2 - 1, e = Math.sqrt(Math.max(0, 1 - zf * zf)) ** .7, xf = j / across * 2 - 1;
    const scallop = .016 * Math.sin(zf * 5 * Math.PI);
    return v3((xf * (gape + .004) + scallop) * e, H * e + .012 * e * (1 - xf * xf), zf * L * .97);
  };
  for (let i = 0; i < along; i++) for (let j = 0; j < across; j++) {
    const zf = (i + .5) / along * 2 - 1, xf = (j + .5) / across * 2 - 1, n = hash(i * 5 + j, 3);
    const siphon = Math.abs(zf - .55) < .08 && Math.abs(xf) < .5;
    const shade = siphon ? color('#1C2730') : Math.abs(xf) > .74 ? rim : n > .78 ? green : n > .4 ? teal : blue;
    mantle.quad(point(i, j), point(i + 1, j), point(i + 1, j + 1), point(i, j + 1), shade);
  }
  const flesh = mesh(mantle, seat);
  return {
    home, body,
    animate(t) {
      // A half-close every 30 s or so, held a moment.
      const s = t % 29, close = s < 1.2 ? s / 1.2 : s < 3.2 ? 1 : s < 5.5 ? 1 - (s - 3.2) / 2.3 : 0, e = close * close * (3 - 2 * close);
      valves[0].rotation.z = -.16 * e; valves[1].rotation.z = .16 * e;
      flesh.scale.set(1 - .45 * e, (1 + .03 * Math.sin(t * .9)) * (1 - .15 * e), 1);
    },
  };
}

const BUILDERS: Record<MacroKind, (lite: boolean) => MacroModel> = {
  chromodoris, pikachu, dancer, seahorse, pipefish, harlequin, mantis, lobster, 'tree-worms': treeWorms, clam,
};
/** A creature and its home, new each time (each creature is drawn once). */
export const buildMacro = (kind: MacroKind, lite = false) => BUILDERS[kind](lite);
