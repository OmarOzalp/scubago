/**
 * Whether this copy of the app may open the local database. On a phone there is only ever one, so
 * the answer is always yes; the web build has its own version (db-lock.web.ts) for browser tabs.
 */
export async function claimDatabase(): Promise<boolean> {
  return true;
}
