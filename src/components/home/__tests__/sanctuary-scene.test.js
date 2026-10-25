import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { router } from 'expo-router';
import { SanctuaryScene } from '../sanctuary-scene';
import { useMarineModels } from '../three/use-marine-models';

jest.mock('../three/scene-canvas', () => ({ SceneCanvas: ({ children }) => <>{children}</> }));
jest.mock('../three/use-marine-models', () => ({ useMarineModels: jest.fn() }));
jest.mock('@/hooks/use-scene-active', () => ({ useSceneActive: () => true, useSceneVisible: () => true }));
jest.mock('../three/scene-camera', () => ({ SceneCamera: () => null }));
jest.mock('../three/scene-performance', () => ({ ScenePerformance: () => null }));
jest.mock('../three/sanctuary-environment', () => ({
  SanctuaryEnvironment: ({ children, islands }) => <environment>{children}{islands?.map((island) => <island key={island.key} data-habitat={island.habitat}>{island.content}</island>)}</environment>,
}));
jest.mock('@react-three/fiber', () => ({
  useFrame: jest.fn(),
  useThree: (select) => select({ size: { width: 420, height: 390 }, invalidate: () => {}, camera: {} }),
}));
jest.mock('../three/animated-marine', () => ({ AnimatedMarine: ({ model, onPress }) => <swimmer model={model} onPress={onPress} /> }));
jest.mock('../three/tuna-school-mesh', () => ({ TunaSchoolMesh: ({ onPress }) => <school onPress={onPress} /> }));
jest.mock('../three/marine-splashes', () => ({ MarineSplashes: () => null }));
jest.mock('../three/reef-rocks', () => ({ ReefRocks: ({ morays, octopuses }) => <rocks morays={morays} octopuses={octopuses} /> }));
jest.mock('../three/reef-anemone', () => ({ ReefAnemones: ({ count }) => <anemones data-count={count} /> }));
// tap-target loads three.js, which jest can't; the Home card's catch-all tap only needs its slop.
jest.mock('../three/tap-target', () => ({ TAP_SLOP: 8 }));
// So does the kelp's mover uniform; the swimmers only need its size and (unprovided) context.
jest.mock('../three/kelp-movers', () => ({ KELP_MOVERS: 12, KelpMoversContext: require('react').createContext(null) }));
jest.mock('../three/macro-life', () => ({ MacroLife: ({ species, onPress, onFocus }) => <macro data-species={species} onPress={onPress} onFocus={onFocus} /> }));
jest.mock('../island-scene', () => ({ IslandScene: () => <fallback /> }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

// The first scene here with animals builds its island's seabed for real (the animals' floor is read off
// the drawn mesh): about a tenth of a second in Node, several seconds under Jest's transform.
jest.setTimeout(20000);

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
test('a new island’s ocean stays empty until the first discovery: no visitors, no school', async () => {
  useMarineModels.mockReturnValue({ models: {}, failed: false, retry: jest.fn() });
  await act(async () => { root = create(<SanctuaryScene {...props} loading />); });
  expect(root.root.findAllByType('environment')).toHaveLength(1);
  expect(root.root.findAllByType('swimmer')).toHaveLength(0);
  await act(async () => root.update(<SanctuaryScene {...props} />));
  expect(useMarineModels).toHaveBeenLastCalledWith([]);
  expect(root.root.findAllByType('swimmer')).toHaveLength(0);
  expect(root.root.findAllByType('school')).toHaveLength(0);
  expect(root.root.findByProps({ accessibilityRole: 'image' }).props.accessibilityLabel).toContain('ocean still empty');
});

const logged = (id, category) => ({ species: { id, commonName: id, scientificName: id, category, rarity: 'common', blurb: '' }, count: 1, firstSeenOn: '2026-01-01', firstSeenSiteId: 'x', lastSeenOn: '2026-01-01' });
test('a logged tuna is shown by the school alone, never also as a generic fish, and other fish still swim', async () => {
  useMarineModels.mockReturnValue({ models: { 'reef-fish': {} }, failed: false, retry: jest.fn() });
  const residents = [logged('dogtooth-tuna', 'fish'), logged('clown-triggerfish', 'fish')];
  await act(async () => { root = create(<SanctuaryScene {...props} residents={residents} />); });
  expect(useMarineModels).toHaveBeenLastCalledWith(['reef-fish']);
  expect(root.root.findAllByType('swimmer').map((swimmer) => swimmer.props.model)).toEqual(['reef-fish']);
  expect(root.root.findAllByType('school')).toHaveLength(1);
  // One school, one species: the logged tuna.
  root.root.findByType('school').props.onPress();
  expect(router.push).toHaveBeenLastCalledWith('/species/dogtooth-tuna');
  root.root.findByType('swimmer').props.onPress();
  expect(router.push).toHaveBeenLastCalledWith('/species/clown-triggerfish');
});
test('no tuna swim unless one is logged, and deleting the last one takes the school away', async () => {
  useMarineModels.mockReturnValue({ models: { 'reef-fish': {} }, failed: false, retry: jest.fn() });
  const clownfish = logged('clown-triggerfish', 'fish');
  await act(async () => { root = create(<SanctuaryScene {...props} residents={[clownfish]} />); });
  expect(root.root.findAllByType('school')).toHaveLength(0);
  expect(root.root.findByProps({ accessibilityRole: 'image' }).props.accessibilityLabel).not.toContain('tuna');
  await act(async () => root.update(<SanctuaryScene {...props} residents={[clownfish, logged('yellowfin-tuna', 'fish')]} />));
  expect(root.root.findAllByType('school')).toHaveLength(1);
  await act(async () => root.update(<SanctuaryScene {...props} residents={[clownfish]} />));
  expect(root.root.findAllByType('school')).toHaveLength(0);
  expect(root.root.findAllByType('swimmer').map((swimmer) => swimmer.props.model)).toEqual(['reef-fish']);
});
test('a collection of only tuna is the school: no visitors, no swimmers', async () => {
  useMarineModels.mockReturnValue({ models: {}, failed: false, retry: jest.fn() });
  await act(async () => { root = create(<SanctuaryScene {...props} residents={[logged('yellowfin-tuna', 'fish')]} />); });
  expect(useMarineModels).toHaveBeenLastCalledWith([]);
  expect(root.root.findAllByType('swimmer')).toHaveLength(0);
  expect(root.root.findAllByType('school')).toHaveLength(1);
});
test('a logged dolphin swims as a pod whose every member opens its one page; a great hammerhead stays alone', async () => {
  useMarineModels.mockReturnValue({ models: { 'bottlenose-dolphin': {}, 'scalloped-hammerhead': {} }, failed: false, retry: jest.fn() });
  const residents = [logged('bottlenose-dolphin', 'mammal'), logged('great-hammerhead', 'shark')];
  await act(async () => { root = create(<SanctuaryScene {...props} residents={residents} />); });
  // Each species is loaded, counted and labeled once, however many animals it shows as.
  expect(useMarineModels).toHaveBeenLastCalledWith(['bottlenose-dolphin', 'scalloped-hammerhead']);
  expect(root.root.findByProps({ accessibilityRole: 'image' }).props.accessibilityLabel).toContain('home to 2 discovered species, 2 swimming');
  const swimmers = root.root.findAllByType('swimmer');
  const dolphins = swimmers.filter((swimmer) => swimmer.props.model === 'bottlenose-dolphin');
  expect(dolphins.length).toBeGreaterThanOrEqual(2);
  expect(dolphins.length).toBeLessThanOrEqual(3);
  expect(swimmers.filter((swimmer) => swimmer.props.model === 'scalloped-hammerhead')).toHaveLength(1);
  for (const dolphin of dolphins) {
    dolphin.props.onPress();
    expect(router.push).toHaveBeenLastCalledWith('/species/bottlenose-dolphin');
  }
});
test('reef animals swim as one animal each, opening their own page, with rocks only for those that need them', async () => {
  useMarineModels.mockReturnValue({ models: { 'day-octopus': {}, 'giant-cuttlefish': {}, 'giant-moray': {} }, failed: false, retry: jest.fn() });
  const octopus = logged('day-octopus', 'cephalopod'), cuttlefish = logged('broadclub-cuttlefish', 'cephalopod');
  const morays = [logged('giant-moray', 'fish'), logged('green-moray', 'fish')];
  await act(async () => { root = create(<SanctuaryScene {...props} residents={[octopus, cuttlefish, ...morays]} />); });
  // (the loader fetches each model once)
  expect(useMarineModels).toHaveBeenLastCalledWith(['day-octopus', 'giant-cuttlefish', 'giant-moray', 'giant-moray']);
  const swimmers = root.root.findAllByType('swimmer');
  expect(swimmers.map((swimmer) => swimmer.props.model)).toEqual(['day-octopus', 'giant-cuttlefish', 'giant-moray', 'giant-moray']);
  ['day-octopus', 'broadclub-cuttlefish', 'giant-moray', 'green-moray'].forEach((id, i) => {
    swimmers[i].props.onPress();
    expect(router.push).toHaveBeenLastCalledWith(`/species/${id}`);
  });
  // Two dens for each moray and a rock for the octopus; the cuttlefish needs none. No tuna, so no school.
  expect(root.root.findByType('rocks').props).toEqual({ morays: 2, octopuses: 1 });
  expect(root.root.findAllByType('school')).toHaveLength(0);
  // Deleting the morays and the octopus takes their rocks away.
  await act(async () => root.update(<SanctuaryScene {...props} residents={[cuttlefish]} />));
  expect(root.root.findAllByType('rocks')).toHaveLength(0);
  expect(root.root.findAllByType('swimmer').map((swimmer) => swimmer.props.model)).toEqual(['giant-cuttlefish']);
});
test('a logged clownfish swims as a pair in its anemone, both opening its page; the open-water newcomers swim in their groups', async () => {
  useMarineModels.mockReturnValue({ models: { clownfish: {}, 'spotted-eagle-ray': {}, 'great-barracuda': {} }, failed: false, retry: jest.fn() });
  const clownfish = logged('clownfish', 'fish'), ray = logged('spotted-eagle-ray', 'ray'), barracuda = logged('great-barracuda', 'fish');
  await act(async () => { root = create(<SanctuaryScene {...props} residents={[clownfish, ray, barracuda]} />); });
  const swimmers = root.root.findAllByType('swimmer');
  // The ray's squadron and the lone barracuda first (the open water's), then the clownfish pair on the reef.
  expect(swimmers.filter((s) => s.props.model === 'clownfish')).toHaveLength(2);
  expect(swimmers.filter((s) => s.props.model === 'great-barracuda')).toHaveLength(1);
  expect(swimmers.filter((s) => s.props.model === 'spotted-eagle-ray').length).toBeGreaterThanOrEqual(3);
  for (const s of swimmers.filter((s) => s.props.model === 'clownfish')) {
    s.props.onPress();
    expect(router.push).toHaveBeenLastCalledWith('/species/clownfish');
  }
  // One anemone for the pair, and no rocks (no moray or octopus).
  expect(root.root.findByType('anemones').props).toEqual({ 'data-count': 1 });
  expect(root.root.findAllByType('rocks')).toHaveLength(0);
});

test('the reef’s small life lives only in the explorer: logged macro species, each opening its page', async () => {
  useMarineModels.mockReturnValue({ models: { manta: {} }, failed: false, retry: jest.fn() });
  const residents = [logged('pygmy-seahorse', 'macro'), logged('reef-manta-ray', 'ray'), logged('giant-clam', 'macro')];
  await act(async () => { root = create(<SanctuaryScene {...props} residents={residents} />); });
  expect(root.root.findAllByType('macro')).toHaveLength(0);
  const explorer = { camera: null, tapScale: 1, zoom: () => 200, focus: jest.fn() };
  await act(async () => root.update(<SanctuaryScene {...props} residents={residents} explorer={explorer} />));
  expect(root.root.findByType('macro').props['data-species']).toEqual(['pygmy-seahorse', 'giant-clam']);
  expect(root.root.findByProps({ accessibilityRole: 'image' }).props.accessibilityLabel).toContain('2 small creatures on the reef to find up close');
  root.root.findByType('macro').props.onPress('giant-clam');
  expect(router.push).toHaveBeenLastCalledWith('/species/giant-clam');
  // From afar, a tap on a home looks closer through the explorer.
  root.root.findByType('macro').props.onFocus(1, 2, 240);
  expect(explorer.focus).toHaveBeenCalledWith(1, 2, 240);
  // Nothing small logged, nothing on the reef.
  await act(async () => root.update(<SanctuaryScene {...props} residents={[logged('reef-manta-ray', 'ray')]} explorer={explorer} />));
  expect(root.root.findAllByType('macro')).toHaveLength(0);
});

test('on the Home card, a tap anywhere no animal takes opens the island full screen; a drag (or the page scrolling) does not', async () => {
  useMarineModels.mockReturnValue({ models: { 'reef-fish': {} }, failed: false, retry: jest.fn() });
  const onOpen = jest.fn(), residents = [logged('clown-triggerfish', 'fish')];
  await act(async () => { root = create(<SanctuaryScene {...props} residents={residents} onOpen={onOpen} />); });
  // An invisible catcher far below everything, so any animal's tap target is hit first.
  const catcher = root.root.findAll((node) => node.type === 'mesh' && typeof node.props.onClick === 'function');
  expect(catcher).toHaveLength(1);
  expect(catcher[0].props.visible).toBe(false);
  expect(catcher[0].props.position[1]).toBeLessThan(-5);
  const stopPropagation = jest.fn();
  catcher[0].props.onClick({ delta: 20, stopPropagation });
  expect(onOpen).not.toHaveBeenCalled();
  catcher[0].props.onClick({ delta: 3, stopPropagation });
  expect(onOpen).toHaveBeenCalledTimes(1);
  expect(stopPropagation).toHaveBeenCalledTimes(1);
  // An animal still opens its own page.
  root.root.findByType('swimmer').props.onPress();
  expect(router.push).toHaveBeenLastCalledWith('/species/clown-triggerfish');
  // Nothing to open: no catcher (nor in the explorer itself, which is already full screen).
  await act(async () => root.update(<SanctuaryScene {...props} residents={residents} />));
  expect(root.root.findAll((node) => node.type === 'mesh' && typeof node.props.onClick === 'function')).toHaveLength(0);
  const explorer = { camera: null, tapScale: 1, zoom: () => 40, focus: jest.fn() };
  await act(async () => root.update(<SanctuaryScene {...props} residents={residents} onOpen={onOpen} explorer={explorer} />));
  expect(root.root.findAll((node) => node.type === 'mesh' && typeof node.props.onClick === 'function')).toHaveLength(0);
});
