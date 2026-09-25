import { expect, test } from '@jest/globals';
import { createMarineMotion } from '../marine-motion';
import type { MarineModel } from '../swimming';

const kinds: MarineModel[] = ['whale-shark', 'tiger-shark', 'reef-manta'];
const members = (count: number) => Array.from({ length: count }, (_, lane) => ({ lane, model: kinds[lane % 3] }));

test('mixed schools stay in view, outside the island, and keep a gap for five minutes', () => {
  for (const count of [1, 3, 8]) {
    const school = createMarineMotion(members(count));
    for (let frame = 0; frame < 6000; frame++) {
      school.step(.05, true);
      if (frame % 10) continue;
      for (let lane = 0; lane < count; lane++) {
        const p = school.get(lane)!;
        expect(Object.values(p).every(Number.isFinite)).toBe(true);
        expect(Math.hypot(p.x, p.z)).toBeGreaterThan(2.95);
        expect(Math.abs(p.x)).toBeLessThan(4.21);
        expect(Math.abs(p.z)).toBeLessThan(3.61);
        for (let other = lane + 1; other < count; other++) {
          const q = school.get(other)!;
          expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThan(1.65);
        }
      }
    }
  }
});

test('turns and movement are smooth at simulator frame rates', () => {
  const school = createMarineMotion(members(3));
  for (let frame = 0; frame < 2400; frame++) {
    const before = members(3).map(({ lane }) => ({ ...school.get(lane)! }));
    school.step(.05, true);
    before.forEach((p, lane) => {
      const next = school.get(lane)!;
      expect(Math.abs(next.heading - p.heading)).toBeLessThanOrEqual(.032501);
      expect(Math.hypot(next.x - p.x, next.z - p.z)).toBeLessThan(.03);
    });
  }
});

test('pause freezes the school and a background frame cannot teleport it', () => {
  const school = createMarineMotion(members(3));
  const before = { ...school.get(0)! };
  school.step(200, false);
  expect(school.get(0)).toEqual(before);
  school.step(200, true);
  expect(Math.hypot(school.get(0)!.x - before.x, school.get(0)!.z - before.z)).toBeLessThan(.03);
});

test('species have different cruising paces and routes vary over time', () => {
  const whale = createMarineMotion([{ model: 'whale-shark', lane: 0 }]);
  const tiger = createMarineMotion([{ model: 'tiger-shark', lane: 0 }]);
  for (let i = 0; i < 200; i++) { whale.step(.05, true); tiger.step(.05, true); }
  expect(Math.hypot(whale.get(0)!.x - tiger.get(0)!.x, whale.get(0)!.z - tiger.get(0)!.z)).toBeGreaterThan(.7);
  expect(whale.get(0)!.effort).not.toBe(1);
});


test('simulator and device frame rates produce comparable movement', () => {
  const low = createMarineMotion(members(3)), high = createMarineMotion(members(3));
  for (let i = 0; i < 2400; i++) low.step(1 / 20, true);
  for (let i = 0; i < 7200; i++) high.step(1 / 60, true);
  for (let lane = 0; lane < 3; lane++) {
    const a = low.get(lane)!, b = high.get(lane)!;
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(.08);
  }
});

test('eight large animals and eight small fish retain spacing through repeated circuits', () => {
  for (const model of ['whale-shark', 'reef-fish'] as const) {
    const school = createMarineMotion(Array.from({ length: 8 }, (_, lane) => ({ lane, model })));
    for (let frame = 0; frame < 12000; frame++) {
      school.step(.05, true);
      if (frame % 20) continue;
      for (let lane = 0; lane < 8; lane++) {
        const a = school.get(lane)!, b = school.get((lane + 1) % 8)!;
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(1.65);
        expect(a.effort).toBeGreaterThan(.65);
      }
    }
  }
});
