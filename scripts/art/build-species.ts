/**
 * Build the species GLBs: original procedural geometry, vertex-painted
 * markings, a species-specific bone hierarchy and a baked `Swim` loop sampled
 * from the runtime rig in src/lib/marine-rigs.ts.
 *
 * Run: npm run build:species            (all species)
 *      npm run build:species -- --only=tiger-shark
 *
 * Relative imports on purpose: tsx doesn't get the app's `@/` alias here.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { SwimRigModel } from '../../src/lib/marine-rigs';
import { assemble, bakeSwim, exportGlb } from './species/export';
import type { MeshBuilder } from './species/kit';
import type { BoneSpec } from './species/export';
import { buildTigerShark } from './species/tiger-shark';
import { buildWhaleShark } from './species/whale-shark';
import { buildReefManta } from './species/reef-manta';
import { buildGreatWhiteShark } from './species/great-white-shark';
import { buildMolaMola } from './species/mola-mola';
import { buildGreenTurtle } from './species/green-turtle';

const OUT = resolve(dirname(process.argv[1]), '../../assets/models/marine') + '/';

const SPECIES: Partial<Record<SwimRigModel, { build: () => { mesh: MeshBuilder; bones: BoneSpec[] }; scientificName: string; reference: string }>> = {
  'tiger-shark': { build: buildTigerShark, scientificName: 'Galeocerdo cuvier', reference: 'https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/tiger-shark/' },
  'whale-shark': { build: buildWhaleShark, scientificName: 'Rhincodon typus', reference: 'https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/whale-shark/' },
  'reef-manta': { build: buildReefManta, scientificName: 'Mobula alfredi', reference: 'https://www.mantatrust.org/mobula-alfredi' },
  'great-white-shark': { build: buildGreatWhiteShark, scientificName: 'Carcharodon carcharias', reference: 'https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/white-shark/' },
  'mola-mola': { build: buildMolaMola, scientificName: 'Mola mola', reference: 'https://www.fisheries.noaa.gov/species/ocean-sunfish' },
  'green-turtle': { build: buildGreenTurtle, scientificName: 'Chelonia mydas', reference: 'https://www.fisheries.noaa.gov/species/green-turtle' },
};

async function main() {
  const only = process.argv.find((arg) => arg.startsWith('--only='))?.slice(7).split(',');
  const manifestPath = `${OUT}species-manifest.json`;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
  for (const [model, species] of Object.entries(SPECIES) as [SwimRigModel, NonNullable<typeof SPECIES[SwimRigModel]>][]) {
    if (only && !only.includes(model)) continue;
    const { mesh, bones } = species.build();
    const { group, bones: rigBones } = assemble(model, mesh, bones);
    const clip = bakeSwim(model, rigBones);
    const glb = await exportGlb(group, clip);
    writeFileSync(`${OUT}${model}.glb`, Buffer.from(glb));
    const size = group.children.find((child) => child.type === 'SkinnedMesh');
    console.log(`${model}: ${mesh.vertexCount} vertices, ${mesh.triangleCount} triangles, ${rigBones.size} bones, ${glb.byteLength} bytes, ${clip.duration.toFixed(2)}s loop${size ? '' : ' (no skinned mesh!)'}`);
    manifest[model] = {
      status: 'stylized-draft', version: 2, bytes: glb.byteLength, triangles: mesh.triangleCount,
      source: 'Original procedural geometry and rig', bones: [...rigBones.keys()].length,
      clip: 'Swim', loopSeconds: Number(clip.duration.toFixed(3)), scientificName: species.scientificName, reference: species.reference,
      humanReview: 'pending', material: 'vertex colors, no textures', generator: 'scripts/art/build-species.ts',
      animation: 'procedural at runtime (src/lib/marine-rigs.ts); Swim clip is the same rig baked at cruising effort',
    };
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

main().catch((error) => { console.error(error); process.exit(1); });
