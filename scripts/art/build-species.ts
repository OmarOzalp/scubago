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
import { buildScallopedHammerhead } from './species/scalloped-hammerhead';
import { buildBottlenoseDolphin } from './species/bottlenose-dolphin';
import { buildDayOctopus } from './species/day-octopus';
import { buildGiantCuttlefish } from './species/giant-cuttlefish';
import { buildGiantMoray } from './species/giant-moray';
import { buildGreatBarracuda } from './species/great-barracuda';
import { buildSailfish } from './species/sailfish';
import { buildClownfish } from './species/clownfish';
import { buildSpottedEagleRay } from './species/spotted-eagle-ray';
import { buildCaliforniaSeaLion } from './species/california-sea-lion';
import { buildGoldenJellyfish } from './species/golden-jellyfish';
import { buildHumpbackWhale } from './species/humpback-whale';
import { buildSpermWhale } from './species/sperm-whale';
import { buildOceanicWhitetip } from './species/oceanic-whitetip';
import { buildLeatherbackTurtle } from './species/leatherback-turtle';
import { buildHawksbillTurtle } from './species/hawksbill-turtle';
import { buildLoggerheadTurtle } from './species/loggerhead-turtle';
import { buildOceanicManta } from './species/oceanic-manta';
import { buildHarborSeal } from './species/harbor-seal';
import { buildSeaOtter } from './species/sea-otter';
import { buildGaribaldi } from './species/garibaldi';
import { buildLeafySeadragon } from './species/leafy-seadragon';
import { buildOrca } from './species/orca';
import { buildMarineIguana } from './species/marine-iguana';
import { buildGalapagosShark } from './species/galapagos-shark';
import { buildThresherShark } from './species/thresher-shark';
import { buildGiantTrevally } from './species/giant-trevally';
import { buildKingAngelfish } from './species/king-angelfish';
import { buildDugong } from './species/dugong';
import { buildSawfish } from './species/sawfish';
import { buildLemonShark } from './species/lemon-shark';
import { buildSouthernStingray } from './species/southern-stingray';
import { buildTarpon } from './species/tarpon';
import { buildLionfish } from './species/lionfish';
import { buildBatfish } from './species/batfish';
import { buildGreyReefShark } from './species/grey-reef-shark';
import { buildBlacktipReefShark } from './species/blacktip-reef-shark';
import { buildWhitetipReefShark } from './species/whitetip-reef-shark';
import { buildSandTigerShark } from './species/sand-tiger-shark';
import { buildNapoleonWrasse } from './species/napoleon-wrasse';
import { buildBumpheadParrotfish } from './species/bumphead-parrotfish';
import { buildGoliathGrouper } from './species/goliath-grouper';

const OUT = resolve(dirname(process.argv[1]), '../../assets/models/marine') + '/';

