import * as SQLite from 'expo-sqlite';

import { SITES } from '@/data/sites';
import { CATALOG_BY_ID } from '@/lib/catalog';
import { claimDatabase } from '@/lib/db-lock';
import { generateDemoSightings } from '@/lib/demo';
import { columnsToDive, DIVE_DATA_COLUMNS, diveToColumns } from '@/lib/dive-rows';
import type { Dive, DiveSignature, DiveSite, Sighting, SightingStatus, Visibility } from '@/lib/types';

/** Bump to regenerate demo data on next launch (e.g. after seed data changes). */
const DEMO_VERSION = '1';

/** How long a confirmed deletion is remembered, so a stale copy can't bring the sighting back. */
const TOMBSTONE_DAYS = 30;

let db: SQLite.SQLiteDatabase | null = null;

/** The log is open in another browser tab (the web build allows one at a time). */
export class DatabaseBusyError extends Error {
  constructor() {
    super('ScubaGo is open in another tab.');
    this.name = 'DatabaseBusyError';
  }
}

/** How a browser reports that another tab has the file (if the lock was missing or bypassed). */
const FILE_IN_USE = /createSyncAccessHandle|NoModificationAllowed|Invalid VFS state/;

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

/** Columns added in schema version 6 (privacy). */
const SIGHTING_COLUMNS_V6: [name: string, definition: string][] = [
  // 'private', 'public', or NULL for a sighting from before privacy (shared, like 'public').
  ['visibility', 'TEXT'],
  ['notes_private', 'INTEGER NOT NULL DEFAULT 0'],
  ['photo_private', 'INTEGER NOT NULL DEFAULT 0'],
];

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    if (!(await claimDatabase())) throw new DatabaseBusyError();
    try {
      db = await openAndMigrate();
    } catch (e) {
      db = null;
      throw e instanceof Error && FILE_IN_USE.test(`${e.name} ${e.message}`) ? new DatabaseBusyError() : e;
    }
  }
  return db;
}

/** Opens the database and brings its tables up to date. */
async function openAndMigrate(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync('scubago.db');
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
      created_at TEXT NOT NULL,
      created_by TEXT
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
  if ((ver?.user_version ?? 0) < 4) {
    // Who added each user site, so only your own say "added by you". Sites downloaded before
    // this stay unknown until the next sync fills it in.
    const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(user_sites)`);
    if (!cols.some((c) => c.name === 'created_by')) {
      await db.execAsync('ALTER TABLE user_sites ADD COLUMN created_by TEXT');
    }
    await db.execAsync('PRAGMA user_version = 4');
  }
  if ((ver?.user_version ?? 0) < 5) {
    // "Something else" sightings carry the diver's own name for the animal.
    const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(sightings)`);
    if (!cols.some((c) => c.name === 'custom_name')) {
      await db.execAsync('ALTER TABLE sightings ADD COLUMN custom_name TEXT');
    }
    await db.execAsync('PRAGMA user_version = 5');
  }
  if ((ver?.user_version ?? 0) < 6) {
    // Who can see each sighting, its notes and its photo (migration 0008). Existing sightings
    // stay as they were: shared with everyone.
    const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(sightings)`);
    for (const [name, definition] of SIGHTING_COLUMNS_V6) {
      if (!cols.some((c) => c.name === name)) {
        await db.execAsync(`ALTER TABLE sightings ADD COLUMN ${name} ${definition}`);
      }
    }
    await db.execAsync('PRAGMA user_version = 6');
  }
  if ((ver?.user_version ?? 0) < 7) {
    // The dive log (migration 0009): a page per dive, and each sighting's dive. Existing sightings
    // keep no dive until the store binds them into past pages.
    await db.execAsync(DIVES_TABLE);
    const cols = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(sightings)`);
    if (!cols.some((c) => c.name === 'dive_id')) await db.execAsync('ALTER TABLE sightings ADD COLUMN dive_id TEXT');
    await db.execAsync('CREATE INDEX IF NOT EXISTS idx_sightings_dive ON sightings(dive_id); PRAGMA user_version = 7;');
  }
  return db;
}

