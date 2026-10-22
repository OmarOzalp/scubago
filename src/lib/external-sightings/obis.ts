import { ParseError } from '@/lib/external-sightings/errors';
import { boxAround, boxToWkt } from '@/lib/external-sightings/geo';
import { buildQuery, fetchJson, isRecord, toNumber, toText, type ClientOptions } from '@/lib/external-sightings/http';
import type { SiteQuery } from '@/lib/external-sightings/inaturalist';

/**
 * OBIS API v3 (https://api.obis.org/). Written from the documentation, not against the live
 * service: see docs/real-sightings.md. Only aggregates are read: how many records each taxon has
 * inside a box around the site. No record, dataset or coordinate is read or kept.
 */

export const OBIS_API = 'https://api.obis.org/v3';
export const OBIS_WEBSITE = 'https://obis.org';

/**
 * Taxa per checklist page. OBIS sends 10 when none is asked for; a busy reef box holds a few hundred
 * (469 off Ras Mohammed, checked live in October 2026), so one page of 1000 holds a site's whole list.
 */
export const CHECKLIST_SIZE = 1000;

/** GET /checklist for a WKT box around the site: one row per taxon with its record count. */
export function checklistUrl(site: SiteQuery): string {
  return `${OBIS_API}/checklist${buildQuery({ geometry: boxToWkt(boxAround(site.lat, site.lng, site.radiusKm)), size: CHECKLIST_SIZE })}`;
}

export interface ObisTaxon {
  /** Names for the same row, best first: scientificName, then acceptedNameUsage, then species. */
  names: string[];
  rank?: string;
  records: number;
}

export interface ChecklistPage {
  taxa: ObisTaxon[];
  /** `total`, when the response says. */
  total?: number;
  rows: number;
}

/** Read a /checklist response. Rows without a name or a record count are skipped; no results array is an error. */
export function parseChecklist(json: unknown): ChecklistPage {
  if (!isRecord(json) || !Array.isArray(json.results)) throw new ParseError('checklist has no results');
  const taxa: ObisTaxon[] = [];
  for (const row of json.results) {
    if (!isRecord(row)) continue;
    const records = toNumber(row.records);
    if (records === undefined || records < 1) continue;
    const names = [row.scientificName, row.acceptedNameUsage, row.species]
      .map(toText)
      .filter((name, index, all): name is string => name !== undefined && all.indexOf(name) === index);
    if (names.length === 0) continue;
    taxa.push({ names, rank: toText(row.taxonRank)?.toLowerCase(), records: Math.floor(records) });
  }
  return { taxa, total: toNumber(json.total), rows: json.results.length };
}

export interface ChecklistResult {
  taxa: ObisTaxon[];
  /** The response says there are more taxa than it returned. */
  truncated: boolean;
}

/** Read the checklist for the box around the site. */
export async function fetchObisChecklist(site: SiteQuery, { fetchImpl, signal }: ClientOptions = {}): Promise<ChecklistResult> {
  const page = parseChecklist(await fetchJson(checklistUrl(site), { fetchImpl, signal }));
  return { taxa: page.taxa, truncated: page.total !== undefined && page.total > page.rows };
}
