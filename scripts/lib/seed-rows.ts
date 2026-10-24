/**
 * Rows the seed (scripts/seed-supabase.ts) sends, kept apart so a test can check them without a
 * project: the seed itself reads the key and writes to the server as soon as it loads.
 */
import type { DiveSite } from '../../src/lib/types';

/**
 * What site_external_ids' upsert matches existing rows on: unique (scheme, external_id, relation)
 * (migration 0005), so an id that has moved to another site (a duplicate found since, folded into its
 * seed) moves with it. Matching on the primary key instead would add a second row for the id, which
 * that constraint refuses, and the whole batch with it.
 */
export const EXTERNAL_ID_CONFLICT = 'scheme,external_id,relation';

/** One site_external_ids row for each id a listed site has in another dataset. */
export function externalIdRows(sites: readonly DiveSite[]) {
  return sites.flatMap((s) => (s.externalIds ?? []).map((ext) => ({
    site_id: s.id, scheme: ext.scheme, external_id: ext.id, relation: ext.relation ?? 'same_as',
  })));
}
