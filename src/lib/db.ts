import * as SQLite from 'expo-sqlite';

import { SITES } from '@/data/sites';
import { CATALOG_BY_ID } from '@/lib/catalog';
import { generateDemoSightings } from '@/lib/demo';
import type { DiveSite, Sighting, SightingStatus } from '@/lib/types';

/** Bump to regenerate demo data on next launch (e.g. after seed data changes). */
const DEMO_VERSION = '1';

/** How long a confirmed deletion is remembered, so a stale copy can't bring the sighting back. */
const TOMBSTONE_DAYS = 30;

let db: SQLite.SQLiteDatabase | null = null;

/**
 * Every exported function runs through this queue, one at a time. The app has one connection, and
 * expo-sqlite transactions don't keep other queries out: without the queue, an edit made while a
 * sync is merging could land inside the sync's transaction and be rolled back with it.
 */
let queue: Promise<unknown> = Promise.resolve();
function exclusive<T>(task: (d: SQLite.SQLiteDatabase) => Promise<T>): Promise<T> {
  const run = queue.then(async () => task(await getDb()));
  queue = run.catch(() => undefined);
  return run;
}

/** Columns added in schema version 3 (editing, deleting and verification status). */
const SIGHTING_COLUMNS_V3: [name: string, definition: string][] = [
  // A deletion waiting to reach the server (synced = 0), or one it confirmed (synced = 1).
  ['deleted', 'INTEGER NOT NULL DEFAULT 0'],
  // The server has this row (pushed or pulled at least once).
  ['remote', 'INTEGER NOT NULL DEFAULT 0'],
  // Bumped by every local change, so a push that raced an edit doesn't mark the edit as synced.
  ['version', 'INTEGER NOT NULL DEFAULT 0'],
  ['updated_at', 'TEXT'],
  ['status', 'TEXT'],
  ['sync_error', 'TEXT'],
  // The photo URL the server holds, so a replaced or removed photo can be deleted from storage.
  ['synced_photo_url', 'TEXT'],
];

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
        created_at TEXT NOT NULL,
        ${SIGHTING_COLUMNS_V3.map(([name, definition]) => `${name} ${definition}`).join(',\n        ')}
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
    if ((ver?.user_version ?? 0) < 3) {
      const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(sightings)`);
      for (const [name, definition] of SIGHTING_COLUMNS_V3) {
        if (!cols.some((c) => c.name === name)) {
          await db.execAsync(`ALTER TABLE sightings ADD COLUMN ${name} ${definition}`);
        }
      }
      // Rows that already synced are on the server (pushed, or pulled from it).
      await db.execAsync(`
        UPDATE sightings SET remote = 1,
          synced_photo_url = CASE WHEN photo_uri LIKE 'http%' THEN photo_uri END
        WHERE synced = 1 AND is_demo = 0;
        PRAGMA user_version = 3;
      `);
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
    updatedAt: row.updated_at ?? undefined,
    status: (row.status as SightingStatus | null) ?? undefined,
    syncError: row.sync_error ?? undefined,
  };
}

function rowToUserSite(row: any): DiveSite {
  return {
    id: row.id,
    name: row.name,
    lat: row.lat,
    lng: row.lng,
    region: row.region,
    country: row.country,
    blurb: row.blurb,
    notableSpecies: [],
    source: 'user' as const,
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

/** A deletion the server hasn't confirmed yet. The sighting is already gone from the app. */
export interface PendingDeletion {
  id: string;
  userId: string;
  syncError?: string;
}

export interface LocalData {
  /** Every sighting except deleted ones. */
  sightings: Sighting[];
  userSites: DiveSite[];
  deletions: PendingDeletion[];
}

async function readAll(d: SQLite.SQLiteDatabase): Promise<LocalData> {
  const sightingRows = await d.getAllAsync<any>(`SELECT * FROM sightings WHERE deleted = 0`);
  const deletionRows = await d.getAllAsync<any>(
    `SELECT id, user_id, sync_error FROM sightings WHERE deleted = 1 AND synced = 0`,
  );
  const siteRows = await d.getAllAsync<any>(`SELECT * FROM user_sites`);
  return {
    sightings: sightingRows.map(rowToSighting),
    userSites: siteRows.map(rowToUserSite),
    deletions: deletionRows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      syncError: row.sync_error ?? undefined,
    })),
  };
}

/** Read everything the store needs (no seeding). */
export function loadAll(): Promise<LocalData> {
  return exclusive(readAll);
}

/**
 * Open the database, seed demo data if needed, and return everything the store needs.
 * `demo: false` (a build with a real backend) removes any demo community sightings and
 * never generates them: invented sightings must never sit beside real ones. Only rows
 * flagged is_demo are touched; the user's own log is never affected.
 */
export function initDb({ demo }: { demo: boolean }): Promise<LocalData> {
  return exclusive(async (d) => {
    // Confirmed deletions only need remembering for a while.
    const cutoff = new Date(Date.now() - TOMBSTONE_DAYS * 86_400_000).toISOString();
    await d.runAsync(`DELETE FROM sightings WHERE deleted = 1 AND synced = 1 AND updated_at < ?`, cutoff);

    if (!demo) {
      await d.withTransactionAsync(async () => {
        await d.runAsync(`DELETE FROM sightings WHERE is_demo = 1`);
        await d.runAsync(`DELETE FROM meta WHERE key = 'demo_version'`);
      });
      return readAll(d);
    }

    const meta = await d.getFirstAsync<{ value: string }>(
      `SELECT value FROM meta WHERE key = 'demo_version'`,
    );
    if (meta?.value !== DEMO_VERSION) {
      const rows = generateDemoSightings(SITES, CATALOG_BY_ID, { seed: 20260824, now: Date.now() });
      await d.withTransactionAsync(async () => {
        await d.runAsync(`DELETE FROM sightings WHERE is_demo = 1`);
        for (const s of rows) await insertSightingRow(d, s);
        await d.runAsync(
          `INSERT OR REPLACE INTO meta (key, value) VALUES ('demo_version', ?)`,
          DEMO_VERSION,
        );
      });
    }

    return readAll(d);
  });
}

export function insertSighting(s: Sighting): Promise<void> {
  return exclusive((d) => insertSightingRow(d, s));
}

/**
 * Save an edit to one of the diver's sightings (its facts, notes, photo and the status the edit
 * leaves it with). The change waits in the outbox until it syncs. Throws if the sighting is gone.
 */
export function updateSighting(s: Sighting): Promise<void> {
  return exclusive(async (d) => {
    const { changes } = await d.runAsync(
      `UPDATE sightings SET species_id = ?, site_id = ?, sighted_on = ?, notes = ?, photo_uri = ?,
         status = ?, updated_at = ?, synced = 0, sync_error = NULL, version = version + 1
       WHERE id = ? AND deleted = 0 AND is_demo = 0`,
      s.speciesId, s.siteId, s.sightedOn, s.notes ?? null, s.photoUri ?? null,
      s.status ?? null, s.updatedAt ?? new Date().toISOString(), s.id,
    );
    if (changes === 0) throw new Error('This sighting no longer exists.');
  });
}

/**
 * Delete a sighting. `pendingSync` keeps a tombstone until the server confirms the deletion (the
 * sighting disappears from the app at once, and a pull can't bring it back); otherwise, for a log
 * that never leaves the device, the row simply goes.
 */
export function deleteSighting(id: string, { pendingSync }: { pendingSync: boolean }): Promise<void> {
  return exclusive(async (d) => {
    if (pendingSync) {
      await d.runAsync(
        `UPDATE sightings SET deleted = 1, synced = 0, sync_error = NULL, updated_at = ?, version = version + 1
         WHERE id = ? AND is_demo = 0`,
        new Date().toISOString(), id,
      );
    } else {
      await d.runAsync(`DELETE FROM sightings WHERE id = ? AND is_demo = 0`, id);
    }
  });
}

/** A change on its way to the server: a new or edited sighting, or a deletion (`deleted`). */
export interface OutboxSighting extends Sighting {
  deleted: boolean;
  /** The server has had this row before. */
  remote: boolean;
  version: number;
  /** The photo URL the server holds for it. */
  syncedPhotoUrl?: string;
}

/** The diver's changes that haven't reached the server yet, oldest first. */
export function getSightingOutbox(userId: string): Promise<OutboxSighting[]> {
  return exclusive(async (d) => {
    const rows = await d.getAllAsync<any>(
      `SELECT * FROM sightings WHERE user_id = ? AND is_demo = 0 AND synced = 0 ORDER BY created_at`,
      userId,
    );
    return rows.map((row) => ({
      ...rowToSighting(row),
      deleted: !!row.deleted,
      remote: !!row.remote,
      version: row.version,
      syncedPhotoUrl: row.synced_photo_url ?? undefined,
    }));
  });
}

/**
 * The server now has this version of the sighting, with `photoUrl` as its photo. It counts as synced
 * only if nothing changed while it was on its way; a newer edit or a deletion goes next time.
 * Returns whether it did (and so whether the local row now points at `photoUrl`).
 */
export function markPushed(id: string, version: number, photoUrl: string | null): Promise<boolean> {
  return exclusive(async (d) => {
    let done = false;
    await d.withTransactionAsync(async () => {
      await d.runAsync(`UPDATE sightings SET remote = 1, synced_photo_url = ? WHERE id = ?`, photoUrl, id);
      const { changes } = await d.runAsync(
        `UPDATE sightings SET synced = 1, sync_error = NULL, photo_uri = ?
         WHERE id = ? AND version = ? AND deleted = 0`,
        photoUrl, id, version,
      );
      done = changes > 0;
    });
    return done;
  });
}

/** Remember why a change couldn't sync (shown to the diver); it stays queued. */
export function markSyncFailed(id: string, message: string): Promise<void> {
  return exclusive(async (d) => {
    await d.runAsync(`UPDATE sightings SET sync_error = ? WHERE id = ?`, message.slice(0, 300), id);
  });
}

/** The server confirmed a deletion. The tombstone stays for a while (see TOMBSTONE_DAYS). */
export function markDeletionSynced(id: string): Promise<void> {
  return exclusive(async (d) => {
    await d.runAsync(
      `UPDATE sightings SET synced = 1, sync_error = NULL, remote = 0, synced_photo_url = NULL
       WHERE id = ? AND deleted = 1`,
      id,
    );
  });
}

/**
 * Drop a sighting the server no longer has (deleted on another device). A deletion elsewhere wins
 * over an edit made here in the meantime.
 */
export function forgetSighting(id: string): Promise<void> {
  return exclusive(async (d) => {
    await d.runAsync(`DELETE FROM sightings WHERE id = ? AND is_demo = 0`, id);
  });
}

/** What a pull covered, so rows missing from it can be told apart from rows it didn't reach. */
export interface PullScope {
  /** The signed-in diver. */
  ownerId: string;
  /** The pull returned every one of the diver's own rows. */
  ownComplete: boolean;
  /** The oldest created_at in the community pull, or null if it returned every row there is. */
  communitySince: string | null;
}

/**
 * Merge a pull into the local database:
 * - a change still waiting here (an edit, or a deletion) wins over the server's copy;
 * - a sighting deleted here but still on the server is queued for deletion again;
 * - a synced row the pull should have returned but didn't was deleted on the server, so it goes.
 */
export function mergePulledSightings(
  pulled: Sighting[],
  scope: PullScope,
): Promise<{ saved: number; removed: number; redeleted: number }> {
  return exclusive(async (d) => {
    let saved = 0;
    let redeleted = 0;
    const gone: string[] = [];
    await d.withTransactionAsync(async () => {
      const local = new Map(
        (await d.getAllAsync<any>(
          `SELECT id, user_id, synced, deleted, remote, is_demo, created_at FROM sightings`,
        )).map((row) => [row.id as string, row]),
      );
      const seen = new Set<string>();
      for (const s of pulled) {
        seen.add(s.id);
        const mine = local.get(s.id);
        if (mine?.is_demo) continue;
        if (mine?.deleted) {
          if (mine.synced && s.userId === scope.ownerId) {
            await d.runAsync(`UPDATE sightings SET synced = 0 WHERE id = ? AND deleted = 1`, s.id);
            redeleted++;
          }
          continue;
        }
        if (mine && !mine.synced) continue;
        const { changes } = await d.runAsync(
          `INSERT INTO sightings
             (id, user_id, username, species_id, site_id, sighted_on, notes, photo_uri, is_demo, synced,
              created_at, remote, status, synced_photo_url)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, 1, ?, ?)
           ON CONFLICT (id) DO UPDATE SET
             user_id = excluded.user_id, username = excluded.username, species_id = excluded.species_id,
             site_id = excluded.site_id, sighted_on = excluded.sighted_on, notes = excluded.notes,
             photo_uri = excluded.photo_uri, created_at = excluded.created_at, remote = 1,
             status = COALESCE(excluded.status, sightings.status),
             synced_photo_url = excluded.synced_photo_url, sync_error = NULL
           WHERE sightings.synced = 1 AND sightings.deleted = 0`,
          s.id, s.userId, s.username, s.speciesId, s.siteId, s.sightedOn, s.notes ?? null,
          s.photoUri ?? null, s.createdAt, s.status ?? null, s.photoUri ?? null,
        );
        saved += changes;
      }

      for (const row of local.values()) {
        if (seen.has(row.id) || row.is_demo || row.deleted || !row.synced || !row.remote) continue;
        const covered = row.user_id === scope.ownerId
          ? scope.ownComplete
          : scope.communitySince === null || row.created_at > scope.communitySince;
        if (covered) gone.push(row.id);
      }
      for (let i = 0; i < gone.length; i += 500) {
        const chunk = gone.slice(i, i + 500);
        await d.runAsync(
          `DELETE FROM sightings WHERE id IN (${chunk.map(() => '?').join(',')}) AND synced = 1 AND deleted = 0`,
          ...chunk,
        );
      }
    });
    return { saved, removed: gone.length, redeleted };
  });
}

export function insertUserSite(site: DiveSite): Promise<void> {
  return exclusive(async (d) => {
    await d.runAsync(
      `INSERT OR REPLACE INTO user_sites (id, name, lat, lng, region, country, blurb, synced, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      site.id, site.name, site.lat, site.lng, site.region, site.country, site.blurb, 0,
      new Date().toISOString(),
    );
  });
}

