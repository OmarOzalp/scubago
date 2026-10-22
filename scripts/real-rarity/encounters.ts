/**
 * Rarity from encounters: ask iNaturalist and OBIS what is recorded near every dive site in
 * src/data/sites.ts, and work out how often each catalogue animal is recorded at the dive sites in
 * its own waters (docs/real-rarity.md). Writes src/data/encounter-rarity.json and the per-site
 * records it was worked out from, src/data/encounter-rarity.sites.json.
 *
 *   NODE_USE_ENV_PROXY=1 npx tsx scripts/real-rarity/encounters.ts      ask, work out, write
 *   npx tsx scripts/real-rarity/encounters.ts --input saved.sites.json  recompute from saved records, no network
 *   npx tsx scripts/real-rarity/encounters.ts --help                    every option
 *
 * Fetching needs network access to api.inaturalist.org and api.obis.org. Run it from the
 * repository root. The logic is in encounters-cli.ts so tests can run it in-process.
 */
import { runEncountersCli } from './encounters-cli';

runEncountersCli(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error) => {
    // fetch reports a network failure as just "fetch failed"; the reason is in `cause`.
    const cause = error instanceof Error && error.cause instanceof Error ? ` (${error.cause.message})` : '';
    console.error(`${error instanceof Error ? error.message : error}${cause}`);
    process.exit(1);
  },
);
