import * as SQLite from 'expo-sqlite';

import { SITES } from '@/data/sites';
import { CATALOG_BY_ID } from '@/lib/catalog';
import { generateDemoSightings } from '@/lib/demo';
import type { DiveSite, Sighting } from '@/lib/types';

/** Bump to regenerate demo data on next launch (e.g. after seed data changes). */
const DEMO_VERSION = '1';

let db: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync('scubago.db');
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sightings (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        species_id TEXT NOT NULL,
        site_id TEXT NOT NULL,
        sighted_on TEXT NOT NULL,
        notes TEXT,
        photo_uri TEXT,
        is_demo INTEGER NOT NULL DEFAULT 0,
        synced INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sightings_site ON sightings(site_id);
      CREATE INDEX IF NOT EXISTS idx_sightings_species ON sightings(species_id);
      CREATE TABLE IF NOT EXISTS user_sites (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        region TEXT NOT NULL,
        country TEXT NOT NULL,
        blurb TEXT NOT NULL,
        synced INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
    `);

    const ver = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    if ((ver?.user_version ?? 0) < 2) {
      const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(user_sites)`);
      if (!cols.some((c) => c.name === 'synced')) {
        await db.execAsync('ALTER TABLE user_sites ADD COLUMN synced INTEGER NOT NULL DEFAULT 0');
      }
      await db.execAsync('PRAGMA user_version = 2');
    }
  }
  return db;
}

function rowToSighting(row: any): Sighting {
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    speciesId: row.species_id,
    siteId: row.site_id,
    sightedOn: row.sighted_on,
    notes: row.notes ?? undefined,
    photoUri: row.photo_uri ?? undefined,
    isDemo: !!row.is_demo,
    synced: !!row.synced,
    createdAt: row.created_at,
  };
}

async function insertSightingRow(d: SQLite.SQLiteDatabase, s: Sighting): Promise<void> {
  await d.runAsync(
    `INSERT OR REPLACE INTO sightings
       (id, user_id, username, species_id, site_id, sighted_on, notes, photo_uri, is_demo, synced, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    s.id, s.userId, s.username, s.speciesId, s.siteId, s.sightedOn,
    s.notes ?? null, s.photoUri ?? null, s.isDemo ? 1 : 0, s.synced ? 1 : 0, s.createdAt,
  );
}

/** Read everything the store needs (no seeding). */
export async function loadAll(): Promise<{ sightings: Sighting[]; userSites: DiveSite[] }> {
  const d = await getDb();
  const sightingRows = await d.getAllAsync<any>(`SELECT * FROM sightings`);
  const siteRows = await d.getAllAsync<any>(`SELECT * FROM user_sites`);
  return {
    sightings: sightingRows.map(rowToSighting),
    userSites: siteRows.map((row) => ({
      id: row.id,
      name: row.name,
      lat: row.lat,
      lng: row.lng,
      region: row.region,
      country: row.country,
      blurb: row.blurb,
      notableSpecies: [],
      source: 'user' as const,
    })),
  };
}

/** Open the database, seed demo data if needed, and return everything the store needs. */
export async function initDb(): Promise<{ sightings: Sighting[]; userSites: DiveSite[] }> {
  const d = await getDb();

  const meta = await d.getFirstAsync<{ value: string }>(
    `SELECT value FROM meta WHERE key = 'demo_version'`,
  );
  if (meta?.value !== DEMO_VERSION) {
    const demo = generateDemoSightings(SITES, CATALOG_BY_ID, { seed: 20260824, now: Date.now() });
    await d.withTransactionAsync(async () => {
      await d.runAsync(`DELETE FROM sightings WHERE is_demo = 1`);
      for (const s of demo) await insertSightingRow(d, s);
      await d.runAsync(
        `INSERT OR REPLACE INTO meta (key, value) VALUES ('demo_version', ?)`,
        DEMO_VERSION,
      );
    });
  }

  return loadAll();
}

export async function insertSighting(s: Sighting): Promise<void> {
  await insertSightingRow(await getDb(), s);
}

export async function insertUserSite(site: DiveSite): Promise<void> {
  const d = await getDb();
  await d.runAsync(
    `INSERT OR REPLACE INTO user_sites (id, name, lat, lng, region, country, blurb, synced, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    site.id, site.name, site.lat, site.lng, site.region, site.country, site.blurb, 0,
    new Date().toISOString(),
  );
}

export async function markSynced(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const d = await getDb();
  const placeholders = ids.map(() => '?').join(',');
  await d.runAsync(`UPDATE sightings SET synced = 1 WHERE id IN (${placeholders})`, ...ids);
}

export async function getUnsyncedUserSites(): Promise<DiveSite[]> {
  const d = await getDb();
  const rows = await d.getAllAsync<any>(`SELECT * FROM user_sites WHERE synced = 0`);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    lat: row.lat,
    lng: row.lng,
    region: row.region,
    country: row.country,
    blurb: row.blurb,
    notableSpecies: [],
    source: 'user' as const,
  }));
}

export async function markSitesSynced(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const d = await getDb();
  const placeholders = ids.map(() => '?').join(',');
  await d.runAsync(`UPDATE user_sites SET synced = 1 WHERE id IN (${placeholders})`, ...ids);
}

/** On first sign-in, hand the device-local log to the authenticated user. */
export async function claimLocalSightings(userId: string, username: string): Promise<void> {
  const d = await getDb();
  await d.runAsync(
    `UPDATE sightings SET user_id = ?, username = ?, synced = 0 WHERE user_id = 'local'`,
    userId,
    username,
  );
}

/** Upsert pulled remote sightings (and re-mark own pushed rows as synced). */
export async function upsertSightings(sightings: Sighting[]): Promise<void> {
  if (sightings.length === 0) return;
  const d = await getDb();
  await d.withTransactionAsync(async () => {
    for (const s of sightings) await insertSightingRow(d, s);
  });
}

export async function upsertUserSites(sites: DiveSite[]): Promise<void> {
  if (sites.length === 0) return;
  const d = await getDb();
  await d.withTransactionAsync(async () => {
    for (const site of sites) {
      await d.runAsync(
        `INSERT OR REPLACE INTO user_sites (id, name, lat, lng, region, country, blurb, synced, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        site.id, site.name, site.lat, site.lng, site.region, site.country, site.blurb,
        new Date().toISOString(),
      );
    }
  });
}
