import { useContext, useEffect, useMemo } from 'react';
import { type BufferGeometry, Color, ConeGeometry, CylinderGeometry, DoubleSide, Float32BufferAttribute, Mesh, MeshLambertMaterial, TorusGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { islets, outlinePoints, shoreDistance } from '@/lib/island-outline';
import { OCEAN, seabedProfile, shelfStretch } from '@/lib/ocean';
import { smoothstep } from '@/lib/steering';
import { alongWreck, WRECK, wreckLength } from '@/lib/wreck';
import { boulder, cliffs, delaunay, faces, hash, noise, paintFaces, triangles, type RockColors } from './coast-geometry';
import { OceanContext } from './ocean-context';
import { foliage, palm, tube } from './reef-coast';
import { useSceneQuality } from './scene-quality';
import { FLOOR_BIAS, prepareUnderwater } from './underwater-material';
import { Unlock } from './unlock';

/**
 * The Shipwreck: a low crescent of white sand dunes with beach grass, a few palms and driftwood,
 * a small red-and-white lighthouse on its northern point and the keeper's hut beside it. In the bight
 * of the crescent lies an old steamer, run aground long ago (`WRECK` in src/lib/wreck.ts): her bow up
 * on the sand, her rusted hull listing as it runs down into clear water, her stern, deckhouse and
 * broken mainmast under it, her funnel and foremast standing above; an anchor, a boiler and plates of
 * her lie scattered on the bottom. What stands above the water is drawn with the island; what lies
 * under it, like the reef's rocks (drawn behind any animal over it, taking on the water above it).
 */
const SAND = new Color('#F4EEDB'), SAND_WET = new Color('#D9CFB2'), DUNE = new Color('#EAE0C2'), WRACK = new Color('#A79A78');
const GRASS = new Color('#B4B06A'), GRASS_DARK = new Color('#7F8A4E'), VINE = new Color('#5F8F45'), VINE_LIGHT = new Color('#86B25A'), SEAGRAPE = new Color('#4C7E3C'), SEAGRAPE_LIGHT = new Color('#7BAA55'), DRIFTWOOD = new Color('#B9AE9A'), DRIFTWOOD_DARK = new Color('#8C826F');
const RUST = new Color('#8E4B2C'), RUST_LIGHT = new Color('#B4643A'), RUST_DARK = new Color('#5A3020'), STREAK = new Color('#C97E45');
const GROWTH = new Color('#6B6A48'), GROWTH_LIGHT = new Color('#8C8A5A'), CORAL_PINK = new Color('#B9787A'), DECK = new Color('#5E4A3C'), HOLD = new Color('#2A211C');
const FUNNEL_BAND = new Color('#2B2522'), WHITE = new Color('#F2F0EA'), RED = new Color('#B8433A'), GLASS = new Color('#F3E7A6'), ROOF = new Color('#A2483C'), WALL = new Color('#E8E0CF');
const BEACH: RockColors = { wet: SAND_WET, rock: SAND, light: SAND };
/** The beach's foot (under the water), the dunes' foot, and the water's calm surface (OCEAN.surfaceLevel). */
const FOOT = -.3, TOP = -.09, WATER = -.18;
/** The lighthouse on the crescent's northern point, and the keeper's hut beside it (island units). */
const LIGHT = { x: -.55, z: -.27, height: .5 }, HUT = { x: -.18, z: -.23 };
/** The Shipwreck's own island: a crescent cay curving round the bight where the wreck lies (island-outline.ts). */
const SHAPE = 'wreck';

const OUTLINE = (() => {
  const points = outlinePoints(10, SHAPE), polygon = new Float32Array(points.length * 2);
  points.forEach(([x, y], i) => { polygon[i * 2] = x; polygon[i * 2 + 1] = -y; });
  return polygon;
})();
const inside = (x: number, z: number) => -shoreDistance([OUTLINE], x, z);
/** The seabed's height at (x, z) off the cay (as the ocean draws it round an island alone), for what lies on the bottom. */
const floorAt = (x: number, z: number) => seabedProfile(Math.max(0, -inside(x, z)) / shelfStretch(x, z), OCEAN).floor;

/** The ground's height at (x, z): the beach rising from the water, then low dunes along the crescent, uneven. */
function groundAt(x: number, z: number) {
  const d = inside(x, z), dune = .055 * smoothstep(.12, .32, d) * (.55 + .45 * noise(x * 3.3 + 1, z * 3.3 - 4));
  return WATER + .012 + (TOP - WATER - .012) * smoothstep(0, .2, d) + dune;
}

/** The cay's ground: the outline filled with facets over a jittered lattice. Wet sand, white beach, a line of wrack, pale dunes. */
function ground(seed: number) {
  const contour = outlinePoints(8, SHAPE).map(([x, y]) => [x * 1.02, -y * 1.02] as const);
  const rim = new Float32Array(contour.flat());
  const step = .15, points: (readonly [number, number])[] = [...contour];
  for (let z = -.85; z <= 1.15; z += step * .87) {
    for (let x = -2.4; x <= 2.4; x += step) {
      const px = x + (Math.round(z / step) % 2) * step / 2 + (hash(x * 7 + seed, z * 3) - .5) * step * .45, pz = z + (hash(z * 5, x * 9 + seed) - .5) * step * .45;
      if (-shoreDistance([rim], px, pz) > step * .4) points.push([px, pz]);
    }
  }
  const height = (i: number) => (i < contour.length ? WATER + .006 : groundAt(points[i][0], points[i][1]));
  const positions: number[] = [];
  for (const [a, b, c] of delaunay(points)) {
    const cx = (points[a][0] + points[b][0] + points[c][0]) / 3, cz = (points[a][1] + points[b][1] + points[c][1]) / 3;
    if (shoreDistance([rim], cx, cz) > 0) continue;
    for (const i of [a, c, b]) positions.push(points[i][0], height(i), points[i][1]);
  }
  const shade = new Color();
  return paintFaces(triangles(positions), (x, _y, z, f) => {
    const n = hash(f, 3.1), d = inside(x, z);
    const color = shade.copy(SAND_WET).lerp(SAND, smoothstep(0, .06, d) * (.85 + .15 * n));
    color.lerp(WRACK, smoothstep(.1, .13, d) * (1 - smoothstep(.15, .18, d)) * .55);
    return color.lerp(DUNE, smoothstep(.16, .3, d) * (.5 + .5 * n)).clone();
  });
}

/** A tuft of beach grass: a few thin blades fanning up from the sand. */
function grass(x: number, z: number, seed: number) {
  const base = groundAt(x, z), positions: number[] = [];
  for (let k = 0; k < 5; k++) {
    const a = seed + k * 1.3, lean = .3 + .4 * hash(seed, k), h = .05 + .03 * hash(k, seed), w = .006;
    const tx = x + Math.cos(a) * lean * h, tz = z + Math.sin(a) * lean * h;
    positions.push(x - Math.sin(a) * w, base, z + Math.cos(a) * w, tx, base + h, tz, x + Math.sin(a) * w, base, z - Math.cos(a) * w);
  }
  const shade = new Color();
  return paintFaces(triangles(positions), (_x, _y, _z, f) => shade.copy(GRASS_DARK).lerp(GRASS, hash(f, seed)).clone());
}

/** The lighthouse: a tapering white tower banded in red, a gallery and its lantern under a red cap; the keeper's hut beside it. */
function lighthouse() {
  const parts: BufferGeometry[] = [], base = groundAt(LIGHT.x, LIGHT.z) - .01, { height } = LIGHT, shade = new Color();
  const tower = new CylinderGeometry(.045, .065, height, 8, 6);
  tower.translate(LIGHT.x, base + height / 2, LIGHT.z);
  parts.push(paintFaces(faces(tower), (_x, y) => (Math.floor((y - base) / height * 6) % 2 ? RED : WHITE).clone()));
  const gallery = new CylinderGeometry(.068, .068, .012, 10);
  gallery.translate(LIGHT.x, base + height + .006, LIGHT.z);
  parts.push(paintFaces(faces(gallery), () => FUNNEL_BAND.clone()));
  const lantern = new CylinderGeometry(.034, .034, .05, 8);
  lantern.translate(LIGHT.x, base + height + .037, LIGHT.z);
  parts.push(paintFaces(faces(lantern), () => GLASS.clone()));
  const cap = new ConeGeometry(.045, .045, 8);
  cap.translate(LIGHT.x, base + height + .084, LIGHT.z);
  parts.push(paintFaces(faces(cap), () => RED.clone()));
  // The keeper's hut: whitewashed walls under a red pitched roof.
  const hutBase = groundAt(HUT.x, HUT.z) - .01, walls = new CylinderGeometry(.5, .5, 1, 4);
  walls.rotateY(Math.PI / 4);
  walls.scale(.13, .06, .09);
  walls.translate(HUT.x, hutBase + .03, HUT.z);
  parts.push(paintFaces(faces(walls), () => WALL.clone()));
  const roof = new CylinderGeometry(0, .5, 1, 4, 1);
  roof.rotateY(Math.PI / 4);
  roof.scale(.15, .05, .11);
  roof.translate(HUT.x, hutBase + .085, HUT.z);
  parts.push(paintFaces(faces(roof), (_x, _y, _z, f) => shade.copy(ROOF).lerp(RUST_DARK, hash(f, 2) * .25).clone()));
  return parts;
}

/** A bleached driftwood log lying on the sand. */
function driftwood(x: number, z: number, angle: number, length: number, seed: number) {
  const ca = Math.cos(angle), sa = Math.sin(angle), y = groundAt(x, z) + .008, half = length / 2;
  const shade = new Color();
  return tube([x - ca * half, y, z - sa * half], [x - ca * half * .3, y + .006, z - sa * half * .3], [x + ca * half * .3, y + .004, z + sa * half * .3], [x + ca * half, y, z + sa * half], .014, .009, 5, 3,
    (_y, f) => shade.copy(DRIFTWOOD).lerp(DRIFTWOOD_DARK, hash(f, seed) * .6).clone());
}

/**
 * Turn a point in the wreck's own frame (u along her from the stern, up from her keel, across her)
 * into the island's. Her back is broken (`WRECK.broken`): aft of the break she has sunk lower, twisted
 * aside and lists harder.
 */
function wreckFrame() {
  const whole = wholeFrame(), { at, drop, twist, list } = WRECK.broken, pivot = whole(at, 0, 0), cos = Math.cos(twist), sin = Math.sin(twist), cl = Math.cos(list), sl = Math.sin(list);
  return (u: number, up: number, across: number): [number, number, number] => {
    if (u >= at) return whole(u, up, across);
    const [x, y, z] = whole(u, up * cl - across * sl - drop * (at - u) / at, across * cl + up * sl);
    return [pivot[0] + (x - pivot[0]) * cos - (z - pivot[2]) * sin, y, pivot[2] + (x - pivot[0]) * sin + (z - pivot[2]) * cos];
  };
}
function wholeFrame() {
  const length = wreckLength(), { stern, bow, keel, list } = WRECK;
  const heading = Math.atan2(bow[1] - stern[1], bow[0] - stern[0]), trim = Math.atan2(keel[1] - keel[0], length);
  const ch = Math.cos(heading), sh = Math.sin(heading), ct = Math.cos(trim), st = Math.sin(trim), cl = Math.cos(list), sl = Math.sin(list);
  return (u: number, up: number, across: number): [number, number, number] => {
    // Listed about her length, then trimmed bow-up, then turned to her heading.
    const y1 = up * cl - across * sl, a1 = across * cl + up * sl;
    const x2 = u * length * ct - y1 * st, y2 = u * length * st + y1 * ct;
    return [stern[0] + x2 * ch - a1 * sh, keel[0] + y2, stern[1] + x2 * sh + a1 * ch];
  };
}

/** Rust here, by height and face: weed-grown and dull under the water, streaked orange above it. */
function rustAt(y: number, face: number, seed: number) {
  const n = hash(face, seed), shade = new Color();
  if (y < WATER - .02) return shade.copy(GROWTH).lerp(GROWTH_LIGHT, n * .6).lerp(n > .85 ? CORAL_PINK : RUST_DARK, n > .85 ? .7 : .25).clone();
  return shade.copy(RUST).lerp(n > .5 ? RUST_LIGHT : RUST_DARK, Math.abs(n - .5) * 1.6).lerp(STREAK, n > .82 ? .75 : 0).lerp(new Color('#3E3A36'), n < .08 ? .6 : 0).clone();
}

/** The wreck and what lies around her, as one geometry: her hull, deck, deckhouse, funnel and masts, and an anchor, a boiler and plates on the bottom. */
function wreckGeometry() {
  const at = wreckFrame(), parts: BufferGeometry[] = [], { beam, depth, sheer } = WRECK, sections = 14;
  // The hull: a lofted U of sections from her square stern to her sharp bow, the deck edge rising at the bow.
  const width = (u: number) => beam / 2 * (u < .08 ? .8 + 2.5 * u : u > .62 ? Math.sqrt(Math.max(0, 1 - ((u - .62) / .38) ** 2)) : 1);
  const top = (u: number) => depth + sheer * smoothstep(.55, 1, u);
  const ring = (u: number) => {
    const w = width(u), h = top(u);
    return [[-w, h], [-w * .96, h * .3], [-w * .55, h * .05], [0, 0], [w * .55, h * .05], [w * .96, h * .3], [w, h]].map(([a, b]) => at(u, b, a));
  };
  const hull: number[] = [], deck: number[] = [], breakAt = WRECK.broken.at;
  // Two pieces, the plating torn ragged either side of the break.
  const stations = [...Array.from({ length: sections + 1 }, (_, i) => i / sections).filter((u) => Math.abs(u - breakAt) > .03), breakAt - .02, breakAt + .02].sort((a, b) => a - b);
  const torn = (u: number, k: number) => (Math.abs(u - breakAt) < .025 ? (hash(k, u * 50) - .5) * .05 : 0);
  for (let i = 0; i < stations.length - 1; i++) {
    if (stations[i] < breakAt && stations[i + 1] > breakAt) continue;
    const r0 = ring(stations[i]).map((p, k) => [p[0] + torn(stations[i], k), p[1] - Math.abs(torn(stations[i], k + 3)), p[2]]);
    const r1 = ring(stations[i + 1]).map((p, k) => [p[0] + torn(stations[i + 1], k), p[1] - Math.abs(torn(stations[i + 1], k + 3)), p[2]]);
    for (let k = 0; k < r0.length - 1; k++) hull.push(...r0[k], ...r1[k + 1], ...r0[k + 1], ...r0[k], ...r1[k], ...r1[k + 1]);
    // The deck between the deck edges, a little below them.
    const u0 = stations[i], u1 = stations[i + 1];
    const d0l = at(u0, top(u0) - .015, -width(u0) * .96), d0r = at(u0, top(u0) - .015, width(u0) * .96);
    const d1l = at(u1, top(u1) - .015, -width(u1) * .96), d1r = at(u1, top(u1) - .015, width(u1) * .96);
    deck.push(...d0l, ...d1r, ...d0r, ...d0l, ...d1l, ...d1r);
  }
  // The transom closing her stern.
  const stern = ring(0);
  for (let k = 1; k < stern.length - 1; k++) hull.push(...stern[0], ...stern[k], ...stern[k + 1]);
  parts.push(paintFaces(triangles(hull), (_x, y, _z, f) => rustAt(y, f, 3)));
  // Rotten planking, open holds where it has fallen through.
  parts.push(paintFaces(triangles(deck), (_x, _y, _z, f) => (hash(Math.floor(f / 2), 9) > .72 ? HOLD : DECK.clone().lerp(hash(f, 5) > .5 ? RUST : DRIFTWOOD_DARK, hash(f, 4) * .55)).clone()));
  // The deckhouse amidships, its plating rusted through in places.
  const { house, funnel, foremast, mainmast } = WRECK;
  const box = new CylinderGeometry(.5, .5, 1, 4);
  box.rotateY(Math.PI / 4);
  box.scale(house.length * wreckLength(), house.height, beam * .62);
  orient(box, at, house.at, top(house.at) + house.height / 2 - .01);
  parts.push(paintFaces(faces(box), (_x, y, _z, f) => rustAt(y, f, 5)));
  // The funnel, leaning aft, its top banded black.
  const stack = new CylinderGeometry(funnel.radius, funnel.radius * 1.1, funnel.height, 8);
  stack.rotateZ(funnel.lean);
  orient(stack, at, funnel.at, top(funnel.at) + house.height + funnel.height / 2 - .02);
  parts.push(paintFaces(faces(stack), (_x, y, _z, f) => (y > WATER + .12 ? FUNNEL_BAND.clone() : rustAt(y, f, 6))));
  // The masts: the foremast still standing, the mainmast broken off short.
  for (const [mast, r] of [[foremast, .012], [mainmast, .014]] as const) {
    const pole = new CylinderGeometry(r * .7, r, mast.height, 5);
    pole.rotateZ(-.12);
    orient(pole, at, mast.at, top(mast.at) + mast.height / 2);
    parts.push(paintFaces(faces(pole), (_x, y, _z, f) => rustAt(y, f, 7)));
  }
  const yard = new CylinderGeometry(.006, .006, beam * 1.3, 4);
  yard.rotateX(Math.PI / 2);
  orient(yard, at, foremast.at, top(foremast.at) + foremast.height * .78);
  parts.push(paintFaces(faces(yard), (_x, y, _z, f) => rustAt(y, f, 8)));
  // On the bottom: her anchor off the bow on its chain, a boiler that broke away, plates of her hull.
  const aft = alongWreck(-.18), side = alongWreck(.3);
  const boiler = new CylinderGeometry(.07, .07, .2, 9);
  boiler.rotateZ(Math.PI / 2);
  boiler.rotateY(.7);
  boiler.translate(aft.x - .05, floorAt(aft.x - .05, aft.z + .22) + .06, aft.z + .22);
  parts.push(paintFaces(faces(boiler), (_x, y, _z, f) => rustAt(y, f, 11)));
  for (let k = 0; k < 4; k++) {
    const plate = new CylinderGeometry(.5, .5, 1, 4);
    plate.scale(.12 + .05 * hash(k, 1), .012, .07 + .03 * hash(k, 2));
    plate.rotateY(hash(k, 3) * Math.PI);
    plate.rotateZ((hash(k, 4) - .5) * .5);
    const px = side.x + .35 + .18 * k * Math.cos(k * 1.9), pz = side.z + .3 + .15 * Math.sin(k * 2.3);
    plate.translate(px, floorAt(px, pz) + .015, pz);
    parts.push(paintFaces(faces(plate), (_x, y, _z, f) => rustAt(y, f, 12 + k)));
  }
  const fore = alongWreck(1);
  const anchorAt = { x: fore.x + .34, z: fore.z + .38, y: floorAt(fore.x + .34, fore.z + .38) };
  const shank = new CylinderGeometry(.008, .008, .12, 4);
  shank.rotateZ(Math.PI / 2 - .3);
  shank.translate(anchorAt.x, anchorAt.y + .02, anchorAt.z);
  parts.push(paintFaces(faces(shank), (_x, y, _z, f) => rustAt(y, f, 20)));
  const crown = new TorusGeometry(.04, .007, 3, 8, Math.PI);
  crown.rotateZ(Math.PI);
  crown.translate(anchorAt.x - .05, anchorAt.y + .03, anchorAt.z);
  parts.push(paintFaces(faces(crown), (_x, y, _z, f) => rustAt(y, f, 21)));
  // The chain in a sagging line from the hawse pipe down to the anchor.
  const hawse = at(.97, top(.97) - .03, 0);
  parts.push(tube(hawse, [hawse[0] + .08, hawse[1] - .12, hawse[2] + .1], [anchorAt.x - .05, anchorAt.y + .02, anchorAt.z - .05], [anchorAt.x + .04, anchorAt.y + .03, anchorAt.z], .005, .005, 3, 6, (y, f) => rustAt(y, f, 22)));
  const geometry = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  return geometry;
}

/** Set a part, built about its own middle, upright on the wreck at `u` along her and `up` above her keel (her list and trim with it). */
function orient(geometry: BufferGeometry, at: ReturnType<typeof wreckFrame>, u: number, up: number) {
  const centre = at(u, up, 0), ahead = at(u + .01, up, 0), lifted = at(u, up + .01, 0), aside = at(u, up, .01);
  const x = ahead.map((v, k) => (v - centre[k]) / .01), y = lifted.map((v, k) => (v - centre[k]) / .01), z = aside.map((v, k) => (v - centre[k]) / .01);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const px = position.getX(i), py = position.getY(i), pz = position.getZ(i);
    position.setXYZ(i, centre[0] + x[0] * px + y[0] * py + z[0] * pz, centre[1] + x[1] * px + y[1] * py + z[1] * pz, centre[2] + x[2] * px + y[2] * py + z[2] * pz);
  }
}

