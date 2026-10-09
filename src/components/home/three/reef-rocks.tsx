import { useContext, useEffect, useMemo } from 'react';
import { Color, Float32BufferAttribute, IcosahedronGeometry, Mesh, MeshLambertMaterial, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { REEF_ROCK, reefRocks, type ReefRock } from '@/lib/reef-life';
import { OceanContext } from './ocean-context';
import { useSceneQuality } from './scene-quality';
import { FLOOR_BIAS, prepareUnderwater } from './underwater-material';

/** Weathered reef rock, darker than the island's dry stones, its faces a little lighter and darker. */
const ROCK = new Color('#6E7A66'), DARK = new Color('#58634F'), LIGHT = new Color('#89937B');
const hash = (a: number, b: number) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };

/** One low-poly boulder: an ellipsoid with these semi-axes, turned `yaw`, its middle at (x, y, z). */
function boulder(x: number, y: number, z: number, [a, b, c]: readonly [number, number, number], yaw: number, seed: number): BufferGeometry {
  const geometry = new IcosahedronGeometry(1, 0);
  geometry.scale(a, b, c);
  geometry.rotateY(yaw);
  geometry.translate(x, y, z);
  const faces = geometry.attributes.position.count / 3, colors = new Float32Array(faces * 9), color = new Color();
  for (let f = 0; f < faces; f++) {
    const n = hash(seed, f);
    color.copy(ROCK).lerp(n < .5 ? DARK : LIGHT, Math.abs(n - .5) * 1.4);
    for (let k = 0; k < 3; k++) colors.set([color.r, color.g, color.b], (f * 3 + k) * 3);
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return geometry;
}

/**
 * A moray's den: a boulder over the mouth, tall enough to cover the moray's body where it goes in
 * (see REEF_ROCK), with a smaller boulder either side; or the rock an octopus rests by, with a stone
 * beside it on the far side from its resting spot.
 */
function rockBoulders(rock: ReefRock, seed: number) {
  const { x, z, floor, dirX, dirZ } = rock, yaw = Math.atan2(dirX, dirZ), px = dirZ, pz = -dirX;
  if (rock.kind === 'den') {
    const r = REEF_ROCK.radius, mx = rock.spotX - dirX * .03, mz = rock.spotZ - dirZ * .03;
    return [
      boulder(x, floor - .06, z, [r, REEF_ROCK.height + .08, r * .85], yaw + .4, seed),
      boulder(mx + px * .21, floor - .03, mz + pz * .21, [.13, .2, .12], yaw + 1.1, seed + 1),
      boulder(mx - px * .21, floor - .03, mz - pz * .21, [.12, .17, .13], yaw - .7, seed + 2),
    ];
  }
  return [
    boulder(x, floor - .04, z, [.2, .27, .17], yaw + .9, seed),
    boulder(x - dirX * .2 + px * .1, floor - .03, z - dirZ * .2 + pz * .1, [.12, .15, .1], yaw - .5, seed + 1),
  ];
}

/**
 * The reef's rocks (reef-life.ts): each moray's two dens and each octopus's rock, drawn only while
 * those animals are on the island, as one mesh. They sit on the seabed at this level (moving out as
 * the island grows), set back in depth like the animals on the bottom, and take on the water above
 * them like the seabed's other props.
 */
export function ReefRocks({ level, morays, octopuses }: { level: number; morays: number; octopuses: number }) {
  const ocean = useContext(OceanContext);
  const lite = useSceneQuality() === 'lite';
  const { mesh, look } = useMemo(() => {
    const { dens, rocks } = reefRocks(level, morays, octopuses);
    const parts = [...dens.flat(), ...rocks].flatMap((rock, i) => rockBoulders(rock, i * 7.3 + 1));
    const geometry = mergeGeometries(parts);
    parts.forEach((part) => part.dispose());
    const material = new MeshLambertMaterial({ vertexColors: true });
    const mesh = new Mesh(geometry, material);
    mesh.raycast = () => {};
    // prepareUnderwater gives the mesh its own copies of the geometry and material.
    // Standing up off the bottom, they take on less of the water's color than the sand around them.
    const look = prepareUnderwater(mesh, ocean ?? undefined, lite, { bias: FLOOR_BIAS, seabed: .45 });
    geometry.dispose();
    material.dispose();
    return { mesh, look };
  }, [level, morays, octopuses, ocean, lite]);
  useEffect(() => () => look.dispose(), [look]);
  return <primitive object={mesh} />;
}
