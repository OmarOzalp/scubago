/**
 * In the browser the log lives in a file only one tab can open at a time (the Origin Private File
 * System). A second tab that tried anyway would fail half-way and show an empty log, as if it were
 * lost. So the first tab takes a lock and keeps it while it is open; another tab is told the app is
 * open elsewhere, without touching the file.
 */

type Holder = { __scubagoDatabaseClaim?: Promise<boolean> };

export function claimDatabase(): Promise<boolean> {
  // Kept on the page, not the module: a fast refresh re-runs this file but the page still holds the lock.
  const page = globalThis as Holder;
  if (page.__scubagoDatabaseClaim) return page.__scubagoDatabaseClaim;
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  // Browsers without Web Locks (a few old ones) open the file as before.
  if (!locks) return Promise.resolve(true);
  const claim = new Promise<boolean>((resolve) => {
    locks
      .request('scubago.db', { ifAvailable: true }, (lock) => {
        resolve(lock !== null);
        // Holding the promise open holds the lock until the tab closes.
        return lock ? new Promise<void>(() => undefined) : undefined;
      })
      .catch(() => resolve(true));
  });
  page.__scubagoDatabaseClaim = claim;
  // Refused: forget it, so "Try again" asks afresh once the other tab has closed.
  void claim.then((granted) => {
    if (!granted) delete page.__scubagoDatabaseClaim;
  });
  return claim;
}
