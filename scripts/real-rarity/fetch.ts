/**
 * Worldwide record counts: ask iNaturalist and OBIS how often each catalogue species is recorded
 * anywhere, and write src/data/real-rarity.json (docs/real-rarity.md). These counts are supporting
 * evidence shown beside a tier. They set no tier: how much an animal is photographed is not how
 * likely a diver is to meet it. The tiers come from scripts/real-rarity/encounters.ts.
 *
 *   NODE_USE_ENV_PROXY=1 npx tsx scripts/real-rarity/fetch.ts   fetch, score, write
 *   npx tsx scripts/real-rarity/fetch.ts --input saved.json     recompute from saved counts, no network
 *   npx tsx scripts/real-rarity/fetch.ts --help                 every option
 *
 * Fetching needs network access to api.inaturalist.org and api.obis.org (Node’s fetch uses a
 * proxy only with NODE_USE_ENV_PROXY=1). Run it from the repository root. The logic is in cli.ts so
 * tests can run it in-process.
 */
import { runCli } from './cli';

runCli(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error) => {
    // fetch reports a network failure as just "fetch failed"; the reason is in `cause`.
    const cause = error instanceof Error && error.cause instanceof Error ? ` (${error.cause.message})` : '';
    console.error(`${error instanceof Error ? error.message : error}${cause}`);
    process.exit(1);
  },
);
