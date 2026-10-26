import { expect, test } from '@jest/globals';
import { seabedBakeVariants } from '@/lib/seabed-bake';
import { expectBakeFresh } from '@/test-support/seabed-bakes';

// Home's island (the Coral Reef) alone at each level on Home's card: each baked file is exactly what the scene would
// work out (its lattice takes seconds under Jest's transform, hence the time each is given).
const variants = seabedBakeVariants().filter((v) => v.shape === 'reef' && !v.reach);

test('there is a bake for every level', () => {
  expect(variants.map((v) => v.level)).toEqual([1, 2, 3, 4, 5, 6]);
});
test.each(variants.map((v) => [v.name, v] as const))('%s is fresh', (_, variant) => expectBakeFresh(variant), 120000);
