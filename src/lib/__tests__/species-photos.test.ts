/**
 * Every species photo may be used anywhere, commercial use included, with credit: CC0, CC BY or
 * CC BY-SA, never a non-commercial, no-derivatives or all-rights-reserved one. Each names its licence
 * in its credit and links to its own page on iNaturalist (scripts/fetch-species-photos.ts).
 */
import { describe, expect, it } from '@jest/globals';

import photos from '@/data/species-photos.json';
import { SPECIES } from '@/data/species';
import { CATALOG } from '@/lib/catalog';

type Entry = { url: string; attribution: string; license: string; source: string };
const entries = photos as Record<string, Entry>;

describe('species photos', () => {
  it('every species has one, and nothing else does', () => {
    expect(Object.keys(entries).sort()).toEqual(SPECIES.map((s) => s.id).sort());
  });

  it('only under a licence that allows any use with credit', () => {
    for (const [id, e] of Object.entries(entries)) {
      expect({ id, license: e.license }).toEqual({ id, license: expect.stringMatching(/^(CC0|CC BY|CC BY-SA)$/) });
      expect({ id, attribution: e.attribution }).toEqual({ id, attribution: expect.not.stringMatching(/all rights reserved|-NC|-ND/i) });
      expect({ id, credited: e.attribution.includes(`(${e.license})`) }).toEqual({ id, credited: true });
    }
  });

  it('links each credit to the same photo’s page on iNaturalist', () => {
    for (const [id, e] of Object.entries(entries)) {
      const photoId = /\/photos\/(\d+)\//.exec(e.url)?.[1];
      expect({ id, source: e.source }).toEqual({ id, source: `https://www.inaturalist.org/photos/${photoId}` });
    }
    for (const s of CATALOG) expect(s.photoSource).toBe(entries[s.id].source);
  });
});
