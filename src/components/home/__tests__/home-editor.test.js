import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { TextInput } from 'react-native';
import { create } from 'react-test-renderer';
import { HomeEditor } from '@/components/home/home-editor';
import { HOME_NAME_MAX } from '@/lib/home';

jest.mock('@/global.css', () => ({}));
jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => true }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

let root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });

const render = async (name) => { await act(async () => { root = create(<HomeEditor preferences={{ name }} saving={false} error="" onSave={async () => true} onClose={() => {}} />); }); };
const texts = () => root.root.findAll((n) => typeof n.children?.[0] === 'string').map((n) => n.children.join(''));
const type = async (value) => act(async () => root.root.findByType(TextInput).props.onChangeText(value));
const note = () => root.root.findAll((n) => n.type === 'Text' && typeof n.children?.[0] === 'string' && /of 32/.test(n.children[0]))[0];

test('the name field says how far along the name is, and that it stops at the longest a name can be', async () => {
  expect(HOME_NAME_MAX).toBe(32);
  await render('Kai’s Atoll');
  expect(root.root.findByType(TextInput).props.maxLength).toBe(HOME_NAME_MAX);
  expect(texts()).toContain('11 of 32');
  // Typing is not read aloud, key by key.
  expect(note().props.accessibilityLiveRegion).toBe('none');
  await type('The Reef Where Maya and I Dive!');
  expect(texts()).toContain('31 of 32');
  // The field itself stops typing here, without a word; the counter is what says why, and says it aloud.
  await type('The Reef Where Maya and I Dive!!');
  expect(texts()).toContain('32 of 32 · that is as long as a name can be');
  expect(texts()).not.toContain('31 of 32');
  expect(note().props.accessibilityLiveRegion).toBe('polite');
});