/** A page of the diver's log, with the same outbox columns as sightings (synced, remote, deleted, version). */
const DIVES_TABLE = `
  CREATE TABLE IF NOT EXISTS dives (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    number INTEGER NOT NULL,
    site_id TEXT NOT NULL,
    dived_on TEXT NOT NULL,
    time_in TEXT,
    bottom_time_min REAL,
    max_depth_m REAL,
    avg_depth_m REAL,
    water_temp_c REAL,
    air_temp_c REAL,
    visibility_m REAL,
    water_current TEXT,
    surface TEXT,
    entry TEXT,
    kinds TEXT,
    gas TEXT,
    o2_percent REAL,
    tank_l REAL,
    tank_material TEXT,
    pressure_start_bar REAL,
    pressure_end_bar REAL,
    weight_kg REAL,
    suit TEXT,
    rating REAL,
    buddy_name TEXT,
    centre_name TEXT,
    notes TEXT,
    signature_name TEXT,
    signature_svg TEXT,
    signature_role TEXT,
    signed_at TEXT,
    from_sightings INTEGER NOT NULL DEFAULT 0,
    remote_signatures TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT,
    synced INTEGER NOT NULL DEFAULT 0,
    remote INTEGER NOT NULL DEFAULT 0,
    deleted INTEGER NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 0,
    sync_error TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_dives_user ON dives(user_id, number);
`;

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
    customName: row.custom_name ?? undefined,
    isDemo: !!row.is_demo,
    synced: !!row.synced,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
    status: (row.status as SightingStatus | null) ?? undefined,
    syncError: row.sync_error ?? undefined,
    visibility: (row.visibility as Visibility | null) ?? undefined,
    notesPrivate: row.notes_private ? true : undefined,
    photoPrivate: row.photo_private ? true : undefined,
    diveId: row.dive_id ?? undefined,
  };
}

function rowToDive(row: any): Dive {
  let remoteSignatures: DiveSignature[] | undefined;
  if (row.remote_signatures) {
    try {
      const list = JSON.parse(row.remote_signatures);
      if (Array.isArray(list) && list.length) remoteSignatures = list;
    } catch {
      remoteSignatures = undefined;
    }
  }
  return {
    ...columnsToDive(row),
    id: row.id,
    userId: row.user_id,
    synced: !!row.synced,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
    syncError: row.sync_error ?? undefined,
    ...(remoteSignatures ? { remoteSignatures } : {}),
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
    // Older rows have no owner: an unsynced one can only have been added here.
    ...(row.created_by ? { createdBy: row.created_by } : row.synced ? {} : { createdBy: 'local' }),
  };
}

