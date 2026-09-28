import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { router } from 'expo-router';
import { SanctuaryScene } from '../sanctuary-scene';
import { useMarineModels } from '../three/use-marine-models';

jest.mock('../three/scene-canvas', () => ({ SceneCanvas: ({ children }) => <>{children}</> }));
jest.mock('../three/use-marine-models', () => ({ useMarineModels: jest.fn() }));
jest.mock('@/hooks/use-scene-active', () => ({ useSceneActive: () => true }));
jest.mock('../three/scene-camera', () => ({ SceneCamera: () => null }));
jest.mock('../three/scene-performance', () => ({ ScenePerformance: () => null }));
jest.mock('../three/sanctuary-environment', () => ({ SanctuaryEnvironment: ({ children }) => <environment>{children}</environment> }));
jest.mock('@react-three/fiber', () => ({ useFrame: jest.fn() }));
jest.mock('../three/animated-marine', () => ({ AnimatedMarine: ({ model, onPress }) => <swimmer model={model} onPress={onPress} /> }));
jest.mock('../three/tuna-school-mesh', () => ({ TunaSchoolMesh: ({ onPress }) => <school onPress={onPress} /> }));
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
  // The tuna school swims with them; a tap on it opens the tuna it is drawn after.
  expect(root.root.findAllByType('school')).toHaveLength(1);
  root.root.findByType('school').props.onPress();
  expect(router.push).toHaveBeenLastCalledWith('/species/yellowfin-tuna');
});

const logged = (id, category) => ({ species: { id, commonName: id, scientificName: id, category, rarity: 'common', blurb: '' }, count: 1, firstSeenOn: '2026-01-01', firstSeenSiteId: 'x', lastSeenOn: '2026-01-01' });
test('a logged tuna is shown by the school alone, never also as a generic fish, and other fish still swim', async () => {
  useMarineModels.mockReturnValue({ models: { 'reef-fish': {} }, failed: false, retry: jest.fn() });
  const residents = [logged('dogtooth-tuna', 'fish'), logged('clownfish', 'fish')];
  await act(async () => { root = create(<SanctuaryScene {...props} residents={residents} />); });
  expect(useMarineModels).toHaveBeenLastCalledWith(['reef-fish']);
  expect(root.root.findAllByType('swimmer').map((swimmer) => swimmer.props.model)).toEqual(['reef-fish']);
  expect(root.root.findAllByType('school')).toHaveLength(1);
  // One school, one species: the logged tuna.
  root.root.findByType('school').props.onPress();
  expect(router.push).toHaveBeenLastCalledWith('/species/dogtooth-tuna');
  root.root.findByType('swimmer').props.onPress();
  expect(router.push).toHaveBeenLastCalledWith('/species/clownfish');
});
test('a collection of only tuna is the school: no preview visitors, no swimmers', async () => {
  useMarineModels.mockReturnValue({ models: {}, failed: false, retry: jest.fn() });
  await act(async () => { root = create(<SanctuaryScene {...props} residents={[logged('yellowfin-tuna', 'fish')]} />); });
  expect(useMarineModels).toHaveBeenLastCalledWith([]);
  expect(root.root.findAllByType('swimmer')).toHaveLength(0);
  expect(root.root.findAllByType('school')).toHaveLength(1);
});
