import type { Category } from '@/lib/types';

export type MarineModel = 'shark' | 'manta' | 'reef-fish';
export function marineModelFor(category: Category): MarineModel | null {
  if (category === 'shark') return 'shark';
  if (category === 'ray') return 'manta';
  if (category === 'fish') return 'reef-fish';
  return null;
}

/** World coordinates: island at origin, Y up, animal nose points along local +Z. */
export function sampleSwimPath(time: number, lane: number) {
  const speed = .095 + (lane % 4) * .007;
  const direction = lane % 3 === 2 ? -1 : 1;
  const angle = time * speed * direction + lane * 2.399963;
  const rx = 3.65 + (lane % 3) * .38;
  const rz = 3.05 + (lane % 2) * .34;
  const x = Math.cos(angle) * rx;
  const z = Math.sin(angle) * rz;
  const dx = -Math.sin(angle) * rx * direction;
  const dz = Math.cos(angle) * rz * direction;
  return {
    x, z, y: -.02 + Math.sin(time * .37 + lane) * .06,
    heading: Math.atan2(dx, dz),
    bank: direction * (.06 + Math.sin(angle * 2) * .035),
  };
}

/** Drop background time instead of teleporting or catching up on resume. */
export function advanceSwimTime(time: number, delta: number, active: boolean) {
  return time + (active ? Math.max(0, Math.min(delta, .05)) : 0);
}
