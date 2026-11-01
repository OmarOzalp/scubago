import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import type { Habitat } from '@/lib/home';
import type { MarineModel } from '@/lib/swimming';

/**
 * Home's island, ready at launch ("Instant start", docs/island-performance.md). What Home's card last showed is kept
 * on the device: its island and level, its animals' models, and a picture of it with its animals. At launch
 * (`startHome`, from src/app/_layout.tsx) it is read, and those models and the island's seabed load during the
 * splash, before Home asks for them; the card shows the picture until the live scene has drawn itself with its
 * animals. Importing this loads no three.js (the root layout imports it): starting does.
 */
const KEY = 'scubago.homeScene.v1';

/** A picture of Home's card: where it is (a file on a phone, a data URL on the web) and the island and level it shows. */
export type HomePicture = { uri: string; level: number; habitat: Habitat };
/**
 * A picture of the island explorer's opening view, kept the same way: where it is, and the `key` of the view it shows (explorerViewKey: the
 * islands in the ocean, the level, the island it opens on and the screen's shape).
 */
export type ExplorerPicture = { uri: string; key: string };
export type HomeScene = { level: number; habitat: Habitat; models: MarineModel[]; picture?: HomePicture; views?: ExplorerPicture[] };
/** How many views of the explorer are kept, the last opened first: each is a picture the size of the screen (on the web a data URL held in storage, so fewer). */
export const KEPT_VIEWS = Platform.OS === 'web' ? 2 : 4;

/** Undefined until storage has answered; null when nothing is kept (a first launch). */
let kept: HomeScene | null | undefined;
let reading: Promise<HomeScene | null> | null = null;
const listeners = new Set<() => void>();
/** Waiting for what Home showed last (onHomeStart). */
const starters: ((last: HomeScene | null) => void)[] = [];
const changed = () => listeners.forEach((listener) => listener());

function parse(value: string | null): HomeScene | null {
  if (!value) return null;
  try {
    const scene = JSON.parse(value) as Partial<HomeScene>;
    if (typeof scene.level !== 'number' || typeof scene.habitat !== 'string' || !Array.isArray(scene.models)) return null;
    const picture = scene.picture && typeof scene.picture.uri === 'string' ? scene.picture : undefined;
    const views = Array.isArray(scene.views) ? scene.views.filter((v): v is ExplorerPicture => !!v && typeof v.uri === 'string' && typeof v.key === 'string') : [];
    return { level: scene.level, habitat: scene.habitat, models: scene.models.filter((m): m is MarineModel => typeof m === 'string'), picture, ...(views.length ? { views } : {}) };
  } catch {
    return null;
  }
}

/** What Home last showed (read once; null if nothing is kept or it can't be read). */
export function readHomeScene(): Promise<HomeScene | null> {
  if (!reading) {
    reading = AsyncStorage.getItem(KEY).then(parse, () => null).then((scene) => {
      // (a scene remembered meanwhile is newer)
      if (kept === undefined) { kept = scene; changed(); }
      return kept ?? null;
    });
    for (const listener of starters.splice(0)) void reading.then(listener);
  }
  return reading;
}

/**
 * At launch: read what Home showed last and load it (three/home-preload.ts: its island's seabed and its animals'
 * models) during the splash, before Home asks for it. Never holds anything up.
 */
export function startHome() {
  // (not while the web's pages are rendered ahead, in Node)
  if (Platform.OS === 'web' && typeof window === 'undefined') return;
  try {
    // Required here, not imported: three.js and the models load with it, and this module stays light for the root layout.
    const { preloadHomeScene } = require('./three/home-preload') as typeof import('./three/home-preload'); // eslint-disable-line @typescript-eslint/no-require-imports
    onHomeStart(preloadHomeScene);
  } catch {
    // (where three.js can't load, as under Jest: Home loads what it needs when it asks)
  }
  void readHomeScene();
}

