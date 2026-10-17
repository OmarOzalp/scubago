/**
 * Hands a newly added dive site back to the logging flow that asked for it ("Can't find your site?
 * Add it"), so the diver lands on the next step with the new site chosen instead of in a second
 * copy of the log screen.
 */
type Listener = (siteId: string) => void;
const listeners = new Set<Listener>();

export function onSiteAdded(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifySiteAdded(siteId: string): void {
  for (const listener of listeners) listener(siteId);
}
