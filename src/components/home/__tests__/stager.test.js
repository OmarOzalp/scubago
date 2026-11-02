import { beforeEach, expect, jest, test } from '@jest/globals';
import { createStager, STAGE } from '../three/stager';

/**
 * The order a scene is built in (stager.ts), without a scene: groups of steps, each told when it opens and saying when it has been shown,
 * over a clock and timers the test moves by hand.
 */
let clock, timers, opened;
const later = (run, ms) => {
  const timer = { run, at: clock + ms };
  timers.push(timer);
  return () => { timers.splice(timers.indexOf(timer), 1); };
};
/** Move the clock on by `ms` (and by the cost of any step that opens meanwhile), running the timers that fall due, in order. */
const advance = (ms) => {
  const end = clock + ms;
  for (;;) {
    const due = timers.filter((timer) => timer.at <= Math.max(end, clock)).sort((a, b) => a.at - b.at)[0];
    if (!due) break;
    timers.splice(timers.indexOf(due), 1);
    clock = Math.max(clock, due.at);
    due.run();
  }
  clock = Math.max(clock, end);
};
beforeEach(() => { clock = 0; timers = []; opened = []; });

/** A group whose steps are shown at once (the scene commits them as they open), costing `cost` ms each. */
const group = (stager, island, stage, total = 1, cost = 1) => {
  const g = { island, stage, total, opened: 0, open: (n) => { opened.push(`${island ?? '-'}:${stage}.${n - 1}`); clock += cost; stager.committed(g); } };
  stager.register(g);
  return g;
};
const make = (options = {}) => createStager({ now: () => clock, later, ...options });

test('nothing is built before the scene’s first frame has been drawn, and then one step at a time, a frame between when the work is heavy', () => {
  const stager = make({ heavy: 0 });
  group(stager, 'a', STAGE.coast); group(stager, 'a', STAGE.props);
  advance(1000);
  expect(opened).toEqual([]);
  stager.frame();
  advance(0);
  expect(opened).toEqual(['a:1.0']);
  advance(10);
  expect(opened).toEqual(['a:1.0']);
  stager.frame();
  advance(0);
  expect(opened).toEqual(['a:1.0', 'a:2.0']);
});

test('every island in view has its coast before any has its props, its props before any has its swimming, and its first animal before any has its second', () => {
  const stager = make({ focus: () => ({ order: ['a', 'b', 'c'], near: 3 }) });
  for (const island of ['c', 'a', 'b']) {
    group(stager, island, STAGE.coast); group(stager, island, STAGE.props); group(stager, island, STAGE.swim); group(stager, island, STAGE.animal, 2);
  }
  stager.frame();
  advance(10000);
  expect(opened).toEqual([
    'a:1.0', 'b:1.0', 'c:1.0', 'a:2.0', 'b:2.0', 'c:2.0', 'a:3.0', 'b:3.0', 'c:3.0',
    'a:4.0', 'b:4.0', 'c:4.0', 'a:4.1', 'b:4.1', 'c:4.1',
  ]);
});

test('the islands in or near the view are built before the rest, and the rest in order of nearness', () => {
  const stager = make({ focus: () => ({ order: ['b', 'c', 'a', 'd'], near: 2 }) });
  for (const island of ['a', 'b', 'c', 'd']) { group(stager, island, STAGE.coast); group(stager, island, STAGE.props); }
  stager.frame();
  advance(10000);
  expect(opened).toEqual(['b:1.0', 'c:1.0', 'b:2.0', 'c:2.0', 'a:1.0', 'd:1.0', 'a:2.0', 'd:2.0']);
});

test('an island the camera comes near moves up the order, even with others waiting', () => {
  let where = { order: ['a', 'b', 'c'], near: 1 };
  const stager = make({ focus: () => where, heavy: 0 });
  for (const island of ['a', 'b', 'c']) { group(stager, island, STAGE.coast); group(stager, island, STAGE.props); }
  stager.frame();
  advance(0);
  expect(opened).toEqual(['a:1.0']);
  // The view heads for c: it is the island in view now.
  where = { order: ['c', 'a', 'b'], near: 1 };
  stager.frame();
  advance(1000);
  // (c's coast and props, then the coasts of the rest, before their props)
  expect(opened.slice(0, 4)).toEqual(['a:1.0', 'c:1.0', 'c:2.0', 'b:1.0']);
});

