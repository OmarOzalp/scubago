/**
 * Slim the marine models (assets/models/marine/*.glb) so they download, load and parse faster, with no
 * visible change. Run it after `npm run build:species` (which writes them full size), or after any change
 * to a model:
 *
 *   node scripts/art/slim-marine.mjs                  (every model)
 *   node scripts/art/slim-marine.mjs --only=orca,shark
 *
 * Each model goes through the gltf-transform command line (fetched by npx: a tool for this script only,
 * not one of the app's dependencies), step by step:
 *   dedup     identical accessors, materials and skins are kept once (meshes stay as they are);
 *   prune     anything nothing uses goes (vertex attributes no material reads, e.g. UVs with no texture),
 *             but every node stays, so the rigs find each bone by name as before;
 *   weld      vertices identical in every attribute become one;
 *   resample  animation keys a straight line through their neighbours already gives (to 1e-5) go;
 *   quantize  KHR_mesh_quantization, which three's GLTFLoader reads natively: positions as 16-bit
 *             integers (the scale goes into the skin's inverse bind matrices), normals as 8-bit, vertex
 *             colours as 16-bit (8 bits of linear colour would band the darkest markings), skin weights
 *             as bytes that sum to exactly 255.
 * Never Draco or meshopt: their decoders need WebAssembly, which Hermes doesn't have.
 *
 * That the weights sum to exactly 255 matters: GLTFLoader renormalizes every skinned vertex's weights as it
 * builds a mesh, which such weights come through unchanged, so the app skips that pass (most of a parse on a
 * phone: marine-loader.ts). This script checks every model it writes, and a test checks the shipped ones
 * (src/components/home/__tests__/marine-assets.test.ts). A model already slimmed is left as it is, and the manifests'
 * `bytes` follow the new sizes.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

const GLTF_TRANSFORM = '@gltf-transform/cli@4.5.1';
const DIR = resolve(dirname(process.argv[1]), '../../assets/models/marine');
const only = process.argv.find((arg) => arg.startsWith('--only='))?.slice(7).split(',');
const models = readdirSync(DIR).filter((file) => file.endsWith('.glb')).map((file) => basename(file, '.glb')).filter((model) => !only || only.includes(model));
if (only) for (const model of only) if (!models.includes(model)) throw new Error(`No model ${model}.glb in ${DIR}`);

const STEPS = [
  ['dedup', '--meshes', 'false'],
  ['prune', '--keep-leaves', 'true', '--keep-attributes', 'false'],
  ['weld'],
  ['resample', '--tolerance', '0.00001'],
  ['quantize', '--quantize-position', '16', '--quantize-normal', '8', '--quantize-color', '16', '--quantize-weight', '8'],
];

/** The GLB's JSON and binary chunks. */
function readGlb(path) {
  const bytes = readFileSync(path), jsonLength = bytes.readUInt32LE(12);
  return { json: JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8')), bin: bytes.subarray(20 + jsonLength + 8), size: bytes.length };
}

/** Every skinned vertex's weights are normalized bytes summing to exactly 255 (else throws). */
function checkWeights(path) {
  const { json, bin } = readGlb(path);
  for (const mesh of json.meshes) {
    for (const primitive of mesh.primitives) {
      const index = primitive.attributes.WEIGHTS_0;
      if (index === undefined) continue;
      const accessor = json.accessors[index], view = json.bufferViews[accessor.bufferView];
      if (accessor.componentType !== 5121 || !accessor.normalized || accessor.type !== 'VEC4') throw new Error(`${basename(path)}: weights are not normalized bytes`);
      const stride = view.byteStride ?? 4, start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
      for (let v = 0; v < accessor.count; v++) {
        const at = start + v * stride, sum = bin[at] + bin[at + 1] + bin[at + 2] + bin[at + 3];
        if (sum !== 255) throw new Error(`${basename(path)}: vertex ${v}'s weights sum to ${sum}/255`);
      }
    }
  }
}

// The command line, fetched once (npx keeps it in its cache), then run directly for every step.
const cli = execFileSync('npx', ['--yes', '-p', GLTF_TRANSFORM, '-c', 'command -v gltf-transform'], { encoding: 'utf8' }).trim();
const work = mkdtempSync(join(tmpdir(), 'slim-marine-'));
const sizes = {};
try {
  for (const model of models) {
    const source = join(DIR, `${model}.glb`), was = statSync(source).size;
    if (readGlb(source).json.extensionsUsed?.includes('KHR_mesh_quantization')) { console.log(`${model}: already slimmed`); continue; }
    let from = source;
    STEPS.forEach(([command, ...options], step) => {
      const to = join(work, `${model}-${step}.glb`);
      execFileSync(cli, [command, from, to, ...options], { stdio: ['ignore', 'ignore', 'inherit'] });
      from = to;
    });
    checkWeights(from);
    writeFileSync(source, readFileSync(from));
    sizes[model] = statSync(source).size;
    console.log(`${model}: ${was} → ${sizes[model]} bytes`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

// The manifests' sizes.
for (const name of ['manifest.json', 'species-manifest.json']) {
  const path = join(DIR, name), manifest = JSON.parse(readFileSync(path, 'utf8'));
  for (const [model, bytes] of Object.entries(sizes)) if (manifest[model]) manifest[model].bytes = bytes;
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
}
