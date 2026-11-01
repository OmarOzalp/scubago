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

/** What is kept now (readHomeScene answers with what was kept when it was first asked). */
const latest = async () => JSON.parse(await AsyncStorage.getItem(KEY));
test('a picture of the explorer’s opening view is kept for that view alone, beside Home’s own picture, and the last few views are kept', async () => {
  files.set('file:///cache/GLView/home.png', 'png-home');
  await home.rememberHomePicture('file:///cache/GLView/home.png', 3, 'island');
  const keys = ['1|a|3|coral-reef|0.46', '1|a|3|shipwreck|0.46', '1|a,b|3|coral-reef|0.46', '1|a,b|4|coral-reef|0.46', '1|a,b|5|coral-reef|0.46'];
  const uris = [];
  for (const [i, key] of keys.slice(0, 2).entries()) {
    files.set(`file:///cache/GLView/ex${i}.png`, `png-ex${i}`);
    jest.spyOn(Date, 'now').mockReturnValue(1000 + i);
    await home.rememberExplorerPicture(`file:///cache/GLView/ex${i}.png`, key);
    uris.push(home.explorerPictureFor(await latest(), key));
  }
  const scene = await latest();
  // Each is found by its own key only; Home's picture and what the card shows are kept as they were.
  expect(scene.picture.level).toBe(3);
  expect(scene.picture.habitat).toBe('island');
  expect(home.explorerPictureFor(scene, keys[0])).toBe(uris[0]);
  expect(home.explorerPictureFor(scene, keys[1])).toBe(uris[1]);
  expect(uris[0]).not.toBe(uris[1]);
  expect(home.explorerPictureFor(scene, keys[2])).toBeNull();
  expect(home.explorerPictureFor(null, keys[0])).toBeNull();
  // They survive the card remembering its scene and its picture.
  home.rememberHomeScene(3, 'island', ['manta']);
  files.set('file:///cache/GLView/home2.png', 'png-home2');
  jest.spyOn(Date, 'now').mockReturnValue(5000);
  await home.rememberHomePicture('file:///cache/GLView/home2.png', 3, 'island');
  expect(home.explorerPictureFor(await latest(), keys[0])).toBe(uris[0]);
  // A new picture of a view takes the place of its old one, which is deleted.
  files.set('file:///cache/GLView/ex0b.png', 'png-ex0b');
  jest.spyOn(Date, 'now').mockReturnValue(6000);
  await home.rememberExplorerPicture('file:///cache/GLView/ex0b.png', keys[0]);
  const again = home.explorerPictureFor(await latest(), keys[0]);
  expect(again).not.toBe(uris[0]);
  expect(files.has(uris[0])).toBe(false);
  expect(files.get(again)).toBe('png-ex0b');
  // Past KEPT_VIEWS the view opened longest ago goes, file and all.
  for (const [i, key] of keys.slice(2).entries()) {
    files.set(`file:///cache/GLView/more${i}.png`, `png-more${i}`);
    jest.spyOn(Date, 'now').mockReturnValue(7000 + i);
    await home.rememberExplorerPicture(`file:///cache/GLView/more${i}.png`, key);
  }
  const last = await latest();
  expect(last.views).toHaveLength(home.KEPT_VIEWS);
  expect(home.explorerPictureFor(last, keys[4])).not.toBeNull();
  expect(home.explorerPictureFor(last, keys[1])).toBeNull();
  expect(files.has(uris[1])).toBe(false);
  // The record is what the next launch reads back.
  const stored = JSON.parse(await AsyncStorage.getItem(KEY));
  expect(stored.views.map((view) => view.key)).toEqual(last.views.map((view) => view.key));
  jest.resetModules();
  const next = require('../home-start');
  expect(await next.readHomeScene()).toEqual(expect.objectContaining({ views: last.views }));
});

test('a first launch straight into the explorer keeps its picture too, and a record with unreadable views loses only them', async () => {
  files.set('file:///cache/GLView/ex.png', 'png-ex');
  await home.rememberExplorerPicture('file:///cache/GLView/ex.png', '1|a|1|coral-reef|0.46');
  const first = await latest();
  expect(first).toEqual(expect.objectContaining({ level: 1, habitat: 'island', models: [] }));
  expect(home.explorerPictureFor(first, '1|a|1|coral-reef|0.46')).toMatch(/^file:\/\/\/documents\/home-island-\d+\.png$/);
  jest.resetModules();
  await AsyncStorage.setItem(KEY, JSON.stringify({ level: 2, habitat: 'island', models: ['manta'], views: [{ uri: 5, key: 'x' }, 'nonsense', { uri: 'file:///documents/v.png', key: 'k' }] }));
  const next = require('../home-start');
  const scene = await next.readHomeScene();
  expect(scene.models).toEqual(['manta']);
  expect(scene.views).toEqual([{ uri: 'file:///documents/v.png', key: 'k' }]);
});
