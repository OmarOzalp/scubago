import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { ARRIVE_SECONDS, IslandContext, Stage, StagerContext, StagingProvider, useSteps } from '../three/staging';
import { createStager, STAGE } from '../three/stager';
import { GrowthContext } from '../three/unlock';

// The scene's steps (staging.tsx) over the stager (stager.ts): what a component builds waits for its step, and the next step waits
// for it to be on screen.
let frames, mockInvalidate;
jest.mock('@react-three/fiber', () => ({
  useFrame: (callback) => { global.__frames.push(callback); },
  useThree: (select) => select({ invalidate: () => global.__invalidate() }),
}));
let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  frames = []; mockInvalidate = jest.fn();
  global.__frames = frames; global.__invalidate = mockInvalidate;
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
  jest.useRealTimers();
  delete process.env.EXPO_PUBLIC_ISLAND_ARRIVAL;
});
/** A frame drawn: the stager hears it, and then the timers it set run. */
const draw = async (stager, ms = 0) => { await act(async () => { stager.frame(); jest.advanceTimersByTime(ms); }); };
const island = (key, children) => <IslandContext.Provider key={key} value={key}>{children}</IslandContext.Provider>;
const names = () => root.root.findAll((node) => typeof node.type === 'string' && node.type === 'built').map((node) => node.props.name);
const Built = ({ name }) => <built name={name} />;

test('with nothing to stage them, everything is there at once', async () => {
  await act(async () => {
    root = create(<>{island('a', <><Stage at={STAGE.coast}><Built name="a coast" /></Stage><Stage at={STAGE.props} grow><Built name="a props" /></Stage></>)}</>);
  });
  expect(names()).toEqual(['a coast', 'a props']);
});

test('each part is built when its step opens: nothing before the scene’s first frame, then one step at a time, a frame between when the work is heavy', async () => {
  const stager = createStager({ heavy: 0 });
  await act(async () => {
    root = create(<StagerContext.Provider value={stager}>
      {island('a', <><Stage at={STAGE.coast}><Built name="a coast" /></Stage><Stage at={STAGE.props}><Built name="a props" /></Stage></>)}
      {island('b', <Stage at={STAGE.coast}><Built name="b coast" /></Stage>)}
    </StagerContext.Provider>);
  });
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(names()).toEqual([]);
  await draw(stager);
  expect(names()).toEqual(['a coast']);
  // (the next is built when the one before has been shown, and a frame has been drawn after it)
  await act(async () => { jest.advanceTimersByTime(10); });
  expect(names()).toEqual(['a coast']);
  await draw(stager);
  expect(names()).toEqual(['a coast', 'b coast']);
  await draw(stager);
  expect(names()).toEqual(['a coast', 'a props', 'b coast']);
  expect(stager.getState()).toEqual({ settled: true, done: true });
});

test('a part waits for the one before it to be on screen: a step opens only after the last was committed', async () => {
  const stager = createStager({ heavy: 1e9, age: 1e9 });
  const log = [];
  const Part = ({ stage, name }) => { log.push(`render ${name}`); return <Stage at={stage}><Built name={name} /></Stage>; };
  await act(async () => { root = create(<StagerContext.Provider value={stager}>{island('a', <><Part stage={STAGE.coast} name="coast" /><Part stage={STAGE.props} name="props" /></>)}</StagerContext.Provider>); });
  expect(names()).toEqual([]);
  await draw(stager);
  await act(async () => { jest.advanceTimersByTime(0); });
  // Both are built by now, one after the other: the second only once the first was shown (or its wait given up).
  expect(names()).toEqual(['coast', 'props']);
});

test('an animal’s step: a count of steps that grows as models arrive, the new ones built in their turn', async () => {
  const stager = createStager({ heavy: 1e9, age: 1e9 });
  const seen = [];
  const Animals = ({ count }) => { const room = useSteps(STAGE.animal, count); seen.push(room); return <built name={`room ${room}`} />; };
  const mount = (count) => <StagerContext.Provider value={stager}>{island('a', <Animals count={count} />)}</StagerContext.Provider>;
  await act(async () => { root = create(mount(2)); });
  expect(names()).toEqual(['room 0']);
  await draw(stager);
  await act(async () => { jest.advanceTimersByTime(0); });
  expect(names()).toEqual(['room 2']);
  await act(async () => root.update(mount(3)));
  expect(names()).toEqual(['room 2']);
  await draw(stager);
  await act(async () => { jest.advanceTimersByTime(0); });
  expect(names()).toEqual(['room 3']);
  // Fewer animals than steps taken: no more room than there are.
  await act(async () => root.update(mount(1)));
  expect(names()).toEqual(['room 1']);
});

