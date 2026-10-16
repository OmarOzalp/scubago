import { describe, expect, it } from '@jest/globals';

import { SPECIES } from '@/data/species';
import { symmetric } from '@/lib/art-path';
import { artFor, composeArt, illustrationNameFor } from '@/lib/species-art';
import { ILLUSTRATIONS } from '@/lib/species-illustrations';
import { hashSeed, washPath } from '@/lib/wash';

describe('species drawings', () => {
  it('every species in the catalogue has a drawing and colours', () => {
    for (const s of SPECIES) {
      const art = artFor(s);
      expect(art.drawing.body.length).toBeGreaterThan(10);
      expect(art.palette.back).toMatch(/^#[0-9A-F]{6}$/i);
      expect(art.palette.belly).toMatch(/^#[0-9A-F]{6}$/i);
      expect(art.wash).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it('draws a painted species and a pencil outline from the same drawing', () => {
    const art = artFor({ id: 'whale-shark', category: 'shark' });
    const painted = composeArt(art, { width: 120 });
    expect(painted.shapes.some((s) => s.fill === '@body')).toBe(true);
    // Its spots are kept inside the body.
    expect(painted.shapes.filter((s) => s.clip && s.fill === art.palette.patternColor).length).toBeGreaterThan(5);
    const pencil = composeArt(art, { width: 120, found: false });
    expect(pencil.shapes.every((s) => s.fill !== '@body')).toBe(true);
    expect(pencil.shapes.some((s) => s.dash)).toBe(true);
  });

  it('leaves the fine lines off small drawings', () => {
    const art = artFor({ id: 'grey-reef-shark', category: 'shark' });
    const lines = (width: number) => composeArt(art, { width }).shapes.filter((s) => s.stroke && !s.fill).length;
    expect(lines(200)).toBeGreaterThan(lines(40));
  });

  it('gives look-alikes the same drawing and keeps each species stable', () => {
    expect(illustrationNameFor({ id: 'reef-manta', category: 'ray' })).toBe('manta');
    expect(illustrationNameFor({ id: 'scalloped-hammerhead', category: 'shark' })).toBe('hammerhead');
    expect(illustrationNameFor({ id: 'grey-reef-shark', category: 'shark' })).toBe('shark');
    expect(artFor({ id: 'grey-reef-shark', category: 'shark' })).toEqual(artFor({ id: 'grey-reef-shark', category: 'shark' }));
  });

  it('"something else" and unknown ids still get a drawing', () => {
    expect(artFor({ id: 'unlisted', category: 'other' }).drawing).toBe(ILLUSTRATIONS.reefFish);
    expect(artFor({ id: 'no-such-thing', category: 'cephalopod' }).drawing).toBe(ILLUSTRATIONS.octopus);
  });

  it('mirrors half an outline into a closed, symmetric one', () => {
    const d = symmetric('M100,10 C90,10 80,20 80,40 C80,60 90,70 100,70');
    expect(d.startsWith('M100,10')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect(d).toContain('120,40');
  });
});

describe('watercolour washes', () => {
  it('are closed paths, the same for the same seed, different for another', () => {
    const a = washPath(42, 50, 30);
    expect(a.startsWith('M')).toBe(true);
    expect(a.endsWith('Z')).toBe(true);
    expect(washPath(42, 50, 30)).toBe(a);
    expect(washPath(43, 50, 30)).not.toBe(a);
  });

  it('stay inside their box', () => {
    const numbers = washPath(7, 40, 20, { inset: 2 }).match(/-?\d+(\.\d+)?/g)!.map(Number);
    const xs = numbers.filter((_, i) => i % 2 === 0);
    const ys = numbers.filter((_, i) => i % 2 === 1);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-2);
    expect(Math.max(...xs)).toBeLessThanOrEqual(42);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(-2);
    expect(Math.max(...ys)).toBeLessThanOrEqual(22);
  });

  it('seed from text stably', () => {
    expect(hashSeed('whale-shark')).toBe(hashSeed('whale-shark'));
    expect(hashSeed('whale-shark')).not.toBe(hashSeed('tiger-shark'));
  });
});
