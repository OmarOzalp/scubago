/**
 * The Overpass QL for the OpenStreetMap dive-site import (docs/osm-sites.md), one query per area.
 * Print them with: npx tsx scripts/osm-sites/query.ts
 *
 * Relative imports on purpose, as in seed-supabase.ts.
 *
 * What counts as a dive spot comes from the OSM wiki's sport=scuba_diving page: a physical feature
 * (a wreck, a reef, a cave entrance, a body of water) tagged `sport=scuba_diving` and
 * `scuba_diving:divespot=yes`. Dive centres (`amenity=dive_centre`), shops (`shop=scuba_diving`)
 * and clubs (`club=scuba_diving`) also carry `sport=scuba_diving`, so that tag alone is never
 * queried. The query asks for:
 *
 * 1. everything with `scuba_diving:divespot=yes`;
 * 2. wrecks, reefs and cave entrances tagged `sport=scuba_diving` without a `divespot` tag (the
 *    sport value may be a list, so it is matched as one item of a semicolon list).
 *
 * Dive centres, shops and clubs are not asked for, but a business that also says `divespot=yes`
 * does come back, and src/lib/site-import.ts drops it with a reason so the summary can count it.
 * Hotels, schools and other businesses are filtered there too, from their tags, not their names.
 *
 * The output is `out center;` (body verbosity plus the centre of ways and relations): nodes keep
 * their lat/lon, which is not certain for `out center tags;` (the `tags` verbosity leaves out
 * geometry), and the extra node lists of a few hundred ways are small.
 */
import { createHash } from 'node:crypto';

import { IMPORT_AREAS, type ImportAreaDef } from '../../src/lib/site-import';

/** The server's time limit for one query, in seconds. */
export const QUERY_TIMEOUT_S = 180;

/** Overpass etiquette: say who is asking, and where to reach them. */
export const REPO_URL = 'https://github.com/OmarOzalp/scubago';
export const USER_AGENT = `ScubaGo-osm-dive-site-import/1.0 (+${REPO_URL}; occasional import of OSM dive spots, one request at a time)`;
export const REFERER = REPO_URL;

const SPORT = '"sport"~"(^|;)scuba_diving(;|$)"';

/** The Overpass QL for one area. The bounding box is (south,west,north,east). */
export function buildQuery(area: ImportAreaDef): string {
  const bbox = `(${area.bbox.join(',')})`;
  return [
    `[out:json][timeout:${QUERY_TIMEOUT_S}];`,
    '(',
    `  nwr["scuba_diving:divespot"="yes"]${bbox};`,
    `  nwr[${SPORT}]["historic"="wreck"]${bbox};`,
    `  nwr[${SPORT}]["natural"~"^(reef|cave_entrance)$"]${bbox};`,
    ');',
    'out center;',
  ].join('\n');
}

export const QUERIES: { area: ImportAreaDef; query: string }[] = IMPORT_AREAS.map((area) => ({ area, query: buildQuery(area) }));

/** A short fingerprint of the queries, recorded in the meta file so a change of query shows up. */
export function queryHash(): string {
  return createHash('sha256').update(QUERIES.map((q) => q.query).join('\n\n')).digest('hex').slice(0, 12);
}

if (require.main === module) {
  for (const { area, query } of QUERIES) {
    console.log(`// ${area.id}: ${area.label}\n${query}\n`);
  }
  console.log(`// query hash ${queryHash()}`);
}
