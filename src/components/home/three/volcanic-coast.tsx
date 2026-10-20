import { useContext, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute, type Group, IcosahedronGeometry, Mesh, MeshBasicMaterial, MeshLambertMaterial, ShaderMaterial, Vector2 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { islets, outlinePoints, shoreDistance } from '@/lib/island-outline';
import { smoothstep } from '@/lib/steering';
import { boulder, cliffs, delaunay, faces, hash, noise, paintFaces, triangles } from './coast-geometry';
import { OceanContext } from './ocean-context';
import { OCEAN_SHADER_CHUNKS } from './ocean-mesh';
import { useSceneQuality } from './scene-quality';

/**
 * The Volcanic Pinnacle's island: a young lava cone rising steeply out of clear blue water, like the
 * Galápagos' Bartolomé and Fernandina. Black basalt shores and two coves of black sand; slopes of
 * dark lava and rust-red cinder, with fresh flows running down them glossy black and a little green
 * scrub and tree cactus low on the side facing the sun; a crater at the summit with a glowing vent
 * that steams; a causeway of basalt columns stepping down into the sea on its east point, and a lone
 * spire of rock (the pinnacle) standing off its west. Drawn in the island group's coordinates.
 */
const LAVA = new Color('#211F1D'), BASALT = new Color('#393530'), BASALT_LIGHT = new Color('#4D4842'), ASH = new Color('#5E5750');
const CINDER = new Color('#7A402C'), CINDER_LIGHT = new Color('#9A5B3B'), SULFUR = new Color('#A99550'), TOPS = new Color('#7E776D');
const SAND = new Color('#67635D'), SAND_WET = new Color('#4B4844');
const SCRUB = new Color('#56633F'), SCRUB_LIGHT = new Color('#6C7A4C');
const PAD = new Color('#5F8048'), PAD_LIGHT = new Color('#77985A'), BARK = new Color('#7C6B52');
const PALO = new Color('#958F86'), PALO_LIGHT = new Color('#B3ADA3');
const ROCKS = { wet: new Color('#1C1B1A'), rock: BASALT, light: BASALT_LIGHT };
/** The Volcanic Pinnacle's own island: small and nearly round (island-outline.ts). */
const SHAPE = 'volcanic';
/** The shore's foot (below the water surface, so the waves wash it) and top, and the sand at the water's edge in the coves. */
const FOOT = -.26, TOP = .03, BEACH = -.13;
/**
 * The cone: its summit's middle, the crater rim's radius and height above the shore, the crater's
 * depth, and how far its slopes reach (longer east–west, where the island is longer).
 */
export const CONE = { x: -.06, z: .02, rim: .21, height: 1.15, crater: .15, reach: (angle: number) => 1.12 + .3 * Math.cos(angle) ** 2 };
/** The coves of black sand: where along the shore (angle about the cone's middle) and how wide (rad). */
const COVES = [{ angle: 1.35, width: .38 }, { angle: -2.2, width: .32 }];
/** The fresh lava flows down the cone: the direction each runs (angle) and how wide it spreads. */
const FLOWS = [{ angle: .55, width: .1 }, { angle: 2.75, width: .08 }, { angle: -1.2, width: .07 }];

const OUTLINE = (() => {
  const points = outlinePoints(10, SHAPE), polygon = new Float32Array(points.length * 2);
  points.forEach(([x, y], i) => { polygon[i * 2] = x; polygon[i * 2 + 1] = -y; });
  return polygon;
})();
const angleTo = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
/** How much (0..1) the shore at angle `a` is one of the black-sand coves. */
const cove = (a: number) => Math.max(...COVES.map((c) => smoothstep(c.width, c.width * .45, angleTo(a, c.angle))));
/** How much (0..1) a point at angle `a`, `r` from the cone's middle, lies on a fresh lava flow. */
const flow = (a: number, r: number) => Math.max(...FLOWS.map((f) => {
  const across = angleTo(a, f.angle + .25 * Math.sin(r * 4)) * r, width = f.width * (.5 + r);
  return smoothstep(width, width * .4, across) * smoothstep(CONE.rim * .9, CONE.rim * 1.4, r);
}));

/** The top of the shore at the outline: the rock rim, coming down to the sand in the coves. */
const shoreTop = (x: number, z: number) => TOP + .045 + (BEACH - TOP - .045) * cove(Math.atan2(z - CONE.z, x - CONE.x));

/** The cone's height above the shore at (x, z): steep, slightly concave slopes ribbed by gullies, a crater at the top. */
function coneAt(x: number, z: number) {
  const dx = x - CONE.x, dz = z - CONE.z, r = Math.hypot(dx, dz), a = Math.atan2(dz, dx);
  if (r < CONE.rim) return CONE.height - CONE.crater * (1 - (r / CONE.rim) ** 2) ** .8;
  const reach = CONE.reach(a), t = Math.max(0, (reach - r) / (reach - CONE.rim));
  const gullies = 1 + .16 * Math.sin(a * 11 + 2.2 * noise(r * 3, a * 2)) * smoothstep(.05, .45, t) * (1 - t * .6);
  return CONE.height * t ** 1.6 * gullies + .022 * flow(a, r);
}
/** The ground's height on the island at (x, z): the cone over a low shore, down to the sand in the coves. */
export function groundAt(x: number, z: number) {
  const inside = Math.max(0, -shoreDistance([OUTLINE], x, z)), a = Math.atan2(z - CONE.z, x - CONE.x);
  const beach = cove(a) * (1 - smoothstep(.15, .6, inside));
  const lumps = (Math.sin(x * 5.1 + 1.3) * Math.sin(z * 4.7 - .4) + Math.sin((x + z) * 7.3)) * .008;
  const ground = TOP + .045 + (coneAt(x, z) + lumps) * smoothstep(0, .4, inside);
  // In the coves the sand slopes gently down to the water's edge.
  return ground + (BEACH + inside * .35 - ground) * beach;
}

/**
 * The island's ground: the outline (a little wider than the shore rocks' top, covering it) filled
 * with facets over a jittered lattice, finer around the crater, following `groundAt`.
 */
function slopes(seed: number) {
  const contour = outlinePoints(8, SHAPE).map(([x, y]) => [x * 1.02, -y * 1.02] as const);
  const rim = new Float32Array(contour.flat());
  const step = .15, points: (readonly [number, number])[] = [...contour];
  for (let z = -1.9; z <= 1.9; z += step * .87) {
    for (let x = -2.5; x <= 2.5; x += step) {
      const px = x + (Math.round(z / step) % 2) * step / 2 + (hash(x * 7 + seed, z * 3) - .5) * step * .45, pz = z + (hash(z * 5, x * 9 + seed) - .5) * step * .45;
      if (Math.hypot(px - CONE.x, pz - CONE.z) < CONE.rim * 1.75) continue;
      if (-shoreDistance([rim], px, pz) > step * .5) points.push([px, pz]);
    }
  }
  // Rings about the summit, so the crater's rim is a crisp edge.
  for (const [r, count] of [[0, 1], [CONE.rim * .45, 7], [CONE.rim * .85, 12], [CONE.rim, 16], [CONE.rim * 1.3, 18]] as const) {
    for (let k = 0; k < count; k++) {
      const a = (k + .5 * (count % 2)) / count * Math.PI * 2;
      points.push([CONE.x + Math.cos(a) * r, CONE.z + Math.sin(a) * r]);
    }
  }
  const height = (i: number) => (i < contour.length ? shoreTop(points[i][0], points[i][1]) : groundAt(points[i][0], points[i][1]));
  const positions: number[] = [];
  for (const [a, b, c] of delaunay(points)) {
    const cx = (points[a][0] + points[b][0] + points[c][0]) / 3, cz = (points[a][1] + points[b][1] + points[c][1]) / 3;
    if (shoreDistance([rim], cx, cz) > 0) continue;
    for (const i of [a, c, b]) positions.push(points[i][0], height(i), points[i][1]);
  }
  const shade = new Color();
  return paintFaces(triangles(positions), (x, y, z, f) => {
    const dx = x - CONE.x, dz = z - CONE.z, r = Math.hypot(dx, dz), a = Math.atan2(dz, dx);
    const inside = -shoreDistance([OUTLINE], x, z), up = (y - TOP) / CONE.height, n = hash(f, 3.3);
    // Dark basalt low down, rust-red cinder and ash higher up, each in soft patches.
    const color = shade.copy(BASALT).lerp(BASALT_LIGHT, n * .5);
    const cinder = smoothstep(.25, .6, up + .25 * (noise(x * 3 + seed, z * 3) - .5));
    color.lerp(CINDER.clone().lerp(CINDER_LIGHT, hash(f, 1.7) * .7), cinder * .85);
    color.lerp(ASH, smoothstep(.6, .85, noise(x * 4.3 - 3, z * 4.3 + 1)) * .5 * (1 - cinder * .5));
    // A pale band of ash about the rim.
    color.lerp(ASH.clone().lerp(BASALT_LIGHT, n * .4), smoothstep(CONE.rim * 1.9, CONE.rim * 1.1, r) * .7);
    // Inside the crater: ash, sulphur-stained, darker toward the vent.
    if (r < CONE.rim * .95) color.copy(ASH).lerp(SULFUR, smoothstep(.55, .8, noise(a * 1.6 + 4, r * 9)) * .45).lerp(LAVA, smoothstep(CONE.rim * .6, 0, r) * .6);
    // Fresh lava flows, glossy black, running down from the rim.
    color.lerp(LAVA, flow(a, r) * .9);
    // Green scrub low on the sunny (south, +z) side, in patches; black sand in the coves.
    const scrub = smoothstep(.5, .68, noise(x * 2.6 + seed, z * 2.6) * .7 + noise(x * 6, z * 6) * .3) * smoothstep(.32, .05, up) * (.55 + .45 * smoothstep(-.4, .5, dz)) * smoothstep(.06, .2, inside);
    color.lerp(SCRUB.clone().lerp(SCRUB_LIGHT, hash(f, 5.1) * .6), scrub * .9 * (1 - flow(a, r)));
    color.lerp(SAND.clone().lerp(SAND_WET, smoothstep(.09, -.02, inside)), cove(a) * smoothstep(.55, .3, inside));
    return color.clone();
  });
}

/** A Galápagos tree cactus (Opuntia): a short bare trunk under a crown of flat oval pads. */
function cactus(x: number, z: number, size: number, seed: number) {
  const parts: BufferGeometry[] = [], shade = new Color(), ground = groundAt(x, z);
  const trunk = new CylinderGeometry(.016 * size, .024 * size, .13 * size, 5);
  trunk.translate(x, ground + .065 * size, z);
  parts.push(paintFaces(faces(trunk), () => BARK));
  for (let k = 0; k < 7; k++) {
    const pad = new IcosahedronGeometry(1, 0), a = k * 2.4 + seed, tier = k < 4 ? 0 : 1;
    pad.scale(.032 * size, .04 * size, .01 * size);
    pad.rotateZ((hash(seed, k) - .5) * .8);
    pad.rotateY(a);
    pad.translate(x + Math.cos(a) * .03 * size * (1 - tier * .4), ground + (.15 + .06 * tier) * size, z + Math.sin(a) * .03 * size * (1 - tier * .4));
    parts.push(paintFaces(faces(pad), (_x, _y, _z, f) => shade.copy(PAD).lerp(PAD_LIGHT, hash(f, k + seed)).clone()));
  }
  return parts;
}

/** A palo santo: a thin, pale trunk under a small, leafless, silvery-grey crown (the dry season's ghost forest). */
function paloSanto(x: number, z: number, size: number, seed: number) {
  const parts: BufferGeometry[] = [], shade = new Color(), ground = groundAt(x, z);
  const trunk = new CylinderGeometry(.006 * size, .01 * size, .09 * size, 4);
  trunk.translate(x, ground + .045 * size, z);
  parts.push(paintFaces(faces(trunk), () => PALO));
  for (let k = 0; k < 3; k++) {
    const crown = new IcosahedronGeometry(1, 0), a = k * 2.1 + seed, w = (.022 + .01 * hash(seed, k)) * size;
    crown.scale(w, w * .6, w);
    crown.translate(x + Math.cos(a) * .018 * size, ground + (.1 + .015 * k) * size, z + Math.sin(a) * .018 * size);
    parts.push(paintFaces(faces(crown), (_x, _y, _z, f) => shade.copy(PALO).lerp(PALO_LIGHT, hash(f, k + seed)).clone()));
  }
  return parts;
}
/** A grove of palo santo on the lower slopes about (x, z), clear of the lava flows and the coves. */
function grove(x: number, z: number, count: number, spread: number, seed: number) {
  const parts: BufferGeometry[] = [];
  for (let k = 0; k < count; k++) {
    const px = x + (hash(seed, k) - .5) * spread * 2, pz = z + (hash(k, seed) - .5) * spread * 1.4;
    const r = Math.hypot(px - CONE.x, pz - CONE.z), a = Math.atan2(pz - CONE.z, px - CONE.x);
    if (shoreDistance([OUTLINE], px, pz) > -.18 || flow(a, r) > .3 || cove(a) > .3) continue;
    parts.push(...paloSanto(px, pz, 1.3 + .5 * hash(seed + 3, k), seed * 13 + k));
  }
  return parts;
}

/**
 * Basalt columns: hexagonal prisms on a honeycomb, `rows` by `columns` about (x, z), turned `yaw`,
 * stepping down from `high` to `low` away from the shore (toward `out`, an angle) like a causeway.
 */
function columns(x: number, z: number, rows: number, cols: number, size: number, yaw: number, high: number, low: number, seed: number) {
  const parts: BufferGeometry[] = [], shade = new Color();
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      if (hash(i + seed, j) < .12) continue;
      const u = (j + (i % 2) * .5 - cols / 2) * size * 1.73, v = (i - rows / 2) * size * 1.5;
      const px = x + u * Math.cos(yaw) - v * Math.sin(yaw), pz = z + u * Math.sin(yaw) + v * Math.cos(yaw);
      const t = j / Math.max(1, cols - 1), top = high + (low - high) * t + (hash(i, j + seed) - .5) * .06;
      const column = new CylinderGeometry(size, size, top - FOOT, 6);
      column.rotateY(yaw + Math.PI / 6);
      column.translate(px, (top + FOOT) / 2, pz);
      parts.push(paintFaces(faces(column), (_x, fy, _z, f) => {
        const n = hash(f, i * 7 + j);
        // The flat tops weather paler than the dark sides.
        return shade.copy(fy > top - .002 ? TOPS : fy < -.16 ? ROCKS.wet : BASALT).lerp(fy > top - .002 ? ASH : LAVA, n * .5).clone();
      }));
    }
  }
  return parts;
}

