/**
 * Sweep the swimming for clipping, the long way: every model, in scenes of eight (groups at their largest, the
 * tuna school with the first), on every island at every level, for minutes at a time, and report how many samples
 * had some part of a body below the seabed or inside the island, per island and level and per species. The jest
 * test (src/lib/__tests__/swim-depth.test.ts) runs the same measure coarsely; this is the exhaustive one.
 *
 *   npm run verify:swim -- [--seconds 120] [--islands reef,kelp] [--levels 1,6] [--seeds 2] [--every .5] [--json out.json]
 *
 * Besides clipping it reports where the animals swim (height over the drawn seabed and depth under the calm surface, by how they live
 * in the water: bottom, reef, open, the school's tuna), how many samples had a body too big for the water it was in ("stranded": more
 * of its back out of the water than is natural), and how many were outside what the camera shows ("unseen"), both after the first few seconds, while the animals swim out from where they start.
 * Exits 1 if anything clipped. Run with tsx (it resolves the app's path aliases); a full sweep takes several minutes,
 * so split it by island or level to use more than one core.
 */
import { writeFileSync } from 'node:fs';
import { clearFailures, surveyScene, swimScenes } from '../src/test-support/swim-clearance.ts';

const ISLANDS = ['reef', 'kelp', 'volcanic', 'mangrove', 'wreck'];
const args = new Map();
for (let i = 2; i < process.argv.length; i++) {
  const name = process.argv[i];
  if (name.startsWith('--')) args.set(name.slice(2), process.argv[i + 1]?.startsWith('--') || i + 1 >= process.argv.length ? 'true' : process.argv[++i]);
}
const seconds = Number(args.get('seconds') ?? 120), every = Number(args.get('every') ?? .5), seeds = Number(args.get('seeds') ?? 1);
const islands = (args.get('islands') ?? ISLANDS.join(',')).split(',');
const levels = (args.get('levels') ?? '1,2,3,4,5,6').split(',').map(Number);
for (const island of islands) if (!ISLANDS.includes(island)) throw new Error(`unknown island ${island} (${ISLANDS.join(', ')})`);

const f = (n) => n.toFixed(2), pct = (n, of) => `${(100 * n / of).toFixed(0)}%`;

const result = {};
let clips = 0, onLand = 0, failures = [];
const started = performance.now();
for (const shape of islands) {
  for (const level of levels) {
    const key = `${shape}:${level}`, merged = (result[key] = {});
    const t0 = performance.now();
    for (let seed = 0; seed < seeds; seed++) {
      swimScenes().forEach((scene, c) => {
        const surveys = surveyScene({ shape, level, models: scene.models, species: scene.species, seed: c + 8 * seed, school: c === 0 }, seconds, every);
        failures.push(...clearFailures(surveys, `${key} seed ${seed}`));
        // (one scene per model, so a second seed's scene of the same models adds to the first's)
        for (const [name, s] of Object.entries(surveys)) {
          const was = merged[name];
          merged[name] = was
            ? { ...s, samples: was.samples + s.samples, clipped: was.clipped + s.clipped, clippedSeen: was.clippedSeen + s.clippedSeen, onLand: was.onLand + s.onLand, grazed: was.grazed + s.grazed, settled: was.settled + s.settled, stranded: was.stranded + s.stranded, unseen: was.unseen + s.unseen,
              worst: Math.max(was.worst, s.worst), leastRoom: Math.min(was.leastRoom, s.leastRoom), jump: Math.max(was.jump, s.jump), tilt: Math.max(was.tilt, s.tilt), where: was.where ?? s.where }
            : s;
        }
      });
    }
    const rows = Object.entries(merged);
    const sum = (pick) => rows.reduce((n, [, s]) => n + pick(s), 0);
    clips += sum((s) => s.clipped); onLand += sum((s) => s.onLand);
    console.log(`${key.padEnd(10)} ${String(sum((s) => s.samples)).padStart(7)} samples  ${String(sum((s) => s.clipped)).padStart(4)} clipped  ${String(sum((s) => s.onLand)).padStart(4)} on land  ${String(sum((s) => s.grazed)).padStart(4)} grazing  ${((performance.now() - t0) / 1000).toFixed(0)} s`);
    for (const [name, s] of rows.filter(([, s]) => s.clipped || s.onLand || s.grazed).sort((a, b) => b[1].clipped - a[1].clipped)) {
      console.log(`    ${name.padEnd(22)} clipped ${s.clipped}/${s.samples} (worst ${f(s.worst)}), on land ${s.onLand}, grazing ${s.grazed}${s.where ? `  e.g. ${s.where}` : ''}`);
    }
    // The animals that are often out of the water's depth or out of the camera's view (the biggest, at the Coral Reef: shelf-water.ts).
    for (const [name, s] of rows.filter(([, s]) => s.stranded > .05 * s.settled || s.unseen > .05 * s.settled).sort((a, b) => b[1].unseen - a[1].unseen)) {
      console.log(`    ${name.padEnd(22)} ${pct(s.unseen, s.settled)} out of view, ${pct(s.stranded, s.settled)} in water too shallow for its body`);
    }
    // Where the animals swim: the middle of the body above the drawn seabed ("above"), and below the calm surface ("below"), at the 10th, 50th and 90th percentile.
    const bands = {};
    for (const [name, s] of rows) {
      const band = (bands[s.kind] ??= { n: 0, above: [0, 0, 0], below: [0, 0, 0] });
      band.n += s.samples;
      for (let i = 0; i < 3; i++) { band.above[i] += s.above[i] * s.samples; band.below[i] += s.below[i] * s.samples; }
    }
    console.log(`    swims (10/50/90th percentile) ${Object.entries(bands).map(([band, b]) => `${band}: ${b.above.map((v) => f(v / b.n)).join('/')} above the seabed, ${b.below.map((v) => f(v / b.n)).join('/')} below the surface`).join('  |  ')}`);
  }
}
console.log(`\n${clips} samples clipped, ${onLand} on land, over ${islands.length} island(s) and ${levels.length} level(s) in ${((performance.now() - started) / 1000).toFixed(0)} s`);
if (args.has('json')) writeFileSync(args.get('json'), JSON.stringify(result, null, 1));
if (failures.length) {
  console.log(`\n${failures.length} problem(s):\n${failures.slice(0, 40).join('\n')}${failures.length > 40 ? `\n... and ${failures.length - 40} more` : ''}`);
  process.exit(1);
}
