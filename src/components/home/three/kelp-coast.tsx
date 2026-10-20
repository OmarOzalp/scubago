import { useEffect, useMemo } from 'react';
import { type BufferGeometry, Color, IcosahedronGeometry, Mesh, MeshLambertMaterial } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { islets, outlinePoints, shoreDistance } from '@/lib/island-outline';
import { smoothstep } from '@/lib/steering';
import { boulder, cliffs, delaunay, faces, hash, noise, paintFaces, triangles } from './coast-geometry';

/**
 * The Kelp Forest's island: a rugged headland of dark rock on a cold coast, like the granite of
 * Point Lobos. Low cliffs and a skirt of wave-washed boulders where the sandy island has its beach,
 * a low hill of sun-dried golden grass with darker patches of coastal scrub and bare rock showing
 * through, a few wind-shaped Monterey cypress leaning away from the sea wind, and sea stacks standing
 * in the water off its points. Drawn in the island group's coordinates (scaled with the level, like
 * the sandy island).
 */
const ROCK_WET = new Color('#4A463E'), ROCK = new Color('#6B6457'), ROCK_LIGHT = new Color('#8A8372');
const GRASS = new Color('#928A5A'), GRASS_DRY = new Color('#A69C66'), SCRUB = new Color('#66744B'), SCRUB_DARK = new Color('#54633F');
const CYPRESS = new Color('#3B5536'), CYPRESS_LIGHT = new Color('#4E6B44'), TRUNK = new Color('#4A3F33');
/** The cliffs' foot (below the water surface, so the waves wash it) and top. */
const FOOT = -.26, TOP = .07;

const ROCKS = { wet: ROCK_WET, rock: ROCK, light: ROCK_LIGHT };
/** The Kelp Forest's own island: a long headland with a bay on its south side (island-outline.ts). */
const SHAPE = 'kelp';

/** The outline in the island group's ground plane (x, z), for distances from the cliff edge. */
const OUTLINE = (() => {
  const points = outlinePoints(10, SHAPE), polygon = new Float32Array(points.length * 2);
  points.forEach(([x, y], i) => { polygon[i * 2] = x; polygon[i * 2 + 1] = -y; });
  return polygon;
})();
/** Where the headland's hill rises highest (on its western end, behind the bay), how high above the cliff top, and how far it spreads (units). */
const HILL = { x: -1.2, z: -.4, height: .24, radius: 2.2 };
/** The ground's height on top of the headland at (x, z): a low hill rising from the cliff edge, a little uneven. */
function groundAt(x: number, z: number) {
  const inside = Math.max(0, -shoreDistance([OUTLINE], x, z));
  const rise = Math.max(0, 1 - Math.hypot(x - HILL.x, z - HILL.z) / HILL.radius) ** 1.4;
  const lumps = (Math.sin(x * 4.1 + 1.3) * Math.sin(z * 3.7 - .4) + Math.sin((x + z) * 6.3)) * .012;
  return TOP + .045 + (HILL.height * rise + lumps) * smoothstep(0, .45, inside);
}

/** The headland's rock walls (coast-geometry.ts); `scale` and the offset place an islet. */
const headland = (scale = 1, ox = 0, oz = 0, seed = 0) => cliffs(ROCKS, FOOT, TOP, scale, ox, oz, seed, undefined, SHAPE);

/**
 * The headland's top: the outline (a little wider than the cliffs' top, covering it) filled with
 * evenly spread facets over a jittered lattice of points, following `groundAt`. Sun-dried golden
 * grass, darker patches of coastal scrub, and bare rock showing at the cliff edge and in outcrops.
 */
function hilltop(seed: number) {
  const contour = outlinePoints(8, SHAPE).map(([x, y]) => [x * 1.02, -y * 1.02] as const);
  const rim = new Float32Array(contour.flat());
  const step = .19, points: (readonly [number, number])[] = [...contour];
  for (let z = -1.9; z <= 1.9; z += step * .87) {
    for (let x = -3; x <= 3; x += step) {
      const px = x + (Math.round(z / step) % 2) * step / 2 + (hash(x * 7 + seed, z * 3) - .5) * step * .45, pz = z + (hash(z * 5, x * 9 + seed) - .5) * step * .45;
      if (-shoreDistance([rim], px, pz) > step * .5) points.push([px, pz]);
    }
  }
  const height = (i: number) => (i < contour.length ? TOP + .045 : groundAt(points[i][0], points[i][1]));
  const positions: number[] = [];
  for (const [a, b, c] of delaunay(points)) {
    // Only inside the outline (Delaunay also bridges its bays).
    const cx = (points[a][0] + points[b][0] + points[c][0]) / 3, cz = (points[a][1] + points[b][1] + points[c][1]) / 3;
    if (shoreDistance([rim], cx, cz) > 0) continue;
    // Counter-clockwise in (x, z) faces down once z is the scene's depth: reverse for an upward face.
    for (const i of [a, c, b]) positions.push(points[i][0], height(i), points[i][1]);
  }
  const shade = new Color();
  return paintFaces(triangles(positions), (x, y, z, f) => {
    // Scrub in soft-edged patches (thicker in the hollows, lee of the hill), bare rock at the cliff
    // edge and in outcrops, each fading into the grass rather than stopping at a line.
    const scrub = noise(x * 2.2 + seed, z * 2.2 - seed) * .75 + noise(x * 5, z * 5) * .25, inside = -shoreDistance([OUTLINE], x, z);
    const outcrop = noise(x * 3.3 - 7, z * 3.3 + 4);
    const color = shade.copy(GRASS).lerp(GRASS_DRY, Math.min(1, hash(f, 3.3) * .3 + (y - TOP) * 2.5));
    color.lerp(SCRUB_DARK.clone().lerp(SCRUB, hash(f, 2.2) * .5), smoothstep(.5, .68, scrub) * .9);
    color.lerp(ROCK.clone().lerp(ROCK_LIGHT, hash(f, 1.1) * .6), Math.max(smoothstep(.1, .03, inside), smoothstep(.76, .9, outcrop) * .85));
    return color.clone();
  });
}

