import { expect, test } from '@jest/globals';
import { createFrameStats, formatFrameSnapshot } from '@/lib/frame-stats';

test('frame stats publish averages once per window, counting hitches', () => {
  const stats = createFrameStats(1.05);
  expect(stats.latest()).toBeNull();
  // 58 smooth frames and two hitches: just over the window.
  for (let i = 0; i < 58; i++) stats.frame(1 / 60, 4, 31, 12345, 'full');
  expect(stats.latest()).toBeNull();
  stats.gl(3.25);
  stats.frame(.05, 12, 31, 12345, 'full');
  stats.frame(.05, 8, 31, 12345, 'full');
  const snapshot = stats.latest()!;
  expect(snapshot.fps).toBeCloseTo(60 / (58 / 60 + .1), 5);
  expect(snapshot.slow).toBe(2);
  expect(snapshot.jsMs).toBeCloseTo((58 * 4 + 12 + 8) / 60, 5);
  expect(snapshot.jsMaxMs).toBe(12);
  expect(snapshot.glMs).toBe(3.25);
  // The next window starts from scratch; a zero or invalid delta is ignored.
  stats.frame(0, 100, 1, 1, 'lite');
  stats.frame(Number.NaN, 100, 1, 1, 'lite');
  for (let i = 0; i < 32; i++) stats.frame(1 / 30, 2, 25, 800, 'lite');
  expect(stats.latest()).toMatchObject({ slow: 32, jsMaxMs: 2, quality: 'lite' });
  expect(stats.latest()!.fps).toBeCloseTo(30, 5);
});

test('the badge reads in two short lines', () => {
  const [first, second] = formatFrameSnapshot({ fps: 59.6, slow: 1, jsMs: 4.12, jsMaxMs: 9, glMs: 3.2, draws: 31, triangles: 12345, quality: 'full' });
  expect(first).toBe('60 fps · 1 slow · full');
  expect(second).toBe('JS 4.1 ms (max 9.0) · GL 3.2 ms · 31 draws · 12.3k tris');
  expect(formatFrameSnapshot({ fps: 20, slow: 0, jsMs: 1, jsMaxMs: 1, glMs: null, draws: 5, triangles: 640, quality: 'lite' })[1]).toBe('JS 1.0 ms (max 1.0) · 5 draws · 640 tris');
});
