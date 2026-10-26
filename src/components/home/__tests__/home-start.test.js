import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';

// What Home's card showed last, kept on the device for the next launch (home-start.ts). A fresh module each test (its
// memory of the scene is module state), over a stand-in for the device's storage and files.
const KEY = 'scubago.homeScene.v1';
let home, AsyncStorage, files;
// The device's storage, the same across launches (a fresh module registry is a fresh launch).
const stored = new Map();
const mockStorage = {
  getItem: async (key) => stored.get(key) ?? null,
  setItem: async (key, value) => { stored.set(key, value); },
  clear: async () => { stored.clear(); },
};
beforeEach(() => {
  jest.resetModules();
  jest.doMock('@react-native-async-storage/async-storage', () => ({ __esModule: true, default: mockStorage }));
  files = new Map();
  jest.doMock('expo-file-system', () => {
    class File {
      constructor(...parts) { this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/'); }
      get exists() { return files.has(this.uri); }
      async copy(to) { files.set(to.uri, files.get(this.uri)); }
      delete() { files.delete(this.uri); }
    }
    return { File, Paths: { document: { uri: 'file:///documents' } } };
  });
  AsyncStorage = mockStorage;
  home = require('../home-start');
});
afterEach(async () => { await AsyncStorage.clear(); jest.dontMock('expo-file-system'); jest.dontMock('@react-native-async-storage/async-storage'); });

test('a first launch has nothing kept; what Home shows is kept and read back at the next launch', async () => {
  expect(await home.readHomeScene()).toBeNull();
  home.rememberHomeScene(3, 'island', ['reef-fish', 'great-white-shark', 'reef-fish']);
  expect(JSON.parse(await AsyncStorage.getItem(KEY))).toEqual({ level: 3, habitat: 'island', models: ['great-white-shark', 'reef-fish'] });
  // The next launch.
  jest.resetModules();
  const next = require('../home-start');
  expect(await next.readHomeScene()).toEqual({ level: 3, habitat: 'island', models: ['great-white-shark', 'reef-fish'], picture: undefined });
});

test('something unreadable kept is nothing kept', async () => {
  await AsyncStorage.setItem(KEY, '{"level": "three"');
  expect(await home.readHomeScene()).toBeNull();
});

test('at launch, what is kept is handed to each who waits for it, before or after it is read; nothing is held up', async () => {
  await AsyncStorage.setItem(KEY, JSON.stringify({ level: 2, habitat: 'island', models: ['manta'] }));
  const early = jest.fn();
  home.onHomeStart(early);
  // (three.js can't load under Jest: the models' loader isn't started here, and that is no failure)
  expect(() => home.startHome()).not.toThrow();
  const late = jest.fn();
  home.onHomeStart(late);
  await home.readHomeScene();
  await Promise.resolve();
  expect(early).toHaveBeenCalledWith(expect.objectContaining({ level: 2, models: ['manta'] }));
  expect(late).toHaveBeenCalledWith(expect.objectContaining({ level: 2, models: ['manta'] }));
});

test('a picture is kept for its island and level only, copied out of the cache on a phone, the one before deleted', async () => {
  files.set('file:///cache/GLView/a.png', 'png-a');
  await home.rememberHomePicture('file:///cache/GLView/a.png', 3, 'island');
  const first = (await home.readHomeScene()).picture;
  expect(first).toEqual({ uri: expect.stringMatching(/^file:\/\/\/documents\/home-island-\d+\.png$/), level: 3, habitat: 'island' });
  expect(files.get(first.uri)).toBe('png-a');
  const scene = await home.readHomeScene();
  expect(home.pictureFor(scene, 3, 'island')).toBe(first.uri);
  expect(home.pictureFor(scene, 4, 'island')).toBeNull();
  expect(home.pictureFor(scene, 3, 'kelp')).toBeNull();
  // A newer picture replaces it (and its file goes); what the scene shows is kept with it.
  home.rememberHomeScene(3, 'island', ['manta']);
  files.set('file:///cache/GLView/b.png', 'png-b');
  jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 1000);
  await home.rememberHomePicture('file:///cache/GLView/b.png', 3, 'island');
  const second = JSON.parse(await AsyncStorage.getItem(KEY));
  expect(second.models).toEqual(['manta']);
  expect(second.picture.uri).not.toBe(first.uri);
  expect(files.has(first.uri)).toBe(false);
  expect(files.get(second.picture.uri)).toBe('png-b');
});