/** A Monterey cypress: a short, leaning trunk under a broad, flat-topped, wind-sheared crown of a few dark masses. */
function cypress(x: number, z: number, size: number, lean: number, seed: number) {
  const parts: BufferGeometry[] = [], shade = new Color(), ground = groundAt(x, z);
  const trunk = new IcosahedronGeometry(1, 0);
  trunk.scale(.025 * size, .14 * size, .025 * size);
  trunk.rotateZ(lean * .5);
  trunk.translate(x - lean * .05 * size, ground + .1 * size, z);
  parts.push(paintFaces(faces(trunk), () => TRUNK));
  // The crown: overlapping flattened masses swept to the lee side.
  for (let k = 0; k < 4; k++) {
    const mass = new IcosahedronGeometry(1, 0);
    const w = (.13 + .05 * hash(seed, k)) * size;
    mass.scale(w, w * .38, w * .8);
    mass.rotateY(hash(seed, k + 9) * 3);
    mass.translate(x - lean * (.05 + .08 * k) * size + (hash(seed, k + 3) - .5) * .06 * size, ground + (.2 + .05 * (k % 2)) * size, z + (hash(seed, k + 5) - .5) * .12 * size);
    parts.push(paintFaces(faces(mass), (_x, y, _z, f) => shade.copy(CYPRESS).lerp(CYPRESS_LIGHT, hash(f, k + seed) * .6 + (y > ground + .22 * size ? .3 : 0)).clone()));
  }
  return parts;
}

/**
 * Boulders along the waterline and sea stacks off the points: island-group coordinates from the
 * outline itself, so they follow the shore.
 */
function shoreRocks(seed: number) {
  const points = outlinePoints(6, SHAPE), parts: BufferGeometry[] = [];
  points.forEach(([px, py], i) => {
    if (hash(i, seed) < .35) return;
    const [qx, qy] = points[(i + 1) % points.length];
    const nx = qy - py, nz = qx - px, length = Math.hypot(nx, nz) || 1;
    // Just outside the cliff foot, a little way into the water.
    const out = .05 + .07 * hash(i, 2.2), x = px + nx / length * out, z = -py + nz / length * out;
    const s = .05 + .06 * hash(i, 4.4);
    parts.push(boulder(ROCKS, x, FOOT + .06 + s * .2, z, s, s * .7, s * .85, hash(i, 6.6) * 3, i * 3.7));
  });
  // Sea stacks: tall rocks standing off the headland's points and in the mouth of its bay, their tops well clear of the water.
  for (const [x, z, s, h] of [[2.32, .78, .17, .34], [-1.95, -1.55, .14, .28], [-3.05, .15, .1, .22], [.3, 1.35, .12, .26]] as const) {
    parts.push(boulder(ROCKS, x, FOOT + h * .5, z, s, h, s * .85, x * 3, x * 11));
    parts.push(boulder(ROCKS, x + s * .9, FOOT + .02, z - s * .4, s * .5, s * .4, s * .45, z, z * 7));
  }
  return parts;
}

/** Everything of the Kelp Forest's island in one mesh (it never moves): rock, hill, cypress, boulders, stacks. */
export function KelpCoast({ level }: { level: number }) {
  const mesh = useMemo(() => {
    const parts: BufferGeometry[] = [
      headland(),
      hilltop(1),
      // A grove on the hill at the western end, and a few more along the headland.
      ...cypress(-1.55, -.25, 1.7, .9, 1), ...cypress(-1.1, -.7, 1.5, .9, 2), ...cypress(-.7, -.2, 1.3, .9, 3),
      ...cypress(-2.1, .15, 1.1, .9, 6), ...cypress(.85, -.45, 1.25, .9, 4), ...cypress(1.6, -.55, 1, .9, 5),
      ...shoreRocks(1),
      // From level 5 the islets (island-outline.ts) rise as rocky skerries.
      ...islets(level, SHAPE).map(({ position: [x, z], scale }, i) => headland(scale, x, z, 7 + i)),
    ];
    const geometry = mergeGeometries(parts);
    parts.forEach((part) => part.dispose());
    geometry.computeVertexNormals();
    const mesh = new Mesh(geometry, new MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    mesh.name = 'kelp-coast';
    mesh.raycast = () => {};
    return mesh;
  }, [level]);
  useEffect(() => () => { mesh.geometry.dispose(); (mesh.material as MeshLambertMaterial).dispose(); }, [mesh]);
  return <primitive object={mesh} />;
}
