import { expect, test } from '@jest/globals';
import { finish, runSliced, type Steps } from '@/lib/slices';

// Work in slices: the same steps run at once or a slice at a time, the thread given back between slices.
function* counting(steps: number, took: (step: number) => void): Steps<string> {
  for (let n = 1; n <= steps; n++) { took(n); yield; }
  return 'done';
}
/** A clock the steps move: each step takes `cost` ms. */
const clockWith = (cost: number | ((step: number) => number)) => {
  let time = 0, step = 0;
  return { now: () => time, took: () => { step++; time += typeof cost === 'function' ? cost(step) : cost; } };
};

test('run to the end at once, the steps give the result they return', () => {
  const seen: number[] = [];
  expect(finish(counting(5, (n) => seen.push(n)))).toBe('done');
  expect(seen).toEqual([1, 2, 3, 4, 5]);
  expect(finish((function* () { return 7; })())).toBe(7);
});

test('in slices, the thread is given back between them, and the result is the same', async () => {
  const clock = clockWith(5), slices: number[] = [];
  let pauses = 0;
  const result = await runSliced(counting(20, clock.took), { slice: 20, now: clock.now, pause: async () => { pauses++; }, onSlice: (ms) => slices.push(ms) });
  expect(result).toBe('done');
  // (a slice stops before a step that would take it over: three steps of 5 ms in 20, the last slice with what is left)
  expect(slices.slice(0, -1).every((ms) => ms === 15)).toBe(true);
  expect(pauses).toBe(slices.length - 1);
  expect(pauses).toBeGreaterThanOrEqual(6);
  expect(Math.max(...slices)).toBeLessThanOrEqual(20);
});

test('every slice takes a step, however long the step, so a slow step cannot stop the work', async () => {
  const clock = clockWith(50), slices: number[] = [];
  const result = await runSliced(counting(4, clock.took), { slice: 10, now: clock.now, pause: async () => undefined, onSlice: (ms) => slices.push(ms) });
  expect(result).toBe('done');
  // (a step each, and the last slice only to find the steps are done)
  expect(slices).toEqual([50, 50, 50, 50, 0]);
});

test('the budget is asked for again each slice, so work can be hurried while it runs', async () => {
  const clock = clockWith(5), slices: number[] = [];
  let hurry = false;
  await runSliced(counting(40, clock.took), {
    slice: () => (hurry ? 50 : 10), now: clock.now, pause: async () => { hurry = slices.length >= 2; }, onSlice: (ms) => slices.push(ms),
  });
  expect(slices.slice(0, 2).every((ms) => ms <= 10)).toBe(true);
  expect(slices[2]).toBeGreaterThan(30);
});

test('the default pause lets timers run, and a step that throws rejects the run', async () => {
  const order: string[] = [];
  setTimeout(() => order.push('timer'), 0);
  await runSliced(counting(3, () => order.push('step')), { slice: 0 });
  // (a zero budget: a step a slice; the timer is not starved by them)
  expect(order).toContain('timer');
  expect(order.indexOf('timer')).toBeLessThan(order.lastIndexOf('step'));
  const broken = (function* (): Steps<void> { yield; throw new Error('no'); })();
  await expect(runSliced(broken, { slice: 5 })).rejects.toThrow('no');
});