/** Once what Home showed last is read (at launch: startHome), `listener` has it (null on a first launch). */
export function onHomeStart(listener: (last: HomeScene | null) => void) {
  if (reading) void reading.then(listener);
  else starters.push(listener);
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
/** What Home last showed, as it is kept now (undefined until storage has answered). */
export function useHomeScene() {
  return useSyncExternalStore(subscribe, () => kept, () => undefined);
}

function store(scene: HomeScene) {
  kept = scene;
  changed();
  AsyncStorage.setItem(KEY, JSON.stringify(scene)).catch(() => undefined);
}

/** Home's card now shows this island at this level with these animals (their models): kept for the next launch. */
export function rememberHomeScene(level: number, habitat: Habitat, models: readonly MarineModel[]) {
  const was = kept ?? undefined, sorted = [...new Set(models)].sort();
  if (was && was.level === level && was.habitat === habitat && was.models.join() === sorted.join()) return;
  store({ level, habitat, models: sorted, picture: was?.picture, ...(was?.views ? { views: was.views } : {}) });
}

/** The picture kept for this island and level, if any. */
export const pictureFor = (scene: HomeScene | null | undefined, level: number, habitat: Habitat) =>
  scene?.picture && scene.picture.level === level && scene.picture.habitat === habitat ? scene.picture.uri : null;

/**
 * Keep a picture of Home's card (an image URI from scene-snapshot.ts's capture, which this lets go of): on a phone
 * copied into the app's documents (the capture is in the cache), on the web a small JPEG data URL in storage.
 */
export async function rememberHomePicture(uri: string, level: number, habitat: Habitat): Promise<void> {
  const saved = Platform.OS === 'web' ? await webPicture(uri) : await nativePicture(uri);
  if (!saved) return;
  const was = kept ?? undefined, old = was?.picture?.uri;
  store({ level: was?.level ?? level, habitat: was?.habitat ?? habitat, models: was?.models ?? [], picture: { uri: saved, level, habitat }, ...(was?.views ? { views: was.views } : {}) });
  if (old && old !== saved && Platform.OS !== 'web') discard(old);
}

/** The picture kept for this view of the explorer (explorerViewKey), if any. */
export const explorerPictureFor = (scene: HomeScene | null | undefined, key: string) => scene?.views?.find((view) => view.key === key)?.uri ?? null;

/**
 * Keep a picture of the explorer's opening view (an image URI from scene-snapshot.ts's capture, which this lets go of), as Home's is: the
 * last `KEPT_VIEWS` views are kept, a new picture of a view taking the place of its old one, and the one opened longest ago going when there are more.
 */
export async function rememberExplorerPicture(uri: string, key: string): Promise<void> {
  const saved = Platform.OS === 'web' ? await webPicture(uri) : await nativePicture(uri);
  if (!saved) return;
  const was = kept ?? undefined, views = was?.views ?? [];
  const next = [{ uri: saved, key }, ...views.filter((view) => view.key !== key)].slice(0, KEPT_VIEWS);
  const gone = views.filter((view) => !next.includes(view)).map((view) => view.uri).filter((old) => old !== saved);
  // (a first launch straight into the explorer has no Home yet: its record is Home's island at the first level)
  store({ level: was?.level ?? 1, habitat: was?.habitat ?? 'island', models: was?.models ?? [], picture: was?.picture, views: next });
  if (Platform.OS !== 'web') for (const old of gone) discard(old);
}

/** expo-file-system, required on a phone only. */
const fileSystem = () => require('expo-file-system') as typeof import('expo-file-system'); // eslint-disable-line @typescript-eslint/no-require-imports

async function nativePicture(uri: string): Promise<string | null> {
  try {
    const { File, Paths } = fileSystem();
    const copy = new File(Paths.document, `home-island-${Date.now()}.png`);
    await new File(uri).copy(copy);
    return copy.uri;
  } catch {
    return null;
  }
}

function discard(uri: string) {
  try {
    const { File } = fileSystem();
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Nothing to delete.
  }
}

/** The web's picture (a blob: URL) as a JPEG data URL small enough to keep in storage. */
async function webPicture(uri: string): Promise<string | null> {
  try {
    const image = new Image();
    image.src = uri;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    canvas.getContext('2d')?.drawImage(image, 0, 0);
    const url = canvas.toDataURL('image/jpeg', .85);
    canvas.width = 0; canvas.height = 0;
    return url.startsWith('data:image/jpeg') ? url : null;
  } catch {
    return null;
  }
}
