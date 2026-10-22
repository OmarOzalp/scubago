import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { Circle, Ellipse, LinearGradient, Path, RadialGradient } from 'react-native-svg';
import { IslandArt } from '@/components/home/island-art';
import { ISLANDS } from '@/lib/archipelago';
import { HABITATS } from '@/lib/home';

// The 2D island pictures (docs/rewards.md, "Islands"): one drawing per habitat, light enough to draw
// anywhere (the Islands screen, the share card, the intro, Home's fallback).

const SHAPES = [Path, Ellipse, Circle];
const GRADIENTS = [LinearGradient, RadialGradient];
// The levels that change the picture most: the plain island, the wider shelf, and both islets.
const LEVELS = [1, 3, 6];
const ISLAND_HABITATS = Object.values(ISLANDS);

let root;
let warn;
let error;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  error = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
  jest.restoreAllMocks();
});

async function draw(...arts) {
  await act(async () => { root = create(<>{arts.map((art, i) => <React.Fragment key={i}>{art}</React.Fragment>)}</>); });
  return root;
}
const shapes = (r) => r.root.findAll((n) => SHAPES.includes(n.type));
const pathData = (r) => new Set(r.root.findAllByType(Path).map((n) => n.props.d));
const gradientIds = (r) => r.root.findAll((n) => GRADIENTS.includes(n.type)).map((n) => n.props.id);
const references = (r) => r.root.findAll((n) => SHAPES.includes(n.type))
  .flatMap((n) => [n.props.fill, n.props.stroke])
  .filter((v) => typeof v === 'string' && v.startsWith('url(#'))
  .map((v) => v.slice(5, -1));

test('every habitat draws at every level without a warning, in a few hundred shapes at most', async () => {
  for (const { id } of HABITATS) {
    let before = 0;
    for (const level of LEVELS) {
      await draw(<IslandArt habitat={id} level={level} />);
      const count = shapes(root).length;
      expect(`${id} level ${level}: ${count > 0 && count <= 400}`).toBe(`${id} level ${level}: true`);
      // The island grows with its level: never fewer shapes than the level before, and more by the end.
      expect(count).toBeGreaterThanOrEqual(before);
      before = count;
      await act(async () => root.unmount());
      root = null;
    }
    await draw(<IslandArt habitat={id} level={1} />);
    const first = shapes(root).length;
    expect(before).toBeGreaterThan(first);
  }
  // react-native-svg warns about a gradient value it cannot read (".5" instead of 0.5) and the like.
  expect(warn).not.toHaveBeenCalled();
  expect(error).not.toHaveBeenCalled();
}, 20000);

test('the five islands are five different drawings, not one island in five colours', async () => {
  const drawn = {};
  for (const habitat of ISLAND_HABITATS) {
    await draw(<IslandArt habitat={habitat} level={1} />);
    drawn[habitat] = pathData(root);
    await act(async () => root.unmount());
    root = null;
  }
  const habitats = Object.keys(drawn);
  expect(habitats).toHaveLength(5);
  for (const a of habitats) {
    for (const b of habitats) {
      if (a >= b) continue;
      const shared = [...drawn[a]].filter((d) => drawn[b].has(d)).length;
      // A palm or two may be shared; the silhouettes and landmarks are not.
      expect(`${a} / ${b}: ${shared / Math.min(drawn[a].size, drawn[b].size) < 0.2}`).toBe(`${a} / ${b}: true`);
    }
  }
});

test('the other shores Home has known (the lagoon and the cove) still draw', async () => {
  for (const habitat of ['lagoon', 'cove']) {
    await draw(<IslandArt habitat={habitat} level={6} />);
    expect(shapes(root).length).toBeGreaterThan(50);
    await act(async () => root.unmount());
    root = null;
  }
  // And a habitat it does not know draws Home's island rather than nothing.
  await draw(<IslandArt habitat="nowhere" />);
  expect(shapes(root).length).toBeGreaterThan(50);
});

test('several islands on one page keep their gradients apart', async () => {
  await draw(...ISLAND_HABITATS.map((h) => <IslandArt key={h} habitat={h} level={3} />), <IslandArt habitat="kelp" level={3} />);
  const ids = gradientIds(root);
  expect(ids.length).toBeGreaterThan(10);
  expect(new Set(ids).size).toBe(ids.length);
  // Everything painted with a gradient finds it on the page.
  const refs = references(root);
  expect(refs.length).toBeGreaterThan(5);
  for (const ref of refs) expect(ids).toContain(ref);
  // The ids are safe to put in url(#...): letters, digits, dashes and underscores.
  for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
});