async function insertSightingRow(d: SQLite.SQLiteDatabase, s: Sighting): Promise<void> {
  await d.runAsync(
    `INSERT OR REPLACE INTO sightings
       (id, user_id, username, species_id, site_id, sighted_on, notes, photo_uri, is_demo, synced, created_at, custom_name,
        visibility, notes_private, photo_private, dive_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    s.id, s.userId, s.username, s.speciesId, s.siteId, s.sightedOn,
    s.notes ?? null, s.photoUri ?? null, s.isDemo ? 1 : 0, s.synced ? 1 : 0, s.createdAt, s.customName ?? null,
    s.visibility ?? null, s.notesPrivate ? 1 : 0, s.photoPrivate ? 1 : 0, s.diveId ?? null,
  );
}

/** The local row's values for a dive's own columns, in DIVE_DATA_COLUMNS order. */
const diveValues = (dive: Dive) => {
  const cols = diveToColumns(dive, 'json');
  return DIVE_DATA_COLUMNS.map((c) => (c === 'from_sightings' ? (cols[c] ? 1 : 0) : (cols[c] as string | number | null)));
};

async function insertDiveRow(d: SQLite.SQLiteDatabase, dive: Dive): Promise<void> {
  await d.runAsync(
    `INSERT OR REPLACE INTO dives (id, user_id, created_at, updated_at, synced, ${DIVE_DATA_COLUMNS.join(', ')})
     VALUES (?, ?, ?, ?, ?, ${DIVE_DATA_COLUMNS.map(() => '?').join(', ')})`,
    dive.id, dive.userId, dive.createdAt, dive.updatedAt ?? null, dive.synced ? 1 : 0, ...diveValues(dive),
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
  /** Every page of the log except deleted ones. */
  dives: Dive[];
  /** Pages deleted here that the server hasn't confirmed yet. */
  diveDeletions: PendingDeletion[];
  /** Dives each diver logged before ScubaGo, by owner id (see setDivesBefore). */
  divesBefore: Record<string, number>;
}

const DIVES_BEFORE = 'dives_before:';

async function readAll(d: SQLite.SQLiteDatabase): Promise<LocalData> {
  const sightingRows = await d.getAllAsync<any>(`SELECT * FROM sightings WHERE deleted = 0`);
  const deletionRows = await d.getAllAsync<any>(
    `SELECT id, user_id, sync_error FROM sightings WHERE deleted = 1 AND synced = 0`,
  );
  const siteRows = await d.getAllAsync<any>(`SELECT * FROM user_sites`);
  const diveRows = await d.getAllAsync<any>(`SELECT * FROM dives WHERE deleted = 0`);
  const diveDeletionRows = await d.getAllAsync<any>(`SELECT id, user_id, sync_error FROM dives WHERE deleted = 1 AND synced = 0`);
  const before = await d.getAllAsync<{ key: string; value: string }>(`SELECT key, value FROM meta WHERE key LIKE '${DIVES_BEFORE}%'`);
  const pending = (row: any): PendingDeletion => ({ id: row.id, userId: row.user_id, syncError: row.sync_error ?? undefined });
  return {
    sightings: sightingRows.map(rowToSighting),
    userSites: siteRows.map(rowToUserSite),
    deletions: deletionRows.map(pending),
    dives: diveRows.map(rowToDive),
    diveDeletions: diveDeletionRows.map(pending),
    divesBefore: Object.fromEntries(before.map((r) => [r.key.slice(DIVES_BEFORE.length), Number(r.value) || 0])),
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
 * Save an edit to one of the diver's sightings (its facts, notes, photo, who can see them, and the
 * status the edit leaves it with). The change waits in the outbox until it syncs. Throws if the sighting is gone.
 */
export function updateSighting(s: Sighting): Promise<void> {
  return exclusive(async (d) => {
    const { changes } = await d.runAsync(
      `UPDATE sightings SET species_id = ?, site_id = ?, sighted_on = ?, notes = ?, photo_uri = ?, custom_name = ?,
         visibility = ?, notes_private = ?, photo_private = ?, dive_id = ?,
         status = ?, updated_at = ?, synced = 0, sync_error = NULL, version = version + 1
       WHERE id = ? AND deleted = 0 AND is_demo = 0`,
      s.speciesId, s.siteId, s.sightedOn, s.notes ?? null, s.photoUri ?? null, s.customName ?? null,
      s.visibility ?? null, s.notesPrivate ? 1 : 0, s.photoPrivate ? 1 : 0, s.diveId ?? null,
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

/**
 * Delete several of the diver's sightings together (all of one animal's log, say) in one transaction:
 * tombstones until the server confirms when `pendingSync` (as deleteSighting does); otherwise the rows go.
 */
export function deleteSightings(ids: string[], { pendingSync }: { pendingSync: boolean }): Promise<void> {
  return exclusive(async (d) => {
    const now = new Date().toISOString();
    await d.withTransactionAsync(async () => {
      for (const id of ids) {
        if (pendingSync) {
          await d.runAsync(
            `UPDATE sightings SET deleted = 1, synced = 0, sync_error = NULL, updated_at = ?, version = version + 1
             WHERE id = ? AND is_demo = 0`,
            now, id,
          );
        } else {
          await d.runAsync(`DELETE FROM sightings WHERE id = ? AND is_demo = 0`, id);
        }
      }
    });
  });
}

/** A change on its way to the server: a new or edited sighting, or a deletion (`deleted`). */
export interface OutboxSighting extends Sighting {
  deleted: boolean;
  /** The server has had this row before. */
  remote: boolean;
  version: number;
  /** The photo the server holds for it: a public URL, or a private ref (src/lib/privacy.ts). */
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
  /**
   * The pull carried each sighting's dive (a project with migration 0009). Without it, the dive a
   * sighting was linked to here is kept rather than cleared.
   */
  diveIds?: boolean;
}

/**
 * Merge a pull into the local database:
 * - a change still waiting here (an edit, or a deletion) wins over the server's copy;
 * - a sighting deleted here but still on the server is queued for deletion again;
 * - a synced row the pull should have returned but didn't was deleted on the server, so it goes;
 * - a pull that says nothing about who can see a sighting (a project without migration 0008, as
 *   far as this session knows) never makes a private one look shared;
 * - a pull that can't tell whether the diver keeps a sighting's notes or photo to themselves (it
 *   has none yet: notesPrivate or photoPrivate undefined) leaves the choice made here.
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
      const flag = (v: boolean | undefined) => (v === undefined ? null : v ? 1 : 0);
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
              created_at, remote, status, synced_photo_url, custom_name, visibility, notes_private, photo_private, dive_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, 1, ?, ?, ?, ?, COALESCE(?, 0), COALESCE(?, 0), ?)
           ON CONFLICT (id) DO UPDATE SET
             user_id = excluded.user_id, username = excluded.username, species_id = excluded.species_id,
             site_id = excluded.site_id, sighted_on = excluded.sighted_on, notes = excluded.notes,
             photo_uri = excluded.photo_uri, created_at = excluded.created_at, remote = 1,
             custom_name = excluded.custom_name, visibility = COALESCE(excluded.visibility, sightings.visibility),
             notes_private = COALESCE(?, sightings.notes_private), photo_private = COALESCE(?, sightings.photo_private),
             status = COALESCE(excluded.status, sightings.status),
             synced_photo_url = excluded.synced_photo_url, sync_error = NULL,
             dive_id = CASE WHEN ? AND excluded.dive_id IS NOT NULL THEN excluded.dive_id ELSE sightings.dive_id END
           WHERE sightings.synced = 1 AND sightings.deleted = 0`,
          s.id, s.userId, s.username, s.speciesId, s.siteId, s.sightedOn, s.notes ?? null,
          s.photoUri ?? null, s.createdAt, s.status ?? null, s.photoUri ?? null, s.customName ?? null,
          s.visibility ?? null, flag(s.notesPrivate), flag(s.photoPrivate), s.diveId ?? null,
          flag(s.notesPrivate), flag(s.photoPrivate), scope.diveIds ? 1 : 0,
        );
        saved += changes;
        // The server has the dive column but not this sighting's page (it was sent before the
        // server had a dive log): keep the page here and send the sighting again with it.
        if (scope.diveIds && !s.diveId && changes > 0) {
          await d.runAsync(
            `UPDATE sightings SET synced = 0, version = version + 1
             WHERE id = ? AND synced = 1 AND dive_id IS NOT NULL AND dive_id IN (SELECT id FROM dives WHERE deleted = 0)`,
            s.id,
          );
        }
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
      `INSERT OR REPLACE INTO user_sites (id, name, lat, lng, region, country, blurb, synced, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      site.id, site.name, site.lat, site.lng, site.region, site.country, site.blurb, 0,
      new Date().toISOString(), site.createdBy ?? 'local',
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

/** On first sign-in, hand the device-local log (sightings, pages and the dives-before count) to the authenticated user. */
export function claimLocalSightings(userId: string, username: string): Promise<void> {
  return exclusive(async (d) => {
    await d.withTransactionAsync(async () => {
      await d.runAsync(
        `UPDATE sightings SET user_id = ?, username = ?, synced = 0 WHERE user_id = 'local'`,
        userId,
        username,
      );
      await d.runAsync(`UPDATE dives SET user_id = ?, synced = 0 WHERE user_id = 'local'`, userId);
      // The count set before signing in carries over, unless this account already has one here.
      await d.runAsync(
        `INSERT OR IGNORE INTO meta (key, value) SELECT ?, value FROM meta WHERE key = ?`,
        `${DIVES_BEFORE}${userId}`, `${DIVES_BEFORE}local`,
      );
      await d.runAsync(`DELETE FROM meta WHERE key = ?`, `${DIVES_BEFORE}local`);
    });
  });
}

/** After the account is deleted: remove that user's own rows (their log and its outbox) from this device. */
export function deleteLocalUserData(userId: string): Promise<void> {
  return exclusive(async (d) => {
    await d.runAsync(`DELETE FROM sightings WHERE user_id = ?`, userId);
    await d.runAsync(`DELETE FROM dives WHERE user_id = ?`, userId);
    await d.runAsync(`DELETE FROM meta WHERE key = ?`, `${DIVES_BEFORE}${userId}`);
  });
}

/**
 * When a diver signs out: remove from this device (it may be shared) what of theirs the server
 * already has. Changes still waiting to sync stay, and so do the synced pages they are on (a sighting
 * must not lose its page): they would be lost otherwise, and go up when the diver signs back in.
 */
export function forgetSyncedUserData(userId: string): Promise<void> {
  return exclusive(async (d) => {
    await d.withTransactionAsync(async () => {
      await d.runAsync(`DELETE FROM sightings WHERE user_id = ? AND synced = 1 AND is_demo = 0`, userId);
      await d.runAsync(
        `DELETE FROM dives WHERE user_id = ? AND synced = 1
           AND id NOT IN (SELECT dive_id FROM sightings WHERE dive_id IS NOT NULL)`,
        userId,
      );
    });
  });
}

export function upsertUserSites(sites: DiveSite[]): Promise<void> {
  return exclusive(async (d) => {
    if (sites.length === 0) return;
    await d.withTransactionAsync(async () => {
      for (const site of sites) {
        await d.runAsync(
          `INSERT OR REPLACE INTO user_sites (id, name, lat, lng, region, country, blurb, synced, created_at, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
          site.id, site.name, site.lat, site.lng, site.region, site.country, site.blurb,
          new Date().toISOString(), site.createdBy ?? null,
        );
      }
    });
  });
}