/** Split a geometry's triangles at the water's surface: what stands above it, and what lies under it. */
function splitAtSurface(geometry: BufferGeometry) {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry, position = flat.attributes.position, color = flat.attributes.color;
  const sides = [{ p: [] as number[], c: [] as number[] }, { p: [] as number[], c: [] as number[] }];
  for (let f = 0; f < position.count / 3; f++) {
    const y = (position.getY(f * 3) + position.getY(f * 3 + 1) + position.getY(f * 3 + 2)) / 3, side = sides[y > WATER + .005 ? 0 : 1];
    for (let k = 0; k < 3; k++) {
      const i = f * 3 + k;
      side.p.push(position.getX(i), position.getY(i), position.getZ(i));
      side.c.push(color.getX(i), color.getY(i), color.getZ(i));
    }
  }
  if (flat !== geometry) flat.dispose();
  return sides.map(({ p, c }) => {
    const g = triangles(p);
    g.setAttribute('color', new Float32BufferAttribute(c, 3));
    return g;
  });
}

/** What of the wreck lies under the water: drawn on the bottom like the reef's rocks, taking on the water above it. */
function SunkenWreck({ geometry }: { geometry: BufferGeometry }) {
  const ocean = useContext(OceanContext);
  const lite = useSceneQuality() === 'lite';
  const { mesh, look } = useMemo(() => {
    const material = new MeshLambertMaterial({ vertexColors: true, flatShading: true, side: DoubleSide });
    const mesh = new Mesh(geometry, material);
    mesh.name = 'wreck-sunken';
    mesh.raycast = () => {};
    // Lying in the water, she takes on its color like the seabed itself.
    const look = prepareUnderwater(mesh, ocean ?? undefined, lite, { bias: FLOOR_BIAS, seabed: .85 });
    material.dispose();
    return { mesh, look };
  }, [geometry, ocean, lite]);
  useEffect(() => () => look.dispose(), [look]);
  return <primitive object={mesh} />;
}

