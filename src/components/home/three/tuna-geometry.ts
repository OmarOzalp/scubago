import { BufferGeometry, Color, Float32BufferAttribute, Vector3 } from 'three';

/**
 * A low-poly tuna for the school, built once at runtime (a few hundred triangles, vertex colors,
 * no textures): a spindle-shaped body with a pointed snout, a slender keeled tail stock, a deeply
 * forked crescent tail, sickle second dorsal and anal fins, long slim pectorals and small finlets.
 * Metallic blue-gray above, a pale iridescent band along the flank, silver below.
 *
 * Model space matches the other species: snout at z = +0.5, tail tips at z = -0.5, +X on the
 * fish's left, Y up. The school's shader sways everything behind the middle (see school-material.ts).
 *
 * `lite` (software-rendered GPUs, where every small triangle costs) builds about half the
 * triangles: six sides and fewer rings, no finlets or eyes, which are too small to see there anyway.
 */

const BACK = new Color('#1c3048'), UPPER = new Color('#2f4c6c'), BAND = new Color('#8fa7b8');
const LOWER = new Color('#c3ced4'), BELLY = new Color('#e6ebed'), FIN = new Color('#243a50');
const FINLET = new Color('#b8a55a'), EYE = new Color('#0b1016');

/** Body stations along the fish: z, half-height above and below the midline, half-width, midline height. */
const STATIONS: readonly (readonly [number, number, number, number, number])[] = [
  [.44, .036, .033, .031, -.004],
  [.35, .08, .075, .064, -.002],
  [.23, .115, .108, .089, 0],
  [.09, .126, .12, .095, 0],
  [-.05, .108, .102, .08, 0],
  [-.17, .07, .066, .052, 0],
  [-.27, .034, .032, .028, 0],
  [-.34, .018, .018, .026, 0],
  [-.39, .024, .024, .012, 0],
];
/** The stations the lite body keeps. */
const LITE_STATIONS = [0, 2, 3, 4, 5, 7];

