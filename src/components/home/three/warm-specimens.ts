import {
  Bone, BufferAttribute, BufferGeometry, Color, DoubleSide, Float32BufferAttribute, FrontSide, Group, InstancedMesh, Mesh, MeshLambertMaterial, Scene, Skeleton, SkinnedMesh, Uint16BufferAttribute,
  type Light, type Material, type Object3D,
} from 'three';
import { createKelpMaterial } from './kelp-forest';
import { animalMaterial } from './marine-colors';
import { createLiteOceanMaterial, createOceanUniforms, createSeabedMaterial, createWaterMaterial, type OceanUniforms } from './ocean-mesh';
import { submerge } from './islet-material';
import { createSchoolMaterial } from './school-material';
import { createSeagrassMaterial } from './seagrass-meadow';
import { FLOOR_BIAS, prepareUnderwater } from './underwater-material';
import { createTunaGeometry } from './tuna-geometry';
import type { WarmKind } from './warm-kinds';

export type SpecimenContext = {
  /** The scene's water: stand-ins share it, as the real materials do (a program does not depend on its values, but on the code built from them). */
  ocean: OceanUniforms; lite: boolean;
  /** How many waters the ocean's field blends (its `field.habitats.length`): the ocean's code depends on it. */
  waters: number;
};

/** A triangle with what a program looks at: normals, colors (none, red-green-blue, or red-green-blue-alpha), and the weights of a skin. */
function triangle(colors: 0 | 3 | 4, skin = false) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  geometry.setAttribute('normal', new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  if (colors === 3) geometry.setAttribute('color', new Float32BufferAttribute(new Array(9).fill(1), 3));
  if (colors === 4) geometry.setAttribute('color', new BufferAttribute(new Uint16Array(12).fill(65535), 4, true));
  if (skin) {
    geometry.setAttribute('skinIndex', new Uint16BufferAttribute(new Array(12).fill(0), 4));
    geometry.setAttribute('skinWeight', new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
  }
  return geometry;
}
/** The ocean's layers have positions alone (a program looks at which attributes a geometry has: normals among them). */
const bare = () => { const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)); return geometry; };
const mesh = (material: Material, geometry = triangle(3)) => new Mesh(geometry, material);
const lambert = (flat: boolean, side: typeof FrontSide | typeof DoubleSide) => new MeshLambertMaterial({ vertexColors: true, flatShading: flat, side });
const reefLook = (seabed: number) => ({ bias: FLOOR_BIAS, seabed });

/** What a kind draws with: the stand-ins' roots, and whatever must stay alive for as long as the programs are wanted. */
const SPECIMENS: Record<WarmKind, (context: SpecimenContext) => Object3D[]> = {
  ocean: ({ ocean, lite, waters }) => (lite
    ? [mesh(createLiteOceanMaterial(ocean), bare())]
    : [mesh(createSeabedMaterial(ocean, waters), bare()), mesh(createWaterMaterial(ocean, waters), bare())]),
  coast: () => [mesh(lambert(true, FrontSide)), mesh(lambert(true, DoubleSide))],
  animals: ({ ocean, lite }) => {
    // A skinned mesh with the colors of a parsed model (marine-loader.ts): red, green, blue and alpha, two-sided.
    const body = new SkinnedMesh(triangle(4, true), animalMaterial({ color: new Color('#ffffff'), side: DoubleSide, transparent: false, opacity: 1, alphaTest: 0, depthWrite: true, depthTest: true }));
    const bone = new Bone();
    body.add(bone);
    body.bind(new Skeleton([bone]));
    const root = new Group();
    root.add(body);
    prepareUnderwater(root, ocean, lite);
    return [root];
  },
  reef: ({ ocean, lite }) => {
    // Coral heads and the sunken wreck (flat, two-sided); rocks and anemones (smooth, one-sided); the small life (smooth, two-sided).
    const made = [lambert(true, DoubleSide), lambert(false, FrontSide), lambert(false, DoubleSide)].map((material, i) => {
      const part = mesh(material);
      prepareUnderwater(part, ocean, lite, reefLook([.32, .45, .25][i]));
      material.dispose();
      return part;
    });
    return made;
  },
  kelp: ({ ocean, lite }) => [mesh(createKelpMaterial(ocean, lite))],
  seagrass: ({ ocean, lite }) => [mesh(createSeagrassMaterial(ocean, lite))],
  steam: () => [mesh(new MeshLambertMaterial({ color: '#F4F2EE', transparent: true, depthWrite: false, emissive: '#5A5A5A' }))],
  school: ({ ocean, lite }) => [new InstancedMesh(createTunaGeometry(lite), createSchoolMaterial(ocean, lite), 1)],
  islet: ({ ocean, lite }) => {
    // An islet's own materials, made to look under water as it rises: the same copies of the coast's.
    const root = new Group();
    root.add(mesh(lambert(true, FrontSide)), mesh(lambert(true, DoubleSide)));
    submerge(root, ocean, lite);
    return [root];
  },
};

/**
 * The stand-ins for `kinds`, one group of them for each kind (so that they can be compiled and drawn kind by kind). Nothing here is ever drawn
 * for real, and none of it is disposed: a program lives as long as one material that uses it does, so these stay with the renderer (warm-up.tsx
 * holds them) to keep what they linked for the scene's own.
 */
export function buildSpecimens(kinds: readonly WarmKind[], context: Partial<SpecimenContext> & { lite: boolean }): Map<WarmKind, Group> {
  const full: SpecimenContext = { ocean: context.ocean ?? createOceanUniforms(), lite: context.lite, waters: Math.max(1, context.waters ?? 1) };
  const groups = new Map<WarmKind, Group>();
  for (const kind of kinds) {
    const group = new Group();
    for (const object of SPECIMENS[kind](full)) group.add(object);
    groups.set(kind, group);
  }
  return groups;
}

/**
 * What to draw once, off to one side, so that a driver that finishes building a program only when it first draws with it (an emulated or a
 * tile-based GPU often does) has done so too: the stand-ins, far outside the view (never culled by three.js, always clipped by the GPU, so no
 * pixel changes), under copies of the scene's lights (a program is made for the lights it is drawn under).
 */
export function offscreen(scene: Object3D, root: Group): Scene {
  const holder = new Scene();
  scene.traverse((object) => { if ((object as Light).isLight) holder.add(object.clone()); });
  root.position.set(1e6, 0, 0);
  root.traverse((object) => { object.frustumCulled = false; });
  holder.add(root);
  return holder;
}