/** A little cay of sand out on the shallows (an islet, from level 5), with tufts of grass and driftwood. */
function IsletCay({ position, scale, seed }: { position: [number, number]; scale: number; seed: number }) {
  const mesh = useMemo(() => {
    const [ix, iz] = position, parts: BufferGeometry[] = [cliffs(BEACH, FOOT, TOP + .005, scale, ix, iz, seed, undefined, SHAPE)];
    for (let k = 0; k < 6; k++) {
      const a = k * 1.1 + seed, x = ix + Math.cos(a) * scale * .9, z = iz + Math.sin(a) * scale * .4, base = TOP + .005, positions: number[] = [];
      for (let b = 0; b < 4; b++) positions.push(x - .006, base, z, x + Math.cos(b + a) * .02, base + .05, z + Math.sin(b + a) * .02, x + .006, base, z);
      parts.push(paintFaces(triangles(positions), (_x, _y, _z, f) => GRASS_DARK.clone().lerp(GRASS, hash(f, seed))));
    }
    parts.push(...palm(ix + scale * .3, iz - scale * .1, .34, seed, seed * 7, TOP));
    const geometry = mergeGeometries(parts);
    parts.forEach((part) => part.dispose());
    geometry.computeVertexNormals();
    const mesh = new Mesh(geometry, new MeshLambertMaterial({ vertexColors: true, flatShading: true, side: DoubleSide }));
    mesh.name = 'wreck-islet';
    mesh.raycast = () => {};
    return mesh;
  }, [position, scale, seed]);
  useEffect(() => () => { mesh.geometry.dispose(); (mesh.material as MeshLambertMaterial).dispose(); }, [mesh]);
  return <primitive object={mesh} />;
}

