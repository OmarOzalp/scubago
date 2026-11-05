import { hashSeed } from '@/lib/wash';

/** The tilt, ink and outline of a site's stamp: the same for the same site, every time. */
export function stampLook(siteId: string): { rotate: number; lagoon: boolean; oval: boolean; drop: number } {
  const h = hashSeed(siteId);
  return { rotate: ((h % 17) - 8) * 1.1, lagoon: h % 3 === 0, oval: (h >>> 4) % 3 === 0, drop: (h >>> 8) % 12 };
}
