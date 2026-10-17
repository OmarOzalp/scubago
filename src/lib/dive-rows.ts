/**
 * How a dive's fields are stored: one list of columns shared by the local database (src/lib/db.ts)
 * and the server table (supabase/migrations/0009_dive_log.sql), so the two can't drift apart.
 */
import type { Dive, DiveFields, DiveSignature } from '@/lib/types';

type Kind = 'int' | 'num' | 'text' | 'time' | 'list';

/** [field, column, kind] for every field a diver writes (the signature is stored in its own columns). */
export const DIVE_FIELD_COLUMNS: [keyof DiveFields, string, Kind][] = [
  ['number', 'number', 'int'],
  ['siteId', 'site_id', 'text'],
  ['divedOn', 'dived_on', 'text'],
  ['timeIn', 'time_in', 'time'],
  ['bottomTimeMin', 'bottom_time_min', 'num'],
  ['maxDepthM', 'max_depth_m', 'num'],
  ['avgDepthM', 'avg_depth_m', 'num'],
  ['waterTempC', 'water_temp_c', 'num'],
  ['airTempC', 'air_temp_c', 'num'],
  ['visibilityM', 'visibility_m', 'num'],
  ['current', 'water_current', 'text'],
  ['surface', 'surface', 'text'],
  ['entry', 'entry', 'text'],
  ['kinds', 'kinds', 'list'],
  ['gas', 'gas', 'text'],
  ['o2Percent', 'o2_percent', 'num'],
  ['tankL', 'tank_l', 'num'],
  ['tankMaterial', 'tank_material', 'text'],
  ['pressureStartBar', 'pressure_start_bar', 'num'],
  ['pressureEndBar', 'pressure_end_bar', 'num'],
  ['weightKg', 'weight_kg', 'num'],
  ['suit', 'suit', 'text'],
  ['rating', 'rating', 'num'],
  ['buddyName', 'buddy_name', 'text'],
  ['centreName', 'centre_name', 'text'],
  ['notes', 'notes', 'text'],
];

export const SIGNATURE_COLUMNS = ['signature_name', 'signature_svg', 'signature_role', 'signed_at'] as const;

/** The columns of a dive row as both sides hold it (besides id, user_id and the timestamps). */
export const DIVE_DATA_COLUMNS = [...DIVE_FIELD_COLUMNS.map(([, column]) => column), ...SIGNATURE_COLUMNS, 'from_sightings'];

/**
 * A dive's fields as column values. `list` holds how a list is kept: the server takes an array,
 * SQLite a JSON string. Missing fields are null, so writing the row clears them.
 */
export function diveToColumns(d: DiveFields & Pick<Dive, 'fromSightings'>, list: 'array' | 'json'): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, column, kind] of DIVE_FIELD_COLUMNS) {
    const v = d[key];
    // The server keeps an empty list rather than none.
    if (v === undefined || v === null) out[column] = kind === 'list' && list === 'array' ? [] : null;
    else if (kind === 'list') out[column] = list === 'json' ? JSON.stringify(v) : v;
    else out[column] = v;
  }
  out.signature_name = d.signature?.name ?? null;
  out.signature_svg = d.signature?.svg ?? null;
  out.signature_role = d.signature?.role ?? null;
  out.signed_at = d.signature?.at ?? null;
  out.from_sightings = !!d.fromSightings;
  return out;
}

const ROLES = new Set(['buddy', 'instructor', 'divemaster', 'guide', 'other']);

/** A row from either side back into a dive's fields (unknown values are dropped, never guessed). */
export function columnsToDive(row: Record<string, any>): DiveFields & Pick<Dive, 'fromSightings'> {
  const out: Record<string, unknown> = {};
  for (const [key, column, kind] of DIVE_FIELD_COLUMNS) {
    const v = row[column];
    if (v === undefined || v === null || v === '') continue;
    if (kind === 'list') {
      const list = typeof v === 'string' ? safeJson(v) : v;
      if (Array.isArray(list) && list.length) out[key] = list.filter((x) => typeof x === 'string');
    } else if (kind === 'int' || kind === 'num') {
      const n = Number(v);
      if (Number.isFinite(n)) out[key] = n;
    } else if (kind === 'time') {
      // Postgres hands back "09:30:00".
      out[key] = String(v).slice(0, 5);
    } else out[key] = String(v);
  }
  const fields = out as unknown as DiveFields & Pick<Dive, 'fromSightings'>;
  if (row.signature_name && row.signed_at) {
    const signature: DiveSignature = { name: String(row.signature_name), at: new Date(row.signed_at).toISOString() };
    if (row.signature_svg) signature.svg = String(row.signature_svg);
    if (ROLES.has(row.signature_role)) signature.role = row.signature_role;
    fields.signature = signature;
  }
  if (row.from_sightings === true || row.from_sightings === 1) fields.fromSightings = true;
  return fields;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
