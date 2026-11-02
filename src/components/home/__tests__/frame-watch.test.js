import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { FrameWatch } from '../instant-picture';
import { IslandContext, Stage, StagerContext } from '../three/staging';
import { createStager, STAGE } from '../three/stager';

/**
 * The picture over a scene (instant-picture.tsx) goes once the scene has drawn two frames with everything in view built: FrameWatch counts them, and counts
 * none while the stager says something in view is still to be built, however early the frames come (the canvas's first, before its islands have said what they have to build).
 */
let frames, root;
jest.mock('@react-three/fiber', () => ({
  useFrame: (callback) => { global.__frames.push(callback); },
  useThree: (select) => select({ invalidate: () => {} }),
}));
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  frames = []; global.__frames = frames;
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
  jest.useRealTimers();
});
/** The canvas draws `n` frames: every frame callback the scene has subscribed runs. */
const draw = async (n = 1) => { for (let i = 0; i < n; i++) await act(async () => { for (const callback of frames) callback(); }); };
const Built = () => <built />;

test('two frames with nothing to build: drawn', async () => {
  const onDrawn = jest.fn();
  await act(async () => { root = create(<FrameWatch watching onDrawn={onDrawn} />); });
  await draw(1);
  expect(onDrawn).not.toHaveBeenCalled();
  await draw(1);
  expect(onDrawn).toHaveBeenCalledTimes(1);
});

test('not watching: no frame counts', async () => {
  const onDrawn = jest.fn();
  await act(async () => { root = create(<FrameWatch watching={false} onDrawn={onDrawn} />); });
  await draw(5);
  expect(onDrawn).not.toHaveBeenCalled();
});

test('a scene whose stager is not settled has not drawn what is in view: its frames do not count until it is', async () => {
  const stager = createStager({ heavy: 0 });
  const onDrawn = jest.fn();
  await act(async () => {
    root = create(<StagerContext.Provider value={stager}>
      <IslandContext.Provider value="a"><Stage at={STAGE.coast}><Built /></Stage><Stage at={STAGE.props}><Built /></Stage></IslandContext.Provider>
      <FrameWatch watching onDrawn={onDrawn} />
    </StagerContext.Provider>);
  });
  // Frames come (the stager hears the first, and starts building), but the island is not built: none counts.
  expect(stager.getState().settled).toBe(false);
  await act(async () => { stager.frame(); jest.advanceTimersByTime(0); });
  await draw(6);
  expect(onDrawn).not.toHaveBeenCalled();
  // Built at last (a frame between steps, as the stager's heavy steps ask): then two frames.
  for (let i = 0; i < 4 && !stager.getState().settled; i++) await act(async () => { stager.frame(); jest.advanceTimersByTime(300); });
  expect(stager.getState().settled).toBe(true);
  await draw(1);
  expect(onDrawn).not.toHaveBeenCalled();
  await draw(1);
  expect(onDrawn).toHaveBeenCalledTimes(1);
});

test('the canvas’s first frames, drawn while the scene still says it is watching and its islands have only just said what they have to build, do not end the picture', async () => {
  const stager = createStager({ heavy: 0 });
  const onDrawn = jest.fn();
  // (what the scene last said: settled, nothing staged yet, so `watching` is true as the canvas mounts)
  expect(stager.getState().settled).toBe(true);
  await act(async () => {
    root = create(<StagerContext.Provider value={stager}>
      <FrameWatch watching onDrawn={onDrawn} />
      <IslandContext.Provider value="a"><Stage at={STAGE.coast}><Built /></Stage></IslandContext.Provider>
    </StagerContext.Provider>);
  });
  // The islands registered in the same commit that mounted the watcher; the frames drawn right after it are not frames of a built scene.
  await draw(3);
  expect(onDrawn).not.toHaveBeenCalled();
});

test('with no stager above it (the card without a staged scene), two frames', async () => {
  const onDrawn = jest.fn();
  await act(async () => { root = create(<StagerContext.Provider value={null}><FrameWatch watching onDrawn={onDrawn} /></StagerContext.Provider>); });
  await draw(2);
  expect(onDrawn).toHaveBeenCalledTimes(1);
});
