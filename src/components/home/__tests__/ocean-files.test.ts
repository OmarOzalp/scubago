import { beforeEach, expect, jest, test } from '@jest/globals';

// The saved oceans on a phone (three/ocean-files.ts): a folder in the cache directory, over a stand-in for the device's files that
// follows expo-file-system's File and Directory (the calls it makes are the only ones the stand-in has).
type Entry = { bytes: Uint8Array; time: number };
const mockDisk = new Map<string, Entry>(), mockFolders = new Set<string>();
let mockClock = 0;
jest.mock('expo-file-system', () => {
  const join = (parts: unknown[]) => parts.map((part) => (typeof part === 'string' ? part : (part as { uri: string }).uri)).join('/');
  class Directory {
    uri: string;
    constructor(...parts: unknown[]) { this.uri = join(parts); }
    get exists() { return mockFolders.has(this.uri); }
    create(options?: { idempotent?: boolean }) { if (mockFolders.has(this.uri) && !options?.idempotent) throw new Error('exists'); mockFolders.add(this.uri); }
    list() { return [...mockDisk.keys()].filter((uri) => uri.startsWith(`${this.uri}/`)).map((uri) => new File(uri)); }
  }
  class File {
    uri: string;
    constructor(...parts: unknown[]) { this.uri = join(parts); }
    get name() { return this.uri.slice(this.uri.lastIndexOf('/') + 1); }
    get exists() { return mockDisk.has(this.uri); }
    get modificationTime() { return mockDisk.get(this.uri)?.time ?? null; }
    create() { if (mockDisk.has(this.uri)) throw new Error('exists'); mockDisk.set(this.uri, { bytes: new Uint8Array(0), time: ++mockClock }); }
    async write(bytes: Uint8Array) { if (!mockDisk.has(this.uri)) throw new Error('no file'); mockDisk.set(this.uri, { bytes: Uint8Array.from(bytes), time: ++mockClock }); }
    async bytes() { return Uint8Array.from(mockDisk.get(this.uri)!.bytes); }
    delete() { mockDisk.delete(this.uri); }
    async move(to: File, options?: { overwrite?: boolean }) {
      if (mockDisk.has(to.uri) && !options?.overwrite) throw new Error('exists');
      mockDisk.set(to.uri, mockDisk.get(this.uri)!); mockDisk.delete(this.uri);
    }
  }
  return { Directory, File, Paths: { cache: { uri: 'file:///cache' } } };
});
// eslint-disable-next-line import/first
import { oceanFiles } from '../three/ocean-files';

beforeEach(() => { mockDisk.clear(); mockFolders.clear(); mockClock = 0; });

test('what is written is read back, a name at a time, and replaces what was there', async () => {
  expect(await oceanFiles.read('ocean-a.bin')).toBeNull();
  await oceanFiles.write('ocean-a.bin', Uint8Array.of(1, 2, 3));
  expect(Array.from((await oceanFiles.read('ocean-a.bin'))!)).toEqual([1, 2, 3]);
  await oceanFiles.write('ocean-a.bin', Uint8Array.of(9));
  expect(Array.from((await oceanFiles.read('ocean-a.bin'))!)).toEqual([9]);
  await oceanFiles.write('ocean-b.bin', Uint8Array.of(4));
  expect((await oceanFiles.list()).map((file) => file.name).sort()).toEqual(['ocean-a.bin', 'ocean-b.bin']);
  // (in a folder of its own in the cache directory)
  expect([...mockDisk.keys()].every((uri) => uri.startsWith('file:///cache/scubago-ocean/'))).toBe(true);
});

test('files are listed with when they were written, and removed by name', async () => {
  await oceanFiles.write('ocean-a.bin', Uint8Array.of(1));
  await oceanFiles.write('ocean-b.bin', Uint8Array.of(2));
  const listed = await oceanFiles.list();
  const at = (name: string) => listed.find((file) => file.name === name)!.at;
  expect(at('ocean-b.bin')).toBeGreaterThan(at('ocean-a.bin'));
  await oceanFiles.remove('ocean-a.bin');
  await oceanFiles.remove('ocean-gone.bin');
  expect((await oceanFiles.list()).map((file) => file.name)).toEqual(['ocean-b.bin']);
  expect(await oceanFiles.read('ocean-a.bin')).toBeNull();
});

test('a write that was cut short leaves nothing readable under the name, and its temporary file is cleared away', async () => {
  await oceanFiles.write('ocean-a.bin', Uint8Array.of(1));
  // (the phone's app was closed after the temporary file was made, before it was moved into place)
  mockDisk.set('file:///cache/scubago-ocean/ocean-b.bin.part', { bytes: Uint8Array.of(7, 7), time: 5 });
  expect(await oceanFiles.read('ocean-b.bin')).toBeNull();
  expect((await oceanFiles.list()).map((file) => file.name)).toEqual(['ocean-a.bin']);
  expect(mockDisk.has('file:///cache/scubago-ocean/ocean-b.bin.part')).toBe(false);
  // ...and writing it again works over the leftover.
  mockDisk.set('file:///cache/scubago-ocean/ocean-b.bin.part', { bytes: Uint8Array.of(7, 7), time: 5 });
  await oceanFiles.write('ocean-b.bin', Uint8Array.of(8));
  expect(Array.from((await oceanFiles.read('ocean-b.bin'))!)).toEqual([8]);
});

test('with no folder yet there is nothing to list', async () => {
  expect(await oceanFiles.list()).toEqual([]);
});