// ── The dive log ─────────────────────────────────────────────────────────────

/** Write a new page and the sightings made on it, together (all or nothing). */
export function insertDive(dive: Dive, sightings: Sighting[] = []): Promise<void> {
  return exclusive(async (d) => {
    await d.withTransactionAsync(async () => {
      await insertDiveRow(d, dive);
      for (const s of sightings) await insertSightingRow(d, s);
    });
  });
}

/**
 * Save changes to a page, and to the sightings on it that change with it (a new site or date moves
 * them too). Waits in the outbox until it syncs. Throws if the page is gone.
 */
export function updateDive(dive: Dive, sightings: Sighting[] = []): Promise<void> {
  return exclusive(async (d) => {
    await d.withTransactionAsync(async () => {
      const { changes } = await d.runAsync(
        `UPDATE dives SET ${DIVE_DATA_COLUMNS.map((c) => `${c} = ?`).join(', ')},
           remote_signatures = ?, updated_at = ?, synced = 0, sync_error = NULL, version = version + 1
         WHERE id = ? AND deleted = 0`,
        ...diveValues(dive),
        // Buddies' signatures come from the server; a page moved to another site or day loses them.
        dive.remoteSignatures?.length ? JSON.stringify(dive.remoteSignatures) : null,
        dive.updatedAt ?? new Date().toISOString(),
        dive.id,
      );
      if (changes === 0) throw new Error('This dive is no longer in your log.');
      for (const s of sightings) {
        await d.runAsync(
          `UPDATE sightings SET site_id = ?, sighted_on = ?, dive_id = ?, status = ?, updated_at = ?,
             synced = 0, sync_error = NULL, version = version + 1
           WHERE id = ? AND deleted = 0 AND is_demo = 0`,
          s.siteId, s.sightedOn, s.diveId ?? null, s.status ?? null, s.updatedAt ?? new Date().toISOString(), s.id,
        );
      }
    });
  });
}

