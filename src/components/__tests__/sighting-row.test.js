import React, { act } from 'react';
import { expect, jest, test } from '@jest/globals';
import { create } from 'react-test-renderer';
import { SightingRow } from '../sighting-row';
import { CATALOG_BY_ID } from '@/lib/catalog';

// The theme module imports the web stylesheet, which Jest can't parse.
jest.mock('@/global.css', () => ({}));

const species = CATALOG_BY_ID.get('whale-shark');
const sighting = (overrides) => ({
  id: 's1', userId: 'u1', username: 'reefwanderer', speciesId: 'whale-shark', siteId: 'richelieu-rock',
  sightedOn: '2026-09-01', isDemo: false, synced: true, createdAt: '2026-09-01T00:00:00.000Z', ...overrides,
});
const text = (root) => root.root.findAll((node) => typeof node.children?.[0] === 'string').map((node) => node.children.join('')).join(' | ');

test('a real community sighting names the diver who logged it', async () => {
  let root;
  await act(async () => { root = create(<SightingRow sighting={sighting()} species={species} showUsername />); });
  expect(text(root)).toContain('@reefwanderer');
  expect(text(root)).not.toContain('Example');
});

test('demo data is labeled as an example and never shown under an invented diver name', async () => {
  let root;
  await act(async () => { root = create(<SightingRow sighting={sighting({ isDemo: true, username: 'mantamagnet' })} species={species} showUsername />); });
  expect(text(root)).toContain('Example');
  expect(text(root)).not.toContain('@mantamagnet');
});
