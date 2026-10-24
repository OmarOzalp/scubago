import React, { act, useEffect } from 'react';
import { create } from 'react-test-renderer';
import { useScrollTo } from '../use-scroll-to';

let scroll;
let root;
function Harness() {
  const value = useScrollTo();
  useEffect(() => {
    scroll = value;
  });
  return null;
}
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
});
const mount = async () => { await act(async () => { root = create(<Harness />); }); };
/** Something that is `top` pixels from the top of the screen. */
const at = (top) => ({ measureInWindow: (done) => done(0, top, 100, 50) });

test('scrolls by the distance between the field and the top of the ScrollView, from where it is now', async () => {
  await mount();
  const scrollTo = jest.fn();
  scroll.scrollView.current = { ...at(100), scrollTo };
  // Scrolled down 50 already; the field is 700 from the top of the screen, the ScrollView starts at 100.
  scroll.onScroll({ nativeEvent: { contentOffset: { y: 50 } } });
  scroll.scrollTo(at(700));
  // 50 + (700 - 100), less the 72 left above it for its label.
  expect(scrollTo).toHaveBeenCalledWith({ y: 578, animated: true });
  scroll.scrollTo(at(700), 0);
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 650, animated: true });
});

test('never scrolls above the top, and does nothing without a field or a ScrollView', async () => {
  await mount();
  const scrollTo = jest.fn();
  scroll.scrollView.current = { ...at(100), scrollTo };
  scroll.scrollTo(at(120));
  expect(scrollTo).toHaveBeenCalledWith({ y: 0, animated: true });
  scrollTo.mockClear();
  scroll.scrollTo(null);
  scroll.scrollTo(undefined);
  scroll.scrollView.current = null;
  scroll.scrollTo(at(700));
  expect(scrollTo).not.toHaveBeenCalled();
});