/**
 * Delete a page and the sightings on it. `pendingSync` keeps tombstones until the server confirms
 * (as deleteSighting does); otherwise the rows simply go.
 */
export function deleteDive(id: string, sightingIds: string[], { pendingSync }: { pendingSync: boolean }): Promise<void> {
  return exclusive(async (d) => {
    const now = new Date().toISOString();
    await d.withTransactionAsync(async () => {
      for (const sid of sightingIds) {
        if (pendingSync) {
          await d.runAsync(
            `UPDATE sightings SET deleted = 1, synced = 0, sync_error = NULL, updated_at = ?, version = version + 1
             WHERE id = ? AND is_demo = 0`,
            now, sid,
          );
        } else {
          await d.runAsync(`DELETE FROM sightings WHERE id = ? AND is_demo = 0`, sid);
        }
      }
      if (pendingSync) {
        await d.runAsync(
          `UPDATE dives SET deleted = 1, synced = 0, sync_error = NULL, updated_at = ?, version = version + 1 WHERE id = ?`,
          now, id,
        );
      } else {
        await d.runAsync(`DELETE FROM dives WHERE id = ?`, id);
      }
    });
  });
}

/**
 * Bind sightings to pages (sightings from before dives, put on past pages): write the new pages and
 * set each sighting's dive. The sightings wait in the outbox, like any edit.
 */