/** Black boulders along the waterline, except in the coves; and the pinnacle, a lone spire off the west point. */
function shoreRocks(seed: number) {
  const points = outlinePoints(6, SHAPE), parts: BufferGeometry[] = [];
  points.forEach(([px, py], i) => {
    if (hash(i, seed) < .3 || cove(Math.atan2(-py - CONE.z, px - CONE.x)) > .2) return;
    const [qx, qy] = points[(i + 1) % points.length];
    const nx = qy - py, nz = qx - px, length = Math.hypot(nx, nz) || 1;
    const out = .05 + .07 * hash(i, 2.2), x = px + nx / length * out, z = -py + nz / length * out;
    const s = .045 + .06 * hash(i, 4.4);
    parts.push(boulder(ROCKS, x, FOOT + .07 + s * .2, z, s, s * .65, s * .85, hash(i, 6.6) * 3, i * 3.7));
  });
  // The pinnacle: a tall, eroded spire of tuff leaning a little, two smaller rocks at its foot.
  const spire = new IcosahedronGeometry(1, 1);
  const position = spire.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i), k = .6 + .4 * hash(Math.round(x * 9), Math.round(y * 9) + Math.round(z * 9));
    // Narrowing upward to a blunt point.
    const taper = 1 - .72 * smoothstep(-.6, 1, y);
    position.setXYZ(i, x * taper * k, y, z * taper * k);
  }
  spire.scale(.2, .52, .17);
  spire.rotateZ(-.12);
  spire.translate(-2.02, FOOT + .44, .5);
  parts.push(paintFaces(faces(spire), (_x, fy, _z, f) => new Color().copy(fy < -.12 ? ROCKS.wet : CINDER).lerp(fy < -.12 ? BASALT : BASALT_LIGHT, hash(f, 9.1) * .8)));
  parts.push(boulder(ROCKS, -1.84, FOOT + .1, .62, .08, .07, .07, 1, 21), boulder(ROCKS, -2.12, FOOT + .08, .33, .06, .05, .06, 2, 23));
  return parts;
}

