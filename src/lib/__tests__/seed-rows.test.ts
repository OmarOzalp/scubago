/**
 * What `npm run seed:supabase` sends must pass the database's own rules (migrations 0001 and 0005),
 * or the seed stops halfway and dives logged at the newer sites can't sync (their site isn't on the
 * server). The allowed values are read from the migration, so the two can't drift apart.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { describe, expect, it } from '@jest/globals';

import { REGIONS } from '@/data/regions';
import { SITES, SITES_BY_ID } from '@/data/sites';

import { EXTERNAL_ID_CONFLICT, externalIdRows } from '../../../scripts/lib/seed-rows';

const migration = readFileSync(join(__dirname, '../../../supabase/migrations/0005_dive_site_details.sql'), 'utf8');

type Row = Record<string, string>;

/** INSERT … ON CONFLICT (target) DO UPDATE, as Postgres runs it: a clash on any other key is error 23505. */
function upsert(table: Row[], incoming: Row[], target: string[], keys: string[][]): Row[] {
  const key = (row: Row, columns: string[]) => columns.map((c) => row[c]).join('|');
  for (const row of incoming) {
    const existing = table.find((r) => key(r, target) === key(row, target));
    table = existing ? table.map((r) => (r === existing ? { ...row } : r)) : [...table, row];
    for (const columns of keys) {
      if (new Set(table.map((r) => key(r, columns))).size < table.length) {
        throw new Error(`23505: duplicate key value violates unique constraint (${columns.join(', ')})`);
      }
    }
  }
  return table;
}

/** The values a `check (column in (...))` or `check (column <@ array[...])` constraint allows. */
function allowed(column: string): string[] {
  const list = new RegExp(`check \\(${column} (?:in \\(|<@ array\\[)([^\\])]*)`).exec(migration)?.[1];
  if (!list) throw new Error(`no check for ${column} in migration 0005`);
  return [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe('the seed', () => {
  it('reads the rules from the migration', () => {
    expect(allowed('dive_types')).toContain('swim-through');
    expect(allowed('access')).toEqual(['boat', 'shore', 'liveaboard']);
    expect(allowed('difficulty')).toContain('technical');
    expect(allowed('field')).toContain('species');
    expect(allowed('scheme')).toContain('osm');
    expect(allowed('relation')).toContain('same_as');
  });

  it('sends regions whose parents and Marine Regions ids hold', () => {
    const ids = new Set(REGIONS.map((r) => r.id));
    expect(ids.size).toBe(REGIONS.length);
    for (const r of REGIONS) if (r.parentId) expect(ids).toContain(r.parentId);
    const mrgids = REGIONS.flatMap((r) => (r.mrgid == null ? [] : [r.mrgid]));
    expect(new Set(mrgids).size).toBe(mrgids.length);
  });

  it('sends a row for every site the app can resolve, each passing dive_sites’ checks', () => {
    const regions = new Set(REGIONS.map((r) => r.id));
    const [types, access, difficulty] = [allowed('dive_types'), allowed('access'), allowed('difficulty')];
    expect(new Set(SITES.map((s) => s.id)).size).toBe(SITES.length);
    // Listed, retired, and found to be a seed's duplicate: a dive logged at any of them needs its row.
    for (const s of SITES) expect(SITES_BY_ID.get(s.id)).toBe(s);
    for (const s of SITES_BY_ID.values()) {
      const problems = [
        !s.name && 'no name',
        !(Number.isFinite(s.lat) && Number.isFinite(s.lng)) && 'no position',
        s.regionId && !regions.has(s.regionId) && `unknown region ${s.regionId}`,
        ...(s.diveTypes ?? []).filter((t) => !types.includes(t)).map((t) => `dive type ${t}`),
        ...(s.access ?? []).filter((a) => !access.includes(a)).map((a) => `access ${a}`),
        s.difficulty && !difficulty.includes(s.difficulty) && `difficulty ${s.difficulty}`,
        ...[s.depthMinM, s.depthMaxM].filter((d) => d != null && !(d >= 0 && d <= 150)).map((d) => `depth ${d}`),
        s.depthMinM != null && s.depthMaxM != null && s.depthMinM > s.depthMaxM && 'depths out of order',
        (s.conditions ?? '').length > 500 && 'conditions too long',
      ].filter(Boolean);
      expect({ id: s.id, problems }).toEqual({ id: s.id, problems: [] });
    }
  });

  it('sends sources and external ids that fit their tables, with no row twice', () => {
    const [fields, schemes, relations] = [allowed('field'), allowed('scheme'), allowed('relation')];
    const sources = SITES.flatMap((s) => (s.sources ?? []).flatMap((src) => src.fields.map((f) => ({ site: s.id, f, src }))));
    for (const { site, f, src } of sources) {
      expect({ site, f, ok: fields.includes(f) }).toEqual({ site, f, ok: true });
      if (src.retrieved) expect(src.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    const sourceKeys = sources.map(({ site, f, src }) => `${site}|${f}|${src.source}`);
    expect(new Set(sourceKeys).size).toBe(sourceKeys.length);

    const ids = SITES.flatMap((s) => (s.externalIds ?? []).map((e) => ({ site: s.id, ...e, relation: e.relation ?? 'same_as' })));
    for (const e of ids) expect({ site: e.site, ok: schemes.includes(e.scheme) && relations.includes(e.relation) }).toEqual({ site: e.site, ok: true });
    // unique (scheme, external_id, relation)
    const idKeys = ids.map((e) => `${e.scheme}|${e.id}|${e.relation}`);
    expect(new Set(idKeys).size).toBe(idKeys.length);
  });

  it('runs again on a project seeded before a site’s external id moved to another site', () => {
    const table = /create table public\.site_external_ids \(([\s\S]*?)\n\);/.exec(migration)![1];
    const keys = [...table.matchAll(/(?:primary key|unique) \(([^)]+)\)/g)].map((m) => m[1].split(', '));
    expect(keys).toEqual([['site_id', 'scheme', 'external_id'], ['scheme', 'external_id', 'relation']]);
    const target = EXTERNAL_ID_CONFLICT.split(',');
    expect(keys.map((k) => [...k].sort())).toContainEqual([...target].sort());

    // A site no longer listed (found to be a seed's duplicate, like OpenStreetMap's Cod Hole) sent its
    // ids while it was; a listed site has those ids now.
    const listed = new Set(SITES.map((s) => s.id));
    const before = externalIdRows([...SITES_BY_ID.values()].filter((s) => !listed.has(s.id)));
    const now = externalIdRows(SITES);
    const moved = now.filter((r) => before.some((b) => b.scheme === r.scheme && b.external_id === r.external_id && b.relation === r.relation));
    expect(moved.map((r) => r.site_id)).toContain('cod-hole');

    const after = upsert(before, now, target, keys);
    for (const r of moved) {
      expect(after.filter((x) => x.scheme === r.scheme && x.external_id === r.external_id && x.relation === r.relation)).toEqual([r]);
    }
  });
});
