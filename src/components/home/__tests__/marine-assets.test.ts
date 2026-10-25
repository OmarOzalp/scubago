// The shipped marine models, as files (scripts/art/slim-marine.mjs slims them): quantized, and with skin weights
// that three's GLTFLoader would renormalize to exactly what is stored, so marine-loader.ts can skip that pass.
import { expect, test } from '@jest/globals';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

type Glb = {
  json: { extensionsUsed?: string[]; meshes: { primitives: { attributes: Record<string, number> }[] }[]; accessors: { bufferView: number; byteOffset?: number; componentType: number; normalized?: boolean; type: string; count: number }[]; bufferViews: { byteOffset?: number; byteStride?: number }[] };
  bin: Buffer;
};

const DIR = join(__dirname, '../../../../assets/models/marine');
const MODELS = readdirSync(DIR).filter((file) => file.endsWith('.glb'));

function readGlb(file: string): Glb {
  const bytes = readFileSync(join(DIR, file)), jsonLength = bytes.readUInt32LE(12);
  return { json: JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8')), bin: bytes.subarray(20 + jsonLength + 8) };
}

/** What SkinnedMesh.normalizeSkinWeights does to one vertex's normalized byte weights (three's BufferAttribute maths). */
function renormalized(weights: number[]) {
  const values = weights.map((w) => w / 255), length = values.reduce((sum, v) => sum + Math.abs(v), 0), scale = 1 / length;
  const scaled = scale !== Infinity ? values.map((v) => v * scale) : [1, 0, 0, 0];
  return scaled.map((v) => Math.round(v * 255));
}

test('every marine model is there and slimmed', () => {
  expect(MODELS).toHaveLength(51);
  for (const file of MODELS) {
    const { json } = readGlb(file);
    expect([file, json.extensionsUsed]).toEqual([file, ['KHR_mesh_quantization']]);
    // No compression that needs a WebAssembly decoder (Hermes has none).
    expect(json.extensionsUsed).not.toContain('KHR_draco_mesh_compression');
    expect(json.extensionsUsed).not.toContain('EXT_meshopt_compression');
  }
});

test("every skinned vertex's weights are bytes summing to 255, which the loader's renormalization leaves as they are", () => {
  let vertices = 0;
  for (const file of MODELS) {
    const { json, bin } = readGlb(file);
    for (const mesh of json.meshes) {
      for (const primitive of mesh.primitives) {
        const accessor = json.accessors[primitive.attributes.WEIGHTS_0];
        expect([file, accessor.componentType, accessor.normalized, accessor.type]).toEqual([file, 5121, true, 'VEC4']);
        const view = json.bufferViews[accessor.bufferView], stride = view.byteStride ?? 4, start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
        for (let v = 0; v < accessor.count; v++) {
          const at = start + v * stride, weights = [bin[at], bin[at + 1], bin[at + 2], bin[at + 3]];
          if (weights[0] + weights[1] + weights[2] + weights[3] !== 255 || renormalized(weights).some((w, i) => w !== weights[i])) {
            throw new Error(`${file}: vertex ${v}'s weights ${weights} would change`);
          }
          vertices++;
        }
      }
    }
  }
  expect(vertices).toBeGreaterThan(50000);
});