test('the sea between the islands is built with the islands in view', () => {
  const stager = make({ focus: () => ({ order: ['a', 'b'], near: 1 }) });
  group(stager, 'b', STAGE.coast); group(stager, null, STAGE.props); group(stager, 'a', STAGE.coast);
  stager.frame();
  advance(1000);
  expect(opened).toEqual(['a:1.0', '-:2.0', 'b:1.0']);
});

test('a heavy step is followed by a drawn frame; light ones follow one another while the frames keep coming', () => {
  const stager = make({ heavy: 10, age: 50, patience: 100 });
  group(stager, 'a', STAGE.coast, 1, 12); group(stager, 'a', STAGE.swim, 1, 12); group(stager, 'a', STAGE.animal, 3, 2); group(stager, 'a', STAGE.props, 1, 2);
  stager.frame();
  advance(0);
  expect(opened).toEqual(['a:1.0']);
  // The first cost 12 ms, a heavy step: nothing more until a frame has been drawn.
  advance(40);
  expect(opened).toEqual(['a:1.0']);
  stager.frame();
  advance(0);
  // (the props: 2 ms, then the swimming, 12 ms: heavy)
  expect(opened).toEqual(['a:1.0', 'a:2.0', 'a:3.0']);
  // The rest cost 2 ms each and the last frame is fresh: they follow one another at once.
  stager.frame();
  advance(0);
  expect(opened).toEqual(['a:1.0', 'a:2.0', 'a:3.0', 'a:4.0', 'a:4.1', 'a:4.2']);
});

test('once the last frame is older than the scene can bear, even a step that is not heavy is followed by a frame', () => {
  const stager = make({ heavy: 1000, age: 50, patience: 100 });
  group(stager, 'a', STAGE.coast, 1, 40); group(stager, 'a', STAGE.swim, 1, 40); group(stager, 'a', STAGE.props, 1, 40);
  stager.frame();
  advance(0);
  // (40 ms on, the frame is 40 ms old: the next follows; 80 ms on it is older than 50 ms: it waits)
  expect(opened).toEqual(['a:1.0', 'a:2.0']);
  advance(50);
  expect(opened).toEqual(['a:1.0', 'a:2.0']);
  stager.frame();
  advance(0);
  expect(opened).toEqual(['a:1.0', 'a:2.0', 'a:3.0']);
});

test('a frame that never comes is waited for only so long', () => {
  const stager = make({ heavy: 1, patience: 100 });
  group(stager, 'a', STAGE.coast, 1, 5); group(stager, 'a', STAGE.props);
  stager.frame();
  advance(0);
  expect(opened).toEqual(['a:1.0']);
  advance(99);
  expect(opened).toEqual(['a:1.0']);
  advance(1);
  expect(opened).toEqual(['a:1.0', 'a:2.0']);
});

test('a step the scene never shows does not stop the others', () => {
  const stager = make({ patience: 50 });
  const lost = { island: 'a', stage: STAGE.coast, total: 1, opened: 0, open: () => {} };
  stager.register(lost);
  group(stager, 'a', STAGE.props);
  stager.frame();
  advance(100);
  expect(opened).toEqual([]);
  // (given up on after four times the patience, then a frame is waited for as after any step)
  advance(100 + 50);
  expect(opened).toEqual(['a:2.0']);
});

test('steps added later (an animal’s model arrived) are built in their turn, and a group that goes is forgotten', () => {
  const stager = make();
  const animals = group(stager, 'a', STAGE.animal, 1);
  stager.frame();
  advance(100);
  expect(opened).toEqual(['a:4.0']);
  stager.resize(animals, 3);
  advance(100);
  stager.frame();
  advance(100);
  expect(opened).toEqual(['a:4.0', 'a:4.1', 'a:4.2']);
  const leaving = group(stager, 'b', STAGE.coast, 1);
  const leave = stager.register({ island: 'c', stage: STAGE.coast, total: 1, opened: 0, open: () => { throw new Error('built after it went'); } });
  leave();
  advance(100);
  expect(opened).toEqual(['a:4.0', 'a:4.1', 'a:4.2', 'b:1.0']);
  expect(leaving.opened).toBe(1);
});

