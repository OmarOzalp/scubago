import { describe, expect, it } from '@jest/globals';

import { SPECIES } from '@/data/species';
import { artFor, SHAPES, shapeNameFor } from '@/lib/species-art';
import { hashSeed, washPath } from '@/lib/wash';

describe('species drawings', () => {
  it('every species in the catalogue has a drawing and a wash', () => {
    for (const s of SPECIES) {
      const art = artFor(s);
      expect(art.shape.body.length).toBeGreaterThan(10);
      expect(art.wash).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it('gives look-alikes the same body and keeps each species stable', () => {
    expect(shapeNameFor({ id: 'reef-manta', category: 'ray' })).toBe('manta');
    expect(shapeNameFor({ id: 'scalloped-hammerhead', category: 'shark' })).toBe('hammerhead');
    expect(shapeNameFor({ id: 'grey-reef-shark', category: 'shark' })).toBe('shark');
    expect(artFor({ id: 'grey-reef-shark', category: 'shark' })).toEqual(artFor({ id: 'grey-reef-shark', category: 'shark' }));
  });

  it('"something else" and unknown ids still get a drawing', () => {
    expect(artFor({ id: 'unlisted', category: 'other' }).shape).toBe(SHAPES.fish);
    expect(artFor({ id: 'no-such-thing', category: 'cephalopod' }).shape).toBe(SHAPES.octopus);
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