export function createTunaGeometry(lite = false) {
  const SIDES = lite ? 6 : 8;
  const stations = lite ? LITE_STATIONS.map((k) => STATIONS[k]) : STATIONS;
  const positions: number[] = [], colors: number[] = [], normals: number[] = [];
  const add = (p: Vector3, color: Color) => {
    positions.push(p.x, p.y, p.z);
    colors.push(color.r, color.g, color.b);
    normals.push(0, 0, 0);
    return positions.length / 3 - 1;
  };
  const point = (i: number) => new Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
  const smooth: number[] = [];
  const flat: number[] = [];

  // --- Body: rings of eight around an elliptical section, closed at the snout and tail base ---
  const shade = (height: number) => {
    // Metallic blue over the whole upper body, a pale band just below the midline, silver beneath:
    // from above the school reads dark blue, and flashes silver as fish roll into their turns.
    const t = height;
    if (t > .3) return BACK.clone().lerp(UPPER, (1 - t) / .7);
    if (t > -.2) return UPPER.clone().lerp(BAND, (.3 - t) / .5);
    if (t > -.55) return BAND.clone().lerp(LOWER, (-.2 - t) / .35);
    return LOWER.clone().lerp(BELLY, Math.min(1, (-.55 - t) / .45));
  };
  const rings = stations.map(([z, top, bottom, width, mid]) => Array.from({ length: SIDES }, (_, k) => {
    const a = Math.PI * 2 * k / SIDES, up = Math.cos(a);
    const p = new Vector3(width * Math.sin(a), mid + (up >= 0 ? top : bottom) * up, z);
    return add(p, shade(up));
  }));
  const snout = add(new Vector3(0, -.006, .5), UPPER);
  const tailBase = add(new Vector3(0, 0, -.405), FIN);
  for (let r = 0; r < rings.length - 1; r++) {
    for (let k = 0; k < SIDES; k++) {
      const k1 = (k + 1) % SIDES;
      smooth.push(rings[r][k], rings[r + 1][k1], rings[r + 1][k], rings[r][k], rings[r][k1], rings[r + 1][k1]);
    }
  }
  for (let k = 0; k < SIDES; k++) {
    const k1 = (k + 1) % SIDES;
    smooth.push(snout, rings[0][k1], rings[0][k]);
    smooth.push(tailBase, rings[rings.length - 1][k], rings[rings.length - 1][k1]);
  }

  // --- Fins: thin single surfaces (the material is double-sided) ---
  const fan = (points: [number, number, number][], color: Color) => {
    const ids = points.map(([x, y, z]) => add(new Vector3(x, y, z), color));
    for (let i = 1; i < ids.length - 1; i++) flat.push(ids[0], ids[i], ids[i + 1]);
  };
  const top = (z: number) => {
    // Body top at z, interpolated between stations.
    for (let i = 0; i < STATIONS.length - 1; i++) {
      const [z0, t0] = STATIONS[i], [z1, t1] = STATIONS[i + 1];
      if (z <= z0 && z >= z1) return t0 + (t1 - t0) * (z0 - z) / (z0 - z1);
    }
    return .02;
  };
  // Crescent tail: two narrow swept lobes meeting at the fork.
  for (const s of [1, -1]) {
    fan([[0, s * .012, -.385], [0, s * .1, -.43], [0, s * .215, -.505], [0, s * .12, -.46], [0, s * .02, -.425]], FIN);
  }
  // First dorsal (low), second dorsal and anal fins (tall sickles), just ahead of the finlets.
  fan([[0, top(.2) - .01, .2], [0, top(.14) + .038, .1], [0, top(.06) - .005, .06]], FIN);
  fan([[0, top(.02) - .01, .02], [0, top(-.06) + .095, -.1], [0, top(-.07) - .005, -.07]], FIN);
  fan([[0, -top(.0) + .01, .0], [0, -top(-.07) - .088, -.11], [0, -top(-.08) + .005, -.08]], FIN);
  // Long, slim pectorals swept back along the flanks.
  for (const s of [1, -1]) fan([[s * .084, .01, .22], [s * .128, -.014, .03], [s * .09, -.012, .17]], FIN);
  if (!lite) {
    // Finlets: small yellow flags along the tail stock, above and below.
    for (let i = 0; i < 5; i++) {
      const z = -.15 - i * .045, h = top(z);
      fan([[0, h - .004, z + .012], [0, h + .024, z - .012], [0, h - .004, z - .018]], FINLET);
      fan([[0, -h + .004, z + .012], [0, -h - .022, z - .012], [0, -h + .004, z - .018]], FINLET);
    }
    // Small dark eyes, standing just proud of the skin.
    for (const s of [1, -1]) fan([[s * .047, .018, .415], [s * .047, .002, .4], [s * .052, .014, .392]], EYE);
  }

  // Smooth normals on the body, one normal per fin triangle.
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), n = new Vector3();
  const accumulate = (list: number[], perFace: boolean) => {
    for (let i = 0; i < list.length; i += 3) {
      a.copy(point(list[i])); b.copy(point(list[i + 1])); c.copy(point(list[i + 2]));
      n.subVectors(b, a).cross(c.sub(a));
      for (const v of [list[i], list[i + 1], list[i + 2]]) {
        if (perFace) { const u = n.clone().normalize(); normals.splice(v * 3, 3, u.x, u.y, u.z); }
        else { normals[v * 3] += n.x; normals[v * 3 + 1] += n.y; normals[v * 3 + 2] += n.z; }
      }
    }
  };
  accumulate(smooth, false);
  accumulate(flat, true);
  for (let v = 0; v < normals.length; v += 3) {
    const length = Math.hypot(normals[v], normals[v + 1], normals[v + 2]) || 1;
    normals[v] /= length; normals[v + 1] /= length; normals[v + 2] /= length;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex([...smooth, ...flat]);
  geometry.computeBoundingSphere();
  return geometry;
}