export function bindSightingsToDives(dives: Dive[], links: { sightingId: string; diveId: string }[]): Promise<void> {
  return exclusive(async (d) => {
    if (dives.length === 0 && links.length === 0) return;
    await d.withTransactionAsync(async () => {
      for (const dive of dives) {
        // A page made on another device with the same id may have arrived first: keep that one.
        await d.runAsync(
          `INSERT OR IGNORE INTO dives (id, user_id, created_at, updated_at, synced, ${DIVE_DATA_COLUMNS.join(', ')})
           VALUES (?, ?, ?, ?, 0, ${DIVE_DATA_COLUMNS.map(() => '?').join(', ')})`,
          dive.id, dive.userId, dive.createdAt, dive.updatedAt ?? null, ...diveValues(dive),
        );
      }
      for (const { sightingId, diveId } of links) {
        await d.runAsync(
          `UPDATE sightings SET dive_id = ?, synced = 0, sync_error = NULL, version = version + 1
           WHERE id = ? AND deleted = 0 AND is_demo = 0 AND dive_id IS NULL`,
          diveId, sightingId,
        );
      }
    });
  });
}

/**
 * Renumber a diver's pages by `delta` (they changed how many dives they logged before ScubaGo) and
 * remember the new count. Every page waits in the outbox with its new number.
 */
export function setDivesBefore(ownerId: string, count: number, delta: number): Promise<void> {
  return exclusive(async (d) => {
    await d.withTransactionAsync(async () => {
      await d.runAsync(`INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)`, `${DIVES_BEFORE}${ownerId}`, String(count));
      if (delta !== 0) {
        await d.runAsync(
          `UPDATE dives SET number = number + ?, updated_at = ?, synced = 0, sync_error = NULL, version = version + 1
           WHERE user_id = ? AND deleted = 0 AND number + ? >= 1`,
          delta, new Date().toISOString(), ownerId, delta,
        );
      }
    });
  });
}

/** A page change on its way to the server: new, edited, or deleted (`deleted`). */
export interface OutboxDive extends Dive {
  deleted: boolean;
  /** The server has had this page before. */
  remote: boolean;
  version: number;
}

/** The diver's page changes that haven't reached the server yet, oldest first. */
export function getDiveOutbox(userId: string): Promise<OutboxDive[]> {
  return exclusive(async (d) => {
    const rows = await d.getAllAsync<any>(`SELECT * FROM dives WHERE user_id = ? AND synced = 0 ORDER BY created_at`, userId);
    return rows.map((row) => ({ ...rowToDive(row), deleted: !!row.deleted, remote: !!row.remote, version: row.version }));
  });
}

