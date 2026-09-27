import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { SanctuaryScene } from '../sanctuary-scene';
import { useMarineModels } from '../three/use-marine-models';

jest.mock('../three/scene-canvas', () => ({ SceneCanvas: ({ children }) => <>{children}</> }));
jest.mock('../three/use-marine-models', () => ({ useMarineModels: jest.fn() }));
jest.mock('@/hooks/use-scene-active', () => ({ useSceneActive: () => true }));
jest.mock('../three/scene-camera', () => ({ SceneCamera: () => null }));
jest.mock('../three/scene-performance', () => ({ ScenePerformance: () => null }));
jest.mock('../three/sanctuary-environment', () => ({ SanctuaryEnvironment: ({ children }) => <environment>{children}</environment> }));
jest.mock('@react-three/fiber', () => ({ useFrame: jest.fn() }));
jest.mock('../three/animated-marine', () => ({ AnimatedMarine: () => <swimmer /> }));
jest.mock('../three/tuna-school-mesh', () => ({ TunaSchoolMesh: () => <school /> }));
jest.mock('../island-scene', () => ({ IslandScene: () => <fallback /> }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

let root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });
const props = { habitat: 'island', level: 1, residents: [], onInspect: jest.fn() };

test('the island renders while animal assets are still loading', async () => {
  useMarineModels.mockReturnValue({ models: null, failed: false, retry: jest.fn() });
  await act(async () => { root = create(<SanctuaryScene {...props} />); });
  expect(root.root.findAllByType('environment')).toHaveLength(1);
  expect(root.root.findAllByType('swimmer')).toHaveLength(0);
});
test('the island is visible during discovery loading, then visiting animals appear', async () => {
  useMarineModels.mockReturnValue({ models: { 'whale-shark': {}, 'reef-manta': {} }, failed: false, retry: jest.fn() });
  await act(async () => { root = create(<SanctuaryScene {...props} loading />); });
  expect(root.root.findAllByType('environment')).toHaveLength(1);
  expect(root.root.findAllByType('swimmer')).toHaveLength(0);
  await act(async () => root.update(<SanctuaryScene {...props} />));
  expect(root.root.findAllByType('swimmer')).toHaveLength(2);
  // The tuna school swims with them.
  expect(root.root.findAllByType('school')).toHaveLength(1);
});
