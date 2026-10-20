import { useEffect, useMemo } from 'react';
import { type BufferGeometry, Color, CylinderGeometry, IcosahedronGeometry, Mesh, MeshLambertMaterial } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Bank } from '@/lib/banks';
import { OCEAN } from '@/lib/ocean';
import { boulder, faces, hash, paintFaces } from './coast-geometry';

/**
 * What breaks the surface of the archipelago's bank between the islands (banks.ts): small cays of
 * bare white sand out on its flanks, a few with a lone palm, and dark rocks standing seaward of
 * them. One mesh; it never moves.
 */
const SAND = new Color('#EFE6C6'), SAND_WET = new Color('#D8CCA4'), TRUNK = new Color('#8B7558'), FROND = new Color('#5E8F45'), FROND_LIGHT = new Color('#79A653');
const ROCKS = { wet: new Color('#2F3433'), rock: new Color('#4C5250'), light: new Color('#6B716D') };
const WATER = OCEAN.surfaceLevel;

/** A cay: a low, flattened mound of sand just clear of the water on a wider apron of wet sand, a few low shrubs on it. */
function cay(x: number, z: number, radius: number, seed: number) {
  const parts: BufferGeometry[] = [], stretch = .7 + .25 * hash(seed, 1), turn = hash(seed, 2) * Math.PI;
  const apron = new IcosahedronGeometry(1, 1);
  apron.scale(radius * 1.25, .012, radius * 1.25 * stretch);
  apron.rotateY(turn);
  apron.translate(x, WATER + .002, z);
  parts.push(paintFaces(faces(apron), (_x, _y, _z, f) => SAND_WET.clone().lerp(SAND, .25 * hash(f, seed))));
  const mound = new IcosahedronGeometry(1, 1);
  mound.scale(radius, .05, radius * stretch);
  mound.rotateY(turn);
  mound.translate(x, WATER + .005, z);
  parts.push(paintFaces(faces(mound), (_x, y, _z, f) => SAND_WET.clone().lerp(SAND, Math.min(1, Math.max(0, (y - WATER) / .04)) * (.7 + .3 * hash(f, seed)))));
  for (let k = 0; k < 3; k++) {
    const shrub = new IcosahedronGeometry(1, 0), a = turn + k * 2.1 + hash(seed, k + 3), r = radius * (.25 + .3 * hash(seed, k + 6)), w = radius * (.16 + .08 * hash(seed, k + 9));
    shrub.scale(w, w * .55, w);
    shrub.translate(x + Math.cos(a) * r, WATER + .05 + w * .3, z + Math.sin(a) * r * stretch);
    parts.push(paintFaces(faces(shrub), (_x, _y, _z, f) => FROND.clone().lerp(FROND_LIGHT, hash(f, k + seed) * .7)));
  }
  return parts;
}

/** A lone coconut palm on a cay: a thin leaning trunk under a tuft of drooping fronds. */
function palm(x: number, z: number, seed: number) {
  const parts: BufferGeometry[] = [], lean = (hash(seed, 3) - .5) * .5, height = .4 + .1 * hash(seed, 4);
  const trunk = new CylinderGeometry(.014, .022, height, 5);
  trunk.rotateZ(lean);
  trunk.translate(x - Math.sin(lean) * height / 2, WATER + .04 + height / 2, z);
  parts.push(paintFaces(faces(trunk), () => TRUNK));
  const topX = x - Math.sin(lean) * height, topY = WATER + .04 + height * Math.cos(lean);
  for (let k = 0; k < 6; k++) {
    const frond = new IcosahedronGeometry(1, 0), a = k * Math.PI / 3 + hash(seed, k);
    frond.scale(.15, .02, .04);
    frond.translate(.115, -.02, 0);
    frond.rotateZ(-.35);
    frond.rotateY(a);
    frond.translate(topX, topY, z);
    parts.push(paintFaces(faces(frond), (_x, _y, _z, f) => FROND.clone().lerp(FROND_LIGHT, hash(f, k + seed))));
  }
  return parts;
}

export function ArchipelagoSea({ bank }: { bank: Bank }) {
  const mesh = useMemo(() => {
    const parts: BufferGeometry[] = [];
    bank.cays.forEach((c, i) => {
      parts.push(...cay(c.x, c.z, c.radius, i + 1));
      if (c.palm) parts.push(...palm(c.x + c.radius * .2, c.z - c.radius * .1, i + 7));
    });
    bank.rocks.forEach((r, i) => {
      parts.push(boulder(ROCKS, r.x, WATER - .02, r.z, r.size, r.size * .9, r.size * .8, hash(i, 5) * 3, i * 3.1));
      parts.push(boulder(ROCKS, r.x + r.size * .9, WATER - .05, r.z + r.size * .4, r.size * .5, r.size * .45, r.size * .5, hash(i, 6) * 3, i * 5.7));
    });
    const geometry = mergeGeometries(parts);
    parts.forEach((part) => part.dispose());
    geometry.computeVertexNormals();
    const mesh = new Mesh(geometry, new MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    mesh.name = 'archipelago-sea';
    mesh.raycast = () => {};
    return mesh;
  }, [bank]);
  useEffect(() => () => { mesh.geometry.dispose(); (mesh.material as MeshLambertMaterial).dispose(); }, [mesh]);
  return <primitive object={mesh} />;
}
