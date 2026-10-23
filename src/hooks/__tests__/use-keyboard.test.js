import React, { act, useEffect } from 'react';
import { create } from 'react-test-renderer';
import { Dimensions, Keyboard, Platform } from 'react-native';
import { useKeyboard } from '../use-keyboard';

let result;
let root;
let listeners;
function Harness({ container }) {
  const value = useKeyboard(container);
  useEffect(() => {
    result = value;
  });
  return null;
}
const mount = async (container) => { await act(async () => { root = create(<Harness container={container} />); }); };
/** A view whose bottom edge is at `bottom` on the screen. */
const viewEndingAt = (bottom) => ({ current: { measureInWindow: (done) => done(0, 100, 390, bottom - 100) } });
const emit = async (event, screenY) => act(async () => listeners[event]({ endCoordinates: { screenY, height: 844 - screenY } }));

const platform = Platform.OS;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  listeners = {};
  jest.spyOn(Keyboard, 'addListener').mockImplementation((event, handler) => {
    listeners[event] = handler;
    return { remove: jest.fn() };
  });
  jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 390, height: 844, scale: 2, fontScale: 1 });
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
  Platform.OS = platform;
  jest.restoreAllMocks();
});

describe('on iOS', () => {
  beforeEach(() => { Platform.OS = 'ios'; });

  test('says how far the keyboard reaches into the container, and 0 again when it goes', async () => {
    await mount(viewEndingAt(844));
    expect(result).toEqual({ open: false, overlap: 0 });
    await emit('keyboardWillChangeFrame', 544);
    expect(result).toEqual({ open: true, overlap: 300 });
    // The keyboard grows (a suggestions bar): the overlap follows.
    await emit('keyboardWillChangeFrame', 500);
    expect(result).toEqual({ open: true, overlap: 344 });
    await act(async () => listeners.keyboardWillHide());
    expect(result).toEqual({ open: false, overlap: 0 });
  });

  test('a frame change to below the screen is the keyboard going, not coming', async () => {
    await mount(viewEndingAt(844));
    await emit('keyboardWillChangeFrame', 544);
    await emit('keyboardWillChangeFrame', 844);
    expect(result).toEqual({ open: false, overlap: 0 });
  });

  test('a container that already ends above the keyboard is not padded again', async () => {
    await mount(viewEndingAt(500));
    await emit('keyboardWillChangeFrame', 544);
    expect(result).toEqual({ open: true, overlap: 0 });
  });

  test('without a container only whether the keyboard is up is known', async () => {
    await mount(undefined);
    await emit('keyboardWillChangeFrame', 544);
    expect(result).toEqual({ open: true, overlap: 0 });
  });
});

describe('on Android', () => {
  beforeEach(() => { Platform.OS = 'android'; });

  test('listens to the events Android sends', async () => {
    await mount(viewEndingAt(844));
    expect(Object.keys(listeners).sort()).toEqual(['keyboardDidHide', 'keyboardDidShow']);
    await emit('keyboardDidShow', 560);
    expect(result).toEqual({ open: true, overlap: 284 });
    await act(async () => listeners.keyboardDidHide());
    expect(result).toEqual({ open: false, overlap: 0 });
  });

  test('where the window has shrunk for the keyboard already, the overlap is 0', async () => {
    // The container now ends where the keyboard begins.
    await mount(viewEndingAt(560));
    await emit('keyboardDidShow', 560);
    expect(result).toEqual({ open: true, overlap: 0 });
  });
});

test('stops listening when it is gone', async () => {
  const remove = jest.fn();
  Keyboard.addListener.mockImplementation(() => ({ remove }));
  await mount(undefined);
  await act(async () => root.unmount());
  root = null;
  expect(remove).toHaveBeenCalledTimes(2);
});

describe('keyboardDismissMode for a form', () => {
  /** The constant as it is on `os`: read when the module loads, so it is loaded afresh with that platform. */
  const dismissOnDrag = (os) => {
    let value;
    jest.isolateModules(() => {
      require('react-native').Platform.OS = os;
      value = require('../use-keyboard').DISMISS_ON_DRAG;
    });
    return value;
  };

  test('is dragging on a phone', () => {
    expect(dismissOnDrag('ios')).toBe('on-drag');
    expect(dismissOnDrag('android')).toBe('on-drag');
  });

  test('is not set on the web, where any scroll would put the keyboard away, even one that goes to a field', () => {
    expect(dismissOnDrag('web')).toBeUndefined();
  });
});
