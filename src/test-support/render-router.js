// Expo Router's own navigators in a test, without @testing-library/react-native (which this project does not install): the same
// ExpoRoot that expo-router/testing-library's renderRouter mounts, over screens given in memory, rendered with react-test-renderer.
// The file-based `routes` are `{ '(tabs)/_layout': Component, '(tabs)/index': Component, ... }`, as renderRouter takes them.
import { act } from 'react';
import { create } from 'react-test-renderer';
import 'expo-router/build/testing-library/mocks';
import { ExpoRoot } from 'expo-router/build/ExpoRoot';
import { getMockContext } from 'expo-router/build/testing-library/mock-config';
import { navigationRef } from 'expo-router/build/global-state/navigationRef';
import { getRouteInfoFromState } from 'expo-router/build/global-state/getRouteInfoFromState';

/** Mounts the app at `initialUrl`; returns the renderer and ways to read where the navigators are. */
export async function renderRouter(routes, { initialUrl = '/' } = {}) {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
  const context = getMockContext(routes);
  let renderer;
  await act(async () => { renderer = create(<ExpoRoot context={context} location={initialUrl} />); });
  return {
    renderer,
    unmount: () => act(async () => renderer.unmount()),
    getPathname: () => getRouteInfoFromState(navigationRef.getRootState()).pathname,
    getParams: () => getRouteInfoFromState(navigationRef.getRootState()).params,
    getRootState: () => navigationRef.getRootState(),
    /** The navigators as one line, the focused route of each marked with *: `stack[(tabs)[index,explore*{island=kelp}],rewards/islands*]`. */
    describe: () => describeState(navigationRef.getRootState()),
  };
}

function describeState(state) {
  if (!state) return '';
  const inner = state.routes.map((route, i) => {
    const params = route.params && Object.keys(route.params).length ? `{${Object.entries(route.params).map(([k, v]) => `${k}=${v}`).join(',')}}` : '';
    const child = route.state ? `[${describeState(route.state)}]` : '';
    return `${route.name}${i === state.index ? '*' : ''}${params}${child}`;
  });
  return inner.join(',');
}