export function getUnsyncedUserSites(): Promise<DiveSite[]> {
  return exclusive(async (d) => {
    const rows = await d.getAllAsync<any>(`SELECT * FROM user_sites WHERE synced = 0`);
    return rows.map(rowToUserSite);
  });
}

export function markSitesSynced(ids: string[]): Promise<void> {
  return exclusive(async (d) => {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(',');
    await d.runAsync(`UPDATE user_sites SET synced = 1 WHERE id IN (${placeholders})`, ...ids);
  });
}

/** On first sign-in, hand the device-local log to the authenticated user. */
export function claimLocalSightings(userId: string, username: string): Promise<void> {
  return exclusive(async (d) => {
    await d.runAsync(
      `UPDATE sightings SET user_id = ?, username = ?, synced = 0 WHERE user_id = 'local'`,
      userId,
      username,
    );
  });
}

/** After the account is deleted: remove that user's own rows (their log and its outbox) from this device. */
export function deleteLocalUserData(userId: string): Promise<void> {
  return exclusive(async (d) => {
    await d.runAsync(`DELETE FROM sightings WHERE user_id = ?`, userId);
  });
}

export function upsertUserSites(sites: DiveSite[]): Promise<void> {
  return exclusive(async (d) => {
    if (sites.length === 0) return;
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
  });
}
