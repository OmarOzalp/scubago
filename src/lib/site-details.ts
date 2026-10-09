import type { DiveSite, DiveType, Difficulty, SiteAccess, SiteSource } from '@/lib/types';

const DIFFICULTY: Record<Difficulty, string> = {
  beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced', technical: 'Technical',
};
const DIVE_TYPE: Record<DiveType, string> = {
  reef: 'Reef', wall: 'Wall', wreck: 'Wreck', drift: 'Drift', pinnacle: 'Pinnacle', bommie: 'Bommie',
  muck: 'Muck', cave: 'Cave', 'swim-through': 'Swim-throughs', pier: 'Pier',
};
const ACCESS: Record<SiteAccess, string> = { boat: 'Boat', shore: 'Shore', liveaboard: 'Liveaboard' };

/** "5–18 m", "to 30 m", "from 12 m", or null when the depth isn't known. */
export function depthLabel(site: Pick<DiveSite, 'depthMinM' | 'depthMaxM'>): string | null {
  const { depthMinM: min, depthMaxM: max } = site;
  if (min != null && max != null) return min === max ? `${max} m` : `${min}–${max} m`;
  if (max != null) return `to ${max} m`;
  if (min != null) return `from ${min} m`;
  return null;
}

/** The known facts about a site, as short labels in reading order; unknown ones are simply absent. */
export function siteFacts(site: DiveSite): { label: string; value: string }[] {
  const facts: { label: string; value: string }[] = [];
  const depth = depthLabel(site);
  if (depth) facts.push({ label: 'Depth', value: depth });
  if (site.difficulty) facts.push({ label: 'Level', value: DIFFICULTY[site.difficulty] });
  if (site.diveTypes?.length) facts.push({ label: 'Type', value: site.diveTypes.map((t) => DIVE_TYPE[t]).join(', ') });
  if (site.access?.length) facts.push({ label: 'Access', value: site.access.map((a) => ACCESS[a]).join(', ') });
  return facts;
}

/** The distinct sources behind a site's details, for its "Sources" line. */
export function siteSourceList(site: DiveSite) {
  const seen = new Map<string, Pick<SiteSource, 'source' | 'url' | 'license'>>();
  for (const s of site.sources ?? []) if (!seen.has(s.source)) seen.set(s.source, { source: s.source, url: s.url, license: s.license });
  return [...seen.values()];
}
