/**
 * expo-sqlite's async API on top of Node's built-in SQLite (Node 22.5+), so tests run the app's
 * real SQL. Use from a jest.mock factory:
 *
 *   jest.mock('expo-sqlite', () => require('@/test-support/node-sqlite').expoSqliteMock());
 *
 * Every openDatabaseAsync call opens a fresh in-memory database; `onOpen` (if set) runs first,
 * so a test can lay down an older schema to migrate.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- loaded lazily, so Node < 22.5 can still run the other tests */
export const hasNodeSqlite = (() => {
  try {
    require('node:sqlite');
    return true;
  } catch {
    return false;
  }
})();

/**
 * Shared through globalThis: jest.isolateModules gives each test "phone" its own copy of this
 * module, and the hooks must be the same object in all of them.
 */
type Hooks = { onOpen: ((db: any) => void) | null; last: any };
const g = globalThis as typeof globalThis & { __scubagoSqliteHooks?: Hooks };
export const sqliteHooks: Hooks = (g.__scubagoSqliteHooks ??= { onOpen: null, last: null });

const plain = (params: unknown[]) =>
  params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p));

export function expoSqliteMock() {
  return {
    openDatabaseAsync: async () => {
      const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync(':memory:');
      sqliteHooks.onOpen?.(db);
      sqliteHooks.last = db;
      return {
        execAsync: async (sql: string) => {
          db.exec(sql);
        },
        runAsync: async (sql: string, ...params: unknown[]) => {
          const result = db.prepare(sql).run(...plain(params));
          return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
        },
        getAllAsync: async (sql: string, ...params: unknown[]) =>
          db.prepare(sql).all(...plain(params)).map((row: object) => ({ ...row })),
        getFirstAsync: async (sql: string, ...params: unknown[]) => {
          const row = db.prepare(sql).get(...plain(params));
          return row ? { ...row } : null;
        },
        withTransactionAsync: async (task: () => Promise<void>) => {
          db.exec('BEGIN');
          try {
            await task();
            db.exec('COMMIT');
          } catch (e) {
            db.exec('ROLLBACK');
            throw e;
          }
        },
      };
    },
  };
}