test('without a stager the room is the count itself', async () => {
  const Animals = ({ count }) => <built name={`room ${useSteps(STAGE.animal, count)}`} />;
  await act(async () => { root = create(<Animals count={5} />); });
  expect(names()).toEqual(['room 5']);
});

test('with growing arrival, what arrives into a scene on show grows in from nothing; under a picture of it, or with the first frame, it is simply there', async () => {
  process.env.EXPO_PUBLIC_ISLAND_ARRIVAL = 'grow';
  const group = () => ({ scale: { value: 1, setScalar(v) { this.value = v; } } });
  const made = [];
  const createNodeMock = (element) => { if (element.type !== 'group') return null; const node = group(); made.push(node); return node; };
  const scene = (stager, animate) => <StagerContext.Provider value={stager}><GrowthContext.Provider value={{ animate, duration: 3.5 }}>
    {island('a', <Stage at={STAGE.props} grow><Built name="props" /></Stage>)}
  </GrowthContext.Provider></StagerContext.Provider>;

  // On show: it grows over ARRIVE_SECONDS.
  const stager = createStager({ heavy: 1e9, age: 1e9 });
  stager.show(true);
  await act(async () => { root = create(scene(stager, true), { createNodeMock }); });
  await draw(stager);
  await act(async () => { jest.advanceTimersByTime(0); });
  expect(names()).toEqual(['props']);
  const node = made.at(-1);
  expect(node.scale.value).toBeCloseTo(.001);
  const tick = frames.at(-1);
  for (let i = 0; i < 20; i++) tick(undefined, ARRIVE_SECONDS / 20);
  expect(node.scale.value).toBeGreaterThan(.99);
  for (let i = 0; i < 5; i++) tick(undefined, ARRIVE_SECONDS / 20);
  expect(node.scale.value).toBe(1);
  await act(async () => root.unmount());

  // Under a picture of the scene (not shown): there at full size at once, in no group of its own.
  const hidden = createStager({ heavy: 1e9, age: 1e9 });
  hidden.show(false);
  made.length = 0;
  await act(async () => { root = create(scene(hidden, true), { createNodeMock }); });
  await draw(hidden);
  await act(async () => { jest.advanceTimersByTime(0); });
  expect(names()).toEqual(['props']);
  expect(made.at(-1)?.scale.value ?? 1).toBe(1);
  await act(async () => root.unmount());

  // Still (Reduce Motion, paused): simply there.
  const still = createStager({ heavy: 1e9, age: 1e9 });
  still.show(true);
  made.length = 0;
  await act(async () => { root = create(scene(still, false), { createNodeMock }); });
  await draw(still);
  await act(async () => { jest.advanceTimersByTime(0); });
  expect(made.at(-1)?.scale.value ?? 1).toBe(1);
});

test('with whole arrival (the default), what arrives is simply there at full size, never grown in, in a scene on show or not', async () => {
  const made = [];
  const createNodeMock = (element) => {
    if (element.type !== 'group') return null;
    const node = { scale: { value: 1, setScalar(v) { this.value = v; } } };
    made.push(node);
    return node;
  };
  const stager = createStager({ heavy: 1e9, age: 1e9 });
  stager.show(true);
  await act(async () => {
    root = create(<StagerContext.Provider value={stager}><GrowthContext.Provider value={{ animate: true, duration: 3.5 }}>
      {island('a', <Stage at={STAGE.props} grow><Built name="props" /></Stage>)}
    </GrowthContext.Provider></StagerContext.Provider>, { createNodeMock });
  });
  await draw(stager);
  await act(async () => { jest.advanceTimersByTime(0); });
  expect(names()).toEqual(['props']);
  expect(made.at(-1).scale.value).toBe(1);
});

test('the provider hands the stager the canvas’s frames and its way to ask for another, and holds the building while the scene is hidden', async () => {
  const stager = createStager({ heavy: 1e9, age: 1e9 });
  const spy = jest.spyOn(stager, 'frame');
  const hold = jest.spyOn(stager, 'hold');
  const invalidate = jest.spyOn(stager, 'setInvalidate');
  const part = <StagingProvider stager={stager} hidden>{island('a', <Stage at={STAGE.coast}><Built name="coast" /></Stage>)}</StagingProvider>;
  await act(async () => { root = create(part); });
  expect(hold).toHaveBeenLastCalledWith(true);
  expect(invalidate).toHaveBeenCalledWith(expect.any(Function));
  frames.at(-1)();
  expect(spy).toHaveBeenCalled();
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(names()).toEqual([]);
  await act(async () => root.update(<StagingProvider stager={stager}>{island('a', <Stage at={STAGE.coast}><Built name="coast" /></Stage>)}</StagingProvider>));
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(names()).toEqual(['coast']);
});
