import { describe, expect, it } from '@jest/globals';

import { SPECIES } from '@/data/species';
import { cachedPlate, hasPlate, plateDrawing, requestPlate } from '@/lib/plates';
import { bbox, type Pt } from '@/lib/plates/kit';
import { drawPlate, fit, PLATE_BOX } from '@/lib/plates/render';
import { PLATES } from '@/lib/plates/registry';
import { softUnion } from '@/lib/plates/soft';

describe('species plates', () => {
  it('draws a plate for every species in the catalogue', () => {
    const missing = SPECIES.filter((s) => !hasPlate(s.id)).map((s) => s.id);
    expect(missing).toEqual([]);
  });

  it('builds every plate inside the plate box, with no broken numbers', () => {
    for (const s of SPECIES) {
      const g = fit(PLATES[s.id].build());
      const b = bbox([g.body, ...g.far.map((p) => p.poly), ...g.near.map((p) => p.poly)].filter((p) => p.length));
      expect(b.x0).toBeGreaterThan(-0.5);
      expect(b.y0).toBeGreaterThan(-0.5);
      expect(b.x1).toBeLessThan(PLATE_BOX.width + 0.5);
      expect(b.y1).toBeLessThan(PLATE_BOX.height + 0.5);
      const d = drawPlate(g, PLATES[s.id].palette, { width: 150 });
      expect(d.shapes.length).toBeGreaterThan(5);
      expect(d.body.length).toBeGreaterThan(20);
      expect(d.shapes.filter((sh) => /NaN|Infinity|undefined/.test(sh.d)).length).toBe(0);
    }
  });

  it('draws the same plate every time', () => {
    for (const id of ['whale-shark', 'day-octopus', 'clownfish', 'giant-clam']) {
      const a = drawPlate(fit(PLATES[id].build()), PLATES[id].palette, { width: 120 });
      const b = drawPlate(fit(PLATES[id].build()), PLATES[id].palette, { width: 120 });
      expect(a).toEqual(b);
    }
  });

  it('draws a species still to find as a dashed pencil outline, with no colour', () => {
    const g = fit(PLATES['great-white-shark'].build());
    const pencil = drawPlate(g, PLATES['great-white-shark'].palette, { width: 120, found: false, paper: '#FFFDF8' });
    expect(pencil.shapes.some((s) => s.dash)).toBe(true);
    expect(pencil.shapes.every((s) => !s.fill || s.fill === '#FFFDF8')).toBe(true);
  });

  it('keeps fine detail for large plates and thins it out for small ones', () => {
    const g = fit(PLATES['tiger-shark'].build());
    const ink = (width: number) => drawPlate(g, PLATES['tiger-shark'].palette, { width }).shapes.reduce((n, s) => n + s.d.length, 0);
    expect(ink(220)).toBeGreaterThan(ink(60));
  });

  it('caches drawings, and queues requests so the screen is not held up', async () => {
    const opts = { width: 97, found: true };
    expect(cachedPlate('lionfish', opts)).toBeUndefined();
    const drawn = await new Promise((resolve) => requestPlate('lionfish', opts, resolve));
    expect(drawn).toBeTruthy();
    expect(cachedPlate('lionfish', opts)).toBe(drawn);
    expect(plateDrawing('lionfish', opts)).toBe(drawn);
    // A species without a plate answers at once, with nothing.
    let answer: unknown = 'pending';
    requestPlate('a-diver-added-species', opts, (d) => (answer = d));
    expect(answer).toBeNull();
  });

  it('melts lobes into one smooth outline', () => {
    const one = softUnion([{ c: [0, 0], rx: 10, ry: 6 }]);
    const two = softUnion([
      { c: [0, 0], rx: 10, ry: 6 },
      { c: [12, 0], rx: 6, ry: 6 },
    ]);
    const span = (p: Pt[]) => bbox([p]);
    expect(span(one).w).toBeCloseTo(20, 0);
    expect(span(two).x1).toBeGreaterThan(17);
    // A single loop round both, not two outlines.
    expect(two.length).toBeGreaterThan(one.length);
  });
});