/** Which of the diver's pages the server already has (so a sighting may point at them). */
export function getRemoteDiveIds(userId: string): Promise<Set<string>> {
  return exclusive(async (d) => {
    const rows = await d.getAllAsync<{ id: string }>(`SELECT id FROM dives WHERE user_id = ? AND remote = 1 AND deleted = 0`, userId);
    return new Set(rows.map((r) => r.id));
  });
}

/** The server has this version of the page; it counts as synced only if nothing changed meanwhile. */
export function markDivePushed(id: string, version: number): Promise<boolean> {
  return exclusive(async (d) => {
    let done = false;
    await d.withTransactionAsync(async () => {
      await d.runAsync(`UPDATE dives SET remote = 1 WHERE id = ?`, id);
      const { changes } = await d.runAsync(
        `UPDATE dives SET synced = 1, sync_error = NULL WHERE id = ? AND version = ? AND deleted = 0`,
        id, version,
      );
      done = changes > 0;
    });
    return done;
  });
}

export function markDiveSyncFailed(id: string, message: string): Promise<void> {
  return exclusive(async (d) => {
    await d.runAsync(`UPDATE dives SET sync_error = ? WHERE id = ?`, message.slice(0, 300), id);
  });
}

/** The server confirmed a page's deletion: the tombstone can go. */
export function markDiveDeletionSynced(id: string): Promise<void> {
  return exclusive(async (d) => {
    await d.runAsync(`DELETE FROM dives WHERE id = ? AND deleted = 1`, id);
  });
}

/** Drop a page the server no longer has (deleted on another device); a deletion there wins. */
export function forgetDive(id: string): Promise<void> {
  return exclusive(async (d) => {
    await d.runAsync(`DELETE FROM dives WHERE id = ?`, id);
  });
}

/**
 * Merge the diver's own pages from a pull: a change still waiting here wins; a page deleted here
 * but still on the server is queued for deletion again; when the pull is `complete`, a synced page
 * it didn't return was deleted elsewhere and goes. Signatures sent from buddies' phones always come
 * from the server.
 */
export function mergePulledDives(
  pulled: Dive[],
  ownerId: string,
  complete: boolean,
): Promise<{ saved: number; removed: number; redeleted: number }> {
  return exclusive(async (d) => {
    let saved = 0;
    let redeleted = 0;
    const gone: string[] = [];
    await d.withTransactionAsync(async () => {
      const local = new Map(
        (await d.getAllAsync<any>(`SELECT id, synced, deleted, remote FROM dives WHERE user_id = ?`, ownerId)).map((r) => [r.id as string, r]),
      );
      const seen = new Set<string>();
      for (const dive of pulled) {
        seen.add(dive.id);
        const remoteSignatures = dive.remoteSignatures?.length ? JSON.stringify(dive.remoteSignatures) : null;
        const mine = local.get(dive.id);
        if (mine?.deleted) {
          if (mine.synced) {
            await d.runAsync(`UPDATE dives SET synced = 0 WHERE id = ? AND deleted = 1`, dive.id);
            redeleted++;
          }
          continue;
        }
        if (mine && !mine.synced) {
          // Keep the local edit, but take the buddies' signatures and note the server has the page.
          await d.runAsync(`UPDATE dives SET remote = 1, remote_signatures = ? WHERE id = ?`, remoteSignatures, dive.id);
          continue;
        }
        await d.runAsync(
          `INSERT OR REPLACE INTO dives (id, user_id, created_at, updated_at, synced, remote, remote_signatures, ${DIVE_DATA_COLUMNS.join(', ')})
           VALUES (?, ?, ?, ?, 1, 1, ?, ${DIVE_DATA_COLUMNS.map(() => '?').join(', ')})`,
          dive.id, ownerId, dive.createdAt, dive.updatedAt ?? null, remoteSignatures, ...diveValues(dive),
        );
        saved++;
      }
      if (complete) {
        for (const row of local.values()) {
          if (!seen.has(row.id) && row.synced && row.remote && !row.deleted) gone.push(row.id);
        }
        for (const id of gone) await d.runAsync(`DELETE FROM dives WHERE id = ? AND synced = 1 AND deleted = 0`, id);
      }
    });
    return { saved, removed: gone.length, redeleted };
  });
}
