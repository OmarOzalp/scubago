import { Directory, File, Paths } from 'expo-file-system';
import type { OceanFiles } from '@/lib/ocean-store';

/**
 * The saved oceans (src/lib/ocean-store.ts) on a phone: a folder of files in the app's cache directory, which the system may clear when
 * the phone runs short of room (the ocean is then worked out again). A file is written under a temporary name and moved into place, so
 * a file that is there is never half written.
 */
const folder = () => new Directory(Paths.cache, 'scubago-ocean');
const PART = '.part';

export const oceanFiles: OceanFiles = {
  async read(name) {
    const file = new File(folder(), name);
    return file.exists ? file.bytes() : null;
  },
  async write(name, bytes) {
    const directory = folder();
    if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
    const part = new File(directory, `${name}${PART}`), done = new File(directory, name);
    if (part.exists) part.delete();
    part.create();
    await part.write(bytes);
    if (done.exists) done.delete();
    await part.move(done, { overwrite: true });
  },
  async remove(name) {
    const file = new File(folder(), name);
    if (file.exists) file.delete();
  },
  async list() {
    const directory = folder();
    if (!directory.exists) return [];
    const files: { name: string; at: number }[] = [];
    for (const item of directory.list()) {
      if (!(item instanceof File)) continue;
      // (a write that was cut short leaves its temporary file behind)
      if (item.name.endsWith(PART)) { item.delete(); continue; }
      files.push({ name: item.name, at: item.modificationTime ?? 0 });
    }
    return files;
  },
};