/** Everything of the Shipwreck in the island group's frame: the cay, and the wreck above and under the water. */
export function WreckCoast({ level }: { level: number }) {
  const lite = useSceneQuality() === 'lite';
  const { cay, sunken } = useMemo(() => {
    const [above, below] = splitAtSurface(wreckGeometry());
    // The beach loses its lids: the ground drawn over it covers the cay.
    const parts: BufferGeometry[] = [cliffs(BEACH, FOOT, TOP, 1, 0, 0, 0, (x, z) => Math.min(TOP, groundAt(x, z) - .008), SHAPE), ground(2), above];
    // Beach grass over the dunes, thinner toward the beach.
    for (let k = 0; k < (lite ? 60 : 150); k++) {
      const x = -2.2 + 4.4 * hash(k, 1), z = -.75 + 1.7 * hash(k, 2), d = inside(x, z);
      if (d > .14 && hash(k, 3) < smoothstep(.12, .3, d) && Math.hypot(x - LIGHT.x, z - LIGHT.z) > .12 && Math.hypot(x - HUT.x, z - HUT.z) > .14) parts.push(grass(x, z, k));
    }
    // A few palms, low shrubs among the dunes, driftwood on the beach and a boulder or two at the points.
    for (const [px, pz, h, lean, seed] of [[.75, -.2, .4, -1.2, 1], [-1.45, .2, .36, 2.6, 2], [.2, -.37, .44, -1.9, 3], [1.55, .4, .34, -.3, 4], [-.95, -.15, .42, 2.2, 5]] as const) parts.push(...palm(px, pz, h, lean, seed, groundAt(px, pz) - .01));
    // Sea grape and low shrubs among the dunes, and mats of beach vine creeping over the sand.
    for (const [sx, sz, seed, size] of [[1.2, -.1, 31, .8], [-1.15, .05, 32, .75], [.45, -.07, 33, .7], [-.2, -.43, 34, .6], [1.75, .1, 35, .55], [-1.75, .25, 36, .55]] as const) {
      parts.push(...foliage(sx, groundAt(sx, sz) - .005, sz, size, seed, [SEAGRAPE, SEAGRAPE.clone().lerp(SEAGRAPE_LIGHT, .5), SEAGRAPE_LIGHT, VINE_LIGHT], 3, .55));
    }
    for (let k = 0; k < (lite ? 8 : 16); k++) {
      const x = -1.9 + 3.8 * hash(k, 21), z = -.6 + 1.2 * hash(k, 22);
      if (inside(x, z) > .16) parts.push(...foliage(x, groundAt(x, z) - .02, z, .45 + .2 * hash(k, 23), 60 + k, [VINE, VINE.clone().lerp(VINE_LIGHT, .5), VINE_LIGHT, GRASS], 2, .25));
    }
    parts.push(driftwood(-1.0, -.37, .4, .32, 1), driftwood(.35, -.53, -.2, .26, 2), driftwood(1.75, .4, 1.2, .22, 3));
    parts.push(...lighthouse());
    for (const [bx, bz, seed] of [[2.1, .73, 41], [-2.05, .77, 42]] as const) parts.push(boulder({ wet: RUST_DARK.clone().lerp(new Color('#55524A'), .7), rock: new Color('#7D786C'), light: new Color('#9E988A') }, bx, WATER - .01, bz, .07, .035, .05, seed, seed, WATER));
    const geometry = mergeGeometries(parts);
    parts.forEach((part) => part.dispose());
    geometry.computeVertexNormals();
    const cay = new Mesh(geometry, new MeshLambertMaterial({ vertexColors: true, flatShading: true, side: DoubleSide }));
    cay.name = 'wreck-coast';
    cay.raycast = () => {};
    return { cay, sunken: below };
  }, [lite]);
  useEffect(() => () => { cay.geometry.dispose(); (cay.material as MeshLambertMaterial).dispose(); }, [cay]);
  const [first, second] = islets(6, SHAPE);
  return <>
    <primitive object={cay} />
    <SunkenWreck geometry={sunken} />
    <Unlock at={5} level={level} kind="rise"><IsletCay position={first.position} scale={first.scale} seed={5} /></Unlock>
    <Unlock at={6} level={level} kind="rise"><IsletCay position={second.position} scale={second.scale} seed={6} /></Unlock>
  </>;
}