/** Everything solid of the Volcanic Pinnacle's island in one mesh (it never moves). */
export function VolcanicCoast({ level }: { level: number }) {
  const mesh = useMemo(() => {
    const parts: BufferGeometry[] = [
      cliffs(ROCKS, FOOT, TOP, 1, 0, 0, 0, (x, z) => shoreTop(x, z) - .05, SHAPE),
      slopes(1),
      ...grove(-1.22, -.12, 9, .38, 1), ...grove(1.15, -.42, 8, .38, 2), ...grove(1.08, .3, 5, .26, 3), ...grove(-.26, -.92, 6, .42, 4),
      ...cactus(-.7, .8, 1.8, 1), ...cactus(-.4, 1, 1.5, 2), ...cactus(.36, .94, 1.7, 3), ...cactus(-1.12, .46, 1.4, 4), ...cactus(1, .64, 1.4, 5),
      // The causeway on the east point, and a stack of columns off the north shore.
      ...columns(1.72, .08, 6, 7, .068, -.25, TOP + .17, -.17, 1),
      ...columns(.72, -1.6, 3, 4, .06, .4, TOP + .12, -.06, 2),
      ...shoreRocks(1),
      // From level 5 the islets (island-outline.ts) rise as low lava rocks capped with columns.
      ...islets(level, SHAPE).flatMap(({ position: [x, z], scale }, i) => [cliffs(ROCKS, FOOT, TOP, scale, x, z, 7 + i, undefined, SHAPE), ...columns(x, z, 3, 3, .05 * scale * 2.5, i, TOP + .08, TOP - .02, 5 + i)]),
    ];
    const geometry = mergeGeometries(parts);
    parts.forEach((part) => part.dispose());
    geometry.computeVertexNormals();
    const mesh = new Mesh(geometry, new MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    mesh.name = 'volcanic-coast';
    mesh.raycast = () => {};
    return mesh;
  }, [level]);
  useEffect(() => () => { mesh.geometry.dispose(); (mesh.material as MeshLambertMaterial).dispose(); }, [mesh]);
  return <>
    <primitive object={mesh} />
    <Vent />
    <Currents />
  </>;
}

/** The vent in the crater floor: a dull glow of hot rock (unlit, so it shows), and the steam rising from it. */
function Vent() {
  const glow = useMemo(() => {
    const geometry = new IcosahedronGeometry(1, 1);
    geometry.scale(CONE.rim * .42, .02, CONE.rim * .42);
    geometry.translate(CONE.x, TOP + .03 + CONE.height - CONE.crater - .008, CONE.z);
    const mesh = new Mesh(paintFaces(faces(geometry), (x, _y, z, f) => new Color('#E0642C').lerp(new Color('#7A2A1B'), Math.min(1, Math.hypot(x - CONE.x, z - CONE.z) / (CONE.rim * .42) * .9 + hash(f, 2) * .25))), new MeshBasicMaterial({ vertexColors: true }));
    mesh.raycast = () => {};
    return mesh;
  }, []);
  useEffect(() => () => { glow.geometry.dispose(); (glow.material as MeshBasicMaterial).dispose(); }, [glow]);
  return <>
    <primitive object={glow} />
    <Steam />
  </>;
}

/** Puffs of steam: each rises from the vent, swelling and thinning as the wind carries it off, then starts again (half as many, coarser, in lite quality). */
export const STEAM = { puffs: 8, period: 10, rise: .95, drift: [.7, -.25] as const, size: [.07, .34] as const, opacity: .55 };
function Steam() {
  const ocean = useContext(OceanContext);
  const group = useRef<Group>(null);
  const lite = useSceneQuality() === 'lite';
  const puffs = useMemo(() => Array.from({ length: lite ? STEAM.puffs / 2 : STEAM.puffs }, (_, i) => {
    const mesh = new Mesh(new IcosahedronGeometry(1, lite ? 0 : 1), new MeshLambertMaterial({ color: '#F4F2EE', transparent: true, depthWrite: false, emissive: '#5A5A5A' }));
    mesh.raycast = () => {};
    mesh.renderOrder = 2;
    mesh.userData.seed = i * 1.618;
    return mesh;
  }), [lite]);
  useEffect(() => () => puffs.forEach((p) => { p.geometry.dispose(); (p.material as MeshLambertMaterial).dispose(); }), [puffs]);
  useFrame(() => {
    // The island's water clock, so the steam stills when the scene does.
    const time = ocean?.uOceanTime.value ?? 0, base = TOP + .03 + CONE.height - CONE.crater;
    puffs.forEach((puff, i) => {
      const p = (time / STEAM.period + i / puffs.length) % 1, seed = puff.userData.seed as number;
      const wobble = Math.sin(time * .7 + seed * 3) * .03 * p;
      puff.position.set(CONE.x + STEAM.drift[0] * p * p + wobble, base + STEAM.rise * (1 - (1 - p) ** 1.6), CONE.z + STEAM.drift[1] * p * p + wobble * .5);
      const s = STEAM.size[0] + (STEAM.size[1] - STEAM.size[0]) * p;
      puff.scale.set(s * (1 + .2 * Math.sin(seed)), s * .75, s);
      (puff.material as MeshLambertMaterial).opacity = STEAM.opacity * smoothstep(0, .12, p) * (1 - p) ** 1.3;
    });
  });
  return <group ref={group}>{puffs.map((puff, i) => <primitive key={i} object={puff} />)}</group>;
}

/**
 * The current sweeping past the island: faint lines of foam on the water along its flow, bending
 * round the island as a stream bends round a stone (potential flow past a circle of `radius`),
 * dashes of foam drifting downstream on the island's water clock and riding the waves. `offsets`
 * are the lines' distances from the island's middle across the flow.
 */
export const CURRENT = { angle: 2.75, speed: .1, radius: 1.85, offsets: [-3, -2.05, -1.25, 1.2, 2, 2.95], reach: 7, width: .055, strength: .24 };

/** Points along one streamline, `offset` across the flow, in the island's frame (x, z), and how far along it each is. */
function streamline(offset: number, samples = 48) {
  const { radius: R, reach, angle } = CURRENT, cos = Math.cos(angle), sin = Math.sin(angle);
  const points: [number, number, number][] = [];
  let along = 0, last: [number, number] | null = null;
  for (let i = 0; i <= samples; i++) {
    const u = -reach + 2 * reach * i / samples;
    // The stream function of uniform flow past a circle: v - R²v/(u² + v²) = offset, solved for v.
    let v = offset + Math.sign(offset) * R * .5;
    for (let k = 0; k < 12; k++) {
      const f = v - R * R * v / (u * u + v * v) - offset, h = 1e-4;
      const d = (v + h - R * R * (v + h) / (u * u + (v + h) ** 2) - offset - f) / h;
      v -= f / d;
    }
    const x = u * cos - v * sin, z = u * sin + v * cos;
    if (last) along += Math.hypot(x - last[0], z - last[1]);
    points.push([x, z, along]);
    last = [x, z];
  }
  return points;
}

function Currents() {
  const ocean = useContext(OceanContext);
  const lite = useSceneQuality() === 'lite';
  const mesh = useMemo(() => {
    const positions: number[] = [], extra: number[] = [], indices: number[] = [];
    CURRENT.offsets.forEach((offset, line) => {
      const points = streamline(offset), length = points[points.length - 1][2], seed = hash(line, 4.2);
      points.forEach(([x, z, along], i) => {
        const [nx, nz] = points[Math.min(points.length - 1, i + 1)], [px, pz] = points[Math.max(0, i - 1)];
        const dx = nx - px, dz = nz - pz, n = Math.hypot(dx, dz) || 1;
        for (const side of [-1, 1]) {
          positions.push(x - dz / n * side * CURRENT.width / 2, 0, z + dx / n * side * CURRENT.width / 2);
          // How far along (units), which side, how near an end (0 at either end, 1 in the middle), the line's own phase.
          extra.push(along, side, Math.min(1, Math.min(along, length - along) / (length * .25)), seed);
        }
        if (i > 0) { const b = positions.length / 3 - 4; indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
      });
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aCurrent', new Float32BufferAttribute(extra, 4));
    geometry.setIndex(indices);
    const material = new ShaderMaterial({
      // The ocean's own uniforms (shared, so the waves and clock follow it), and the foam's.
      uniforms: { ...(ocean ?? {}), uCurrent: { value: new Color('#F4F9FC') }, uCurrentFlow: { value: new Vector2(CURRENT.speed, CURRENT.strength) } },
      transparent: true, depthWrite: false,
      vertexShader: `${OCEAN_SHADER_CHUNKS.waves}
        uniform float uOceanSurface;
        attribute vec4 aCurrent;
        varying vec4 vCurrent;
        varying float vClipY;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          ${lite ? 'world.y = uOceanSurface + .008;' : 'vec3 wave = oceanWave(world.xz); world.xz += wave.xz; world.y = uOceanSurface + wave.y + .008;'}
          gl_Position = projectionMatrix * viewMatrix * world;
          vCurrent = aCurrent;
          vClipY = gl_Position.y / gl_Position.w;
        }`,
      fragmentShader: `
        uniform float uOceanTime; uniform vec2 uOceanEdge; uniform vec3 uCurrent; uniform vec2 uCurrentFlow;
        varying vec4 vCurrent;
        varying float vClipY;
        void main() {
          // Dashes of foam drifting downstream, soft across the line, fading at its ends and toward the view's hazy edges.
          float f = fract(vCurrent.x * .45 - uOceanTime * uCurrentFlow.x + vCurrent.w);
          float dash = smoothstep(0.0, .12, f) * (1.0 - smoothstep(.26, .42, f));
          float across = 1.0 - abs(vCurrent.y);
          float edge = 1.0 - smoothstep(uOceanEdge.x, uOceanEdge.y, abs(vClipY));
          gl_FragColor = vec4(uCurrent, dash * smoothstep(0.0, .6, across + .4) * vCurrent.z * edge * uCurrentFlow.y);
        }`,
    });
    const mesh = new Mesh(geometry, material);
    mesh.name = 'volcanic-currents';
    mesh.renderOrder = 2;
    mesh.frustumCulled = false;
    mesh.raycast = () => {};
    return mesh;
  }, [ocean, lite]);
  useEffect(() => () => { mesh.geometry.dispose(); (mesh.material as ShaderMaterial).dispose(); }, [mesh]);
  return <primitive object={mesh} />;
}