const SPECIES: Partial<Record<SwimRigModel, { build: () => { mesh: MeshBuilder; bones: BoneSpec[] }; scientificName: string; reference: string }>> = {
  'tiger-shark': { build: buildTigerShark, scientificName: 'Galeocerdo cuvier', reference: 'https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/tiger-shark/' },
  'whale-shark': { build: buildWhaleShark, scientificName: 'Rhincodon typus', reference: 'https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/whale-shark/' },
  'reef-manta': { build: buildReefManta, scientificName: 'Mobula alfredi', reference: 'https://www.mantatrust.org/mobula-alfredi' },
  'great-white-shark': { build: buildGreatWhiteShark, scientificName: 'Carcharodon carcharias', reference: 'https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/white-shark/' },
  'mola-mola': { build: buildMolaMola, scientificName: 'Mola mola', reference: 'https://www.fisheries.noaa.gov/species/ocean-sunfish' },
  'green-turtle': { build: buildGreenTurtle, scientificName: 'Chelonia mydas', reference: 'https://www.fisheries.noaa.gov/species/green-turtle' },
  'scalloped-hammerhead': { build: buildScallopedHammerhead, scientificName: 'Sphyrna lewini', reference: 'https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/sphyrna-lewini/' },
  'bottlenose-dolphin': { build: buildBottlenoseDolphin, scientificName: 'Tursiops truncatus', reference: 'https://www.fisheries.noaa.gov/species/common-bottlenose-dolphin' },
  'giant-cuttlefish': { build: buildGiantCuttlefish, scientificName: 'Sepia apama', reference: 'https://www.marinespecies.org/aphia.php?p=taxlist&tName=Sepia%20apama' },
  'giant-moray': { build: buildGiantMoray, scientificName: 'Gymnothorax javanicus', reference: 'https://www.marinespecies.org/aphia.php?p=taxlist&tName=Gymnothorax%20javanicus' },
  'great-barracuda': { build: buildGreatBarracuda, scientificName: 'Sphyraena barracuda', reference: 'https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/sphyraena-barracuda/' },
  sailfish: { build: buildSailfish, scientificName: 'Istiophorus platypterus', reference: 'https://www.fisheries.noaa.gov/species/atlantic-sailfish' },
  'spotted-eagle-ray': { build: buildSpottedEagleRay, scientificName: 'Aetobatus narinari', reference: 'https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/aetobatus-narinari/' },
  'california-sea-lion': { build: buildCaliforniaSeaLion, scientificName: 'Zalophus californianus', reference: 'https://www.fisheries.noaa.gov/species/california-sea-lion' },
  'golden-jellyfish': { build: buildGoldenJellyfish, scientificName: 'Mastigias papua', reference: 'https://www.marinespecies.org/aphia.php?p=taxdetails&id=135288' },
  clownfish: { build: buildClownfish, scientificName: 'Amphiprion ocellaris', reference: 'https://www.marinespecies.org/aphia.php?p=taxdetails&id=278398' },
  'day-octopus': { build: buildDayOctopus, scientificName: 'Octopus cyanea', reference: 'https://www.marinespecies.org/aphia.php?p=taxlist&tName=Octopus%20cyanea' },
  'humpback-whale': { build: buildHumpbackWhale, scientificName: 'Megaptera novaeangliae', reference: 'https://www.fisheries.noaa.gov/species/humpback-whale' },
  'sperm-whale': { build: buildSpermWhale, scientificName: 'Physeter macrocephalus', reference: 'https://www.fisheries.noaa.gov/species/sperm-whale' },
  'oceanic-whitetip': { build: buildOceanicWhitetip, scientificName: 'Carcharhinus longimanus', reference: 'https://www.fisheries.noaa.gov/species/oceanic-whitetip-shark' },
  'leatherback-turtle': { build: buildLeatherbackTurtle, scientificName: 'Dermochelys coriacea', reference: 'https://www.fisheries.noaa.gov/species/leatherback-turtle' },
  'hawksbill-turtle': { build: buildHawksbillTurtle, scientificName: 'Eretmochelys imbricata', reference: 'https://www.fisheries.noaa.gov/species/hawksbill-turtle' },
  'loggerhead-turtle': { build: buildLoggerheadTurtle, scientificName: 'Caretta caretta', reference: 'https://www.fisheries.noaa.gov/species/loggerhead-turtle' },
  'oceanic-manta': { build: buildOceanicManta, scientificName: 'Mobula birostris', reference: 'https://www.fisheries.noaa.gov/species/giant-manta-ray' },
  'harbor-seal': { build: buildHarborSeal, scientificName: 'Phoca vitulina', reference: 'https://www.fisheries.noaa.gov/species/harbor-seal' },
  'sea-otter': { build: buildSeaOtter, scientificName: 'Enhydra lutris', reference: 'https://www.fisheries.noaa.gov/species/sea-otter' },
  garibaldi: { build: buildGaribaldi, scientificName: 'Hypsypops rubicundus', reference: 'https://www.marinespecies.org/aphia.php?p=taxdetails&id=280033' },
  'leafy-seadragon': { build: buildLeafySeadragon, scientificName: 'Phycodurus eques', reference: 'https://www.marinespecies.org/aphia.php?p=taxdetails&id=212287' },
  orca: { build: buildOrca, scientificName: 'Orcinus orca', reference: 'https://www.fisheries.noaa.gov/species/killer-whale' },
  'marine-iguana': { build: buildMarineIguana, scientificName: 'Amblyrhynchus cristatus', reference: 'https://www.galapagos.org/about_galapagos/about-galapagos/biodiversity/reptiles/' },
  'galapagos-shark': { build: buildGalapagosShark, scientificName: 'Carcharhinus galapagensis', reference: 'https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/carcharhinus-galapagensis/' },
  'thresher-shark': { build: buildThresherShark, scientificName: 'Alopias pelagicus', reference: 'https://www.iucnredlist.org/species/161597/68607857' },
  'giant-trevally': { build: buildGiantTrevally, scientificName: 'Caranx ignobilis', reference: 'https://www.fishbase.se/summary/Caranx-ignobilis.html' },
  'king-angelfish': { build: buildKingAngelfish, scientificName: 'Holacanthus passer', reference: 'https://www.fishbase.se/summary/Holacanthus-passer.html' },
  dugong: { build: buildDugong, scientificName: 'Dugong dugon', reference: 'https://www.iucnredlist.org/species/6909/160756767' },
  sawfish: { build: buildSawfish, scientificName: 'Pristis pristis', reference: 'https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/pristis-pristis/' },
  'lemon-shark': { build: buildLemonShark, scientificName: 'Negaprion brevirostris', reference: 'https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/negaprion-brevirostris/' },
  'southern-stingray': { build: buildSouthernStingray, scientificName: 'Hypanus americanus', reference: 'https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/hypanus-americanus/' },
  tarpon: { build: buildTarpon, scientificName: 'Megalops atlanticus', reference: 'https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/megalops-atlanticus/' },
  lionfish: { build: buildLionfish, scientificName: 'Pterois volitans', reference: 'https://www.fishbase.se/summary/Pterois-volitans.html' },
  batfish: { build: buildBatfish, scientificName: 'Platax teira', reference: 'https://www.fishbase.se/summary/Platax-teira.html' },
  'grey-reef-shark': { build: buildGreyReefShark, scientificName: 'Carcharhinus amblyrhynchos', reference: 'https://www.fishbase.se/summary/Carcharhinus-amblyrhynchos.html' },
  'blacktip-reef-shark': { build: buildBlacktipReefShark, scientificName: 'Carcharhinus melanopterus', reference: 'https://www.fishbase.se/summary/Carcharhinus-melanopterus.html' },
  'whitetip-reef-shark': { build: buildWhitetipReefShark, scientificName: 'Triaenodon obesus', reference: 'https://www.fishbase.se/summary/Triaenodon-obesus.html' },
  'sand-tiger-shark': { build: buildSandTigerShark, scientificName: 'Carcharias taurus', reference: 'https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/carcharias-taurus/' },
  'napoleon-wrasse': { build: buildNapoleonWrasse, scientificName: 'Cheilinus undulatus', reference: 'https://www.fishbase.se/summary/Cheilinus-undulatus.html' },
  'bumphead-parrotfish': { build: buildBumpheadParrotfish, scientificName: 'Bolbometopon muricatum', reference: 'https://www.fishbase.se/summary/Bolbometopon-muricatum.html' },
  'goliath-grouper': { build: buildGoliathGrouper, scientificName: 'Epinephelus itajara', reference: 'https://www.floridamuseum.ufl.edu/discover-fish/species-profiles/epinephelus-itajara/' },
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