test('held while the scene is hidden, and carried on when it is on show again', () => {
  const stager = make();
  group(stager, 'a', STAGE.coast); group(stager, 'a', STAGE.props);
  stager.hold(true);
  stager.frame();
  advance(1000);
  expect(opened).toEqual([]);
  stager.hold(false);
  advance(1000);
  expect(opened).toEqual(['a:1.0', 'a:2.0']);
});

test('it says when all in view is built (settled) and when all is (done), and asks for a frame as each step is shown', () => {
  const invalidate = jest.fn();
  const stager = make({ focus: () => ({ order: ['a', 'b'], near: 1 }), invalidate, heavy: 0 });
  const heard = jest.fn();
  stager.subscribe(heard);
  // Nothing staged: nothing to wait for.
  expect(stager.getState()).toEqual({ settled: true, done: false });
  group(stager, 'a', STAGE.coast); group(stager, 'b', STAGE.coast);
  expect(stager.getState()).toEqual({ settled: false, done: false });
  stager.frame();
  advance(0);
  expect(stager.getState()).toEqual({ settled: true, done: false });
  stager.frame();
  advance(0);
  expect(stager.getState()).toEqual({ settled: true, done: true });
  expect(heard).toHaveBeenCalled();
  // (frames were drawn just before each step was shown: nothing to ask for)
  expect(invalidate).not.toHaveBeenCalled();
  // A scene drawing no frames of its own (still, or paused) is asked for one to show what was built.
  advance(500);
  group(stager, 'b', STAGE.props);
  advance(500);
  expect(invalidate).toHaveBeenCalled();
  // More to build: neither is true again until it is.
  group(stager, 'a', STAGE.props);
  expect(stager.getState()).toEqual({ settled: false, done: false });
  stager.frame();
  advance(0);
  expect(stager.getState()).toEqual({ settled: true, done: true });
});

test('what is shown is traced: island, stage, number and how long it took', () => {
  const trace = jest.fn();
  const stager = make({ trace });
  group(stager, 'a', STAGE.animal, 2, 7);
  stager.frame();
  advance(1000);
  expect(trace.mock.calls.map(([step]) => step)).toEqual([
    { island: 'a', stage: STAGE.animal, index: 0, ms: 7 },
    { island: 'a', stage: STAGE.animal, index: 1, ms: 7 },
  ]);
});

test('whether an island has steps of some stages, and whether any is still to open or being shown, is asked of the stager, and every change to it is heard', () => {
  const stager = make({ heavy: 0 });
  const heard = jest.fn();
  const stop = stager.watch(heard);
  expect(stager.has('a')).toBe(false);
  expect(stager.pending('a', [STAGE.coast, STAGE.props])).toBe(false);
  // A step that opens and is not yet shown is pending, on its own island only.
  const g = { island: 'a', stage: STAGE.coast, total: 1, opened: 0, open: () => undefined };
  stager.register(g);
  group(stager, 'b', STAGE.coast);
  group(stager, 'a', STAGE.props);
  expect(heard).toHaveBeenCalled();
  expect(stager.has('a', [STAGE.coast])).toBe(true);
  expect(stager.has('a', [STAGE.animal])).toBe(false);
  expect(stager.pending('a', [STAGE.coast, STAGE.props])).toBe(true);
  stager.frame();
  advance(0);
  // (a's coast opened, and is not shown: the scene has not committed it)
  expect(g.opened).toBe(1);
  expect(stager.pending('a', [STAGE.coast])).toBe(true);
  expect(stager.pending('b', [STAGE.coast])).toBe(true);
  heard.mockClear();
  stager.committed(g);
  expect(heard).toHaveBeenCalled();
  expect(stager.pending('a', [STAGE.coast])).toBe(false);
  expect(stager.pending('a', [STAGE.coast, STAGE.props])).toBe(true);
  stager.frame();
  advance(1000);
  expect(stager.pending('a', [STAGE.coast, STAGE.props])).toBe(false);
  expect(stager.pending('b')).toBe(false);
  stop();
  heard.mockClear();
  group(stager, 'c', STAGE.coast);
  expect(heard).not.toHaveBeenCalled();
});
