import { expect, test } from '@jest/globals';
import { seabedBakeVariants } from '@/lib/seabed-bake';
import { expectBakeFresh } from '@/test-support/seabed-bakes';

// The other islands (kelp forest, volcanic pinnacle, mangroves, shipwreck) alone at each level on Home's card: each
// baked file is exactly what the scene would work out.
const variants = seabedBakeVariants().filter((v) => v.shape !== 'reef');

test('there is a bake for every island and level', () => {
  expect(variants).toHaveLength(24);
});
test.each(variants.map((v) => [v.name, v] as const))('%s is fresh', (_, variant) => expectBakeFresh(variant), 60000);
