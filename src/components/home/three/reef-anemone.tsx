import { useContext, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, Color, Float32BufferAttribute, Mesh, MeshLambertMaterial, Vector3 } from 'three';
import { REEF_ANEMONE, reefRocks, type ReefRock } from '@/lib/reef-life';
import { OceanContext } from './ocean-context';
import { useSceneQuality } from './scene-quality';
import { FLOOR_BIAS, prepareUnderwater } from './underwater-material';

/** A magnificent sea anemone: a purple column under a dense crown of finger-like tentacles, sand-colored with green-gold tips. */
const COLUMN = new Color('#b0307e'), DISC = new Color('#c98a6a'), TENTACLE = new Color('#efc47e'), TIP = new Color('#a8dc48');
/** How far a tentacle tip sways (units) in the swell. */
const SWAY = .022;
const hash = (a: number, b: number) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };

/**
 * One anemone's geometry at (x, floor, z): a short flared column and oral disc, then rings of
 * tapering tentacles leaning out and curling over. Each vertex also gets how much it sways (0 at a
 * tentacle's root, 1 at its tip) and its tentacle's phase.
 */
function anemone(rock: ReefRock, seed: number, rings: readonly number[]) {
  const positions: number[] = [], colors: number[] = [], sway: number[] = [], phase: number[] = [], index: number[] = [];
  const add = (p: Vector3, color: Color, weight = 0, ph = 0) => {
    positions.push(p.x, p.y, p.z); colors.push(color.r, color.g, color.b); sway.push(weight); phase.push(ph);
    return positions.length / 3 - 1;
  };
  const { x, z, floor } = rock;
  // The column: from just under the sand up to the oral disc, flaring out at the top.
  const sides = 14, bottom: number[] = [], top: number[] = [];
  for (let k = 0; k < sides; k++) {
    const a = k / sides * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    bottom.push(add(new Vector3(x + c * .22, floor - .04, z + s * .22), COLUMN));
    top.push(add(new Vector3(x + c * .3, floor + .035, z + s * .3), COLUMN.clone().lerp(DISC, .3)));
  }
  const middle = add(new Vector3(x, floor + .05, z), DISC);
  for (let k = 0; k < sides; k++) {
    const n = (k + 1) % sides;
    index.push(bottom[k], top[k], top[n], bottom[k], top[n], bottom[n], middle, top[n], top[k]);
  }
  // Tentacles in rings, inner ones shorter and more upright, outer ones leaning out over the sand.
  const radius = REEF_ANEMONE.radius - .06;
  rings.forEach((count, r) => {
    const out = rings.length > 1 ? r / (rings.length - 1) : 1;
    for (let i = 0; i < count; i++) {
      const id = seed * 100 + r * 31 + i;
      const a = (i + .5 * (r % 2) + .3 * hash(id, 1)) / count * Math.PI * 2, ux = Math.cos(a), uz = Math.sin(a);
      const base = new Vector3(x + ux * (.05 + (radius - .1) * out), floor + .035 - .015 * out, z + uz * (.05 + (radius - .1) * out));
      const length = REEF_ANEMONE.height * (.6 + .25 * hash(id, 2)) * (.8 + .3 * out), lean = .15 + .5 * out, ph = hash(id, 3) * Math.PI * 2;
      // Rising, then curling over at the tip like a finger.
      const point = (t: number) => base.clone().add(new Vector3(ux * (lean * t + .35 * t * t) * length, (1 - .55 * out * t * t) * t * length, uz * (lean * t + .35 * t * t) * length));
      const rows: number[][] = [];
      for (let j = 0; j < 4; j++) {
        const t = j / 4, c = point(t), w = .032 * (1 - .45 * t);
        const color = TENTACLE.clone().lerp(TIP, Math.min(1, Math.max(0, (t - .5) / .4)));
        // A round finger: four sides around the line out from the middle.
        rows.push([0, 1, 2, 3].map((k) => {
          const b = k / 4 * Math.PI * 2;
          return add(c.clone().add(new Vector3(-uz * Math.cos(b) * w, Math.sin(b) * w, ux * Math.cos(b) * w)), color, t ** 1.6, ph);
        }));
      }
      const tip = add(point(1), TIP, 1, ph);
      for (let j = 0; j < 3; j++) {
        for (let k = 0; k < 4; k++) {
          const n = (k + 1) % 4;
          index.push(rows[j][k], rows[j + 1][k], rows[j + 1][n], rows[j][k], rows[j + 1][n], rows[j][n]);
        }
      }
      for (let k = 0; k < 4; k++) index.push(rows[3][k], tip, rows[3][(k + 1) % 4]);
    }
  });
  return { positions, colors, sway, phase, index };
}

/**
 * The anemones clownfish live in (reef-life.ts), drawn only while they are on the island, as one
 * mesh. They sit on the seabed at this level, set back in depth like the animals on the bottom, and
 * their tentacles sway gently in the swell (moved on the CPU: a few hundred vertices).
 */
export function ReefAnemones({ level, count }: { level: number; count: number }) {
  const ocean = useContext(OceanContext);
  const lite = useSceneQuality() === 'lite';
  const view = useMemo(() => {
    const homes = reefRocks(level, 0, 0, count).anemones;
    const rings = lite ? [8, 14, 18] : [10, 16, 20, 24];
    const parts = homes.map((rock, i) => anemone(rock, i + 1, rings));
    const offset = parts.reduce<number[]>((acc, part, i) => [...acc, (acc[i] ?? 0) + part.positions.length / 3], [0]);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(parts.flatMap((p) => p.positions), 3));
    geometry.setAttribute('color', new Float32BufferAttribute(parts.flatMap((p) => p.colors), 3));
    geometry.setIndex(parts.flatMap((p, i) => p.index.map((v) => v + offset[i])));
    geometry.computeVertexNormals();
    const material = new MeshLambertMaterial({ vertexColors: true });
    const mesh = new Mesh(geometry, material);
    mesh.raycast = () => {};
    // Vivid on the sand: it takes on much less of the water's color than the rocks do.
    const look = prepareUnderwater(mesh, ocean ?? undefined, lite, { bias: FLOOR_BIAS, seabed: .1 });
    geometry.dispose();
    material.dispose();
    // prepareUnderwater gave the mesh its own geometry: that copy is the one to move.
    const attribute = mesh.geometry.attributes.position, live = attribute.array as Float32Array;
    const rest = Float32Array.from(live), sway = Float32Array.from(parts.flatMap((p) => p.sway)), phase = Float32Array.from(parts.flatMap((p) => p.phase));
    return {
      mesh,
      /** A slow swell sets the whole crown leaning one way and back, each tentacle waving a little on its own. */
      update(t: number) {
        const swell = Math.sin(t * .45);
        for (let i = 0; i < sway.length; i++) {
          const w = sway[i];
          if (w === 0) continue;
          const ph = phase[i];
          live[i * 3] = rest[i * 3] + w * SWAY * (.8 * swell + .6 * Math.sin(t * 1.3 + ph));
          live[i * 3 + 2] = rest[i * 3 + 2] + w * SWAY * (.4 * swell + .6 * Math.cos(t * 1.1 + ph * 1.7));
        }
        attribute.needsUpdate = true;
      },
      dispose() { look.dispose(); },
    };
  }, [level, count, ocean, lite]);
  useEffect(() => () => view.dispose(), [view]);
  useFrame(({ clock }) => view.update(clock.elapsedTime));
  return <primitive object={view.mesh} />;
}
