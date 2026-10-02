/**
 * Turn a built mesh and bone layout into a skinned glTF: one vertex-colored
 * draw call, the species' bone hierarchy in bind pose, and a looping `Swim`
 * clip sampled from the same procedural rig the app drives at runtime.
 */
import {
  AnimationClip, Bone, BufferGeometry, DoubleSide, Euler, Float32BufferAttribute, Group, MeshStandardMaterial,
  Quaternion, QuaternionKeyframeTrack, Skeleton, SkinnedMesh, Uint16BufferAttribute, Uint8BufferAttribute, Vector3,
  VectorKeyframeTrack,
} from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { createSwimRig, rigBones, RIG_EULER_ORDER, strokeFrequency, SWIM_RIGS, type SwimRigModel } from '../../../src/lib/marine-rigs';
import type { MeshBuilder } from './kit';

export type BoneSpec = { name: string; parent: string | null; position: Vector3 };

/** GLTFExporter reads its binary output through FileReader, which Node lacks. */
if (!('FileReader' in globalThis)) {
  class NodeFileReader {
    result: ArrayBuffer | string | null = null;
    onloadend: (() => void) | null = null;
    readAsArrayBuffer(blob: Blob) { blob.arrayBuffer().then((buffer) => { this.result = buffer; this.onloadend?.(); }); }
    readAsDataURL(blob: Blob) {
      blob.arrayBuffer().then((buffer) => {
        this.result = `data:application/octet-stream;base64,${Buffer.from(buffer).toString('base64')}`;
        this.onloadend?.();
      });
    }
  }
  (globalThis as Record<string, unknown>).FileReader = NodeFileReader;
}

export function assemble(model: SwimRigModel, mesh: MeshBuilder, layout: BoneSpec[]) {
  const order = rigBones(model);
  const missing = order.filter((name) => !layout.some((b) => b.name === name));
  if (missing.length) throw new Error(`${model}: missing bones ${missing.join(', ')}`);
  const byName = new Map<string, Bone>();
  for (const spec of layout) {
    const bone = new Bone();
    bone.name = spec.name;
    byName.set(spec.name, bone);
  }
  for (const spec of layout) {
    const bone = byName.get(spec.name)!;
    const parent = spec.parent ? layout.find((b) => b.name === spec.parent)! : null;
    bone.position.copy(spec.position).sub(parent ? parent.position : new Vector3());
    if (spec.parent) byName.get(spec.parent)!.add(bone);
  }
  const index = new Map(order.map((name, i) => [name, i]));
  const count = mesh.vertexCount;
  const joints = new Uint8Array(count * 4), weights = new Float32Array(count * 4);
  mesh.skins.forEach((skin, v) => {
    const top = Object.entries(skin).filter(([, w]) => w > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const total = top.reduce((sum, [, w]) => sum + w, 0);
    top.forEach(([name, w], k) => {
      if (!index.has(name)) throw new Error(`${model}: weight on unknown bone ${name}`);
      joints[v * 4 + k] = index.get(name)!;
      weights[v * 4 + k] = w / total;
    });
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(mesh.positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(mesh.normals, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(mesh.colors, 3));
  geometry.setAttribute('skinIndex', new Uint8BufferAttribute(joints, 4));
  geometry.setAttribute('skinWeight', new Float32BufferAttribute(weights, 4));
  geometry.setIndex(new Uint16BufferAttribute(mesh.indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const material = new MeshStandardMaterial({ name: 'Painted skin', vertexColors: true, roughness: .8, metalness: 0, side: DoubleSide });
  const skinned = new SkinnedMesh(geometry, material);
  skinned.name = `${model}-body`;
  const group = new Group();
  group.name = model;
  const rootBone = byName.get(layout.find((b) => b.parent === null)!.name)!;
  group.add(rootBone, skinned);
  group.updateMatrixWorld(true);
  skinned.bind(new Skeleton(order.map((name) => byName.get(name)!)));
  return { group, skinned, bones: byName };
}

/** One cruising stroke, sampled evenly; the last key repeats the first so the loop is seamless. */
export function bakeSwim(model: SwimRigModel, bones: Map<string, Bone>, samples = 32) {
  const rig = createSwimRig(model);
  const duration = 1 / strokeFrequency(SWIM_RIGS[model], 1);
  const times = Array.from({ length: samples + 1 }, (_, i) => duration * i / samples);
  const rotations = new Map(rig.bones.map((name) => [name, [] as number[]]));
  const scales = new Map(rig.scaled.map((b) => [rig.bones[b], [] as number[]]));
  const rootPosition: number[] = [];
  const root = bones.get('Root')!;
  const euler = new Euler(), quaternion = new Quaternion();
  times.forEach((_, i) => {
    rig.sample(Math.PI * 2 * (i % samples) / samples);
    rig.bones.forEach((name, b) => {
      euler.set(rig.rotation[b * 3], rig.rotation[b * 3 + 1], rig.rotation[b * 3 + 2], RIG_EULER_ORDER);
      quaternion.setFromEuler(euler);
      rotations.get(name)!.push(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    });
    rig.scaled.forEach((b) => scales.get(rig.bones[b])!.push(rig.scale[b * 3], rig.scale[b * 3 + 1], rig.scale[b * 3 + 2]));
    rootPosition.push(root.position.x + rig.offset.x, root.position.y + rig.offset.y, root.position.z + rig.offset.z);
  });
  const tracks = [
    ...rig.bones.map((name) => new QuaternionKeyframeTrack(`${name}.quaternion`, times, rotations.get(name)!)),
    new VectorKeyframeTrack('Root.position', times, rootPosition),
    ...[...scales].map(([name, values]) => new VectorKeyframeTrack(`${name}.scale`, times, values)),
  ];
  return new AnimationClip('Swim', duration, tracks);
}

export async function exportGlb(group: Group, clip: AnimationClip): Promise<ArrayBuffer> {
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(group, { binary: true, animations: [clip], onlyVisible: false });
  return result as ArrayBuffer;
}
