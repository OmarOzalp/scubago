import { expect, test } from '@jest/globals';
import { seabedBakeVariants } from '@/lib/seabed-bake';
import { expectBakeFresh } from '@/test-support/seabed-bakes';

// Home's island alone in the explorer (its water's reach on a phone held upright): each baked file is exactly what
// the explorer would work out.
const variants = seabedBakeVariants().filter((v) => v.reach);

test('there is a bake for every level', () => {
  expect(variants.map((v) => `${v.shape} ${v.level}`)).toEqual([1, 2, 3, 4, 5, 6].map((level) => `reef ${level}`));
});
test.each(variants.map((v) => [v.name, v] as const))('%s is fresh', (_, variant) => expectBakeFresh(variant), 120000);
